-- =============================================================================
-- Policies SELECT cross-org para super_admin (necesarias para modo impersonar).
--
-- Todas las tablas ISO tienen policies por org_id = auth_org_id(). El super_admin
-- necesita LEER data de otras orgs (para hacer soporte impersonando en modo
-- lectura), pero NO debe poder escribir cross-org.
--
-- Este SQL agrega una policy adicional en cada tabla del schema public que
-- tenga RLS habilitado + columna org_id: super_admin puede SELECT siempre.
--
-- Las policies de INSERT/UPDATE/DELETE se mantienen intactas — el super_admin
-- sigue siendo bloqueado si intenta escribir en otra org (WITH CHECK por
-- auth_org_id() falla porque devuelve su propia org, no la impersonada).
-- =============================================================================

DO $$
DECLARE
  t RECORD;
  policy_name TEXT;
BEGIN
  FOR t IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true                    -- RLS habilitado
      AND EXISTS (                                    -- tiene columna org_id
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid
          AND a.attname = 'org_id'
          AND NOT a.attisdropped
      )
      -- Excluimos organizations y user_profiles que ya tienen su policy
      -- desde la migración 20260807000000_super_admin_panel.sql
      AND c.relname NOT IN ('organizations', 'user_profiles', 'admin_audit_log')
  LOOP
    policy_name := t.table_name || '_select_super_admin';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, t.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (is_super_admin())',
      policy_name, t.table_name
    );
    RAISE NOTICE 'Policy % creada en tabla %', policy_name, t.table_name;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- Verificación: contar policies super_admin creadas
SELECT COUNT(*) AS super_admin_policies_created
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE '%_select_super_admin';
