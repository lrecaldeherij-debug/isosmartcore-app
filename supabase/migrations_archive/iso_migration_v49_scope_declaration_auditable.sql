-- =============================================================================
-- v49 — Scope Declaration: ISO 4.3 (Alcance del SGC)
--
-- Agrega workflow de aprobación, revisión periódica, procesos vinculados,
-- exclusiones estructuradas y change_log.
-- =============================================================================

CREATE TABLE IF NOT EXISTS scope_declaration (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                 UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  considerations_41_42   TEXT,
  processes_covered      TEXT,
  products_services      TEXT,
  geographic_location    TEXT,
  exclusions_83_etc      TEXT,
  scope_statement        TEXT,
  last_reviewed          DATE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Columnas nuevas ───
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS status               TEXT DEFAULT 'Borrador';
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS revision             TEXT DEFAULT 'v1.0';
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS next_review_date     DATE;
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS approved_by          TEXT;
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS approved_role        TEXT;
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS approved_at          DATE;
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS document_url         TEXT;
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS linked_processes_ids JSONB DEFAULT '[]'::jsonb;
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS iso_exclusions       JSONB DEFAULT '[]'::jsonb;
ALTER TABLE scope_declaration ADD COLUMN IF NOT EXISTS change_log           JSONB DEFAULT '[]'::jsonb;

-- ─── Limpieza defensiva ───
UPDATE scope_declaration SET status = 'Borrador' WHERE status IS NULL OR status NOT IN ('Borrador','Aprobada','Comunicada','Obsoleta');

-- ─── Constraints ───
ALTER TABLE scope_declaration DROP CONSTRAINT IF EXISTS scope_declaration_status_check;
ALTER TABLE scope_declaration
  ADD CONSTRAINT scope_declaration_status_check
  CHECK (status IN ('Borrador','Aprobada','Comunicada','Obsoleta'));

-- ─── Índices ───
CREATE INDEX IF NOT EXISTS idx_scope_org    ON scope_declaration(org_id);
CREATE INDEX IF NOT EXISTS idx_scope_status ON scope_declaration(status);

-- ─── RLS ───
ALTER TABLE scope_declaration ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sd_select" ON scope_declaration;
CREATE POLICY "sd_select" ON scope_declaration FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "sd_insert" ON scope_declaration;
CREATE POLICY "sd_insert" ON scope_declaration FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "sd_update" ON scope_declaration;
CREATE POLICY "sd_update" ON scope_declaration FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "sd_delete" ON scope_declaration;
CREATE POLICY "sd_delete" ON scope_declaration FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
