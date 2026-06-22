-- =============================================================================
-- v28 — Cerrar Personal ISO 7.2 (Competencia) y 7.3 (Toma de conciencia)
--
-- 1) training_attendees — relación N:M empleados ↔ capacitaciones.
--    Reemplaza el campo libre "participants" del Training viejo por una
--    vinculación real con personnel, así cada empleado puede mostrar las
--    capacitaciones que recibió.
--
-- 2) performance_evaluations — histórico de evaluaciones de desempeño
--    (score 1-5). Mismo patrón que objective_measurements (v26).
-- =============================================================================

-- 1. Asistentes a capacitaciones
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

DROP POLICY IF EXISTS "ta_select" ON training_attendees;
CREATE POLICY "ta_select" ON training_attendees FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "ta_insert" ON training_attendees;
CREATE POLICY "ta_insert" ON training_attendees FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "ta_update" ON training_attendees;
CREATE POLICY "ta_update" ON training_attendees FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "ta_delete" ON training_attendees;
CREATE POLICY "ta_delete" ON training_attendees FOR DELETE USING (org_id = auth_org_id());


-- 2. Histórico de evaluaciones de desempeño
CREATE TABLE IF NOT EXISTS performance_evaluations (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  person_id        UUID NOT NULL REFERENCES personnel(id) ON DELETE CASCADE,
  evaluation_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  score            NUMERIC NOT NULL CHECK (score >= 1 AND score <= 5),
  evaluator_name   TEXT,
  notes            TEXT,
  evidence_url     TEXT,
  recorded_by      UUID REFERENCES auth.users(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perfeval_person_date ON performance_evaluations(person_id, evaluation_date DESC);
CREATE INDEX IF NOT EXISTS idx_perfeval_org ON performance_evaluations(org_id);

ALTER TABLE performance_evaluations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pe_select" ON performance_evaluations;
CREATE POLICY "pe_select" ON performance_evaluations FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "pe_insert" ON performance_evaluations;
CREATE POLICY "pe_insert" ON performance_evaluations FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "pe_update" ON performance_evaluations;
CREATE POLICY "pe_update" ON performance_evaluations FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "pe_delete" ON performance_evaluations;
CREATE POLICY "pe_delete" ON performance_evaluations FOR DELETE USING (org_id = auth_org_id());
