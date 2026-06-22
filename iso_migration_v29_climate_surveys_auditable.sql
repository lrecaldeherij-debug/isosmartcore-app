-- =============================================================================
-- v29 — Climate Surveys: crear tabla (si no existe) + campos auditables
--       para ISO 7.1.4 (Ambiente de trabajo).
--
-- La tabla climate_surveys estaba referenciada en migraciones de RLS (v10/v11/v12)
-- pero nunca tuvo un CREATE TABLE explícito. Este script:
--
--   1) Crea la tabla si no existe (con org_id multi-tenant).
--   2) Agrega los campos auditables: evidence_url, notes, survey_date.
--   3) Habilita RLS y las 4 políticas por org_id.
-- =============================================================================

-- 1. Crear tabla si no existe
CREATE TABLE IF NOT EXISTS climate_surveys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id     UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  responses_json  JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_score     NUMERIC,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Campos auditables (idempotente)
ALTER TABLE climate_surveys ADD COLUMN IF NOT EXISTS evidence_url TEXT;
ALTER TABLE climate_surveys ADD COLUMN IF NOT EXISTS notes        TEXT;
ALTER TABLE climate_surveys ADD COLUMN IF NOT EXISTS survey_date  DATE DEFAULT CURRENT_DATE;

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_climate_surveys_org      ON climate_surveys(org_id);
CREATE INDEX IF NOT EXISTS idx_climate_surveys_employee ON climate_surveys(employee_id);
CREATE INDEX IF NOT EXISTS idx_climate_surveys_date     ON climate_surveys(survey_date DESC);

-- 4. RLS
ALTER TABLE climate_surveys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cs_select" ON climate_surveys;
CREATE POLICY "cs_select" ON climate_surveys FOR SELECT USING (org_id = auth_org_id());

DROP POLICY IF EXISTS "cs_insert" ON climate_surveys;
CREATE POLICY "cs_insert" ON climate_surveys FOR INSERT WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS "cs_update" ON climate_surveys;
CREATE POLICY "cs_update" ON climate_surveys FOR UPDATE USING (org_id = auth_org_id());

DROP POLICY IF EXISTS "cs_delete" ON climate_surveys;
CREATE POLICY "cs_delete" ON climate_surveys FOR DELETE USING (org_id = auth_org_id());
