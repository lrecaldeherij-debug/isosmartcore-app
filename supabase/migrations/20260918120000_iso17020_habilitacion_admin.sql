-- =============================================================================
-- ISO/IEC 17020 — el módulo lo habilita solo el super_admin
--
-- Antes cualquier owner podía prender "Habilitar módulos de inspección" desde
-- Mi Organización. Ahora:
--   - El cliente SOLICITA el módulo (request_inspection_module).
--   - El super_admin lo aprueba o lo apaga desde el Panel de administración
--     (admin_set_inspection_module), y queda en admin_audit_log.
--   - Un trigger impide cambiar inspection_module_enabled por fuera de eso,
--     así que no se puede saltear con un UPDATE directo desde el navegador.
-- =============================================================================

BEGIN;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS inspection_module_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS inspection_module_requested_at TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS inspection_module_requested_by UUID;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS inspection_module_request_note TEXT;

-- 1. Guardia: solo super_admin (o el backend sin usuario) cambia estos campos
CREATE OR REPLACE FUNCTION guard_inspection_module_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Migraciones / service_role / funciones internas: sin usuario autenticado
  IF auth.uid() IS NULL OR is_super_admin() THEN
    RETURN NEW;
  END IF;

  -- Las funciones SECURITY DEFINER de abajo marcan la sesión para poder escribir
  IF current_setting('app.inspection_module_rpc', true) = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.inspection_module_enabled IS DISTINCT FROM OLD.inspection_module_enabled THEN
    RAISE EXCEPTION 'El módulo de inspección (17020) lo habilita el administrador de IsoSmartCore. Solicitalo desde Mi Organización.';
  END IF;

  IF NEW.inspection_module_requested_at IS DISTINCT FROM OLD.inspection_module_requested_at
     OR NEW.inspection_module_requested_by IS DISTINCT FROM OLD.inspection_module_requested_by
     OR NEW.inspection_module_request_note IS DISTINCT FROM OLD.inspection_module_request_note THEN
    RAISE EXCEPTION 'La solicitud del módulo de inspección se hace con el botón Solicitar.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_inspection_module ON organizations;
CREATE TRIGGER trg_guard_inspection_module
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION guard_inspection_module_fields();

