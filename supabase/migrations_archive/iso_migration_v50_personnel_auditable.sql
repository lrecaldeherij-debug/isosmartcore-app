-- =============================================================================
-- v50 — Personnel: ISO 7.1.2 (Recursos humanos para el SGC)
--
-- Agrega vínculo formal a perfil de cargo y proceso, próxima evaluación,
-- análisis de brecha de competencia y change_log.
-- =============================================================================

CREATE TABLE IF NOT EXISTS personnel (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  full_name              TEXT NOT NULL,
  document_id            TEXT,
  start_date             DATE,
  email                  TEXT,
  phone                  TEXT,
  job_title              TEXT,
  education              TEXT,
  education_institution  TEXT,
  education_year         INT,
  experience             TEXT,
  skills                 TEXT,
  evidence_url           TEXT,
  status                 TEXT DEFAULT 'Competente',
  awareness_date         DATE,
  awareness_file_url     TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Columnas nuevas ───
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS job_id                UUID REFERENCES job_descriptions(id) ON DELETE SET NULL;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS process_id            UUID REFERENCES processes(id) ON DELETE SET NULL;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS next_evaluation_date  DATE;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS competency_gap        TEXT;
ALTER TABLE personnel ADD COLUMN IF NOT EXISTS change_log            JSONB DEFAULT '[]'::jsonb;

-- ─── Limpieza defensiva ───
UPDATE personnel SET status = 'Competente' WHERE status IS NULL OR status NOT IN ('Competente','En Formación','Brecha Detectada','Inactivo');

-- ─── Constraints ───
ALTER TABLE personnel DROP CONSTRAINT IF EXISTS personnel_status_check;
ALTER TABLE personnel
  ADD CONSTRAINT personnel_status_check
  CHECK (status IN ('Competente','En Formación','Brecha Detectada','Inactivo'));

-- ─── Índices ───
CREATE INDEX IF NOT EXISTS idx_personnel_org      ON personnel(org_id);
CREATE INDEX IF NOT EXISTS idx_personnel_status   ON personnel(status);
CREATE INDEX IF NOT EXISTS idx_personnel_job      ON personnel(job_id);
CREATE INDEX IF NOT EXISTS idx_personnel_process  ON personnel(process_id);
CREATE INDEX IF NOT EXISTS idx_personnel_next_eval ON personnel(next_evaluation_date);

-- ─── RLS ───
ALTER TABLE personnel ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pers_select" ON personnel;
CREATE POLICY "pers_select" ON personnel FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "pers_insert" ON personnel;
CREATE POLICY "pers_insert" ON personnel FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "pers_update" ON personnel;
CREATE POLICY "pers_update" ON personnel FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "pers_delete" ON personnel;
CREATE POLICY "pers_delete" ON personnel FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
