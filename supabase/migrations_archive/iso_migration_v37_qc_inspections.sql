-- =============================================================================
-- v37 — QC Inspections / Liberación: ISO 8.6
--
-- Tabla dedicada para cada inspección de QC (no metemos todo en production_orders).
-- Cada registro queda auditable con inspector, fecha, decisión, checklist y evidencia.
-- También actualizamos el constraint de production_orders para incluir 'Liberado'
-- y 'Rechazado' como estados finales válidos.
-- =============================================================================

CREATE TABLE IF NOT EXISTS qc_inspections (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  production_order_id      UUID REFERENCES production_orders(id) ON DELETE SET NULL,
  inspection_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  inspector_name           TEXT,
  inspector_user_id        UUID REFERENCES auth.users(id),
  decision                 TEXT NOT NULL CHECK (decision IN ('Liberado','Liberación condicional','Rechazado')),
  decision_reason          TEXT,
  -- Checklist como array de objetos:
  -- [{ criterion, expected, actual, conforme: true|false }]
  checklist                JSONB DEFAULT '[]'::jsonb,
  evidence_url             TEXT,
  concession_authorized_by TEXT,    -- requerido si decision = 'Liberación condicional'
  linked_nc_id             UUID,    -- vínculo opcional a non_conformities
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qc_inspections_org      ON qc_inspections(org_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_prod     ON qc_inspections(production_order_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_decision ON qc_inspections(decision);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_date     ON qc_inspections(inspection_date DESC);

-- RLS
ALTER TABLE qc_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qc_select" ON qc_inspections;
CREATE POLICY "qc_select" ON qc_inspections FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "qc_insert" ON qc_inspections;
CREATE POLICY "qc_insert" ON qc_inspections FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "qc_update" ON qc_inspections;
CREATE POLICY "qc_update" ON qc_inspections FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "qc_delete" ON qc_inspections;
CREATE POLICY "qc_delete" ON qc_inspections FOR DELETE USING (org_id = auth_org_id());

-- Actualizar constraint de production_orders para incluir Liberado y Rechazado
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'production_orders_status_check'
  ) THEN
    EXECUTE 'ALTER TABLE production_orders DROP CONSTRAINT production_orders_status_check';
  END IF;
END $$;

ALTER TABLE production_orders
  ADD CONSTRAINT production_orders_status_check
  CHECK (status IN ('Pendiente','En Proceso','En Pausa','Terminado','Cancelado','Liberado','Rechazado'));

NOTIFY pgrst, 'reload schema';
