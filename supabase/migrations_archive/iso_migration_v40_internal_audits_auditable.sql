-- =============================================================================
-- v40 — Internal Audits: ISO 9.2 (Auditoría Interna)
--
-- Extiende `internal_audits` con programa anual, alcance/criterios, equipo,
-- estados ricos y change_log. Mantiene compatibilidad con datos existentes.
-- =============================================================================

CREATE TABLE IF NOT EXISTS internal_audits (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  audit_date      DATE,
  audit_process   TEXT,
  auditor_name    TEXT,
  audit_results   TEXT,
  report_url      TEXT,
  is_finished     BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Programa / planificación
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS audit_type       TEXT DEFAULT 'Programada';
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS planned_date     DATE;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS actual_date      DATE;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS status           TEXT DEFAULT 'Planificada';
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS year             INT;

-- Alcance ISO 9.2.2
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS audit_scope      TEXT;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS audit_criteria   TEXT;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS process_id       UUID REFERENCES processes(id) ON DELETE SET NULL;

-- Equipo auditor
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS lead_auditor     TEXT;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS audit_team       JSONB DEFAULT '[]'::jsonb;

-- Resultados
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS findings_count   INT DEFAULT 0;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS conclusions      TEXT;
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS recommendations  TEXT;

-- Auditoría
ALTER TABLE internal_audits ADD COLUMN IF NOT EXISTS change_log       JSONB DEFAULT '[]'::jsonb;

-- Status constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname LIKE 'internal_audits%status%check%'
  ) THEN
    EXECUTE 'ALTER TABLE internal_audits DROP CONSTRAINT IF EXISTS internal_audits_status_check';
  END IF;
END $$;

ALTER TABLE internal_audits
  ADD CONSTRAINT internal_audits_status_check
  CHECK (status IN ('Planificada','En Ejecución','Cerrada','Cancelada'));

-- Type constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname LIKE 'internal_audits%type%check%'
  ) THEN
    EXECUTE 'ALTER TABLE internal_audits DROP CONSTRAINT IF EXISTS internal_audits_audit_type_check';
  END IF;
END $$;

ALTER TABLE internal_audits
  ADD CONSTRAINT internal_audits_audit_type_check
  CHECK (audit_type IN ('Programada','Extraordinaria','Seguimiento','Certificación'));

-- Índices
CREATE INDEX IF NOT EXISTS idx_internal_audits_org      ON internal_audits(org_id);
CREATE INDEX IF NOT EXISTS idx_internal_audits_status   ON internal_audits(status);
CREATE INDEX IF NOT EXISTS idx_internal_audits_planned  ON internal_audits(planned_date);
CREATE INDEX IF NOT EXISTS idx_internal_audits_year     ON internal_audits(year);
CREATE INDEX IF NOT EXISTS idx_internal_audits_process  ON internal_audits(process_id);

-- RLS
ALTER TABLE internal_audits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ia_select" ON internal_audits;
CREATE POLICY "ia_select" ON internal_audits FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "ia_insert" ON internal_audits;
CREATE POLICY "ia_insert" ON internal_audits FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "ia_update" ON internal_audits;
CREATE POLICY "ia_update" ON internal_audits FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "ia_delete" ON internal_audits;
CREATE POLICY "ia_delete" ON internal_audits FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
