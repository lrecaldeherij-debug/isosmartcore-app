-- Add missing columns detected via 400 errors on Dashboard load.
-- Root cause: v67 master sync no cubrió estas columnas; el código deployado
-- las pide y PostgREST devuelve 42703 (undefined_column) rompiendo el load.

ALTER TABLE stakeholders     ADD COLUMN IF NOT EXISTS expectations       TEXT;
ALTER TABLE stakeholders     ADD COLUMN IF NOT EXISTS needs              TEXT;
ALTER TABLE stakeholders     ADD COLUMN IF NOT EXISTS influence_level    TEXT DEFAULT 'Medio';
ALTER TABLE quality_policy   ADD COLUMN IF NOT EXISTS policy_text        TEXT;
ALTER TABLE context_analysis ADD COLUMN IF NOT EXISTS last_reviewed_date DATE;

NOTIFY pgrst, 'reload schema';
