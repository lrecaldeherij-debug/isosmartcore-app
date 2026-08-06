-- =============================================================================
-- v55 — Quality Objectives: ISO 6.2 (Objetivos de calidad y planificación)
--
-- Agrega name/descripción separados, SMART check estructurado, categoría,
-- baseline + fechas, vínculos a procesos/política/riesgo/strategic_action/
-- mejora, aprobación, método de comunicación y change_log.
-- =============================================================================

CREATE TABLE IF NOT EXISTS quality_objectives (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  objective                   TEXT,
  indicator                   TEXT,
  target                      NUMERIC,
  current                     NUMERIC,
  unit                        TEXT DEFAULT '%',
  frequency                   TEXT DEFAULT 'Mensual',
  responsible                 TEXT,
  evidence_url                TEXT,
  status                      TEXT DEFAULT 'Borrador',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Columnas BASE (defensivo por si la tabla existía con esquema más viejo) ───
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS objective                  TEXT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS indicator                  TEXT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS target                     NUMERIC;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS current                    NUMERIC;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS unit                       TEXT DEFAULT '%';
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS frequency                  TEXT DEFAULT 'Mensual';
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS responsible                TEXT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS evidence_url               TEXT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS status                     TEXT DEFAULT 'Borrador';
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS created_at                 TIMESTAMPTZ NOT NULL DEFAULT now();

-- ─── Columnas nuevas ───

-- Identificación
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS name                       TEXT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS category                   TEXT;

-- SMART check estructurado
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS is_specific                BOOLEAN DEFAULT false;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS is_measurable              BOOLEAN DEFAULT false;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS is_achievable              BOOLEAN DEFAULT false;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS is_relevant                BOOLEAN DEFAULT false;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS is_time_bound              BOOLEAN DEFAULT false;

-- Línea base + fechas
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS baseline_value             NUMERIC;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS year                       INT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS start_date                 DATE;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS target_date                DATE;

-- Vínculos
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS process_ids                JSONB DEFAULT '[]'::jsonb;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS policy_id                  UUID REFERENCES quality_policy(id) ON DELETE SET NULL;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS strategic_action_id        UUID REFERENCES strategic_actions(id) ON DELETE SET NULL;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS improvement_opportunity_id UUID REFERENCES improvement_opportunities(id) ON DELETE SET NULL;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS risk_id                    UUID REFERENCES risk_matrix(id) ON DELETE SET NULL;

-- Aprobación
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS approved_by                TEXT;
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS approved_at                DATE;

-- Comunicación
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS comm_method                TEXT;

-- Auditable
ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS change_log                 JSONB DEFAULT '[]'::jsonb;

-- ─── Limpieza defensiva ───

-- Si tienen 'objective' pero no 'name', copiar los primeros 80 chars
UPDATE quality_objectives
   SET name = LEFT(objective, 80)
 WHERE (name IS NULL OR name = '') AND objective IS NOT NULL AND objective <> '';

-- Default category
UPDATE quality_objectives SET category = 'Otra'
 WHERE category IS NULL
    OR category NOT IN ('Calidad','Satisfacción','Eficiencia','Costo','Tiempo','Seguridad','Otra');

-- Default year (año actual si NULL)
UPDATE quality_objectives SET year = EXTRACT(YEAR FROM COALESCE(created_at, now()))::INT
 WHERE year IS NULL;

-- Migrar status viejos al workflow nuevo
UPDATE quality_objectives SET status = 'Borrador'
 WHERE status IS NULL
    OR status NOT IN ('Borrador','Aprobado','En curso','Cumplido','No cumplido','Reformulado');

-- ─── Constraints ───
ALTER TABLE quality_objectives DROP CONSTRAINT IF EXISTS quality_objectives_status_check;
ALTER TABLE quality_objectives
  ADD CONSTRAINT quality_objectives_status_check
  CHECK (status IN ('Borrador','Aprobado','En curso','Cumplido','No cumplido','Reformulado'));

ALTER TABLE quality_objectives DROP CONSTRAINT IF EXISTS quality_objectives_category_check;
ALTER TABLE quality_objectives
  ADD CONSTRAINT quality_objectives_category_check
  CHECK (category IN ('Calidad','Satisfacción','Eficiencia','Costo','Tiempo','Seguridad','Otra'));

-- ─── Índices ───
CREATE INDEX IF NOT EXISTS idx_qo_org              ON quality_objectives(org_id);
CREATE INDEX IF NOT EXISTS idx_qo_status           ON quality_objectives(status);
CREATE INDEX IF NOT EXISTS idx_qo_category         ON quality_objectives(category);
CREATE INDEX IF NOT EXISTS idx_qo_year             ON quality_objectives(year);
CREATE INDEX IF NOT EXISTS idx_qo_policy           ON quality_objectives(policy_id);
CREATE INDEX IF NOT EXISTS idx_qo_risk             ON quality_objectives(risk_id);
CREATE INDEX IF NOT EXISTS idx_qo_strategic        ON quality_objectives(strategic_action_id);
CREATE INDEX IF NOT EXISTS idx_qo_improvement      ON quality_objectives(improvement_opportunity_id);
CREATE INDEX IF NOT EXISTS idx_qo_target_date      ON quality_objectives(target_date);

-- ─── RLS ───
ALTER TABLE quality_objectives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qo_select" ON quality_objectives;
CREATE POLICY "qo_select" ON quality_objectives FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "qo_insert" ON quality_objectives;
CREATE POLICY "qo_insert" ON quality_objectives FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "qo_update" ON quality_objectives;
CREATE POLICY "qo_update" ON quality_objectives FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "qo_delete" ON quality_objectives;
CREATE POLICY "qo_delete" ON quality_objectives FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
