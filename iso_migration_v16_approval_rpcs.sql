-- iso_migration_v16_approval_rpcs.sql
-- RPCs para el workflow de aprobaciones.
-- El cliente llama a estas funciones; nunca toca approvals directamente.
-- Cada función emite un approval_event.
--
-- Reglas:
--   * Solo owner y quality_manager pueden solicitar aprobación.
--   * El aprobador no puede ser el creador ni el solicitante (separación de funciones).
--   * Una entidad solo puede tener UNA approval pending a la vez.
--   * Al aprobar un documents_versions, las versiones Vigentes anteriores del
--     mismo code+org pasan a Obsoleto. La aprobada queda como única Vigente.

-- =============================================================================
-- Helper: hash determinístico del contenido relevante de un documento
-- =============================================================================
-- Salvaguarda: asegurar columnas esperadas (no-op si ya existen)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='documents_versions' AND column_name='type') THEN
    ALTER TABLE documents_versions ADD COLUMN type VARCHAR(50);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name='documents_versions' AND column_name='content_url') THEN
    ALTER TABLE documents_versions ADD COLUMN content_url TEXT;
  END IF;
END $$;

-- Nota: en SQL functions con parámetro composite, acceder a campos con
-- p_doc.campo se confunde con tabla.columna. Usamos to_jsonb(p_doc) ->> 'campo'
-- que es portable y resistente a columnas faltantes.
CREATE OR REPLACE FUNCTION compute_document_hash(p_doc documents_versions)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(
    digest(
      coalesce(to_jsonb(p_doc) ->> 'code', '')        || '|' ||
      coalesce(to_jsonb(p_doc) ->> 'title', '')       || '|' ||
      coalesce(to_jsonb(p_doc) ->> 'type', '')        || '|' ||
      coalesce(to_jsonb(p_doc) ->> 'version', '')     || '|' ||
      coalesce(to_jsonb(p_doc) ->> 'content_url', ''),
      'sha256'
    ),
    'hex'
  )
$$;

