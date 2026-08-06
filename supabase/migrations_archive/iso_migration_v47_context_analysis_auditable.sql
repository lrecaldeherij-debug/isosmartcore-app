-- =============================================================================
-- v47 — Context Analysis: ISO 4.1 (Comprensión de la organización y su contexto)
--
-- Agrega impacto/probabilidad, priorización, estado, revisión periódica,
-- vínculos cross-module y change_log.
-- =============================================================================

CREATE TABLE IF NOT EXISTS context_analysis (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  type                TEXT,
  category            TEXT,
  factor              TEXT NOT NULL,
  description         TEXT,
  strategy            TEXT,
  last_reviewed_date  DATE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Columnas nuevas ───
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS impact_level         TEXT DEFAULT 'Medio';
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS probability          TEXT DEFAULT 'Medio';
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS priority_score       INT;
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS status               TEXT DEFAULT 'Activo';
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS next_review_date     DATE;
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS linked_risk_id       UUID REFERENCES risk_matrix(id) ON DELETE SET NULL;
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS linked_stakeholder_id UUID REFERENCES stakeholders(id) ON DELETE SET NULL;
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS crossover_strategy   TEXT;
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS change_log           JSONB DEFAULT '[]'::jsonb;

-- ─── Limpieza defensiva ───
UPDATE context_analysis SET impact_level = 'Medio' WHERE impact_level IS NULL OR impact_level NOT IN ('Alto','Medio','Bajo');
UPDATE context_analysis SET probability = 'Medio' WHERE probability IS NULL OR probability NOT IN ('Alto','Medio','Bajo');
UPDATE context_analysis SET status = 'Activo' WHERE status IS NULL OR status NOT IN ('Activo','Mitigado','Obsoleto');
UPDATE context_analysis SET type = 'Interno' WHERE type IS NULL OR type NOT IN ('Interno','Externo');
UPDATE context_analysis SET category = 'Fortaleza' WHERE category IS NULL OR category NOT IN ('Fortaleza','Debilidad','Oportunidad','Amenaza');

-- ─── Constraints ───
ALTER TABLE context_analysis DROP CONSTRAINT IF EXISTS context_analysis_impact_check;
ALTER TABLE context_analysis
  ADD CONSTRAINT context_analysis_impact_check
  CHECK (impact_level IN ('Alto','Medio','Bajo'));

ALTER TABLE context_analysis DROP CONSTRAINT IF EXISTS context_analysis_probability_check;
ALTER TABLE context_analysis
  ADD CONSTRAINT context_analysis_probability_check
  CHECK (probability IN ('Alto','Medio','Bajo'));

ALTER TABLE context_analysis DROP CONSTRAINT IF EXISTS context_analysis_status_check;
ALTER TABLE context_analysis
  ADD CONSTRAINT context_analysis_status_check
  CHECK (status IN ('Activo','Mitigado','Obsoleto'));

ALTER TABLE context_analysis DROP CONSTRAINT IF EXISTS context_analysis_type_check;
ALTER TABLE context_analysis
  ADD CONSTRAINT context_analysis_type_check
  CHECK (type IN ('Interno','Externo'));

ALTER TABLE context_analysis DROP CONSTRAINT IF EXISTS context_analysis_category_check;
ALTER TABLE context_analysis
  ADD CONSTRAINT context_analysis_category_check
  CHECK (category IN ('Fortaleza','Debilidad','Oportunidad','Amenaza'));

-- ─── Índices ───
CREATE INDEX IF NOT EXISTS idx_context_org      ON context_analysis(org_id);
CREATE INDEX IF NOT EXISTS idx_context_status   ON context_analysis(status);
CREATE INDEX IF NOT EXISTS idx_context_category ON context_analysis(category);
CREATE INDEX IF NOT EXISTS idx_context_review   ON context_analysis(next_review_date);

-- ─── RLS ───
ALTER TABLE context_analysis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ctx_select" ON context_analysis;
CREATE POLICY "ctx_select" ON context_analysis FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "ctx_insert" ON context_analysis;
CREATE POLICY "ctx_insert" ON context_analysis FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "ctx_update" ON context_analysis;
CREATE POLICY "ctx_update" ON context_analysis FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "ctx_delete" ON context_analysis;
CREATE POLICY "ctx_delete" ON context_analysis FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
