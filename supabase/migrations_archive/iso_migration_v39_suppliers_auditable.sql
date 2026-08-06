-- =============================================================================
-- v39 — Suppliers: ISO 8.4 (Control de procesos, productos y servicios externos)
--
-- Cambios:
--  1) Extiende `suppliers` con datos comerciales, criticidad, criterios separados
--     (calidad/plazo/precio/servicio), requisitos comunicados, próxima reevaluación
--     y change_log auditable.
--  2) Crea tabla nueva `supplier_evaluations` para mantener histórico de evaluaciones
--     (no solo el último score).
-- =============================================================================

-- ----------------------- TABLA BASE (idempotente) ----------------------------
CREATE TABLE IF NOT EXISTS suppliers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  product_service    TEXT,
  contact_info       TEXT,
  evaluation_score   NUMERIC,
  status             TEXT DEFAULT 'Aprobado',
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------- COLUMNAS NUEVAS -------------------------------------
-- Identificación / datos comerciales
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS tax_id                    TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS address                   TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS country                   TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS website                   TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_name              TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_email             TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS contact_phone             TEXT;

-- Clasificación (nivel de control ISO 8.4.1)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS category                  TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS criticality               TEXT DEFAULT 'Normal';

-- 8.4.3 — Requisitos comunicados al proveedor
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS requirements_communicated TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS requirements_communicated_at DATE;

-- 8.4.2 — Última evaluación (criterios separados)
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS criteria_quality          INT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS criteria_delivery         INT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS criteria_price            INT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS criteria_service          INT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS evaluation_date           DATE;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS last_evaluation_by        TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS next_evaluation_date      DATE;

-- Evidencia + auditoría
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS evidence_url              TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS notes                     TEXT;
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS change_log                JSONB DEFAULT '[]'::jsonb;

-- Status constraint (con los 3 estados originales + 'En Evaluación')
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname LIKE 'suppliers%status%check%'
  ) THEN
    EXECUTE 'ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_status_check';
  END IF;
END $$;

ALTER TABLE suppliers
  ADD CONSTRAINT suppliers_status_check
  CHECK (status IN ('Aprobado','Condicionado','Rechazado','En Evaluación'));

-- Criticality constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname LIKE 'suppliers%criticality%check%'
  ) THEN
    EXECUTE 'ALTER TABLE suppliers DROP CONSTRAINT IF EXISTS suppliers_criticality_check';
  END IF;
END $$;

ALTER TABLE suppliers
  ADD CONSTRAINT suppliers_criticality_check
  CHECK (criticality IN ('Crítico','Normal','Estratégico'));

-- Índices
CREATE INDEX IF NOT EXISTS idx_suppliers_org         ON suppliers(org_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_status      ON suppliers(status);
CREATE INDEX IF NOT EXISTS idx_suppliers_criticality ON suppliers(criticality);
CREATE INDEX IF NOT EXISTS idx_suppliers_next_eval   ON suppliers(next_evaluation_date);

-- RLS suppliers
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sup_select" ON suppliers;
CREATE POLICY "sup_select" ON suppliers FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "sup_insert" ON suppliers;
CREATE POLICY "sup_insert" ON suppliers FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "sup_update" ON suppliers;
CREATE POLICY "sup_update" ON suppliers FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "sup_delete" ON suppliers;
CREATE POLICY "sup_delete" ON suppliers FOR DELETE USING (org_id = auth_org_id());


-- ============================================================================
-- HISTÓRICO DE EVALUACIONES (tabla nueva)
-- ============================================================================
CREATE TABLE IF NOT EXISTS supplier_evaluations (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  supplier_id         UUID NOT NULL REFERENCES suppliers(id) ON DELETE CASCADE,
  evaluation_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  evaluator_name      TEXT,
  evaluator_user_id   UUID REFERENCES auth.users(id),
  criteria_quality    INT,
  criteria_delivery   INT,
  criteria_price      INT,
  criteria_service    INT,
  score_total         NUMERIC,
  decision            TEXT CHECK (decision IN ('Mantener','Condicionar','Rechazar')),
  comments            TEXT,
  evidence_url        TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sup_evals_org        ON supplier_evaluations(org_id);
CREATE INDEX IF NOT EXISTS idx_sup_evals_supplier   ON supplier_evaluations(supplier_id);
CREATE INDEX IF NOT EXISTS idx_sup_evals_date       ON supplier_evaluations(evaluation_date DESC);

ALTER TABLE supplier_evaluations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "se_select" ON supplier_evaluations;
CREATE POLICY "se_select" ON supplier_evaluations FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "se_insert" ON supplier_evaluations;
CREATE POLICY "se_insert" ON supplier_evaluations FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "se_update" ON supplier_evaluations;
CREATE POLICY "se_update" ON supplier_evaluations FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "se_delete" ON supplier_evaluations;
CREATE POLICY "se_delete" ON supplier_evaluations FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
