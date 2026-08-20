-- =============================================================================
-- Fix DEFINITIVO del bug de "trial caducado" en clientes combo.
--
-- Root cause: cuando marcabas una org como combo (admin_set_combo), solo se
-- actualizaban los campos is_combo_client/combo_start_date/combo_end_date,
-- pero subscription_status seguia en 'trialing'. Aunque el fix anterior de
-- la vista org_with_plan compute effective_status='active' para combos
-- vigentes, pueden quedar puntos de la app que miran subscription_status
-- directo (o cache de PostgREST viejo).
--
-- Este SQL hace 3 cosas:
--   1. Actualiza YA todos los combos activos existentes a subscription_status='active'
--   2. Reaplica la vista org_with_plan (idempotente, por si no se corrio antes)
--   3. Actualiza admin_set_combo para que en el futuro marcar como combo
--      tambien mueva subscription_status a 'active'
-- =============================================================================

BEGIN;

-- 1. FIX INMEDIATO: todas las orgs combo con fecha vigente pasan a 'active'
UPDATE organizations
   SET subscription_status = 'active'
 WHERE is_combo_client = true
   AND combo_end_date IS NOT NULL
   AND combo_end_date >= CURRENT_DATE
   AND subscription_status = 'trialing';

-- 2. Reaplicar vista org_with_plan (por si el fix previo no se corrio)
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

-- 3. Actualizar admin_set_combo: al marcar combo activa la suscripcion
CREATE OR REPLACE FUNCTION admin_set_combo(
  p_org_id     UUID,
  p_is_combo   BOOLEAN,
  p_start_date DATE DEFAULT NULL,
  p_end_date   DATE DEFAULT NULL,
  p_notes      TEXT DEFAULT NULL
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
    RAISE EXCEPTION 'Solo super_admin puede modificar el combo';
  END IF;

  SELECT email INTO v_admin_email FROM auth.users WHERE id = auth.uid();

  UPDATE organizations
     SET is_combo_client  = p_is_combo,
         combo_start_date = COALESCE(p_start_date, combo_start_date),
         combo_end_date   = COALESCE(p_end_date,   combo_end_date),
         combo_notes      = COALESCE(p_notes,      combo_notes),
         -- Cuando marcas como combo con fecha en el futuro, la suscripcion
         -- queda 'active' (implicito: el cliente puede usar el sistema)
         subscription_status = CASE
           WHEN p_is_combo AND COALESCE(p_end_date, combo_end_date) >= CURRENT_DATE
             THEN 'active'
           WHEN NOT p_is_combo AND subscription_status = 'active'
             -- Si te DES-marcan como combo y estabas active por eso,
             -- vuelve a trialing (el cliente decidira si paga)
             THEN 'trialing'
           ELSE subscription_status
         END
   WHERE id = p_org_id;

  INSERT INTO admin_audit_log (admin_user_id, admin_email, action, target_org_id, payload)
  VALUES (
    auth.uid(), v_admin_email, 'set_combo', p_org_id,
    jsonb_build_object(
      'is_combo', p_is_combo,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'notes', p_notes
    )
  );
END;
$$;

-- 4. Actualizar list_all_organizations_admin para incluir effective_status
-- Postgres no permite CREATE OR REPLACE cuando el RETURNS TABLE cambia de shape.
-- Necesitamos DROP antes.
DROP FUNCTION IF EXISTS list_all_organizations_admin();
CREATE FUNCTION list_all_organizations_admin()
RETURNS TABLE (
  id                    UUID,
  name                  TEXT,
  slug                  TEXT,
  plan_id               TEXT,
  subscription_status   TEXT,
  effective_status      TEXT,
  trial_ends_at         TIMESTAMPTZ,
  current_period_end    TIMESTAMPTZ,
  is_internal_account   BOOLEAN,
  is_combo_client       BOOLEAN,
  combo_start_date      DATE,
  combo_end_date        DATE,
  combo_notes           TEXT,
  admin_notes           TEXT,
  users_count           INT,
  owner_email           TEXT,
  created_at            TIMESTAMPTZ,
  days_until_expiry     INT
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id, o.name, o.slug, o.plan_id, o.subscription_status,
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
    o.trial_ends_at, o.current_period_end, o.is_internal_account,
    o.is_combo_client, o.combo_start_date, o.combo_end_date,
    o.combo_notes, o.admin_notes,
    (SELECT COUNT(*)::INT FROM user_profiles p WHERE p.org_id = o.id),
    (SELECT u.email FROM user_profiles p JOIN auth.users u ON u.id = p.user_id
      WHERE p.org_id = o.id AND p.role = 'owner' LIMIT 1),
    o.created_at,
    CASE
      WHEN o.is_combo_client AND o.combo_end_date IS NOT NULL
        THEN (o.combo_end_date - CURRENT_DATE)::INT
      WHEN o.trial_ends_at IS NOT NULL
        THEN (o.trial_ends_at::DATE - CURRENT_DATE)::INT
      ELSE NULL
    END
  FROM organizations o
  WHERE is_super_admin()
  ORDER BY o.created_at DESC
$$;

-- 5. Refresh schema cache (crítico para que PostgREST vea la vista nueva)
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación post-fix
SELECT
  o.name,
  o.subscription_status,
  o.is_combo_client,
  o.combo_end_date,
  ow.effective_status,
  ow.trial_days_left
FROM organizations o
LEFT JOIN org_with_plan ow ON ow.id = o.id
WHERE NOT o.is_internal_account
ORDER BY o.name;
