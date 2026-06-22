-- iso_migration_v12_rls_by_org.sql
-- Reemplaza las políticas "todos los autenticados ven todo" de v10 por
-- aislamiento real por organización + control por rol.
--
-- Roles:
--   owner            → puede todo, incluye gestión de organización y miembros
--   quality_manager  → puede editar todo el SGC, no toca usuarios ni facturación
--   auditor          → solo lectura del SGC + edición de internal_audits y non_conformities
--   viewer           → solo lectura
--
-- Idempotente.

-- =============================================================================
-- 1. Borrar políticas previas (v4 stakeholders + v7/v8 company_profile + v10 genéricas)
--    Para evitar que políticas "USING (true)" sigan vivas y filtren menos que las nuevas.
-- =============================================================================
DO $$
DECLARE
  t TEXT;
  pol_rec RECORD;
  app_tables TEXT[] := ARRAY[
    'climate_surveys', 'communication_matrix', 'company_profile',
    'context_analysis', 'customer_orders', 'documents_versions',
    'equipment_calibration', 'internal_audits', 'job_descriptions',
    'jobs', 'management_review', 'non_conformities',
    'operational_incidents', 'organizational_chart', 'personnel',
    'processes', 'production_orders', 'quality_objectives',
    'quality_policy', 'risk_matrix', 'scope_declaration',
    'stakeholders', 'suppliers', 'training_records', 'audit_logs'
  ];
BEGIN
  FOREACH t IN ARRAY app_tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    -- Borrar TODAS las políticas existentes de cada tabla operativa.
    -- Esto reinicia el state de RLS para que sólo apliquen las que define v12.
    FOR pol_rec IN
      SELECT policyname FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_rec.policyname, t);
    END LOOP;
  END LOOP;
END $$;

-- =============================================================================
-- 2. Políticas estándar por org + rol para tablas operativas
-- =============================================================================
DO $$
DECLARE
  t TEXT;
  -- Tablas donde TODO miembro con rol de escritura (owner/qm) puede CRUD.
  -- Auditor se maneja aparte (solo internal_audits + non_conformities).
  app_tables TEXT[] := ARRAY[
    'climate_surveys', 'communication_matrix', 'company_profile',
    'context_analysis', 'customer_orders', 'documents_versions',
    'equipment_calibration', 'internal_audits', 'job_descriptions',
    'jobs', 'management_review', 'non_conformities',
    'operational_incidents', 'organizational_chart', 'personnel',
    'processes', 'production_orders', 'quality_objectives',
    'quality_policy', 'risk_matrix', 'scope_declaration',
    'stakeholders', 'suppliers', 'training_records'
  ];
BEGIN
  FOREACH t IN ARRAY app_tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- SELECT: cualquier miembro de la org puede leer
    EXECUTE format(
      'CREATE POLICY org_select ON public.%I FOR SELECT TO authenticated USING (org_id = auth_org_id())',
      t
    );

    -- INSERT: owner o quality_manager
    EXECUTE format(
      'CREATE POLICY org_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (org_id = auth_org_id() AND auth_role() IN (''owner''::org_role, ''quality_manager''::org_role))',
      t
    );

    -- UPDATE: owner o quality_manager
    EXECUTE format(
      'CREATE POLICY org_update ON public.%I FOR UPDATE TO authenticated USING (org_id = auth_org_id() AND auth_role() IN (''owner''::org_role, ''quality_manager''::org_role)) WITH CHECK (org_id = auth_org_id())',
      t
    );

    -- DELETE: solo owner (conservador; borrar es destructivo)
    EXECUTE format(
      'CREATE POLICY org_delete ON public.%I FOR DELETE TO authenticated USING (org_id = auth_org_id() AND auth_role() = ''owner''::org_role)',
      t
    );
  END LOOP;
END $$;

-- =============================================================================
-- 3. Excepción: auditor puede escribir en internal_audits y non_conformities
-- =============================================================================
DO $$
DECLARE
  t TEXT;
  auditor_writable TEXT[] := ARRAY['internal_audits', 'non_conformities'];
BEGIN
  FOREACH t IN ARRAY auditor_writable
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      CONTINUE;
    END IF;

    -- Reemplazar org_insert / org_update por versión que incluye auditor
    EXECUTE format('DROP POLICY IF EXISTS org_insert ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS org_update ON public.%I', t);

    EXECUTE format(
      'CREATE POLICY org_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (org_id = auth_org_id() AND auth_role() IN (''owner''::org_role, ''quality_manager''::org_role, ''auditor''::org_role))',
      t
    );
    EXECUTE format(
      'CREATE POLICY org_update ON public.%I FOR UPDATE TO authenticated USING (org_id = auth_org_id() AND auth_role() IN (''owner''::org_role, ''quality_manager''::org_role, ''auditor''::org_role)) WITH CHECK (org_id = auth_org_id())',
      t
    );
  END LOOP;
END $$;

-- =============================================================================
-- 4. audit_logs: append-only desde el trigger, SELECT solo de la propia org
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
    -- Sin INSERT/UPDATE/DELETE para el cliente: solo el trigger (SECURITY DEFINER) inserta.
    EXECUTE 'CREATE POLICY org_select ON public.audit_logs FOR SELECT TO authenticated USING (org_id = auth_org_id())';
  END IF;
END $$;

-- =============================================================================
-- 5. organizations: cada usuario solo ve y administra la suya
-- =============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_select_own ON public.organizations;
CREATE POLICY org_select_own ON public.organizations
  FOR SELECT TO authenticated
  USING (id = auth_org_id());

DROP POLICY IF EXISTS org_update_own ON public.organizations;
CREATE POLICY org_update_own ON public.organizations
  FOR UPDATE TO authenticated
  USING (id = auth_org_id() AND auth_role() = 'owner'::org_role)
  WITH CHECK (id = auth_org_id());

-- INSERT lo hace el trigger de signup (SECURITY DEFINER), no el cliente.
-- DELETE no se permite desde la app.

-- =============================================================================
-- 6. user_profiles: ver miembros propios, owner administra
-- =============================================================================
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_own_org ON public.user_profiles;
CREATE POLICY profiles_select_own_org ON public.user_profiles
  FOR SELECT TO authenticated
  USING (org_id = auth_org_id());

-- INSERT lo hace el trigger de signup o un futuro flujo de invitación con
-- SECURITY DEFINER. El cliente NO inserta perfiles directamente.

DROP POLICY IF EXISTS profiles_update_admin ON public.user_profiles;
CREATE POLICY profiles_update_admin ON public.user_profiles
  FOR UPDATE TO authenticated
  USING (org_id = auth_org_id() AND auth_role() = 'owner'::org_role)
  WITH CHECK (org_id = auth_org_id());

DROP POLICY IF EXISTS profiles_delete_admin ON public.user_profiles;
CREATE POLICY profiles_delete_admin ON public.user_profiles
  FOR DELETE TO authenticated
  USING (
    org_id = auth_org_id()
    AND auth_role() = 'owner'::org_role
    AND user_id <> auth.uid()  -- el owner no se puede borrar a sí mismo
  );
