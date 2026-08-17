-- =============================================================================
-- RPC para que el super_admin pueda ELIMINAR organizaciones completas.
--
-- Es destructivo: elimina la org y por FK cascade elimina user_profiles y
-- toda la data operativa (processes, stakeholders, etc.).
--
-- Seguridad:
--   - Solo super_admin puede llamar
--   - Requiere que el nombre exacto de la org se pase como confirmación
--     (patrón GitHub "type the repo name to delete")
--   - Loguea ANTES de eliminar (después el target_org_id se pondría en NULL
--     por el ON DELETE SET NULL del audit_log)
--
-- También agrego admin_delete_user_of_org para casos donde queremos limpiar
-- solo el usuario de auth (opcional, no forzoso).
-- =============================================================================

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

  -- Log ANTES del delete (el target_org_id se resetea a NULL por SET NULL)
  INSERT INTO admin_audit_log (
    admin_user_id, admin_email, action, target_org_id, payload, reason
  )
  VALUES (
    auth.uid(), v_admin_email, 'delete_organization', p_org_id,
    jsonb_build_object(
      'org_name', v_org_name,
      'users_affected', v_users_count
    ),
    p_reason
  );

  -- Eliminar. FK ON DELETE CASCADE limpia user_profiles y toda la data.
  DELETE FROM organizations WHERE id = p_org_id;

  RETURN jsonb_build_object(
    'deleted', true,
    'org_name', v_org_name,
    'users_affected', v_users_count
  );
END;
$$;

-- RPC helper: lista los planes disponibles (para el selector de cambiar plan)
CREATE OR REPLACE FUNCTION list_available_plans()
RETURNS TABLE (
  id                TEXT,
  name              TEXT,
  price_monthly_usd NUMERIC,
  max_users         INT,
  max_processes     INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name, price_monthly_usd, max_users, max_processes
  FROM plans
  WHERE is_super_admin()
  ORDER BY display_order NULLS LAST, price_monthly_usd
$$;

NOTIFY pgrst, 'reload schema';
