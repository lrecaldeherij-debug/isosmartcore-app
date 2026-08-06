-- =============================================================================
-- v43 — Job Descriptions: ISO 5.3 (Roles, Responsabilidades y Autoridades)
--
-- Agrega autoridades (explícito en ISO 5.3), competencias, titular actual,
-- flag Responsable del SGC, matriz RACI por proceso y change_log.
--
-- NOTA: incluye limpieza defensiva de valores viejos en `level` y `status`
-- antes de aplicar los CHECK constraints, para evitar errores 23514 en bases
-- con datos preexistentes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS job_descriptions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  title                   TEXT NOT NULL,
  code                    TEXT,
  level                   TEXT,
  dependency              TEXT,
  salary                  TEXT,
  mission                 TEXT,
  document_url            TEXT,
  functions_json          JSONB DEFAULT '[]'::jsonb,
  responsibilities_json   JSONB DEFAULT '{}'::jsonb,
  elaborated_by           TEXT,
  revised_by              TEXT,
  approved_by             TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Columnas nuevas ───

-- Autoridades (ISO 5.3 distingue funciones de autoridades)
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS authorities_json    JSONB DEFAULT '[]'::jsonb;

-- Competencias requeridas
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS competencies_json   JSONB DEFAULT '{}'::jsonb;

-- Titular actual
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS current_holder      TEXT;
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS current_holder_since DATE;

-- Estado del cargo
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS status              TEXT DEFAULT 'Activo';

-- Marker Responsable del SGC
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS is_sgc_responsible  BOOLEAN DEFAULT false;

-- RACI por proceso
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS raci_json           JSONB DEFAULT '[]'::jsonb;

-- Auditoría
ALTER TABLE job_descriptions ADD COLUMN IF NOT EXISTS change_log          JSONB DEFAULT '[]'::jsonb;

-- ─── Limpieza defensiva ANTES de los constraints ───

-- Drop constraints viejos (si quedaron parcialmente aplicados)
ALTER TABLE job_descriptions DROP CONSTRAINT IF EXISTS job_descriptions_level_check;
ALTER TABLE job_descriptions DROP CONSTRAINT IF EXISTS job_descriptions_status_check;

-- Normalizar `level`: pasar a NULL todo lo que no esté en el set permitido
UPDATE job_descriptions
SET level = NULL
WHERE level IS NOT NULL
  AND level NOT IN ('Estratégico','Táctico','Operativo','');

-- Normalizar `status`: pasar a 'Activo' lo que no esté en el set permitido
UPDATE job_descriptions
SET status = 'Activo'
WHERE status IS NULL
   OR status NOT IN ('Activo','Vacante','Inactivo','Borrador');

-- ─── Constraints ───

ALTER TABLE job_descriptions
  ADD CONSTRAINT job_descriptions_status_check
  CHECK (status IN ('Activo','Vacante','Inactivo','Borrador'));

ALTER TABLE job_descriptions
  ADD CONSTRAINT job_descriptions_level_check
  CHECK (level IN ('Estratégico','Táctico','Operativo','') OR level IS NULL);

-- Solo un Responsable del SGC por organización (partial unique index)
CREATE UNIQUE INDEX IF NOT EXISTS idx_job_desc_one_sgc_per_org
  ON job_descriptions(org_id) WHERE is_sgc_responsible = true;

-- ─── Índices ───
CREATE INDEX IF NOT EXISTS idx_job_desc_org    ON job_descriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_job_desc_status ON job_descriptions(status);
CREATE INDEX IF NOT EXISTS idx_job_desc_level  ON job_descriptions(level);

-- ─── RLS ───
ALTER TABLE job_descriptions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "jd_select" ON job_descriptions;
CREATE POLICY "jd_select" ON job_descriptions FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "jd_insert" ON job_descriptions;
CREATE POLICY "jd_insert" ON job_descriptions FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "jd_update" ON job_descriptions;
CREATE POLICY "jd_update" ON job_descriptions FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "jd_delete" ON job_descriptions;
CREATE POLICY "jd_delete" ON job_descriptions FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
