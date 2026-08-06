-- =============================================================================
-- v35 — Customer Orders / Requisitos del Cliente: ISO 8.2
--
-- Crea tabla si no existe + campos auditables para 8.2.2 (determinación de
-- requisitos) y 8.2.3 (revisión de requisitos antes de comprometerse).
-- =============================================================================

CREATE TABLE IF NOT EXISTS customer_orders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  client_name           TEXT NOT NULL,
  order_reference       TEXT,
  requirements_desc     TEXT,
  delivery_date         DATE,
  review_evidence       TEXT,
  status                TEXT NOT NULL DEFAULT 'Borrador',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Datos del cliente
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_contact_person TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_email          TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS customer_phone          TEXT;

-- Requisitos extendidos (ISO 8.2.2)
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS requirements_legal      TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS requirements_implicit   TEXT;

-- Revisión y capacidad (ISO 8.2.3)
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS capacity_review         TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS reviewed_by             TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS reviewed_at             DATE;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS acceptance_date         DATE;

-- Cambios al pedido (ISO 8.2.4)
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS change_log              JSONB DEFAULT '[]'::jsonb;

-- Operativo
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS quoted_amount           NUMERIC;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS currency                TEXT DEFAULT 'USD';
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS priority                TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS evidence_url            TEXT;
ALTER TABLE customer_orders ADD COLUMN IF NOT EXISTS notes                   TEXT;

-- Drop status constraint anterior si existe e instalar el nuevo
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname LIKE 'customer_orders%status%check%'
  ) THEN
    EXECUTE 'ALTER TABLE customer_orders DROP CONSTRAINT IF EXISTS customer_orders_status_check';
  END IF;
END $$;

-- Tomamos los status legacy ('Revision', 'Aprobado', 'Rechazado') + nuevos
ALTER TABLE customer_orders
  ADD CONSTRAINT customer_orders_status_check
  CHECK (status IN ('Borrador','En Revisión','Revision','Aprobado','Rechazado','En Producción','Entregado'));

-- Índices
CREATE INDEX IF NOT EXISTS idx_customer_orders_org      ON customer_orders(org_id);
CREATE INDEX IF NOT EXISTS idx_customer_orders_status   ON customer_orders(status);
CREATE INDEX IF NOT EXISTS idx_customer_orders_delivery ON customer_orders(delivery_date);

-- RLS
ALTER TABLE customer_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "co_select" ON customer_orders;
CREATE POLICY "co_select" ON customer_orders FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "co_insert" ON customer_orders;
CREATE POLICY "co_insert" ON customer_orders FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "co_update" ON customer_orders;
CREATE POLICY "co_update" ON customer_orders FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "co_delete" ON customer_orders;
CREATE POLICY "co_delete" ON customer_orders FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
