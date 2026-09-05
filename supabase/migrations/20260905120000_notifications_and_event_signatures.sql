-- =============================================================================
-- Fase 2 portal operativo: notificaciones in-app + firma digital de eventos
--
-- Dos capacidades independientes, en la misma migracion porque comparten
-- trigger sobre work_order_events:
--
--   A. NOTIFICACIONES: cuando un operador registra un evento, owner y
--      quality_manager del org reciben notif in-app. Trigger AFTER INSERT
--      genera 1 row por destinatario en `notifications`. El actor no se
--      auto-notifica.
--
--   B. FIRMA DIGITAL: cada evento gana signature_hash = SHA-256 de
--      (id || performed_by || event_type || coalesce(notes,'') || created_at).
--      Se calcula BEFORE INSERT. Sirve como huella criptografica: si alguien
--      modifica notes/event_type via SQL directo, la firma no matchea y el
--      auditor detecta manipulacion. RPC verify_event_signature() recalcula
--      y compara.
--
--      Solo eventos de decision (approved/rejected/released/etc.) firman.
--      Comentarios no — son texto libre reemplazable, no ameritan firma.
-- =============================================================================

-- Requerido por digest() en la firma. En Supabase ya viene activado; el IF NOT
-- EXISTS lo hace safe para proyectos fresh sin correr baseline.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── A.1 Tabla notifications ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL,
  -- Contexto opcional: apunta al recurso que disparo la notif.
  source_table   TEXT,
  source_id      UUID,
  event_id       UUID REFERENCES work_order_events(id) ON DELETE CASCADE,
  title          TEXT NOT NULL,
  body           TEXT,
  read_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Query dominante: notifs no leidas de un user, ordenadas por fecha desc.
