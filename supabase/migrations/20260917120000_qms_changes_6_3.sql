-- =============================================================================
-- ISO 9001:2015 — 6.3 Planificación de los cambios
--
-- "Cuando la organización determine la necesidad de cambios en el SGC, estos
--  se deben llevar a cabo de manera planificada. La organización debe
--  considerar:
--    a) el propósito de los cambios y sus consecuencias potenciales;
--    b) la integridad del SGC;
--    c) la disponibilidad de recursos;
--    d) la asignación o reasignación de responsabilidades y autoridades."
--
-- Hasta ahora esta cláusula no tenía módulo: el Plan de Acción cubre las
-- acciones de 6.1.2 / 6.2.2, no los cambios al sistema. El auditor pide
-- evidencia de que un cambio (nueva sede, cambio de ERP, reorganización,
-- nueva línea de producto, cambio de alcance) se planificó ANTES de ejecutarlo.
--
-- Diseño: un registro por cambio, con los 4 puntos de la norma como campos
-- obligatorios de planificación, aprobación explícita antes de ejecutar y
-- verificación posterior de que el SGC siguió íntegro.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS qms_changes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,

  code               TEXT,
  title              TEXT NOT NULL,
  change_type        TEXT NOT NULL DEFAULT 'other',
  description        TEXT,

  -- a) Propósito y consecuencias potenciales
  purpose            TEXT,
  consequences       TEXT,
  affected_clauses   TEXT,

  -- b) Integridad del SGC: qué se hace para que el sistema siga coherente
  integrity_actions  TEXT,

  -- c) Recursos necesarios
  resources_required TEXT,
  estimated_cost     NUMERIC(14,2),
  currency           TEXT DEFAULT 'USD',

  -- d) Responsabilidades y autoridades (quién hace qué y quién decide)
  responsibilities   TEXT,
  responsible        TEXT,

  -- Planificación temporal
  requested_by       TEXT,
  requested_at       DATE DEFAULT CURRENT_DATE,
  planned_start      DATE,
  planned_end        DATE,
  actual_end         DATE,

  -- Estado del cambio. Un cambio no debería ejecutarse sin aprobación.
  status             TEXT NOT NULL DEFAULT 'Propuesto'
                       CHECK (status IN ('Propuesto', 'Planificado', 'Aprobado', 'En ejecución', 'Implementado', 'Verificado', 'Rechazado', 'Cancelado')),

  risk_level         TEXT CHECK (risk_level IN ('Bajo', 'Medio', 'Alto')),

  approved_by        TEXT,
  approved_role      TEXT,
  approved_at        DATE,

  -- Verificación posterior: el SGC quedó íntegro y el cambio logró su propósito
  verification_notes  TEXT,
  verification_result TEXT CHECK (verification_result IN ('Eficaz', 'Parcial', 'No eficaz')),
  verified_by         TEXT,
  verified_at         DATE,

  -- Vínculos con el resto del SGC
  process_id         UUID REFERENCES processes(id) ON DELETE SET NULL,
  risk_id            UUID REFERENCES risk_matrix(id) ON DELETE SET NULL,
  objective_id       UUID REFERENCES quality_objectives(id) ON DELETE SET NULL,
  review_id          UUID REFERENCES management_review(id) ON DELETE SET NULL,
  strategic_action_id UUID REFERENCES strategic_actions(id) ON DELETE SET NULL,

  evidence_url       TEXT,
  notes              TEXT,
  change_log         JSONB DEFAULT '[]'::jsonb,

  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Defensivo: si la tabla ya existía con otra forma
ALTER TABLE qms_changes ADD COLUMN IF NOT EXISTS affected_clauses TEXT;
ALTER TABLE qms_changes ADD COLUMN IF NOT EXISTS integrity_actions TEXT;
ALTER TABLE qms_changes ADD COLUMN IF NOT EXISTS responsibilities TEXT;
ALTER TABLE qms_changes ADD COLUMN IF NOT EXISTS verification_result TEXT;
ALTER TABLE qms_changes ADD COLUMN IF NOT EXISTS strategic_action_id UUID;

CREATE INDEX IF NOT EXISTS idx_qms_changes_org ON qms_changes(org_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_qms_changes_status ON qms_changes(org_id, status);

-- updated_at automático (mismo patrón que el resto de tablas)
CREATE OR REPLACE FUNCTION touch_qms_changes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_touch_qms_changes ON qms_changes;
CREATE TRIGGER tr_touch_qms_changes
  BEFORE UPDATE ON qms_changes
  FOR EACH ROW EXECUTE FUNCTION touch_qms_changes();

ALTER TABLE qms_changes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS qms_changes_select ON qms_changes;
CREATE POLICY qms_changes_select ON qms_changes FOR SELECT
  USING (
    org_id = auth_org_id()
    OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
  );

DROP POLICY IF EXISTS qms_changes_insert ON qms_changes;
CREATE POLICY qms_changes_insert ON qms_changes FOR INSERT
  WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS qms_changes_update ON qms_changes;
CREATE POLICY qms_changes_update ON qms_changes FOR UPDATE
  USING (org_id = auth_org_id()) WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS qms_changes_delete ON qms_changes;
CREATE POLICY qms_changes_delete ON qms_changes FOR DELETE
  USING (org_id = auth_org_id());

COMMENT ON TABLE qms_changes IS
  'ISO 9001:2015 cláusula 6.3 — cambios al SGC planificados: propósito y
   consecuencias, integridad del sistema, recursos, responsabilidades,
   aprobación previa y verificación posterior.';

NOTIFY pgrst, 'reload schema';

COMMIT;
