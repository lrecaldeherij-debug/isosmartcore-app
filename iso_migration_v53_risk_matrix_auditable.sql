-- =============================================================================
-- v53 — Risks & Opportunities: ISO 6.1 (Acciones para abordar riesgos y oportunidades)
--
-- Agrega distinción Riesgo vs Oportunidad, categoría, vínculos formales a
-- proceso/stakeholder/contexto, estrategia de tratamiento, KRI, fechas de
-- revisión, owner, costo y cross-link con strategic_actions/improvement_opps,
-- workflow de status y change_log.
-- =============================================================================

CREATE TABLE IF NOT EXISTS risk_matrix (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  process_area          TEXT,
  risk_description      TEXT,
  probability_initial   INT,
  impact_initial        INT,
  control_measure       TEXT,
  responsible           TEXT,
  status                TEXT DEFAULT 'Identificado',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Columnas nuevas ───

-- Distinción Riesgo vs Oportunidad
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS type                       TEXT DEFAULT 'Riesgo';
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS category                   TEXT;

-- Vínculos formales (FK)
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS process_id                 UUID REFERENCES processes(id) ON DELETE SET NULL;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS stakeholder_id             UUID REFERENCES stakeholders(id) ON DELETE SET NULL;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS context_id                 UUID REFERENCES context_analysis(id) ON DELETE SET NULL;

-- Causa y consecuencia separadas (ISO requiere "pensamiento basado en riesgos")
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS potential_cause            TEXT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS potential_consequence      TEXT;

-- Estrategia de tratamiento
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS treatment_strategy         TEXT;

-- KRI (Key Risk Indicator)
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS kri_indicator              TEXT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS kri_target                 TEXT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS kri_current                TEXT;

-- Fechas y trazabilidad
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS identification_date        DATE DEFAULT CURRENT_DATE;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS due_date                   DATE;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS review_date                DATE;

-- Owner y aprobador
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS owner                      TEXT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS approved_by                TEXT;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS approved_at                DATE;

-- Cross-link con otros módulos
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS strategic_action_id        UUID REFERENCES strategic_actions(id) ON DELETE SET NULL;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS improvement_opportunity_id UUID REFERENCES improvement_opportunities(id) ON DELETE SET NULL;

-- Costo del tratamiento
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS treatment_cost             NUMERIC;
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS currency                   TEXT DEFAULT 'PYG';

-- Auditable
ALTER TABLE risk_matrix ADD COLUMN IF NOT EXISTS change_log                 JSONB DEFAULT '[]'::jsonb;

-- ─── Limpieza defensiva ───

-- Migrar status viejos al workflow nuevo
UPDATE risk_matrix SET status = 'En Tratamiento' WHERE status = 'En proceso';
UPDATE risk_matrix SET status = 'Identificado'
  WHERE status IS NULL
     OR status NOT IN ('Identificado','Evaluado','En Tratamiento','Tratado','Aceptado','Cerrado','Materializado');

-- Default type para registros viejos
UPDATE risk_matrix SET type = 'Riesgo' WHERE type IS NULL OR type NOT IN ('Riesgo','Oportunidad');

-- Default category si está vacío
UPDATE risk_matrix SET category = 'Operacional'
  WHERE category IS NULL
     OR category NOT IN ('Estratégico','Operacional','Financiero','Cumplimiento','Reputacional','Tecnológico','Personal','Cliente','Proveedor','Mercado');

-- Default treatment_strategy si está vacío
UPDATE risk_matrix SET treatment_strategy = 'Mitigar'
  WHERE treatment_strategy IS NULL
     OR treatment_strategy NOT IN ('Evitar','Mitigar','Transferir','Aceptar','Aprovechar','Mejorar','Compartir');

-- ─── Constraints ───
ALTER TABLE risk_matrix DROP CONSTRAINT IF EXISTS risk_matrix_type_check;
ALTER TABLE risk_matrix
  ADD CONSTRAINT risk_matrix_type_check
  CHECK (type IN ('Riesgo','Oportunidad'));

ALTER TABLE risk_matrix DROP CONSTRAINT IF EXISTS risk_matrix_category_check;
ALTER TABLE risk_matrix
  ADD CONSTRAINT risk_matrix_category_check
  CHECK (category IN ('Estratégico','Operacional','Financiero','Cumplimiento','Reputacional','Tecnológico','Personal','Cliente','Proveedor','Mercado'));

ALTER TABLE risk_matrix DROP CONSTRAINT IF EXISTS risk_matrix_status_check;
ALTER TABLE risk_matrix
  ADD CONSTRAINT risk_matrix_status_check
  CHECK (status IN ('Identificado','Evaluado','En Tratamiento','Tratado','Aceptado','Cerrado','Materializado'));

ALTER TABLE risk_matrix DROP CONSTRAINT IF EXISTS risk_matrix_treatment_check;
ALTER TABLE risk_matrix
  ADD CONSTRAINT risk_matrix_treatment_check
  CHECK (treatment_strategy IN ('Evitar','Mitigar','Transferir','Aceptar','Aprovechar','Mejorar','Compartir'));

-- ─── Índices ───
CREATE INDEX IF NOT EXISTS idx_rm_org             ON risk_matrix(org_id);
CREATE INDEX IF NOT EXISTS idx_rm_type            ON risk_matrix(type);
CREATE INDEX IF NOT EXISTS idx_rm_category        ON risk_matrix(category);
CREATE INDEX IF NOT EXISTS idx_rm_status          ON risk_matrix(status);
CREATE INDEX IF NOT EXISTS idx_rm_process         ON risk_matrix(process_id);
CREATE INDEX IF NOT EXISTS idx_rm_stakeholder     ON risk_matrix(stakeholder_id);
CREATE INDEX IF NOT EXISTS idx_rm_context         ON risk_matrix(context_id);
CREATE INDEX IF NOT EXISTS idx_rm_strategic       ON risk_matrix(strategic_action_id);
CREATE INDEX IF NOT EXISTS idx_rm_improvement     ON risk_matrix(improvement_opportunity_id);
CREATE INDEX IF NOT EXISTS idx_rm_review_date     ON risk_matrix(review_date);
CREATE INDEX IF NOT EXISTS idx_rm_score_initial   ON risk_matrix(score_initial);

-- ─── RLS ───
ALTER TABLE risk_matrix ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rm_select" ON risk_matrix;
CREATE POLICY "rm_select" ON risk_matrix FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "rm_insert" ON risk_matrix;
CREATE POLICY "rm_insert" ON risk_matrix FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "rm_update" ON risk_matrix;
CREATE POLICY "rm_update" ON risk_matrix FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "rm_delete" ON risk_matrix;
CREATE POLICY "rm_delete" ON risk_matrix FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
