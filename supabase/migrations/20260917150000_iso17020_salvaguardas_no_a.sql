-- =============================================================================
-- ISO/IEC 17020:2026 — salvaguardas de organismo tipo no A (Anexo A.2)
--
-- Herij declara tipo no A: la empresa también diseña, fabrica, instala, repara
-- o mantiene ítems del mismo tipo que los que inspecciona. La norma no lo
-- prohíbe, pero exige salvaguardas, y la más dura es A.2 b):
--
--   "El personal que ha estado involucrado en el diseño, fabricación,
--    instalación, reparación o mantenimiento de un ítem NO debe participar en
--    la inspección de ESE ítem."
--
-- Para poder aplicar esa regla hace falta saber quién intervino cada ítem, y
-- eso hoy no se registra en ningún lado. Esta migración agrega:
--
--   1. item_interventions — qué hizo la propia empresa sobre cada ítem y quién.
--   2. item_inspection_restrictions — vista que responde, por ítem, qué
--      personas quedan inhabilitadas para inspeccionarlo y por qué.
--   3. Declaración de independencia a nivel organización, con sus salvaguardas.
--
-- La vista es la que va a consultar la fase 3 para bloquear la asignación de
-- un inspector a un ítem que él mismo intervino.
-- =============================================================================

BEGIN;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS inspection_independence_type TEXT
    CHECK (inspection_independence_type IN ('A', 'no_A'));
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS inspection_safeguards TEXT;

COMMENT ON COLUMN organizations.inspection_independence_type IS
  'ISO/IEC 17020 5.1 / Anexo A — tipo declarado por defecto. Cada actividad puede declarar el suyo en inspection_scopes.';
COMMENT ON COLUMN organizations.inspection_safeguards IS
  'Salvaguardas declaradas para tipo no A: separación de responsabilidades, líneas de reporte, control de acceso.';

-- ─── 1. Intervenciones de la propia empresa sobre un ítem ───────────────────
CREATE TABLE IF NOT EXISTS item_interventions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL DEFAULT auth_org_id() REFERENCES organizations(id) ON DELETE CASCADE,
  item_id            UUID NOT NULL REFERENCES inspection_items(id) ON DELETE CASCADE,

  -- Las cinco actividades que menciona A.2 b), más modificación
  intervention_type  TEXT NOT NULL
                       CHECK (intervention_type IN ('Diseño', 'Fabricación', 'Instalación', 'Reparación', 'Mantenimiento', 'Modificación')),

  -- Quién la ejecutó. person_id cuando es personal propio registrado; el
  -- nombre libre cubre contratistas o personal histórico sin ficha.
  person_id          UUID REFERENCES personnel(id) ON DELETE SET NULL,
  person_name        TEXT,

  performed_at       DATE,
  work_order_ref     TEXT,                     -- OT, informe o contrato de respaldo
  description        TEXT,

  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Sin persona identificada la restricción no se puede aplicar
  CONSTRAINT item_interventions_person_ck
    CHECK (person_id IS NOT NULL OR NULLIF(TRIM(person_name), '') IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_item_interventions_item ON item_interventions(item_id);
CREATE INDEX IF NOT EXISTS idx_item_interventions_person ON item_interventions(person_id) WHERE person_id IS NOT NULL;

ALTER TABLE item_interventions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS item_interventions_select ON item_interventions;
CREATE POLICY item_interventions_select ON item_interventions FOR SELECT
  USING (
    org_id = auth_org_id()
    OR (is_super_admin() AND current_impersonate_org() IS NOT NULL AND current_impersonate_org() = org_id)
  );

DROP POLICY IF EXISTS item_interventions_insert ON item_interventions;
CREATE POLICY item_interventions_insert ON item_interventions FOR INSERT
  WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS item_interventions_update ON item_interventions;
CREATE POLICY item_interventions_update ON item_interventions FOR UPDATE
  USING (org_id = auth_org_id()) WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS item_interventions_delete ON item_interventions;
CREATE POLICY item_interventions_delete ON item_interventions FOR DELETE
  USING (org_id = auth_org_id());

-- ─── 2. Vista: quién NO puede inspeccionar cada ítem ────────────────────────
-- security_invoker = on para que respete la RLS de quien consulta (si no, la
-- vista filtraría con los permisos del dueño y expondría datos de otra org).
CREATE OR REPLACE VIEW item_inspection_restrictions AS
SELECT
  i.org_id,
  i.item_id,
  i.person_id,
  COALESCE(p.full_name, i.person_name) AS person_name,
  string_agg(DISTINCT i.intervention_type, ', ' ORDER BY i.intervention_type) AS interventions,
  MAX(i.performed_at) AS last_intervention_at,
  COUNT(*) AS intervention_count
FROM item_interventions i
LEFT JOIN personnel p ON p.id = i.person_id
GROUP BY i.org_id, i.item_id, i.person_id, COALESCE(p.full_name, i.person_name);

DO $$
BEGIN
  IF current_setting('server_version_num')::INT >= 150000 THEN
    EXECUTE 'ALTER VIEW item_inspection_restrictions SET (security_invoker = on)';
  END IF;
END $$;

COMMENT ON VIEW item_inspection_restrictions IS
  'ISO/IEC 17020 Anexo A.2 b) — personas inhabilitadas para inspeccionar cada ítem por haber intervenido en él.';

COMMENT ON TABLE item_interventions IS
  'Intervenciones de la propia empresa sobre un ítem (diseño, fabricación, instalación, reparación, mantenimiento). Base de la salvaguarda de tipo no A.';

NOTIFY pgrst, 'reload schema';

COMMIT;
