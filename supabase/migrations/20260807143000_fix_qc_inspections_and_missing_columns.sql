-- =============================================================================
-- Fix descubierto por Talleres Mejia Fiam (primer cliente real):
--
-- 3 errores en cascada al usar módulo QC Release + Customer Requirements:
--   1. Tabla qc_inspections NO existe (v37 nunca corrió — código de QCRelease
--      la usa y explotó con "table 'public.qc_inspections' in schema cache")
--   2. suppliers.supplier_name NO existe (ProductionControl lo pide,
--      la tabla tiene contact_name pero el código evolucionó y usa supplier_name)
--   3. customer_orders.client_name y .order_reference NO existen
--      (CustomerRequirements los usa, v67 no los cubrió)
--
-- Este fix es idempotente (IF NOT EXISTS en todo) — seguro correr en repeat.
-- =============================================================================

BEGIN;

-- 1. Crear tabla qc_inspections (copiada de v37 con IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS qc_inspections (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  production_order_id      UUID REFERENCES production_orders(id) ON DELETE SET NULL,
  inspection_date          DATE NOT NULL DEFAULT CURRENT_DATE,
  inspector_name           TEXT,
  inspector_user_id        UUID REFERENCES auth.users(id),
  decision                 TEXT NOT NULL CHECK (decision IN ('Liberado','Liberación condicional','Rechazado')),
  decision_reason          TEXT,
  checklist                JSONB DEFAULT '[]'::jsonb,
  evidence_url             TEXT,
  concession_authorized_by TEXT,
  linked_nc_id             UUID,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qc_inspections_org      ON qc_inspections(org_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_prod     ON qc_inspections(production_order_id);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_decision ON qc_inspections(decision);
CREATE INDEX IF NOT EXISTS idx_qc_inspections_date     ON qc_inspections(inspection_date DESC);

ALTER TABLE qc_inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qc_select" ON qc_inspections;
CREATE POLICY "qc_select" ON qc_inspections FOR SELECT USING (org_id = auth_org_id() OR is_super_admin());
DROP POLICY IF EXISTS "qc_insert" ON qc_inspections;
CREATE POLICY "qc_insert" ON qc_inspections FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "qc_update" ON qc_inspections;
CREATE POLICY "qc_update" ON qc_inspections FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "qc_delete" ON qc_inspections;
CREATE POLICY "qc_delete" ON qc_inspections FOR DELETE USING (org_id = auth_org_id());

-- 2. Actualizar constraint de production_orders para incluir Liberado/Rechazado
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'production_orders_status_check'
  ) THEN
    EXECUTE 'ALTER TABLE production_orders DROP CONSTRAINT production_orders_status_check';
  END IF;
END $$;

ALTER TABLE production_orders
  ADD CONSTRAINT production_orders_status_check
  CHECK (status IN ('Pendiente','En Proceso','En Pausa','Terminado','Cancelado','Liberado','Rechazado'));

-- 3. Columnas faltantes en suppliers (usadas por ProductionControl.jsx)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS supplier_name TEXT;

-- 4. Columnas faltantes en customer_orders (usadas por CustomerRequirements.jsx)
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS client_name     TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS order_reference TEXT;

-- 5. Refresh schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación
SELECT 'qc_inspections table' AS check_name,
       EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'qc_inspections') AS ok
UNION ALL
SELECT 'suppliers.supplier_name',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'suppliers' AND column_name = 'supplier_name')
UNION ALL
SELECT 'customer_orders.client_name',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'customer_orders' AND column_name = 'client_name')
UNION ALL
SELECT 'customer_orders.order_reference',
       EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_name = 'customer_orders' AND column_name = 'order_reference');
