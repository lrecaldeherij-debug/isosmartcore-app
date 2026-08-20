-- =============================================================================
-- FIX CRÍTICO — data leak visto por el super_admin.
--
-- Bug: la migración 20260807170000 creó policies <table>_select_super_admin
-- con USING(is_super_admin()) en TODAS las tablas ISO. Como las policies RLS
-- se combinan con OR, cuando el super_admin (Lebis) usa la app en su propia
-- org, ve las filas de Herij (via la policy normal org_id=auth_org_id()) MÁS
-- las filas de TODAS las demás orgs (via _select_super_admin).
--
-- Resultado observado: el Tablero Principal de Herij mostraba 18 cargos +
-- 3 procesos + 9 partes interesadas mezclando datos de Talleres Mejía, ASSAM
-- y Herij en la misma vista. Confusión para el super_admin, no leak entre
-- clientes normales (ellos siguen con la policy normal, no ven cross-org).
--
-- Fix: eliminar TODAS las policies <table>_select_super_admin en tablas ISO.
-- El super_admin vuelve a ver SOLO su propia org (Herij) desde el sidebar
-- normal, y para gestionar clientes ajenos usa las RPCs SECURITY DEFINER del
-- panel /admin (list_all_organizations_admin, etc.) que ya existen.
--
-- Consecuencia sobre el modo impersonate:
--   - startImpersonation() sigue funcionando (redirige a /app?impersonate=)
--   - OrgContext sigue leyendo la org impersonada (organizations tiene policy
--     super_admin propia de la migración 20260807000000)
--   - PERO las tablas ISO ya no devuelven filas cross-org via query directa
--   - Efecto: el super_admin impersonando ve la org, el plan, el ADN (via el
--     fix de CompanyProfile.jsx con .eq('org_id', org.id) — org.id apunta a
--     la impersonada), pero el Tablero Principal saldrá vacío
--   - Para restaurar la visibilidad del impersonate como "modo lectura real"
--     hay que hacer un rework: policy condicionada a JWT metadata
--     (impersonate_org_id) o pasar a RPCs SECURITY DEFINER por módulo
--
-- Prioridad: integridad de datos del super_admin usando su propia app > tener
-- el modo impersonate 100% funcional. Impersonate se degrada, se arregla
-- después.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  p RECORD;
  n_dropped INT := 0;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE '%_select_super_admin'
      -- Preservar las policies del panel admin (organizations, user_profiles,
      -- admin_audit_log) que la migración 20260807000000 creó a mano.
      AND tablename NOT IN ('organizations', 'user_profiles', 'admin_audit_log')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', p.policyname, p.tablename);
    n_dropped := n_dropped + 1;
    RAISE NOTICE 'Policy % eliminada de tabla %', p.policyname, p.tablename;
  END LOOP;
  RAISE NOTICE 'Total policies eliminadas: %', n_dropped;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación: no deben quedar policies _select_super_admin en tablas ISO
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE '%_select_super_admin'
ORDER BY tablename;
-- Solo deberían aparecer: organizations, user_profiles, admin_audit_log