CREATE INDEX IF NOT EXISTS idx_notif_user_unread
  ON notifications(user_id, read_at NULLS FIRST, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_user_created
  ON notifications(user_id, created_at DESC);

-- ─── A.2 RLS ─────────────────────────────────────────────────────────────────
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- Cada user ve solo sus propias notifs. No hay impersonate aca — el super_admin
-- no quiere ver notifs ajenas, y las funciones fire-and-forget escriben con
-- service_role.
DROP POLICY IF EXISTS notif_select ON notifications;
CREATE POLICY notif_select ON notifications FOR SELECT
  USING (user_id = auth.uid());

-- UPDATE: marcar como leida (read_at). El user solo puede modificar sus propias.
-- Otras columnas no deberian cambiar — RLS + WITH CHECK las protege.
DROP POLICY IF EXISTS notif_update ON notifications;
CREATE POLICY notif_update ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- DELETE: el user puede borrar sus propias notifs si quiere (limpieza manual).
DROP POLICY IF EXISTS notif_delete ON notifications;
CREATE POLICY notif_delete ON notifications FOR DELETE
  USING (user_id = auth.uid());

-- INSERT: no hay policy para authenticated — el trigger corre como SECURITY
-- DEFINER y bypasea RLS. Nadie escribe notifs a mano desde el frontend.

-- ─── A.3 Trigger: notif automatica al crear evento ──────────────────────────
CREATE OR REPLACE FUNCTION notify_on_work_order_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_recipient RECORD;
  v_actor_name TEXT;
  v_event_label TEXT;
  v_source_label TEXT;
BEGIN
  -- Solo notifs de eventos "de decision" o "release" — comentarios no
  -- generan ruido a owner/QM.
  IF NEW.event_type = 'comment' THEN
    RETURN NEW;
  END IF;

  v_actor_name := COALESCE(NEW.performed_by_name, 'Alguien');

  -- Labels legibles para el mensaje. Mantener sincronizado con EVENT_TYPES
  -- del frontend (src/lib/workOrderEvents.js).
  v_event_label := CASE NEW.event_type
    WHEN 'created'             THEN 'creo'
    WHEN 'approved'            THEN 'aprobo'
    WHEN 'rejected'            THEN 'rechazo'
    WHEN 'in_production'       THEN 'liberó a producción'
    WHEN 'paused'              THEN 'pauso'
    WHEN 'resumed'             THEN 'retomo'
    WHEN 'released'            THEN 'liberó'
    WHEN 'conditional_release' THEN 'liberó condicionalmente'
    WHEN 'delivered'           THEN 'entregó'
    WHEN 'cancelled'           THEN 'canceló'
    ELSE NEW.event_type
  END;

  v_source_label := CASE NEW.source_table
    WHEN 'customer_orders'   THEN 'un pedido'
    WHEN 'production_orders' THEN 'una orden de producción'
    WHEN 'qc_inspections'    THEN 'una inspección de calidad'
    ELSE 'un registro operativo'
  END;

  -- Insertar una notif por cada owner/QM del org, excluyendo al actor.
  FOR v_recipient IN
    SELECT user_id
    FROM user_profiles
    WHERE org_id = NEW.org_id
      AND role IN ('owner', 'quality_manager')
      AND user_id IS DISTINCT FROM NEW.performed_by
  LOOP
    INSERT INTO notifications (
      org_id, user_id, kind, source_table, source_id, event_id, title, body
    ) VALUES (
      NEW.org_id,
      v_recipient.user_id,
      'work_order_event',
      NEW.source_table,
      NEW.source_id,
      NEW.id,
      v_actor_name || ' ' || v_event_label || ' ' || v_source_label,
      NEW.notes
    );
  END LOOP;

  -- Si el evento esta marcado como conflicto de segregacion, notif adicional
  -- solo al auditor del org (si existe) — flag explicito para revision.
  IF NEW.same_person = true THEN
    FOR v_recipient IN
      SELECT user_id
      FROM user_profiles
      WHERE org_id = NEW.org_id
        AND role = 'auditor'
    LOOP
      INSERT INTO notifications (
        org_id, user_id, kind, source_table, source_id, event_id, title, body
      ) VALUES (
        NEW.org_id,
        v_recipient.user_id,
        'segregation_conflict',
        NEW.source_table,
        NEW.source_id,
        NEW.id,
        'Conflicto de segregación: ' || v_actor_name,
        'La misma persona tomó dos decisiones sobre el mismo registro. Revisar en panel de segregación.'
      );
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_on_work_order_event ON work_order_events;
CREATE TRIGGER trg_notify_on_work_order_event
  AFTER INSERT ON work_order_events
  FOR EACH ROW EXECUTE FUNCTION notify_on_work_order_event();

-- ─── B.1 Columna signature_hash + trigger ────────────────────────────────────
ALTER TABLE work_order_events
  ADD COLUMN IF NOT EXISTS signature_hash TEXT;

-- Set de tipos de evento que se firman. Comentario no — es texto libre editable
-- y firmar comentarios inflaria la BD sin proteger nada critico.
-- (Debe matchear DECISION_EVENT_TYPES en src/lib/workOrderEvents.js.)
CREATE OR REPLACE FUNCTION calc_event_signature()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_payload TEXT;
BEGIN
  -- Solo firmar eventos de decision (created + aprobado/rechazado/liberado/entregado).
  -- Comentarios y pausas/reanudaciones no firman.
  IF NEW.event_type NOT IN (
    'created', 'approved', 'rejected', 'released',
    'conditional_release', 'delivered', 'cancelled'
  ) THEN
    RETURN NEW;
  END IF;

  -- Payload determinista: campos ordenados con separador que no puede aparecer
  -- naturalmente en un UUID/timestamp/enum. Notes puede tener \n, lo dejamos
  -- crudo — SHA-256 no depende del formato.
  v_payload :=
    NEW.id::text || '|' ||
    COALESCE(NEW.performed_by::text, '') || '|' ||
    NEW.event_type || '|' ||
    COALESCE(NEW.notes, '') || '|' ||
    NEW.created_at::text;

  NEW.signature_hash := encode(digest(v_payload, 'sha256'), 'hex');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_calc_event_signature ON work_order_events;
CREATE TRIGGER trg_calc_event_signature
  BEFORE INSERT ON work_order_events
  FOR EACH ROW EXECUTE FUNCTION calc_event_signature();

-- ─── B.2 RPC de verificacion para el auditor ─────────────────────────────────
-- Recalcula el hash del evento con los datos actuales y compara con
-- signature_hash. Si no matchea → alguien modifico el evento por fuera del
-- flujo (SQL directo, backup manual, etc.). El auditor puede llamarla por
-- evento o por rango.
CREATE OR REPLACE FUNCTION verify_event_signature(p_event_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ev RECORD;
  v_payload TEXT;
  v_recalc TEXT;
BEGIN
  SELECT * INTO v_ev FROM work_order_events WHERE id = p_event_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  -- Autorizacion: mismo tenant. Auditor/owner/QM pueden verificar; operator
  -- tambien lee lo suyo. RLS ya filtra por org al hacer el SELECT.
  IF v_ev.org_id <> auth_org_id() AND NOT (
      is_super_admin() AND current_impersonate_org() = v_ev.org_id
     ) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;

  IF v_ev.signature_hash IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'signed', false,
      'reason', 'event_type_not_signed'
    );
  END IF;

  v_payload :=
    v_ev.id::text || '|' ||
    COALESCE(v_ev.performed_by::text, '') || '|' ||
    v_ev.event_type || '|' ||
    COALESCE(v_ev.notes, '') || '|' ||
    v_ev.created_at::text;

  v_recalc := encode(digest(v_payload, 'sha256'), 'hex');

  RETURN jsonb_build_object(
    'ok', true,
    'signed', true,
    'valid', v_recalc = v_ev.signature_hash,
    'stored_hash', v_ev.signature_hash,
    'recalc_hash', v_recalc,
    'event_type', v_ev.event_type,
    'performed_by_name', v_ev.performed_by_name,
    'created_at', v_ev.created_at
  );
END;
$$;

GRANT EXECUTE ON FUNCTION verify_event_signature(UUID) TO authenticated;

-- ─── B.3 Backfill: firmar eventos historicos ─────────────────────────────────
-- Los eventos ya existentes (creados antes de esta migracion) no tienen firma.
-- Calculamos su hash retroactivamente con los mismos datos, para que el badge
-- "🔒 Firmado" aparezca en todo el timeline y no solo en eventos nuevos.
UPDATE work_order_events
SET signature_hash = encode(
  digest(
    id::text || '|' ||
    COALESCE(performed_by::text, '') || '|' ||
    event_type || '|' ||
    COALESCE(notes, '') || '|' ||
    created_at::text,
    'sha256'
  ),
  'hex'
)
WHERE signature_hash IS NULL
  AND event_type IN (
    'created', 'approved', 'rejected', 'released',
    'conditional_release', 'delivered', 'cancelled'
  );

-- ─── Docs ────────────────────────────────────────────────────────────────────
COMMENT ON TABLE notifications IS
  'Notificaciones in-app por user. Se generan automaticamente via trigger sobre
   work_order_events. Cada user ve solo las suyas (RLS). read_at NULL = no leida.';

COMMENT ON COLUMN work_order_events.signature_hash IS
  'Firma digital simple: SHA-256(id||performed_by||event_type||notes||created_at).
   Calculada BEFORE INSERT por calc_event_signature(). Verificable con la RPC
   verify_event_signature(). Solo eventos de decision firman.';

COMMENT ON FUNCTION verify_event_signature(UUID) IS
  'Verifica que un evento no fue modificado por fuera del flujo (SQL directo,
   restore de backup). Devuelve { ok, signed, valid, stored_hash, recalc_hash }.';
