-- =============================================================================
-- FIX CRÍTICO — data leak cross-org en qc_inspections + hardening RLS de
-- 5 tablas con policies laxas.
--
-- Descubierto por auditoría (21-ago-2026). Contexto:
--
-- 1. qc_inspections: la policy qc_select hace USING (org_id = auth_org_id()
--    OR is_super_admin()). El fix del 07-ago (20260807200000) solo dropea
--    policies con nombre LIKE '%_select_super_admin' — 'qc_select' queda
--    viva. Resultado: super_admin ve inspecciones QC de todas las orgs
--    mezcladas en su propia app (bug idéntico al de la semana pasada).
--
-- 2. climate_surveys, equipment_calibration, calibration_history,
--    customer_orders, qc_inspections, survey_campaigns, survey_invitations:
--    tienen dos juegos de policies. Las de v12 exigen rol (owner/QM); las
--    posteriores (v29, v34, v35, v30, qc) no lo exigen. Como las policies
--    permissive se combinan con OR, la laxa gana → cualquier viewer puede
--    insertar/actualizar/borrar. Rompe la trazabilidad ISO.
--
-- Fix: (a) recrear qc_select sin el OR is_super_admin (la cobertura para
-- impersonate ya la da _select_impersonate); (b) dropear las policies de
-- escritura laxas en las 7 tablas listadas — quedan solo las de v12 con
-- role check.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. qc_inspections: cerrar leak cross-org del super_admin
-- ─────────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS qc_select ON qc_inspections;
CREATE POLICY qc_select ON qc_inspections
  FOR SELECT
  USING (org_id = auth_org_id());
-- Nota: super_admin en modo impersonate sigue viendo via _select_impersonate
-- de la migración 20260807210000. Si esa migración no existe (dev sin fix),
-- el super_admin ve solo su propia org — safe default.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Dropear policies de escritura sin role check. Quedan solo las de v12
--    que exigen owner/quality_manager.
-- ─────────────────────────────────────────────────────────────────────────────

-- climate_surveys (v29 puso cs_insert/update/delete sin role check)
DROP POLICY IF EXISTS cs_insert ON climate_surveys;
DROP POLICY IF EXISTS cs_update ON climate_surveys;
DROP POLICY IF EXISTS cs_delete ON climate_surveys;

-- equipment_calibration (v34)
DROP POLICY IF EXISTS ec_insert ON equipment_calibration;
DROP POLICY IF EXISTS ec_update ON equipment_calibration;
DROP POLICY IF EXISTS ec_delete ON equipment_calibration;

-- calibration_history (v34)
DROP POLICY IF EXISTS ch_insert ON calibration_history;
DROP POLICY IF EXISTS ch_update ON calibration_history;
DROP POLICY IF EXISTS ch_delete ON calibration_history;

-- customer_orders (v35)
DROP POLICY IF EXISTS co_insert ON customer_orders;
DROP POLICY IF EXISTS co_update ON customer_orders;
DROP POLICY IF EXISTS co_delete ON customer_orders;

-- qc_inspections (fix del 07-ago las dejó sin role check)
DROP POLICY IF EXISTS qc_insert ON qc_inspections;
DROP POLICY IF EXISTS qc_update ON qc_inspections;
DROP POLICY IF EXISTS qc_delete ON qc_inspections;

-- survey_campaigns (v30)
DROP POLICY IF EXISTS sc_insert ON survey_campaigns;
DROP POLICY IF EXISTS sc_update ON survey_campaigns;
DROP POLICY IF EXISTS sc_delete ON survey_campaigns;

-- survey_invitations (v30)
DROP POLICY IF EXISTS si_insert ON survey_invitations;
DROP POLICY IF EXISTS si_update ON survey_invitations;
DROP POLICY IF EXISTS si_delete ON survey_invitations;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Recrear policies de escritura con role check consistente.
--    Patrón: owner y quality_manager pueden escribir. Auditor y viewer NO.
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper reutilizable en el DO block
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'climate_surveys',
    'equipment_calibration',
    'calibration_history',
    'customer_orders',
    'qc_inspections',
    'survey_campaigns',
    'survey_invitations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated
       WITH CHECK (org_id = auth_org_id()
                   AND auth_role() IN (''owner'', ''quality_manager''))',
      t || '_insert_hardened', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
       USING (org_id = auth_org_id())
       WITH CHECK (org_id = auth_org_id()
                   AND auth_role() IN (''owner'', ''quality_manager''))',
      t || '_update_hardened', t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated
       USING (org_id = auth_org_id()
              AND auth_role() IN (''owner'', ''quality_manager''))',
      t || '_delete_hardened', t
    );
    RAISE NOTICE 'Policies hardened en %', t;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verificación
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. qc_select ya no menciona is_super_admin
SELECT policyname, qual AS using_clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'qc_inspections'
  AND policyname = 'qc_select';

-- 2. Confirmar que las 7 tablas tienen _hardened policies y NO tienen las viejas
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('climate_surveys','equipment_calibration','calibration_history',
                    'customer_orders','qc_inspections','survey_campaigns','survey_invitations')
  AND cmd IN ('INSERT','UPDATE','DELETE')
ORDER BY tablename, cmd, policyname;
-- Esperado: solo policies con sufijo _hardened + las de v12 (org_insert/update/delete
-- que ya tenían role check). Ninguna cs_*, ec_*, ch_*, co_*, qc_insert/update/delete,
-- sc_*, si_* debe aparecer.
