-- =============================================================================
-- v46 — Quality Policy: ISO 5.2 (Compromiso de la Alta Dirección)
--
-- Agrega workflow, aprobación formal, tracking de comunicación,
-- alineación con objetivos 6.2 y change_log auditable.
-- =============================================================================

CREATE TABLE IF NOT EXISTS quality_policy (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                  UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  what_we_do              TEXT,
  who_is_customer         TEXT,
  value_proposition       TEXT,
  commitments             TEXT,
  final_policy_statement  TEXT,
  last_reviewed           DATE,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Columnas nuevas ───

-- Workflow
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS status                TEXT DEFAULT 'Borrador';
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS revision              TEXT DEFAULT 'v1.0';
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS next_review_date      DATE;

-- Aprobación formal
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS approved_by           TEXT;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS approved_role         TEXT;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS approved_at           DATE;

-- Comunicación (ISO 5.2.2)
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS communicated_at       DATE;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS communication_method  TEXT;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS communication_audience TEXT;
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS communication_evidence_url TEXT;

-- Alineación con objetivos (marco para 6.2)
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS alignment_with_objectives TEXT;

-- Disponibilidad pública del documento
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS document_url          TEXT;

-- Auditoría
ALTER TABLE quality_policy ADD COLUMN IF NOT EXISTS change_log            JSONB DEFAULT '[]'::jsonb;

-- ─── Limpieza defensiva antes de constraints ───
UPDATE quality_policy SET status = 'Borrador' WHERE status IS NULL OR status NOT IN ('Borrador','Aprobada','Comunicada','Obsoleta');

-- ─── Constraints ───
ALTER TABLE quality_policy DROP CONSTRAINT IF EXISTS quality_policy_status_check;
ALTER TABLE quality_policy
  ADD CONSTRAINT quality_policy_status_check
  CHECK (status IN ('Borrador','Aprobada','Comunicada','Obsoleta'));

-- Índices
CREATE INDEX IF NOT EXISTS idx_quality_policy_org    ON quality_policy(org_id);
CREATE INDEX IF NOT EXISTS idx_quality_policy_status ON quality_policy(status);

-- RLS
ALTER TABLE quality_policy ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "qp_select" ON quality_policy;
CREATE POLICY "qp_select" ON quality_policy FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "qp_insert" ON quality_policy;
CREATE POLICY "qp_insert" ON quality_policy FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "qp_update" ON quality_policy;
CREATE POLICY "qp_update" ON quality_policy FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "qp_delete" ON quality_policy;
CREATE POLICY "qp_delete" ON quality_policy FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
