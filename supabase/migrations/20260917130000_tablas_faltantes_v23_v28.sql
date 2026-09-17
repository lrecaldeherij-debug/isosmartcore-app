-- =============================================================================
-- Tablas que el frontend usa pero que nunca llegaron a producción
--
-- Verificado el 2026-09-17 contra la base real: training_attendees,
-- performance_evaluations y report_artifacts no existen. Las definían dos
-- migraciones del archivo (v23 y v28) que quedaron sin aplicar, así que:
--
--   - Formación (7.2): la lista de asistentes por capacitación falla; el
--     historial de capacitaciones por persona sale siempre vacío.
--   - Personal (7.1.2 / 7.2): el historial de evaluaciones de desempeño falla.
--   - Guía de implementación: el "informe oficial" (PDF firmado subido por el
--     cliente) no se puede guardar ni listar.
--
-- Como el código hace `data || []`, ninguno de esos fallos se veía: las
-- secciones aparecían vacías como si no hubiera registros.
--
-- Esta migración las crea con el patrón actual del proyecto (RLS por org +
-- soporte de impersonación de super_admin). Es idempotente.
-- =============================================================================

BEGIN;

-- ─── 1. Asistentes a capacitaciones (7.2) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS training_attendees (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  training_id  UUID NOT NULL REFERENCES training_records(id) ON DELETE CASCADE,
  person_id    UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  attended     BOOLEAN NOT NULL DEFAULT true,
  score        NUMERIC,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (training_id, person_id)
);

CREATE INDEX IF NOT EXISTS idx_training_attendees_person ON training_attendees(person_id);
CREATE INDEX IF NOT EXISTS idx_training_attendees_training ON training_attendees(training_id);

ALTER TABLE training_attendees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ta_select ON training_attendees;
CREATE POLICY ta_select ON training_attendees FOR SELECT
  USING (
    org_id = auth_org_id()
    OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
  );
DROP POLICY IF EXISTS ta_insert ON training_attendees;
CREATE POLICY ta_insert ON training_attendees FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS ta_update ON training_attendees;
CREATE POLICY ta_update ON training_attendees FOR UPDATE
  USING (org_id = auth_org_id()) WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS ta_delete ON training_attendees;
CREATE POLICY ta_delete ON training_attendees FOR DELETE USING (org_id = auth_org_id());

-- ─── 2. Evaluaciones de desempeño (7.1.2 / 7.2) ─────────────────────────────
CREATE TABLE IF NOT EXISTS performance_evaluations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  person_id        UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  evaluation_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  score            NUMERIC NOT NULL CHECK (score >= 1 AND score <= 5),
  evaluator_name   TEXT,
  notes            TEXT,
  evidence_url     TEXT,
  recorded_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perfeval_person_date ON performance_evaluations(person_id, evaluation_date DESC);
CREATE INDEX IF NOT EXISTS idx_perfeval_org ON performance_evaluations(org_id);

ALTER TABLE performance_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pe_select ON performance_evaluations;
CREATE POLICY pe_select ON performance_evaluations FOR SELECT
  USING (
    org_id = auth_org_id()
    OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
  );
DROP POLICY IF EXISTS pe_insert ON performance_evaluations;
CREATE POLICY pe_insert ON performance_evaluations FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS pe_update ON performance_evaluations;
CREATE POLICY pe_update ON performance_evaluations FOR UPDATE
  USING (org_id = auth_org_id()) WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS pe_delete ON performance_evaluations;
CREATE POLICY pe_delete ON performance_evaluations FOR DELETE USING (org_id = auth_org_id());

-- ─── 3. Informes oficiales subidos por el cliente (7.5.3) ───────────────────
CREATE TABLE IF NOT EXISTS report_artifacts (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  report_key        TEXT NOT NULL,
  storage_path      TEXT NOT NULL,
  original_filename TEXT NOT NULL,
  mime_type         TEXT,
  size_bytes        BIGINT,
  version_label     TEXT,
  notes             TEXT,
  uploaded_by       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  uploaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_active         BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_report_artifacts_org_key_active
  ON report_artifacts(org_id, report_key, is_active, uploaded_at DESC);

ALTER TABLE report_artifacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_artifacts_select ON report_artifacts;
CREATE POLICY report_artifacts_select ON report_artifacts FOR SELECT
  USING (
    org_id = auth_org_id()
    OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
  );
DROP POLICY IF EXISTS report_artifacts_insert ON report_artifacts;
CREATE POLICY report_artifacts_insert ON report_artifacts FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS report_artifacts_update ON report_artifacts;
CREATE POLICY report_artifacts_update ON report_artifacts FOR UPDATE
  USING (org_id = auth_org_id()) WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS report_artifacts_delete ON report_artifacts;
CREATE POLICY report_artifacts_delete ON report_artifacts FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';

COMMIT;
