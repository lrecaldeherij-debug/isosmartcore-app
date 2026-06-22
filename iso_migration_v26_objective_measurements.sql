-- =============================================================================
-- v26 — Objetivos: evidencia + histórico de mediciones
--
-- 1) Agrega evidence_url a quality_objectives (link a Drive/PowerBI/Sheet).
-- 2) Crea tabla objective_measurements para guardar cada medición con fecha
--    (eje de auditoría ISO 9.1 — seguimiento, medición, análisis y evaluación).
--
-- El valor "current" de quality_objectives se mantiene como cache del último
-- valor para no romper el render existente; pero la verdad histórica vive en
-- objective_measurements.
-- =============================================================================

ALTER TABLE quality_objectives ADD COLUMN IF NOT EXISTS evidence_url TEXT;

CREATE TABLE IF NOT EXISTS objective_measurements (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  objective_id  UUID NOT NULL REFERENCES quality_objectives(id) ON DELETE CASCADE,
  value         NUMERIC NOT NULL,
  measured_at   DATE NOT NULL DEFAULT CURRENT_DATE,
  notes         TEXT,
  recorded_by   UUID REFERENCES auth.users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_objective_measurements_obj_date
  ON objective_measurements(objective_id, measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_objective_measurements_org
  ON objective_measurements(org_id);

ALTER TABLE objective_measurements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "obj_meas_select" ON objective_measurements;
CREATE POLICY "obj_meas_select" ON objective_measurements
  FOR SELECT USING (org_id = auth_org_id());

DROP POLICY IF EXISTS "obj_meas_insert" ON objective_measurements;
CREATE POLICY "obj_meas_insert" ON objective_measurements
  FOR INSERT WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS "obj_meas_update" ON objective_measurements;
CREATE POLICY "obj_meas_update" ON objective_measurements
  FOR UPDATE USING (org_id = auth_org_id());

DROP POLICY IF EXISTS "obj_meas_delete" ON objective_measurements;
CREATE POLICY "obj_meas_delete" ON objective_measurements
  FOR DELETE USING (org_id = auth_org_id());
