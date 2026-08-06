-- =============================================================================
-- v45 — Improvement Opportunities: ISO 10.3 (Mejora Continua)
--
-- Módulo proactivo (vs NonConformities que es reactivo). Captura oportunidades
-- de mejora desde múltiples fuentes (cliente, empleado, auditoría, revisión
-- dirección, análisis de NCs recurrentes, indicadores, etc.) y las lleva por
-- un pipeline: Identificada → En evaluación → Aprobada → En implementación →
-- Implementada → Eficacia evaluada.
-- =============================================================================

DROP TABLE IF EXISTS improvement_opportunities CASCADE;

CREATE TABLE improvement_opportunities (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identificación
  title                       TEXT NOT NULL,
  description                 TEXT,
  source                      TEXT NOT NULL DEFAULT 'Espontánea'
                              CHECK (source IN ('Cliente','Empleado','Auditoría','Revisión Dirección','Análisis NCs','Indicador','Benchmarking','Espontánea')),
  area                        TEXT,

  -- Vínculos cross-module (todos opcionales)
  process_id                  UUID REFERENCES processes(id) ON DELETE SET NULL,
  objective_id                UUID REFERENCES quality_objectives(id) ON DELETE SET NULL,
  review_id                   UUID REFERENCES management_review(id) ON DELETE SET NULL,
  nc_id                       UUID,  -- opcional, NC raíz de la que se originó

  -- Estado del pipeline (workflow)
  status                      TEXT NOT NULL DEFAULT 'Identificada'
                              CHECK (status IN ('Identificada','En evaluación','Aprobada','En implementación','Implementada','Descartada')),

  -- Evaluación / negocio
  expected_benefit            TEXT,
  estimated_cost              NUMERIC,
  roi_estimate                TEXT,
  priority_score              INT DEFAULT 0
                              CHECK (priority_score >= 0 AND priority_score <= 100),
  priority                    TEXT DEFAULT 'Media'
                              CHECK (priority IN ('Alta','Media','Baja')),

  -- Personas
  proposed_by                 TEXT,
  proposed_at                 DATE DEFAULT CURRENT_DATE,
  evaluated_by                TEXT,
  evaluated_at                DATE,
  approved_by                 TEXT,
  approved_at                 DATE,

  -- Implementación / conversión a acción
  strategic_action_id         UUID REFERENCES strategic_actions(id) ON DELETE SET NULL,
  implementation_start        DATE,
  implementation_end          DATE,

  -- Eficacia post-implementación (ISO 10.3 cierra con verificación)
  effectiveness_evaluated_at  DATE,
  actual_benefit              TEXT,
  effectiveness_score         INT  -- 0-100 cómo de eficaz fue
                              CHECK (effectiveness_score IS NULL OR (effectiveness_score >= 0 AND effectiveness_score <= 100)),
  lessons_learned             TEXT,

  -- Evidencia / auditoría
  evidence_url                TEXT,
  notes                       TEXT,
  change_log                  JSONB DEFAULT '[]'::jsonb,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Índices ───
CREATE INDEX idx_improvement_org       ON improvement_opportunities(org_id);
CREATE INDEX idx_improvement_status    ON improvement_opportunities(status);
CREATE INDEX idx_improvement_source    ON improvement_opportunities(source);
CREATE INDEX idx_improvement_priority  ON improvement_opportunities(priority);
CREATE INDEX idx_improvement_process   ON improvement_opportunities(process_id);
CREATE INDEX idx_improvement_objective ON improvement_opportunities(objective_id);
CREATE INDEX idx_improvement_review    ON improvement_opportunities(review_id);
CREATE INDEX idx_improvement_action    ON improvement_opportunities(strategic_action_id);

-- ─── RLS ───
ALTER TABLE improvement_opportunities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "io_select" ON improvement_opportunities FOR SELECT USING (org_id = auth_org_id());
CREATE POLICY "io_insert" ON improvement_opportunities FOR INSERT WITH CHECK (org_id = auth_org_id());
CREATE POLICY "io_update" ON improvement_opportunities FOR UPDATE USING (org_id = auth_org_id());
CREATE POLICY "io_delete" ON improvement_opportunities FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
