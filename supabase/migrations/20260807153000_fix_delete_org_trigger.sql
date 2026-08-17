-- =============================================================================
-- Fix: el trigger enforce_min_one_owner bloquea el DELETE de organizations
-- porque el CASCADE en user_profiles activa el trigger (que ve la org todavía
-- existente durante la transacción y RAISE porque "no hay owner").
--
-- Solución: variable de sesión app.deleting_org que el RPC de super_admin
-- setea a 'true' antes del DELETE. El trigger la lee y salta el check.
--
-- Usuarios normales NUNCA setean esa variable, así que el constraint sigue
-- protegiéndolos de demote/eliminar el último owner.
-- =============================================================================

-- 1. Redefinir el trigger para respetar la variable de sesión
CREATE OR REPLACE FUNCTION enforce_min_one_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  owner_count INT;
BEGIN
  -- Bypass: cuando super_admin está eliminando la org completa vía RPC,
  -- el CASCADE en user_profiles no debe bloquear.
  IF current_setting('app.deleting_org', true) = 'true' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'UPDATE' AND OLD.role = 'owner' AND NEW.role <> 'owner')
     OR (TG_OP = 'DELETE' AND OLD.role = 'owner') THEN
    SELECT COUNT(*) INTO owner_count
    FROM user_profiles
    WHERE org_id = OLD.org_id AND role = 'owner' AND user_id <> OLD.user_id;
    IF owner_count = 0 THEN
      RAISE EXCEPTION 'La organización debe tener al menos un propietario (owner). No podés demote/eliminar el último.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- 2. Redefinir admin_delete_organization para setear la variable de sesión
CREATE OR REPLACE FUNCTION admin_delete_organization(
  p_org_id       UUID,
  p_confirm_name TEXT,
  p_reason       TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_email TEXT;
  v_org_name    TEXT;
  v_users_count INT;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Solo super_admin puede eliminar organizaciones';
  END IF;

  SELECT name INTO v_org_name FROM organizations WHERE id = p_org_id;
  IF v_org_name IS NULL THEN
    RAISE EXCEPTION 'Organización no encontrada';
  END IF;

  IF v_org_name != p_confirm_name THEN
    RAISE EXCEPTION 'Nombre de confirmación no coincide. Escribí exactamente: %', v_org_name;
  END IF;

  SELECT email INTO v_admin_email FROM auth.users WHERE id = auth.uid();
  SELECT COUNT(*)::INT INTO v_users_count FROM user_profiles WHERE org_id = p_org_id;

  -- Log ANTES del delete
  INSERT INTO admin_audit_log (
    admin_user_id, admin_email, action, target_org_id, payload, reason
  )
  VALUES (
    auth.uid(), v_admin_email, 'delete_organization', p_org_id,
    jsonb_build_object('org_name', v_org_name, 'users_affected', v_users_count),
    p_reason
  );

  -- Setear flag para que el trigger enforce_min_one_owner salte durante este CASCADE
  PERFORM set_config('app.deleting_org', 'true', true);  -- true = local a la transacción

  DELETE FROM organizations WHERE id = p_org_id;

  RETURN jsonb_build_object(
    'deleted', true,
    'org_name', v_org_name,
    'users_affected', v_users_count
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
