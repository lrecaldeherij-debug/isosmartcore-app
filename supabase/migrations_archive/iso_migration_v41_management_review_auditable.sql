-- =============================================================================
-- v41 — Management Review: ISO 9.3 (Revisión por la Dirección)
--
-- Extiende `management_review` con entradas/salidas estructuradas según
-- ISO 9.3.2 y 9.3.3, agenda y asistentes. Crea tabla `management_review_actions`
-- para acciones derivadas (decisiones con responsable + plazo).
-- =============================================================================

CREATE TABLE IF NOT EXISTS management_review (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  review_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  review_status   TEXT DEFAULT 'Completa',
  review_inputs   TEXT,
  review_outputs  TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Planificación
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS review_type        TEXT DEFAULT 'Anual';
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS period_start       DATE;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS period_end         DATE;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS status             TEXT DEFAULT 'Programada';

-- Agenda y asistentes
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS agenda             TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS chairperson        TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS attendees          JSONB DEFAULT '[]'::jsonb;

-- Entradas estructuradas (ISO 9.3.2)
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_previous_actions    TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_changes             TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_performance         TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_audit_results       TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_nonconformities     TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_supplier_performance TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_customer_feedback   TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_resources           TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_risks               TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS inputs_objectives          TEXT;

-- Salidas estructuradas (ISO 9.3.3)
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS outputs_improvement_opportunities TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS outputs_changes_needed     TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS outputs_resource_needs     TEXT;

-- Acta + auditoría
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS report_url         TEXT;
ALTER TABLE management_review ADD COLUMN IF NOT EXISTS change_log         JSONB DEFAULT '[]'::jsonb;

-- Status constraint (nuevo)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname LIKE 'management_review%status%check%'
      AND conname NOT LIKE '%review_status%'
  ) THEN
    EXECUTE 'ALTER TABLE management_review DROP CONSTRAINT IF EXISTS management_review_status_check';
  END IF;
END $$;

ALTER TABLE management_review
  ADD CONSTRAINT management_review_status_check
  CHECK (status IN ('Programada','En Ejecución','Cerrada','Cancelada'));

-- Type constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname LIKE 'management_review%review_type%check%'
  ) THEN
    EXECUTE 'ALTER TABLE management_review DROP CONSTRAINT IF EXISTS management_review_review_type_check';
  END IF;
END $$;

ALTER TABLE management_review
  ADD CONSTRAINT management_review_review_type_check
  CHECK (review_type IN ('Anual','Semestral','Trimestral','Extraordinaria'));

CREATE INDEX IF NOT EXISTS idx_mr_org    ON management_review(org_id);
CREATE INDEX IF NOT EXISTS idx_mr_status ON management_review(status);
CREATE INDEX IF NOT EXISTS idx_mr_date   ON management_review(review_date DESC);

-- RLS
ALTER TABLE management_review ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mr_select" ON management_review;
CREATE POLICY "mr_select" ON management_review FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "mr_insert" ON management_review;
CREATE POLICY "mr_insert" ON management_review FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "mr_update" ON management_review;
CREATE POLICY "mr_update" ON management_review FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "mr_delete" ON management_review;
CREATE POLICY "mr_delete" ON management_review FOR DELETE USING (org_id = auth_org_id());


-- ============================================================================
-- ACCIONES DERIVADAS DE LA REVISIÓN (tabla nueva)
-- ============================================================================
CREATE TABLE IF NOT EXISTS management_review_actions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  review_id     UUID NOT NULL REFERENCES management_review(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  responsible   TEXT,
  due_date      DATE,
  status        TEXT DEFAULT 'Pendiente' CHECK (status IN ('Pendiente','En curso','Cerrada','Cancelada')),
  priority      TEXT DEFAULT 'Media' CHECK (priority IN ('Alta','Media','Baja')),
  category      TEXT,  -- 'Mejora' | 'Cambio' | 'Recurso'
  evidence_url  TEXT,
  notes         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mra_org    ON management_review_actions(org_id);
CREATE INDEX IF NOT EXISTS idx_mra_review ON management_review_actions(review_id);
CREATE INDEX IF NOT EXISTS idx_mra_status ON management_review_actions(status);
CREATE INDEX IF NOT EXISTS idx_mra_due    ON management_review_actions(due_date);

ALTER TABLE management_review_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mra_select" ON management_review_actions;
CREATE POLICY "mra_select" ON management_review_actions FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "mra_insert" ON management_review_actions;
CREATE POLICY "mra_insert" ON management_review_actions FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "mra_update" ON management_review_actions;
CREATE POLICY "mra_update" ON management_review_actions FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "mra_delete" ON management_review_actions;
CREATE POLICY "mra_delete" ON management_review_actions FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
