-- =============================================================================
-- Fase 1: Portal operativo con timeline de eventos + evidencias por adjunto
--
-- Cambios:
--   1. Enum org_role gana valor 'operator' — rol operativo (comercial/produccion/QC)
--      que puede escribir SOLO en los 3 modulos operativos (pedidos 8.2,
--      produccion 8.5, liberacion 8.6) + incidentes. Ve UI reducida.
--   2. Tabla work_order_events — timeline de eventos sobre las tres tablas
--      operativas (customer_orders, production_orders, qc_inspections).
--      Cada evento captura: quien, cuando, tipo de accion, notas.
--   3. Tabla work_order_attachments — evidencia por evento: archivo (Storage)
--      o link externo (Drive/OneDrive/sistema del cliente).
--   4. RLS estandar por org_id con soporte de super_admin impersonate.
--
-- No toca las 3 tablas operativas existentes. El timeline se agrega ENCIMA
-- via source_table + source_id (mismo patron que rag_chunks).
-- =============================================================================

-- ─── 1. Enum operator ────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'org_role' AND e.enumlabel = 'operator'
  ) THEN
    ALTER TYPE org_role ADD VALUE 'operator';
  END IF;
END$$;

-- ─── 2. Tabla work_order_events ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_order_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  source_table      TEXT NOT NULL CHECK (source_table IN (
                      'customer_orders',
                      'production_orders',
                      'qc_inspections'
                    )),
  source_id         UUID NOT NULL,
  event_type        TEXT NOT NULL CHECK (event_type IN (
                      'created',                -- pedido/orden/inspeccion creada
                      'approved',               -- QM aprueba compromiso con cliente
                      'rejected',               -- QM rechaza
                      'in_production',          -- se libera a produccion
                      'paused',                 -- produccion pausada
                      'resumed',                -- produccion retomada
                      'released',               -- QC libera producto
                      'conditional_release',    -- liberacion condicional
                      'delivered',              -- entregado al cliente
                      'cancelled',              -- cancelado
                      'comment'                 -- comentario libre sin cambio de estado
                    )),
  performed_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Snapshot del nombre + rol en el momento del evento. Aunque el user despues
  -- se elimine o cambie de rol, la evidencia historica queda intacta.
  performed_by_name TEXT,
  performed_by_role TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_woe_source ON work_order_events(org_id, source_table, source_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_woe_created ON work_order_events(org_id, created_at DESC);

ALTER TABLE work_order_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS woe_select ON work_order_events;
CREATE POLICY woe_select ON work_order_events FOR SELECT
  USING (
    org_id = auth_org_id()
    OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
  );

DROP POLICY IF EXISTS woe_insert ON work_order_events;
CREATE POLICY woe_insert ON work_order_events FOR INSERT
  WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS woe_update ON work_order_events;
CREATE POLICY woe_update ON work_order_events FOR UPDATE
  USING (org_id = auth_org_id())
  WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS woe_delete ON work_order_events;
CREATE POLICY woe_delete ON work_order_events FOR DELETE
  USING (org_id = auth_org_id());

-- ─── 3. Tabla work_order_attachments ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS work_order_attachments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  event_id       UUID NOT NULL REFERENCES work_order_events(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK (kind IN ('file', 'link')),
  -- Uno de los dos debe estar poblado segun kind
  storage_path   TEXT,        -- si kind='file': path en bucket 'documents'
  external_url   TEXT,        -- si kind='link': URL externa (Drive, OneDrive, etc.)
  filename       TEXT,        -- nombre original del archivo o titulo del link
  mime_type      TEXT,
  size_bytes     BIGINT,
  uploaded_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT woa_kind_coherent CHECK (
    (kind = 'file' AND storage_path IS NOT NULL AND external_url IS NULL) OR
    (kind = 'link' AND external_url IS NOT NULL AND storage_path IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_woa_event ON work_order_attachments(event_id);

ALTER TABLE work_order_attachments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS woa_select ON work_order_attachments;
CREATE POLICY woa_select ON work_order_attachments FOR SELECT
  USING (
    org_id = auth_org_id()
    OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
  );

DROP POLICY IF EXISTS woa_insert ON work_order_attachments;
CREATE POLICY woa_insert ON work_order_attachments FOR INSERT
  WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS woa_update ON work_order_attachments;
CREATE POLICY woa_update ON work_order_attachments FOR UPDATE
  USING (org_id = auth_org_id())
  WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS woa_delete ON work_order_attachments;
CREATE POLICY woa_delete ON work_order_attachments FOR DELETE
  USING (org_id = auth_org_id());

-- ─── 4. Comentarios de tabla (documentacion inline) ──────────────────────────
COMMENT ON TABLE work_order_events IS
  'Timeline de eventos sobre pedidos/ordenes/inspecciones. Trazabilidad end-to-end
   para auditoria ISO 8.2/8.5/8.6. Cada evento captura quien y cuando, y puede
   tener 0..n adjuntos (archivo o link externo) via work_order_attachments.';

COMMENT ON TABLE work_order_attachments IS
  'Evidencias documentales asociadas a un evento del timeline. Kind file = archivo
   en bucket documents, kind link = URL externa (Drive, OneDrive, sistema cliente).';
