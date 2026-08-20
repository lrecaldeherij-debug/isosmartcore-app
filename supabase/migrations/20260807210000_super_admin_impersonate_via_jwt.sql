-- =============================================================================
-- Restaura visibilidad ISO cross-org para super_admin SOLO en modo impersonate.
--
-- Contexto:
--   - 20260807170000 creó <table>_select_super_admin sin condición → data leak
--   - 20260807200000 las eliminó → arreglado el leak, impersonate degradado
--   - Este SQL restaura el impersonate de forma segura vía JWT user_metadata
--
-- Mecánica:
--   - Frontend (impersonate.js) llama supabase.auth.updateUser({ data: {
--     impersonate_org_id: <uuid> }}) al iniciar impersonate → el JWT del
--     super_admin ahora lleva el uuid en user_metadata
--   - Al salir del impersonate, updateUser({ data: { impersonate_org_id: null }})
--   - OrgContext también limpia el metadata si detecta URL sin ?impersonate=
--     (safety net por si el user cierra el navegador sin salir limpio)
--   - Policy _select_impersonate en cada tabla ISO exige:
--       is_super_admin() AND current_impersonate_org() = org_id
--     → solo filas de la org explícitamente impersonada
--
-- Seguridad:
--   - user_metadata es modificable por el user, pero como la policy exige
--     is_super_admin() primero, un cliente normal no puede aprovecharla
--   - El super_admin puede setear cualquier uuid — que es justo lo que
--     necesita para hacer soporte a cualquier cliente
--   - Escrituras siguen bloqueadas por WITH CHECK sobre auth_org_id() que
--     devuelve la org REAL del super_admin, no la impersonada
-- =============================================================================

BEGIN;

-- Helper: extrae impersonate_org_id del JWT del user actual
CREATE OR REPLACE FUNCTION current_impersonate_org()
RETURNS UUID
LANGUAGE sql STABLE
AS $$
  SELECT NULLIF(
    auth.jwt() -> 'user_metadata' ->> 'impersonate_org_id',
    ''
  )::UUID
$$;

-- Crear policy _select_impersonate en todas las tablas ISO con RLS + org_id
DO $$
DECLARE
  t RECORD;
  policy_name TEXT;
  n_created INT := 0;
BEGIN
  FOR t IN
    SELECT c.relname AS table_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = true
      AND EXISTS (
        SELECT 1 FROM pg_attribute a
        WHERE a.attrelid = c.oid
          AND a.attname = 'org_id'
          AND NOT a.attisdropped
      )
      AND c.relname NOT IN ('organizations', 'user_profiles', 'admin_audit_log')
  LOOP
    policy_name := t.table_name || '_select_impersonate';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, t.table_name);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
         is_super_admin()
         AND current_impersonate_org() IS NOT NULL
         AND current_impersonate_org() = org_id
       )',
      policy_name, t.table_name
    );
    n_created := n_created + 1;
    RAISE NOTICE 'Policy % creada en tabla %', policy_name, t.table_name;
  END LOOP;
  RAISE NOTICE 'Total policies creadas: %', n_created;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación
SELECT tablename, policyname
FROM pg_policies
WHERE schemaname = 'public'
  AND policyname LIKE '%_select_impersonate'
ORDER BY tablename;
