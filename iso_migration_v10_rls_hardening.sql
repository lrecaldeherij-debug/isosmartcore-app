-- iso_migration_v10_rls_hardening.sql
-- Cierra el hueco más crítico: habilita Row Level Security en todas las tablas
-- del SGC. Sin esto, la anon key (que viaja al cliente) tiene acceso libre.
--
-- Política base: cualquier usuario autenticado puede CRUD.
-- (Más adelante se puede restringir por user_id si se introduce multi-tenant).
-- Excepción: audit_logs es append-only desde el trigger; el cliente sólo lee.
--
-- Es idempotente: se puede correr varias veces sin error.

DO $$
DECLARE
  t TEXT;
  app_tables TEXT[] := ARRAY[
    'climate_surveys',
    'communication_matrix',
    'company_profile',
    'context_analysis',
    'customer_orders',
    'documents_versions',
    'equipment_calibration',
    'internal_audits',
    'job_descriptions',
    'jobs',
    'management_review',
    'non_conformities',
    'operational_incidents',
    'organizational_chart',
    'personnel',
    'processes',
    'production_orders',
    'quality_objectives',
    'quality_policy',
    'risk_matrix',
    'scope_declaration',
    'stakeholders',
    'suppliers',
    'training_records'
  ];
BEGIN
  FOREACH t IN ARRAY app_tables
  LOOP
    -- Saltar si la tabla todavía no fue creada (algunas módulos pueden no
    -- haberse desplegado aún en este entorno).
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Tabla % no existe, se omite', t;
      CONTINUE;
    END IF;

    -- Habilitar RLS
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- SELECT
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = 'auth_select'
    ) THEN
      EXECUTE format(
        'CREATE POLICY auth_select ON public.%I FOR SELECT TO authenticated USING (true)',
        t
      );
    END IF;

    -- INSERT
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = 'auth_insert'
    ) THEN
      EXECUTE format(
        'CREATE POLICY auth_insert ON public.%I FOR INSERT TO authenticated WITH CHECK (true)',
        t
      );
    END IF;

    -- UPDATE
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = 'auth_update'
    ) THEN
      EXECUTE format(
        'CREATE POLICY auth_update ON public.%I FOR UPDATE TO authenticated USING (true) WITH CHECK (true)',
        t
      );
    END IF;

    -- DELETE
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = 'auth_delete'
    ) THEN
      EXECUTE format(
        'CREATE POLICY auth_delete ON public.%I FOR DELETE TO authenticated USING (true)',
        t
      );
    END IF;
  END LOOP;
END $$;

-- audit_logs: bitácora inmutable. El trigger log_changes() inserta con
-- SECURITY DEFINER, así que NO necesitamos política de INSERT para el cliente.
-- Sólo permitimos SELECT.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_logs'
  ) THEN
    ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'audit_logs'
        AND policyname = 'auth_select'
    ) THEN
      CREATE POLICY auth_select ON public.audit_logs
        FOR SELECT TO authenticated USING (true);
    END IF;
    -- Sin INSERT/UPDATE/DELETE → append-only desde el trigger.
  END IF;
END $$;

-- Aplicar triggers de auditoría a todas las tablas operativas críticas
-- (idempotente; reemplaza definiciones previas).
DO $$
DECLARE
  t TEXT;
  audit_tables TEXT[] := ARRAY[
    'risk_matrix',
    'quality_objectives',
    'internal_audits',
    'non_conformities',
    'management_review',
    'processes',
    'job_descriptions',
    'documents_versions',
    'customer_orders',
    'production_orders',
    'operational_incidents',
    'suppliers',
    'company_profile',
    'stakeholders'
  ];
BEGIN
  FOREACH t IN ARRAY audit_tables
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
      EXECUTE format(
        'CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION log_changes()',
        t, t
      );
    END IF;
  END LOOP;
END $$;
