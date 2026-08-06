-- iso_migration_v13_signup_trigger.sql
-- Cuando un usuario se registra (signUp con metadata company_name),
-- se crea automáticamente:
--   1. Una organización nueva con ese nombre
--   2. Un user_profile vinculando al usuario como owner
--
-- El frontend pasa el nombre así:
--   supabase.auth.signUp({
--     email, password,
--     options: { data: { company_name: 'Acme SRL', full_name: 'Juan Pérez' } }
--   })
--
-- Si por alguna razón no llega company_name (signup viejo, OAuth), el trigger
-- usa el email como nombre temporal. El owner puede renombrar después.

CREATE OR REPLACE FUNCTION handle_new_user_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_company_name TEXT;
  v_full_name TEXT;
  v_slug TEXT;
  v_invited_org_id UUID;
  v_invited_role TEXT;
BEGIN
  v_full_name := NULLIF(TRIM(NEW.raw_user_meta_data ->> 'full_name'), '');

  -- Caso A: usuario INVITADO a una org existente
  -- (la edge function `invite-member` pasa invited_org_id e invited_role en metadata)
  v_invited_org_id := NULLIF(NEW.raw_user_meta_data ->> 'invited_org_id', '')::UUID;
  v_invited_role := NULLIF(NEW.raw_user_meta_data ->> 'invited_role', '');

  IF v_invited_org_id IS NOT NULL THEN
    -- Validar que la org existe
    IF NOT EXISTS (SELECT 1 FROM organizations WHERE id = v_invited_org_id) THEN
      RAISE EXCEPTION 'invited_org_id no existe: %', v_invited_org_id;
    END IF;

    INSERT INTO user_profiles (user_id, org_id, role, full_name)
    VALUES (
      NEW.id,
      v_invited_org_id,
      COALESCE(v_invited_role, 'viewer')::org_role,
      v_full_name
    );
    RETURN NEW;
  END IF;

  -- Caso B: signup self-service → crear org nueva con el usuario como owner
  v_company_name := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data ->> 'company_name'), ''),
    split_part(NEW.email, '@', 1)
  );

  v_slug := lower(regexp_replace(split_part(NEW.email, '@', 1), '[^a-z0-9]+', '-', 'g'))
            || '-' || substr(NEW.id::TEXT, 1, 8);

  INSERT INTO organizations (name, slug, plan)
  VALUES (v_company_name, v_slug, 'free')
  RETURNING id INTO v_org_id;

  INSERT INTO user_profiles (user_id, org_id, role, full_name)
  VALUES (NEW.id, v_org_id, 'owner'::org_role, v_full_name);

  RETURN NEW;
END;
$$;

-- Disparar en cada nuevo usuario de auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user_signup();
