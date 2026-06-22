-- =============================================================================
-- v36 — Production Orders / Control de Producción: ISO 8.5
--
-- Crea tabla si no existe + campos auditables para trazabilidad bidireccional,
-- información documentada del producto/servicio y vínculos a customer_orders,
-- materia prima (suppliers) y equipos de medición (equipment_calibration).
-- =============================================================================

CREATE TABLE IF NOT EXISTS production_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  order_id        TEXT,                     -- legacy: referencia libre al pedido
  product_name    TEXT NOT NULL,
  quantity        NUMERIC,
  start_date      DATE,
  status          TEXT NOT NULL DEFAULT 'Pendiente',
  batch_number    TEXT,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1. Trazabilidad ISO 8.5.2 — vínculo real al pedido del cliente
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS customer_order_id    UUID REFERENCES customer_orders(id) ON DELETE SET NULL;

-- 2. Información documentada (ISO 8.5.1)
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS product_spec         TEXT;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS process_instructions TEXT;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS quality_criteria     TEXT;

-- 3. Trazabilidad: materia prima usada + equipos de medición
--    Cada entrada de raw_materials puede tener { supplier, item, lot, quantity, unit }
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS raw_materials        JSONB DEFAULT '[]'::jsonb;
--    Cada entrada de equipment_used puede tener { equipment_id, name }
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS equipment_used       JSONB DEFAULT '[]'::jsonb;

-- 4. Operación
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS planned_end_date     DATE;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS actual_start_date    TIMESTAMPTZ;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS actual_end_date      TIMESTAMPTZ;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS unit                 TEXT;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS operator             TEXT;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS supervisor           TEXT;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS priority             TEXT;

-- 5. Evidencia y auditoría
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS evidence_url         TEXT;
ALTER TABLE production_orders ADD COLUMN IF NOT EXISTS change_log           JSONB DEFAULT '[]'::jsonb;

-- 6. Status extendido
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname LIKE 'production_orders%status%check%'
  ) THEN
    EXECUTE 'ALTER TABLE production_orders DROP CONSTRAINT IF EXISTS production_orders_status_check';
  END IF;
END $$;

ALTER TABLE production_orders
  ADD CONSTRAINT production_orders_status_check
  CHECK (status IN ('Pendiente','En Proceso','En Pausa','Terminado','Cancelado'));

-- Índices
CREATE INDEX IF NOT EXISTS idx_production_orders_org         ON production_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_status      ON production_orders(status);
CREATE INDEX IF NOT EXISTS idx_production_orders_customer    ON production_orders(customer_order_id);
CREATE INDEX IF NOT EXISTS idx_production_orders_batch       ON production_orders(batch_number);

-- RLS
ALTER TABLE production_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "po_select" ON production_orders;
CREATE POLICY "po_select" ON production_orders FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "po_insert" ON production_orders;
CREATE POLICY "po_insert" ON production_orders FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "po_update" ON production_orders;
CREATE POLICY "po_update" ON production_orders FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "po_delete" ON production_orders;
CREATE POLICY "po_delete" ON production_orders FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