-- =============================================================================
-- submit_for_approval(entity_type, entity_id, requester_note)
-- =============================================================================
CREATE OR REPLACE FUNCTION submit_for_approval(
  p_entity_type TEXT,
  p_entity_id UUID,
  p_note TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role org_role;
  v_org_id UUID;
  v_approval_id UUID;
  v_entity_org UUID;
  v_doc documents_versions;
BEGIN
  v_role := auth_role();
  v_org_id := auth_org_id();

  IF v_role NOT IN ('owner', 'quality_manager') THEN
    RAISE EXCEPTION 'Solo owner o quality_manager pueden enviar a aprobación';
  END IF;

  IF p_entity_type NOT IN ('documents_versions') THEN
    RAISE EXCEPTION 'entity_type no soportado: %', p_entity_type;
  END IF;

  -- Validar que la entidad pertenece a la org y está en estado correcto
  IF p_entity_type = 'documents_versions' THEN
    SELECT * INTO v_doc FROM documents_versions WHERE id = p_entity_id;
    IF v_doc.id IS NULL THEN
      RAISE EXCEPTION 'Documento no encontrado';
    END IF;
    IF v_doc.org_id <> v_org_id THEN
      RAISE EXCEPTION 'Documento de otra organización';
    END IF;
    IF v_doc.status NOT IN ('Borrador', 'Rechazado') THEN
      RAISE EXCEPTION 'Solo se pueden enviar Borradores o Rechazados (estado actual: %)', v_doc.status;
    END IF;
    v_entity_org := v_doc.org_id;
  END IF;

  -- No permitir dos approvals pendientes sobre la misma entidad
  IF EXISTS (
    SELECT 1 FROM approvals
    WHERE entity_type = p_entity_type AND entity_id = p_entity_id AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'Ya hay una solicitud de aprobación pendiente para esta entidad';
  END IF;

  -- Crear approval
  INSERT INTO approvals (org_id, entity_type, entity_id, status, requested_by, requester_note)
  VALUES (v_entity_org, p_entity_type, p_entity_id, 'pending', auth.uid(), p_note)
  RETURNING id INTO v_approval_id;

  -- Evento
  INSERT INTO approval_events (org_id, approval_id, event_type, actor_id, comment)
  VALUES (v_entity_org, v_approval_id, 'submitted', auth.uid(), p_note);

  -- Mover la entidad a "En Revisión"
  IF p_entity_type = 'documents_versions' THEN
    UPDATE documents_versions
    SET status = 'En Revisión',
        approval_id = v_approval_id,
        submitted_by = auth.uid(),
        submitted_at = NOW()
    WHERE id = p_entity_id;
  END IF;

  RETURN v_approval_id;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_for_approval(TEXT, UUID, TEXT) TO authenticated;

-- =============================================================================
-- approve_entity(approval_id, comment)
-- =============================================================================
CREATE OR REPLACE FUNCTION approve_entity(
  p_approval_id UUID,
  p_comment TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role org_role;
  v_org_id UUID;
  v_approval approvals;
  v_doc documents_versions;
  v_hash TEXT;
  v_doc_created_by UUID;
BEGIN
  v_role := auth_role();
  v_org_id := auth_org_id();

  IF v_role NOT IN ('owner', 'quality_manager') THEN
    RAISE EXCEPTION 'Solo owner o quality_manager pueden aprobar';
  END IF;

  SELECT * INTO v_approval FROM approvals WHERE id = p_approval_id;
  IF v_approval.id IS NULL THEN
    RAISE EXCEPTION 'Aprobación no encontrada';
  END IF;
  IF v_approval.org_id <> v_org_id THEN
    RAISE EXCEPTION 'Aprobación de otra organización';
  END IF;
  IF v_approval.status <> 'pending' THEN
    RAISE EXCEPTION 'Solo se pueden aprobar solicitudes pendientes (estado actual: %)', v_approval.status;
  END IF;

  -- Separación de funciones: el aprobador no puede ser el solicitante
  IF v_approval.requested_by = auth.uid() THEN
    RAISE EXCEPTION 'No podés aprobar tu propia solicitud (separación de funciones)';
  END IF;

  -- Tampoco puede ser el creador original de la entidad
  IF v_approval.entity_type = 'documents_versions' THEN
    SELECT created_by INTO v_doc_created_by FROM documents_versions WHERE id = v_approval.entity_id;
    IF v_doc_created_by IS NOT NULL AND v_doc_created_by = auth.uid() THEN
      RAISE EXCEPTION 'No podés aprobar un documento que vos mismo creaste (separación de funciones)';
    END IF;

    SELECT * INTO v_doc FROM documents_versions WHERE id = v_approval.entity_id;
    v_hash := compute_document_hash(v_doc);

    -- Marcar versiones vigentes anteriores del mismo code+org como Obsoleto
    UPDATE documents_versions
    SET status = 'Obsoleto'
    WHERE org_id = v_doc.org_id
      AND code = v_doc.code
      AND id <> v_doc.id
      AND status = 'Vigente';

    -- Marcar esta versión como Vigente con sello
    UPDATE documents_versions
    SET status = 'Vigente',
        approved_by = auth.uid(),
        approved_at = NOW(),
        content_hash = v_hash
    WHERE id = v_doc.id;
  END IF;

  -- Actualizar approval
  UPDATE approvals
  SET status = 'approved',
      decided_by = auth.uid(),
      decided_at = NOW(),
      decision_comment = p_comment,
      content_hash = v_hash
  WHERE id = p_approval_id;

  -- Evento
  INSERT INTO approval_events (org_id, approval_id, event_type, actor_id, comment)
  VALUES (v_approval.org_id, p_approval_id, 'approved', auth.uid(), p_comment);
END;
$$;

GRANT EXECUTE ON FUNCTION approve_entity(UUID, TEXT) TO authenticated;

-- =============================================================================
-- reject_entity(approval_id, reason)
-- =============================================================================
CREATE OR REPLACE FUNCTION reject_entity(
  p_approval_id UUID,
  p_reason TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role org_role;
  v_org_id UUID;
  v_approval approvals;
BEGIN
  v_role := auth_role();
  v_org_id := auth_org_id();

  IF v_role NOT IN ('owner', 'quality_manager') THEN
    RAISE EXCEPTION 'Solo owner o quality_manager pueden rechazar';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'El rechazo requiere un motivo';
  END IF;

  SELECT * INTO v_approval FROM approvals WHERE id = p_approval_id;
  IF v_approval.id IS NULL OR v_approval.org_id <> v_org_id THEN
    RAISE EXCEPTION 'Aprobación no encontrada';
  END IF;
  IF v_approval.status <> 'pending' THEN
    RAISE EXCEPTION 'Solo se pueden rechazar solicitudes pendientes';
  END IF;
  IF v_approval.requested_by = auth.uid() THEN
    RAISE EXCEPTION 'No podés rechazar tu propia solicitud';
  END IF;

  UPDATE approvals
  SET status = 'rejected',
      decided_by = auth.uid(),
      decided_at = NOW(),
      decision_comment = p_reason
  WHERE id = p_approval_id;

  INSERT INTO approval_events (org_id, approval_id, event_type, actor_id, comment)
  VALUES (v_approval.org_id, p_approval_id, 'rejected', auth.uid(), p_reason);

  -- Volver la entidad a Rechazado para que el solicitante pueda editar y reenviar
  IF v_approval.entity_type = 'documents_versions' THEN
    UPDATE documents_versions
    SET status = 'Rechazado',
        approval_id = NULL
    WHERE id = v_approval.entity_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION reject_entity(UUID, TEXT) TO authenticated;

-- =============================================================================
-- cancel_approval(approval_id) — el solicitante puede retirar antes de ser decidido
-- =============================================================================
CREATE OR REPLACE FUNCTION cancel_approval(p_approval_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approval approvals;
BEGIN
  SELECT * INTO v_approval FROM approvals WHERE id = p_approval_id;
  IF v_approval.id IS NULL OR v_approval.org_id <> auth_org_id() THEN
    RAISE EXCEPTION 'Aprobación no encontrada';
  END IF;
  IF v_approval.status <> 'pending' THEN
    RAISE EXCEPTION 'Solo se pueden cancelar solicitudes pendientes';
  END IF;
  IF v_approval.requested_by <> auth.uid() AND auth_role() <> 'owner' THEN
    RAISE EXCEPTION 'Solo el solicitante o el owner pueden cancelar';
  END IF;

  UPDATE approvals
  SET status = 'cancelled', decided_by = auth.uid(), decided_at = NOW()
  WHERE id = p_approval_id;

  INSERT INTO approval_events (org_id, approval_id, event_type, actor_id)
  VALUES (v_approval.org_id, p_approval_id, 'cancelled', auth.uid());

  -- Devolver la entidad a Borrador para seguir editando
  IF v_approval.entity_type = 'documents_versions' THEN
    UPDATE documents_versions
    SET status = 'Borrador', approval_id = NULL
    WHERE id = v_approval.entity_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_approval(UUID) TO authenticated;

-- =============================================================================
-- pgcrypto: necesario para digest() en compute_document_hash
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;
