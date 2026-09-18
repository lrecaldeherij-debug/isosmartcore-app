-- =============================================================================
-- Usuarios adicionales por organización
--
-- El límite de usuarios salía solo del plan (Starter = 1). Para combos y
-- acuerdos puntuales el super_admin puede sumar usuarios a una org concreta
-- sin cambiarle el plan: límite efectivo = plan.max_users + extra_users.
--
-- Solo el super_admin lo cambia (admin_set_extra_users); un trigger bloquea
-- que el cliente se lo suba con un UPDATE directo.
-- =============================================================================

BEGIN;

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS extra_users INT NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'organizations_extra_users_nonneg') THEN
    ALTER TABLE organizations ADD CONSTRAINT organizations_extra_users_nonneg CHECK (extra_users >= 0);
  END IF;
END $$;

-- 1. Guardia
CREATE OR REPLACE FUNCTION guard_extra_users()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.extra_users IS DISTINCT FROM OLD.extra_users THEN
    RAISE EXCEPTION 'Los usuarios adicionales los asigna el administrador de IsoSmartCore.';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_extra_users ON organizations;
CREATE TRIGGER trg_guard_extra_users
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION guard_extra_users();

-- 2. RPC del super_admin
CREATE OR REPLACE FUNCTION admin_set_extra_users(
  p_org_id      UUID,
  p_extra_users INT,
  p_reason      TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_email TEXT;
  v_before      INT;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Solo el administrador de IsoSmartCore puede asignar usuarios adicionales';
  END IF;
  IF p_extra_users IS NULL OR p_extra_users < 0 THEN
    RAISE EXCEPTION 'La cantidad de usuarios adicionales debe ser 0 o más';
  END IF;

  SELECT extra_users INTO v_before FROM organizations WHERE id = p_org_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Organización no encontrada';
  END IF;

  UPDATE organizations SET extra_users = p_extra_users WHERE id = p_org_id;

  SELECT email INTO v_admin_email FROM auth.users WHERE id = auth.uid();
  INSERT INTO admin_audit_log (admin_user_id, admin_email, action, target_org_id, payload)
  VALUES (
    auth.uid(), v_admin_email, 'set_extra_users', p_org_id,
    jsonb_build_object('before', v_before, 'after', p_extra_users, 'reason', p_reason)
  );
END;
$$;

-- 3. Lectura para el Panel de administración
CREATE OR REPLACE FUNCTION admin_org_extra_users()
RETURNS TABLE (org_id UUID, extra_users INT, plan_max_users INT)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT o.id, o.extra_users, p.max_users
    FROM organizations o
    LEFT JOIN plans p ON p.id = o.plan_id
   WHERE is_super_admin()
$$;

REVOKE ALL ON FUNCTION admin_set_extra_users(UUID, INT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION admin_org_extra_users() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION admin_set_extra_users(UUID, INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION admin_org_extra_users() TO authenticated;

-- 4. Talleres Mejía (combo, plan 'free' = Starter de 1 usuario en la app):
--    +3 usuarios = 4 en total
UPDATE organizations
   SET extra_users = GREATEST(extra_users, 3)
 WHERE name ILIKE 'Talleres Mej%'
   AND is_combo_client;

INSERT INTO admin_audit_log (admin_user_id, admin_email, action, target_org_id, payload)
SELECT u.id, u.email, 'set_extra_users', o.id,
       jsonb_build_object('after', o.extra_users, 'reason', 'Combo Talleres Mejía: 3 usuarios adicionales (migración)')
  FROM organizations o
  CROSS JOIN LATERAL (
    SELECT id, email FROM auth.users
     WHERE lower(email) = 'l.recaldeherij@gmail.com' LIMIT 1
  ) u
 WHERE o.name ILIKE 'Talleres Mej%' AND o.is_combo_client;

-- 5. Recrear org_with_plan para que exponga extra_users (su o.* se congela
--    al crear la vista). Misma definición que 20260918120000.
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

DO $$
BEGIN
  IF current_setting('server_version_num')::int >= 150000 THEN
    EXECUTE 'ALTER VIEW org_with_plan SET (security_invoker = true)';
  END IF;
END $$;

GRANT SELECT ON org_with_plan TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación
SELECT name, plan_id, is_combo_client, extra_users FROM organizations WHERE name ILIKE 'Talleres Mej%';
