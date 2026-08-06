-- =============================================================================
-- v44 — Strategic Actions: ISO 6.1.2 (Planificar acciones para riesgos/oportunidades)
--
-- Cierra el loop de ISO 6.1: lo identificado en risk_matrix se convierte
-- en acciones planificadas con responsable, plazo, eficacia y trazabilidad
-- cross-module a riesgos, objetivos, procesos y revisiones por la dirección.
--
-- NOTA: como el módulo es nuevo (sin data previa), drop & recreate limpio.
-- =============================================================================

DROP TABLE IF EXISTS strategic_actions CASCADE;

CREATE TABLE strategic_actions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  -- Identificación
  title                       TEXT NOT NULL,
  description                 TEXT,
  source                      TEXT NOT NULL DEFAULT 'Estratégica'
                              CHECK (source IN ('Riesgo','Oportunidad','Objetivo','Revisión Dirección','Estratégica','Auditoría','Cliente')),
  category                    TEXT DEFAULT 'Preventiva'
                              CHECK (category IN ('Preventiva','Correctiva','Mejora','Capitalizar','Mitigación')),

  -- Vínculos cross-module (todos opcionales)
  risk_id                     UUID REFERENCES risk_matrix(id) ON DELETE SET NULL,
  objective_id                UUID REFERENCES quality_objectives(id) ON DELETE SET NULL,
  review_id                   UUID REFERENCES management_review(id) ON DELETE SET NULL,
  process_id                  UUID REFERENCES processes(id) ON DELETE SET NULL,

  -- Planificación
  responsible                 TEXT,
  resources_required          TEXT,
  estimated_cost              NUMERIC,
  priority                    TEXT DEFAULT 'Media'
                              CHECK (priority IN ('Alta','Media','Baja')),
  planned_start               DATE,
  planned_end                 DATE,

  -- Ejecución
  status                      TEXT DEFAULT 'Pendiente'
                              CHECK (status IN ('Pendiente','En curso','Completada','Cancelada','Suspendida')),
  actual_end                  DATE,
  progress                    INT DEFAULT 0
                              CHECK (progress >= 0 AND progress <= 100),

  -- Eficacia ISO 6.1.2.b
  effectiveness_evaluation    TEXT,
  effectiveness_result        TEXT,
  effectiveness_evaluated_at  DATE,

  -- Evidencia y auditoría
  evidence_url                TEXT,
  notes                       TEXT,
  change_log                  JSONB DEFAULT '[]'::jsonb,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── Índices ───
CREATE INDEX idx_strat_actions_org       ON strategic_actions(org_id);
CREATE INDEX idx_strat_actions_status    ON strategic_actions(status);
CREATE INDEX idx_strat_actions_source    ON strategic_actions(source);
CREATE INDEX idx_strat_actions_priority  ON strategic_actions(priority);
CREATE INDEX idx_strat_actions_planned   ON strategic_actions(planned_end);
CREATE INDEX idx_strat_actions_risk      ON strategic_actions(risk_id);
CREATE INDEX idx_strat_actions_objective ON strategic_actions(objective_id);
CREATE INDEX idx_strat_actions_review    ON strategic_actions(review_id);
CREATE INDEX idx_strat_actions_process   ON strategic_actions(process_id);

-- ─── RLS ───
ALTER TABLE strategic_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sa_select" ON strategic_actions FOR SELECT USING (org_id = auth_org_id());
CREATE POLICY "sa_insert" ON strategic_actions FOR INSERT WITH CHECK (org_id = auth_org_id());
CREATE POLICY "sa_update" ON strategic_actions FOR UPDATE USING (org_id = auth_org_id());
CREATE POLICY "sa_delete" ON strategic_actions FOR DELETE USING (org_id = auth_org_id());

NOTIFY pgrst, 'reload schema';
