-- =============================================================================
-- v48 — Stakeholders: ISO 4.2 (Partes Interesadas)
--
-- Agrega categoría, matriz Poder-Interés, estrategia de engagement,
-- comunicación, próxima revisión y change_log auditable.
-- =============================================================================

CREATE TABLE IF NOT EXISTS stakeholders (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  expectations          TEXT,
  influence_level       TEXT DEFAULT 'Medio',
  is_sgc_requirement    BOOLEAN DEFAULT false,
  follow_up_frequency   TEXT DEFAULT 'Anual',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Columnas existentes (defensivo) ───
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS planning_in_sgc      TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS evaluation_method    TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS responsible          TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS evidence_url         TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS compliance_date      DATE;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS status               TEXT DEFAULT 'Pendiente';

-- ─── Columnas nuevas ───
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS category             TEXT DEFAULT 'Cliente';
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS power_level          TEXT DEFAULT 'Medio';
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS interest_level       TEXT DEFAULT 'Medio';
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS engagement_strategy  TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS communication_strategy TEXT;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS next_review_date     DATE;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS last_reviewed_at     DATE;
ALTER TABLE stakeholders ADD COLUMN IF NOT EXISTS change_log           JSONB DEFAULT '[]'::jsonb;

-- ─── Limpieza defensiva ───
UPDATE stakeholders SET influence_level = 'Medio' WHERE influence_level IS NULL OR influence_level NOT IN ('Alto','Medio','Bajo');
UPDATE stakeholders SET power_level = 'Medio' WHERE power_level IS NULL OR power_level NOT IN ('Alto','Medio','Bajo');
UPDATE stakeholders SET interest_level = 'Medio' WHERE interest_level IS NULL OR interest_level NOT IN ('Alto','Medio','Bajo');
UPDATE stakeholders SET category = 'Cliente' WHERE category IS NULL OR category NOT IN ('Cliente','Proveedor','Empleado','Accionista','Regulador','Sociedad','Otro');
UPDATE stakeholders SET status = 'Pendiente' WHERE status IS NULL OR status NOT IN ('Pendiente','En proceso','Cumplido','No aplica');
UPDATE stakeholders SET follow_up_frequency = 'Anual' WHERE follow_up_frequency IS NULL OR follow_up_frequency NOT IN ('Trimestral','Semestral','Anual','Mensual','Ocasional');

-- ─── Constraints ───
ALTER TABLE stakeholders DROP CONSTRAINT IF EXISTS stakeholders_category_check;
ALTER TABLE stakeholders
  ADD CONSTRAINT stakeholders_category_check
  CHECK (category IN ('Cliente','Proveedor','Empleado','Accionista','Regulador','Sociedad','Otro'));

ALTER TABLE stakeholders DROP CONSTRAINT IF EXISTS stakeholders_power_check;
ALTER TABLE stakeholders
  ADD CONSTRAINT stakeholders_power_check
  CHECK (power_level IN ('Alto','Medio','Bajo'));

ALTER TABLE stakeholders DROP CONSTRAINT IF EXISTS stakeholders_interest_check;
ALTER TABLE stakeholders
  ADD CONSTRAINT stakeholders_interest_check
  CHECK (interest_level IN ('Alto','Medio','Bajo'));

ALTER TABLE stakeholders DROP CONSTRAINT IF EXISTS stakeholders_influence_check;
ALTER TABLE stakeholders
  ADD CONSTRAINT stakeholders_influence_check
  CHECK (influence_level IN ('Alto','Medio','Bajo'));

ALTER TABLE stakeholders DROP CONSTRAINT IF EXISTS stakeholders_status_check;
ALTER TABLE stakeholders
  ADD CONSTRAINT stakeholders_status_check
  CHECK (status IN ('Pendiente','En proceso','Cumplido','No aplica'));

-- ─── Índices ───
CREATE INDEX IF NOT EXISTS idx_stakeholders_org      ON stakeholders(org_id);
CREATE INDEX IF NOT EXISTS idx_stakeholders_category ON stakeholders(category);
CREATE INDEX IF NOT EXISTS idx_stakeholders_status   ON stakeholders(status);
CREATE INDEX IF NOT EXISTS idx_stakeholders_review   ON stakeholders(next_review_date);

-- ─── RLS ───
ALTER TABLE stakeholders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "sh_select" ON stakeholders;
CREATE POLICY "sh_select" ON stakeholders FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "sh_insert" ON stakeholders;
CREATE POLICY "sh_insert" ON stakeholders FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "sh_update" ON stakeholders;
CREATE POLICY "sh_update" ON stakeholders FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "sh_delete" ON stakeholders;
CREATE POLICY "sh_delete" ON stakeholders FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
