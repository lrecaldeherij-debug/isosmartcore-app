-- =============================================================================
-- v38 — Operational Incidents: ISO 8.5.3 (Propiedad cliente) + 8.5.6 (Cambios)
-- =============================================================================

CREATE TABLE IF NOT EXISTS operational_incidents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  type                  TEXT NOT NULL DEFAULT 'Propiedad Cliente',
  description           TEXT,
  authorized_by         TEXT,
  date                  DATE NOT NULL DEFAULT CURRENT_DATE,
  impact_analysis       TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Vínculos (trazabilidad)
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS customer_order_id     UUID REFERENCES customer_orders(id) ON DELETE SET NULL;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS production_order_id   UUID REFERENCES production_orders(id) ON DELETE SET NULL;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS linked_nc_id          UUID;

-- 8.5.3 — Propiedad del cliente
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS client_name           TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS asset_description     TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS asset_location        TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS asset_condition       TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS client_notified       BOOLEAN DEFAULT false;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS client_notified_at    DATE;

-- 8.5.6 — Cambios
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS change_what           TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS change_why            TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS change_planned        BOOLEAN DEFAULT true;

-- Comunes
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS severity              TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS status                TEXT DEFAULT 'Abierto';
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS actions_taken         TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS evidence_url          TEXT;
ALTER TABLE operational_incidents ADD COLUMN IF NOT EXISTS change_log            JSONB DEFAULT '[]'::jsonb;

-- Status constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname LIKE 'operational_incidents%status%check%'
  ) THEN
    EXECUTE 'ALTER TABLE operational_incidents DROP CONSTRAINT IF EXISTS operational_incidents_status_check';
  END IF;
END $$;

ALTER TABLE operational_incidents
  ADD CONSTRAINT operational_incidents_status_check
  CHECK (status IN ('Abierto','En Análisis','Cerrado'));

-- Índices
CREATE INDEX IF NOT EXISTS idx_op_incidents_org      ON operational_incidents(org_id);
CREATE INDEX IF NOT EXISTS idx_op_incidents_type     ON operational_incidents(type);
CREATE INDEX IF NOT EXISTS idx_op_incidents_status   ON operational_incidents(status);
CREATE INDEX IF NOT EXISTS idx_op_incidents_date     ON operational_incidents(date DESC);

-- RLS
ALTER TABLE operational_incidents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "oi_select" ON operational_incidents;
CREATE POLICY "oi_select" ON operational_incidents FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "oi_insert" ON operational_incidents;
CREATE POLICY "oi_insert" ON operational_incidents FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "oi_update" ON operational_incidents;
CREATE POLICY "oi_update" ON operational_incidents FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "oi_delete" ON operational_incidents;
CREATE POLICY "oi_delete" ON operational_incidents FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
