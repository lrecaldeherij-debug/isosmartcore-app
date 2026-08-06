-- =============================================================================
-- v51 — Training: ISO 7.2 (Competencia / Capacitación)
--
-- Separa eficacia del status del curso, agrega DNC (a qué brecha responde),
-- vínculo formal a cargos/procesos, plan anual, evidencias y change_log.
-- =============================================================================

CREATE TABLE IF NOT EXISTS training_records (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  course_name              TEXT NOT NULL,
  training_date            DATE,
  trainer                  TEXT,
  efficacy_evaluation      TEXT,
  status                   TEXT DEFAULT 'Realizado',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Columnas nuevas ───
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS type                       TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS modality                   TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS duration_hours             NUMERIC;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS cost                       NUMERIC;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS currency                   TEXT DEFAULT 'PYG';
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS learning_objective         TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS target_job_ids             JSONB DEFAULT '[]'::jsonb;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS target_process_ids         JSONB DEFAULT '[]'::jsonb;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS competency_gap_origin      TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS certificate_url            TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS material_url               TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS attendance_url             TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS efficacy_evaluation_date   DATE;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS efficacy_criteria          TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS efficacy_result            TEXT DEFAULT 'Pendiente';
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS efficacy_evaluator         TEXT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS planned_year               INT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS planned_quarter            INT;
ALTER TABLE training_records ADD COLUMN IF NOT EXISTS change_log                 JSONB DEFAULT '[]'::jsonb;

-- ─── Limpieza defensiva ───

-- Migrar status viejos: 'Completo' → 'Realizado', 'Ineficaz' → 'Realizado' (la ineficacia ahora vive en efficacy_result)
UPDATE training_records SET status = 'Realizado' WHERE status IN ('Completo','Ineficaz') OR status IS NULL;
UPDATE training_records SET efficacy_result = 'No eficaz' WHERE efficacy_result IS NULL AND status = 'Realizado' AND efficacy_evaluation ILIKE '%inefica%';
UPDATE training_records SET status = 'Planificado' WHERE status = 'Pendiente';
UPDATE training_records SET status = 'Realizado' WHERE status NOT IN ('Planificado','En Curso','Realizado','Evaluado','Cancelado');

UPDATE training_records SET efficacy_result = 'Pendiente' WHERE efficacy_result IS NULL OR efficacy_result NOT IN ('Pendiente','Eficaz','Eficaz Parcial','No Eficaz');

-- ─── Constraints ───
ALTER TABLE training_records DROP CONSTRAINT IF EXISTS training_records_status_check;
ALTER TABLE training_records
  ADD CONSTRAINT training_records_status_check
  CHECK (status IN ('Planificado','En Curso','Realizado','Evaluado','Cancelado'));

ALTER TABLE training_records DROP CONSTRAINT IF EXISTS training_records_efficacy_check;
ALTER TABLE training_records
  ADD CONSTRAINT training_records_efficacy_check
  CHECK (efficacy_result IN ('Pendiente','Eficaz','Eficaz Parcial','No Eficaz'));

-- ─── Índices ───
CREATE INDEX IF NOT EXISTS idx_training_org           ON training_records(org_id);
CREATE INDEX IF NOT EXISTS idx_training_status        ON training_records(status);
CREATE INDEX IF NOT EXISTS idx_training_efficacy      ON training_records(efficacy_result);
CREATE INDEX IF NOT EXISTS idx_training_date          ON training_records(training_date);
CREATE INDEX IF NOT EXISTS idx_training_planned_year  ON training_records(planned_year);
CREATE INDEX IF NOT EXISTS idx_training_efficacy_date ON training_records(efficacy_evaluation_date);

-- ─── RLS ───
ALTER TABLE training_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tr_select" ON training_records;
CREATE POLICY "tr_select" ON training_records FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "tr_insert" ON training_records;
CREATE POLICY "tr_insert" ON training_records FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "tr_update" ON training_records;
CREATE POLICY "tr_update" ON training_records FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "tr_delete" ON training_records;
CREATE POLICY "tr_delete" ON training_records FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