-- 2. El cliente solicita (solo el owner de su propia org)
CREATE OR REPLACE FUNCTION request_inspection_module(p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_role   TEXT;
BEGIN
  SELECT org_id, role INTO v_org_id, v_role
    FROM user_profiles WHERE user_id = auth.uid();

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No perteneces a ninguna organización';
  END IF;
  IF v_role <> 'owner' THEN
    RAISE EXCEPTION 'Solo el owner de la organización puede solicitar el módulo de inspección';
  END IF;
  IF EXISTS (SELECT 1 FROM organizations WHERE id = v_org_id AND inspection_module_enabled) THEN
    RAISE EXCEPTION 'El módulo de inspección ya está habilitado';
  END IF;

  PERFORM set_config('app.inspection_module_rpc', 'on', true);
  UPDATE organizations
     SET inspection_module_requested_at = now(),
         inspection_module_requested_by = auth.uid(),
         inspection_module_request_note = NULLIF(trim(COALESCE(p_note, '')), '')
   WHERE id = v_org_id;
  PERFORM set_config('app.inspection_module_rpc', 'off', true);
END;
$$;

-- El cliente retira su solicitud
CREATE OR REPLACE FUNCTION cancel_inspection_module_request()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
  v_role   TEXT;
BEGIN
  SELECT org_id, role INTO v_org_id, v_role
    FROM user_profiles WHERE user_id = auth.uid();
  IF v_org_id IS NULL OR v_role <> 'owner' THEN
    RAISE EXCEPTION 'Solo el owner de la organización puede retirar la solicitud';
  END IF;

  PERFORM set_config('app.inspection_module_rpc', 'on', true);
  UPDATE organizations
     SET inspection_module_requested_at = NULL,
         inspection_module_requested_by = NULL,
         inspection_module_request_note = NULL
   WHERE id = v_org_id;
  PERFORM set_config('app.inspection_module_rpc', 'off', true);
END;
$$;

-- 3. El super_admin habilita / deshabilita
CREATE OR REPLACE FUNCTION admin_set_inspection_module(
  p_org_id  UUID,
  p_enabled BOOLEAN,
  p_reason  TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_email TEXT;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Solo el administrador de IsoSmartCore puede habilitar el módulo de inspección';
  END IF;

  SELECT email INTO v_admin_email FROM auth.users WHERE id = auth.uid();

  UPDATE organizations
     SET inspection_module_enabled = p_enabled,
         -- Aprobada o rechazada, la solicitud queda resuelta
         inspection_module_requested_at = NULL,
         inspection_module_requested_by = NULL,
         inspection_module_request_note = NULL
   WHERE id = p_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organización no encontrada';
  END IF;

  INSERT INTO admin_audit_log (admin_user_id, admin_email, action, target_org_id, payload)
  VALUES (
    auth.uid(), v_admin_email, 'set_inspection_module', p_org_id,
    jsonb_build_object('enabled', p_enabled, 'reason', p_reason)
  );
END;
$$;

-- 4. Estado del módulo en todas las orgs (para el Panel de administración)
CREATE OR REPLACE FUNCTION admin_inspection_module_status()
RETURNS TABLE (
  org_id        UUID,
  enabled       BOOLEAN,
  requested_at  TIMESTAMPTZ,
  request_note  TEXT,
  requested_by_email TEXT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.inspection_module_enabled, o.inspection_module_requested_at,
         o.inspection_module_request_note, u.email
    FROM organizations o
    LEFT JOIN auth.users u ON u.id = o.inspection_module_requested_by
   WHERE is_super_admin()
$$;

REVOKE ALL ON FUNCTION request_inspection_module(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION cancel_inspection_module_request() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_set_inspection_module(UUID, BOOLEAN, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_inspection_module_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION request_inspection_module(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION cancel_inspection_module_request() TO authenticated;
GRANT EXECUTE ON FUNCTION admin_set_inspection_module(UUID, BOOLEAN, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_inspection_module_status() TO authenticated;

-- 5. Recrear org_with_plan
-- La vista se definió con `o.*`, y Postgres congela esa lista de columnas al
-- crearla: las columnas agregadas después a organizations (módulo 17020, tipo
-- de independencia, salvaguardas, solicitud) NO aparecen en la vista, y
-- OrgContext lee la org desde ella. Sin esto el menú "Inspección (17020)" no
-- aparece aunque el módulo esté habilitado.
DROP VIEW IF EXISTS org_with_plan;
CREATE VIEW org_with_plan AS
SELECT
  o.*,
  p.name AS plan_name,
  p.price_monthly_usd,
  p.max_users,
  p.max_processes,
  p.max_orgs,
  p.ai_prompts_per_month,
  p.features AS plan_features,
  p.is_popular AS plan_is_popular,
  CASE
    WHEN o.is_internal_account THEN 'active'
    WHEN o.is_combo_client AND o.combo_end_date IS NOT NULL
         AND o.combo_end_date >= CURRENT_DATE THEN 'active'
    WHEN o.is_combo_client AND o.combo_end_date IS NOT NULL
         AND o.combo_end_date < CURRENT_DATE THEN 'expired'
    WHEN o.subscription_status = 'trialing' AND o.trial_ends_at < now() THEN 'expired'
    WHEN o.subscription_status = 'trialing' THEN 'trialing'
    ELSE o.subscription_status
  END AS effective_status,
  CASE
    WHEN o.is_internal_account THEN NULL
    WHEN o.is_combo_client AND o.combo_end_date IS NOT NULL
      THEN GREATEST(0, (o.combo_end_date - CURRENT_DATE)::INT)
    WHEN o.subscription_status = 'trialing'
      THEN GREATEST(0, EXTRACT(DAY FROM (o.trial_ends_at - now()))::INT)
    ELSE NULL
  END AS trial_days_left,
  CASE
    WHEN o.is_internal_account THEN NULL
    WHEN p.ai_prompts_per_month IS NULL THEN NULL
    ELSE GREATEST(0, p.ai_prompts_per_month - COALESCE(o.ai_prompts_used_month, 0))
  END AS ai_prompts_remaining
FROM organizations o
LEFT JOIN plans p ON p.id = o.plan_id;

-- Mantener el aislamiento por RLS (ver 20260910180000_views_security_invoker)
DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    EXECUTE 'ALTER VIEW org_with_plan SET (security_invoker = true)';
  END IF;
END $$;

GRANT SELECT ON org_with_plan TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
