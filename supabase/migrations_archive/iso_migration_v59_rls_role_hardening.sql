-- =============================================================================
-- v59 — RLS hardening por rol
--
-- Hasta v58 las policies validaban solo `org_id = auth_org_id()` — cualquier
-- usuario de la org podía INSERT/UPDATE/DELETE. La UI usaba lib/roles.js
-- para ocultar botones, pero un curl o un bypass de UI podía hacer escrituras.
--
-- v59 agrega policies específicas por acción (insert/update/delete) que
-- filtran por rol. Refleja exactamente PERMISSIONS de src/lib/roles.js.
--
-- Semántica:
--   FULL_WRITE   = owner + quality_manager
--   AUDIT_WRITE  = owner + quality_manager + auditor
--   DELETE_FULL  = owner + quality_manager
--   DELETE_OWNER = solo owner (para tablas críticas como scope/policy/review)
--   SELECT       = todos los roles (el filtro de org_id ya es suficiente)
-- =============================================================================

-- ─── 1. Helpers más finos ───
-- auth_can_write() viejo deja al auditor escribir todo. Mantenemos por compat,
-- pero usamos auth_can_write_full() y auth_can_write_audit() en las policies nuevas.

CREATE OR REPLACE FUNCTION auth_can_write_full()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT auth_role() IN ('owner', 'quality_manager')
$$;

CREATE OR REPLACE FUNCTION auth_can_write_audit()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT auth_role() IN ('owner', 'quality_manager', 'auditor')
$$;

CREATE OR REPLACE FUNCTION auth_is_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT auth_role() = 'owner'
$$;

-- ─── 2. Helper macro: aplica el patrón completo a una tabla ───

CREATE OR REPLACE FUNCTION _apply_role_policies(
  tbl TEXT,
  write_func TEXT DEFAULT 'auth_can_write_full',
  delete_func TEXT DEFAULT 'auth_can_write_full'
) RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  prefix TEXT;
BEGIN
  -- Skip silencioso si la tabla no existe (compat con orgs que no corrieron todas las migraciones)
  IF to_regclass('public.' || quote_ident(tbl)) IS NULL THEN
    RAISE NOTICE 'Tabla % no existe, skip', tbl;
    RETURN;
  END IF;

  -- Skip si la tabla no tiene columna org_id (schema viejo pre-multitenant)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = tbl AND column_name = 'org_id'
  ) THEN
    RAISE NOTICE 'Tabla % no tiene columna org_id, skip', tbl;
    RETURN;
  END IF;

  prefix := replace(tbl, '_', '');

  -- Drop policies viejas (varios patrones de naming históricos)
  EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I', prefix, tbl);
  EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %I', prefix, tbl);
  EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I', prefix, tbl);
  EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON %I', prefix, tbl);
  EXECUTE format('DROP POLICY IF EXISTS "%s_select" ON %I', tbl, tbl);
  EXECUTE format('DROP POLICY IF EXISTS "%s_insert" ON %I', tbl, tbl);
  EXECUTE format('DROP POLICY IF EXISTS "%s_update" ON %I', tbl, tbl);
  EXECUTE format('DROP POLICY IF EXISTS "%s_delete" ON %I', tbl, tbl);

  -- Asegurar RLS habilitado
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

  -- SELECT: cualquier rol de la org
  EXECUTE format(
    'CREATE POLICY "%s_select" ON %I FOR SELECT USING (org_id = auth_org_id())',
    prefix, tbl
  );

  -- INSERT: requiere rol con write
  EXECUTE format(
    'CREATE POLICY "%s_insert" ON %I FOR INSERT WITH CHECK (org_id = auth_org_id() AND %s())',
    prefix, tbl, write_func
  );

  -- UPDATE: requiere rol con write
  EXECUTE format(
    'CREATE POLICY "%s_update" ON %I FOR UPDATE USING (org_id = auth_org_id() AND %s())',
    prefix, tbl, write_func
  );

  -- DELETE: requiere rol con delete
  EXECUTE format(
    'CREATE POLICY "%s_delete" ON %I FOR DELETE USING (org_id = auth_org_id() AND %s())',
    prefix, tbl, delete_func
  );
END;
$$;

-- ─── 3. Aplicar a todas las tablas ───

-- FULL_WRITE / DELETE = owner + quality_manager
SELECT _apply_role_policies('context_analysis');
SELECT _apply_role_policies('stakeholders');
SELECT _apply_role_policies('processes');
SELECT _apply_role_policies('job_descriptions');
SELECT _apply_role_policies('risk_matrix');
SELECT _apply_role_policies('quality_objectives');
SELECT _apply_role_policies('objective_measurements');
SELECT _apply_role_policies('strategic_actions');
SELECT _apply_role_policies('training_records');
SELECT _apply_role_policies('personnel');
SELECT _apply_role_policies('suppliers');
SELECT _apply_role_policies('customer_requirements');
SELECT _apply_role_policies('documents');
SELECT _apply_role_policies('communication_matrix');
SELECT _apply_role_policies('production_orders');
SELECT _apply_role_policies('qc_release');
SELECT _apply_role_policies('operational_incidents');

-- FULL_WRITE pero DELETE solo owner
SELECT _apply_role_policies('scope_declaration', 'auth_can_write_full', 'auth_is_owner');
SELECT _apply_role_policies('quality_policy', 'auth_can_write_full', 'auth_is_owner');
SELECT _apply_role_policies('management_review', 'auth_can_write_full', 'auth_is_owner');

-- AUDIT_WRITE = owner + quality_manager + auditor; DELETE solo full
SELECT _apply_role_policies('non_conformities', 'auth_can_write_audit', 'auth_can_write_full');
SELECT _apply_role_policies('internal_audits', 'auth_can_write_audit', 'auth_can_write_full');
SELECT _apply_role_policies('improvement_opportunities', 'auth_can_write_audit', 'auth_can_write_full');

-- ─── 4. Limpieza del helper ───
DROP FUNCTION IF EXISTS _apply_role_policies(TEXT, TEXT, TEXT);

NOTIFY pgrst, 'reload schema';
