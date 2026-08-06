-- =============================================================================
-- v52 — Non Conformities: ISO 10.2 (No conformidad y acción correctiva)
--
-- Agrega clasificación, separación corrección/acción correctiva, 5 Porqués
-- estructurado, verificación de eficacia, vínculos a proceso/auditoría/riesgo,
-- flag recurrente, costo de impacto, cross-link con oportunidades de mejora
-- y change_log.
-- =============================================================================

CREATE TABLE IF NOT EXISTS non_conformities (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                   UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  description              TEXT NOT NULL,
  source                   TEXT,
  root_cause               TEXT,
  action_plan              TEXT,
  responsible              TEXT,
  evidence_url             TEXT,
  status                   TEXT DEFAULT 'Identificada',
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Columnas nuevas ───

-- Clasificación
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS type                     TEXT;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS severity                 TEXT;

-- Tratamiento separado
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS correction               TEXT;

-- Fechas y trazabilidad
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS detection_date           DATE;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS detected_by              TEXT;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS due_date                 DATE;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS closure_date             DATE;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS closed_by                TEXT;

-- Vínculos cruzados
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS process_id               UUID REFERENCES processes(id) ON DELETE SET NULL;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS audit_id                 UUID REFERENCES internal_audits(id) ON DELETE SET NULL;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS risk_id                  UUID REFERENCES risk_matrix(id) ON DELETE SET NULL;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS supplier_id              UUID REFERENCES suppliers(id) ON DELETE SET NULL;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS improvement_opportunity_id UUID REFERENCES improvement_opportunities(id) ON DELETE SET NULL;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS recurrent_of_id          UUID REFERENCES non_conformities(id) ON DELETE SET NULL;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS is_recurrent             BOOLEAN DEFAULT false;

-- Cliente / referencias de texto libre
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS customer_name            TEXT;

-- 5 Porqués estructurado
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS five_whys                JSONB DEFAULT '[]'::jsonb;

-- Verificación de eficacia
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS effectiveness_check_date DATE;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS effectiveness_result     TEXT DEFAULT 'Pendiente';
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS effectiveness_evaluator  TEXT;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS effectiveness_notes      TEXT;

-- Costo de impacto
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS cost_impact              NUMERIC;
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS currency                 TEXT DEFAULT 'PYG';

-- Auditoría
ALTER TABLE non_conformities ADD COLUMN IF NOT EXISTS change_log               JSONB DEFAULT '[]'::jsonb;

-- ─── Limpieza defensiva ───

-- Migrar status viejos al workflow nuevo
UPDATE non_conformities SET status = 'Identificada' WHERE status IS NULL OR status = 'Abierto';
UPDATE non_conformities SET status = 'Cerrada' WHERE status = 'Cerrado';
UPDATE non_conformities SET status = 'Identificada'
  WHERE status NOT IN ('Identificada','En Análisis','Acción Definida','En Implementación','En Verificación','Cerrada','Reabierta');

-- Default type si está vacío
UPDATE non_conformities SET type = 'NC Menor' WHERE type IS NULL OR type NOT IN ('NC Mayor','NC Menor','Observación','Potencial');

-- Default severity si está vacío
UPDATE non_conformities SET severity = 'Media' WHERE severity IS NULL OR severity NOT IN ('Crítica','Alta','Media','Baja');

-- Default effectiveness_result si está vacío
UPDATE non_conformities SET effectiveness_result = 'Pendiente'
  WHERE effectiveness_result IS NULL
     OR effectiveness_result NOT IN ('Pendiente','Eficaz','Eficaz Parcial','No Eficaz','N/A');

-- ─── Constraints ───
ALTER TABLE non_conformities DROP CONSTRAINT IF EXISTS non_conformities_status_check;
ALTER TABLE non_conformities
  ADD CONSTRAINT non_conformities_status_check
  CHECK (status IN ('Identificada','En Análisis','Acción Definida','En Implementación','En Verificación','Cerrada','Reabierta'));

ALTER TABLE non_conformities DROP CONSTRAINT IF EXISTS non_conformities_type_check;
ALTER TABLE non_conformities
  ADD CONSTRAINT non_conformities_type_check
  CHECK (type IN ('NC Mayor','NC Menor','Observación','Potencial'));

ALTER TABLE non_conformities DROP CONSTRAINT IF EXISTS non_conformities_severity_check;
ALTER TABLE non_conformities
  ADD CONSTRAINT non_conformities_severity_check
  CHECK (severity IN ('Crítica','Alta','Media','Baja'));

ALTER TABLE non_conformities DROP CONSTRAINT IF EXISTS non_conformities_effectiveness_check;
ALTER TABLE non_conformities
  ADD CONSTRAINT non_conformities_effectiveness_check
  CHECK (effectiveness_result IN ('Pendiente','Eficaz','Eficaz Parcial','No Eficaz','N/A'));

-- ─── Índices ───
CREATE INDEX IF NOT EXISTS idx_nc_org              ON non_conformities(org_id);
CREATE INDEX IF NOT EXISTS idx_nc_status           ON non_conformities(status);
CREATE INDEX IF NOT EXISTS idx_nc_type             ON non_conformities(type);
CREATE INDEX IF NOT EXISTS idx_nc_severity         ON non_conformities(severity);
CREATE INDEX IF NOT EXISTS idx_nc_due_date         ON non_conformities(due_date);
CREATE INDEX IF NOT EXISTS idx_nc_process          ON non_conformities(process_id);
CREATE INDEX IF NOT EXISTS idx_nc_audit            ON non_conformities(audit_id);
CREATE INDEX IF NOT EXISTS idx_nc_risk             ON non_conformities(risk_id);
CREATE INDEX IF NOT EXISTS idx_nc_supplier         ON non_conformities(supplier_id);
CREATE INDEX IF NOT EXISTS idx_nc_improvement      ON non_conformities(improvement_opportunity_id);
CREATE INDEX IF NOT EXISTS idx_nc_recurrent_of     ON non_conformities(recurrent_of_id);
CREATE INDEX IF NOT EXISTS idx_nc_effectiveness    ON non_conformities(effectiveness_result);

-- ─── RLS ───
ALTER TABLE non_conformities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nc_select" ON non_conformities;
CREATE POLICY "nc_select" ON non_conformities FOR SELECT USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "nc_insert" ON non_conformities;
CREATE POLICY "nc_insert" ON non_conformities FOR INSERT WITH CHECK (org_id = auth_org_id());
DROP POLICY IF EXISTS "nc_update" ON non_conformities;
CREATE POLICY "nc_update" ON non_conformities FOR UPDATE USING (org_id = auth_org_id());
DROP POLICY IF EXISTS "nc_delete" ON non_conformities;
CREATE POLICY "nc_delete" ON non_conformities FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
