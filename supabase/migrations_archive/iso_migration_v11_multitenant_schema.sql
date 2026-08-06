-- iso_migration_v11_multitenant_schema.sql
-- Esquema multi-tenant: cada usuario pertenece a UNA organización, y todos los
-- datos operativos se filtran por organization_id. Los inserts derivan el
-- org_id automáticamente desde la sesión, así los componentes existentes no
-- necesitan tocar nada para que sus INSERTs funcionen.
--
-- Idempotente: se puede re-ejecutar.

-- =============================================================================
-- 1. ENUM de roles
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_role') THEN
    CREATE TYPE org_role AS ENUM ('owner', 'quality_manager', 'auditor', 'viewer');
  END IF;
END $$;

-- =============================================================================
-- 2. organizations
-- =============================================================================
CREATE TABLE IF NOT EXISTS organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 3. user_profiles (vínculo usuario ↔ organización + rol)
-- =============================================================================
CREATE TABLE IF NOT EXISTS user_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role org_role NOT NULL DEFAULT 'viewer',
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_org ON user_profiles(org_id);

-- =============================================================================
-- 4. Funciones helper para RLS
-- =============================================================================

-- Devuelve el org_id del usuario actual (NULL si no tiene perfil).
-- STABLE → Postgres puede cachear el resultado dentro de una misma query.
CREATE OR REPLACE FUNCTION auth_org_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM user_profiles WHERE user_id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION auth_role()
RETURNS org_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_profiles WHERE user_id = auth.uid()
$$;

-- True si el usuario actual puede escribir en el SGC (todo menos viewer).
CREATE OR REPLACE FUNCTION auth_can_write()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT auth_role() IN ('owner', 'quality_manager', 'auditor')
$$;

-- True si el usuario actual puede gestionar la organización (sólo owner).
CREATE OR REPLACE FUNCTION auth_can_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT auth_role() = 'owner'
$$;

-- =============================================================================
-- 5. Crear organización "Legacy" para datos preexistentes
-- =============================================================================
DO $$
DECLARE
  legacy_org_id UUID;
BEGIN
  -- Crear org Legacy si no existe
  SELECT id INTO legacy_org_id FROM organizations WHERE slug = 'legacy-data';
  IF legacy_org_id IS NULL THEN
    INSERT INTO organizations (name, slug, plan)
    VALUES ('Datos Legacy (pre-multitenant)', 'legacy-data', 'free')
    RETURNING id INTO legacy_org_id;
  END IF;

  -- Asignar todos los usuarios existentes que no tienen perfil → org Legacy como owner
  INSERT INTO user_profiles (user_id, org_id, role)
  SELECT u.id, legacy_org_id, 'owner'::org_role
  FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM user_profiles p WHERE p.user_id = u.id);
END $$;

-- =============================================================================
-- 6. Agregar org_id a todas las tablas operativas
-- =============================================================================
DO $$
DECLARE
  t TEXT;
  legacy_id UUID;
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
  SELECT id INTO legacy_id FROM organizations WHERE slug = 'legacy-data';

  FOREACH t IN ARRAY app_tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      RAISE NOTICE 'Tabla % no existe, se omite', t;
      CONTINUE;
    END IF;

    -- Agregar columna si no existe (con DEFAULT a legacy para no romper)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'org_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE',
        t
      );

      -- Llenar registros existentes con la org legacy
      EXECUTE format('UPDATE public.%I SET org_id = %L WHERE org_id IS NULL', t, legacy_id);

      -- Ahora NOT NULL
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN org_id SET NOT NULL', t);
    END IF;

    -- Configurar DEFAULT a auth_org_id() para que los INSERTs derivan org_id solos
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN org_id SET DEFAULT auth_org_id()',
      t
    );

    -- Índice para acelerar el filtrado RLS
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%I_org_id ON public.%I(org_id)',
      t, t
    );
  END LOOP;
END $$;

-- =============================================================================
-- 7. audit_logs también necesita org_id para no fugar datos entre orgs
-- =============================================================================
DO $$
DECLARE
  legacy_id UUID;
BEGIN
  SELECT id INTO legacy_id FROM organizations WHERE slug = 'legacy-data';

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'audit_logs' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.audit_logs ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
    UPDATE public.audit_logs SET org_id = legacy_id WHERE org_id IS NULL;
    ALTER TABLE public.audit_logs ALTER COLUMN org_id SET NOT NULL;
  END IF;

  ALTER TABLE public.audit_logs ALTER COLUMN org_id SET DEFAULT auth_org_id();
  CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON public.audit_logs(org_id);
END $$;

-- Actualizar el trigger de auditoría para que también setee org_id
CREATE OR REPLACE FUNCTION log_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old JSONB;
  v_new JSONB;
  v_record_id UUID;
  v_org_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_record_id := OLD.id;
    v_org_id := OLD.org_id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := NEW.id;
    v_org_id := NEW.org_id;
  ELSE
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_record_id := NEW.id;
    v_org_id := NEW.org_id;
  END IF;

  INSERT INTO audit_logs (user_id, org_id, action, table_name, record_id, old_data, new_data)
  VALUES (auth.uid(), v_org_id, TG_OP, TG_TABLE_NAME, v_record_id, v_old, v_new);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- =============================================================================
-- 8. updated_at automático en organizations y user_profiles
-- =============================================================================
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_organizations_updated_at ON organizations;
CREATE TRIGGER tr_organizations_updated_at
BEFORE UPDATE ON organizations
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

DROP TRIGGER IF EXISTS tr_user_profiles_updated_at ON user_profiles;
CREATE TRIGGER tr_user_profiles_updated_at
BEFORE UPDATE ON user_profiles
FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
