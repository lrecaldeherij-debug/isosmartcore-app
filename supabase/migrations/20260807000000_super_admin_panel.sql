-- =============================================================================
-- Panel de super_admin — Lebis solo, acceso cross-org para gestionar clientes.
--
-- Motivación:
--   Con clientes reales entrando al SaaS, hace falta un panel para ver todas
--   las orgs, gestionar el combo "asesoramiento + 6 meses gratis del sistema"
--   y hacer soporte impersonando en modo lectura.
--
-- Componentes:
--   1. Flag is_super_admin en user_profiles + función is_super_admin()
--   2. Marcar l.recaldeherij@gmail.com y lebis.recalde@herijec.com como super_admin
--   3. Campos combo en organizations (fechas + notas privadas)
--   4. Tabla admin_audit_log — cada acción del super_admin queda registrada
--   5. RLS que da SELECT cross-org al super_admin (INSERT/UPDATE/DELETE
--      requieren acción explícita vía RPC)
--   6. RPCs seguros: list_all_organizations_admin, admin_metrics,
--      admin_extend_trial, admin_set_combo, admin_change_plan
--
-- Seguridad:
--   - Todas las RPCs verifican is_super_admin() antes de ejecutar
--   - Cada RPC insertó en admin_audit_log con quién, qué, cuándo, por qué
--   - Modo impersonar es SOLO frontend (redirige a /app con banner + guardias
--     que no envían mutaciones). Server-side lectura funciona vía is_super_admin
-- =============================================================================

BEGIN;

-- 1. Flag super_admin en user_profiles
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT false;

-- 2. Campos combo en organizations
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_combo_client   BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS combo_start_date  DATE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS combo_end_date    DATE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS combo_notes       TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS admin_notes       TEXT;

-- 3. Función helper is_super_admin()
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_super_admin FROM user_profiles WHERE user_id = auth.uid()),
    false
  )
$$;

-- 4. Marcar a Lebis como super_admin (ambos emails que usa)
UPDATE user_profiles
   SET is_super_admin = true
 WHERE user_id IN (
   SELECT id FROM auth.users
    WHERE lower(email) IN ('l.recaldeherij@gmail.com', 'lebis.recalde@herijec.com')
 );

-- 5. Tabla admin_audit_log
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email   TEXT,
  action        TEXT NOT NULL,          -- 'extend_trial', 'set_combo', 'change_plan', 'impersonate_start', etc.
  target_org_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  target_email  TEXT,
  payload       JSONB DEFAULT '{}'::jsonb,
  reason        TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_admin     ON admin_audit_log(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target    ON admin_audit_log(target_org_id);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created   ON admin_audit_log(created_at DESC);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Solo super_admin ve el log
DROP POLICY IF EXISTS admin_audit_log_select ON admin_audit_log;
CREATE POLICY admin_audit_log_select ON admin_audit_log
  FOR SELECT TO authenticated
  USING (is_super_admin());

-- 6. Extender RLS de organizations para permitir SELECT al super_admin en TODAS
DROP POLICY IF EXISTS organizations_select_super_admin ON organizations;
CREATE POLICY organizations_select_super_admin ON organizations
  FOR SELECT TO authenticated
  USING (is_super_admin());

-- Mismo para user_profiles (para poder listar usuarios de cada org)
DROP POLICY IF EXISTS user_profiles_select_super_admin ON user_profiles;
CREATE POLICY user_profiles_select_super_admin ON user_profiles
  FOR SELECT TO authenticated
  USING (is_super_admin());

-- 7. RPC: listar todas las organizaciones con info agregada
CREATE OR REPLACE FUNCTION list_all_organizations_admin()
RETURNS TABLE (
  id                    UUID,
  name                  TEXT,
  slug                  TEXT,
  plan_id               TEXT,
  subscription_status   TEXT,
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
  days_until_expiry     INT   -- días restantes hasta que empiece a pagar (combo_end o trial_end, lo que aplique)
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    o.id,
    o.name,
    o.slug,
    o.plan_id,
    o.subscription_status,
    o.trial_ends_at,
    o.current_period_end,
    o.is_internal_account,
    o.is_combo_client,
    o.combo_start_date,
    o.combo_end_date,
    o.combo_notes,
    o.admin_notes,
    (SELECT COUNT(*)::INT FROM user_profiles p WHERE p.org_id = o.id) AS users_count,
    (SELECT u.email FROM user_profiles p JOIN auth.users u ON u.id = p.user_id
      WHERE p.org_id = o.id AND p.role = 'owner' LIMIT 1) AS owner_email,
    o.created_at,
    CASE
      WHEN o.is_combo_client AND o.combo_end_date IS NOT NULL
        THEN (o.combo_end_date - CURRENT_DATE)::INT
      WHEN o.trial_ends_at IS NOT NULL
        THEN (o.trial_ends_at::DATE - CURRENT_DATE)::INT
      ELSE NULL
    END AS days_until_expiry
  FROM organizations o
  WHERE is_super_admin()  -- guard: solo super_admin puede llamar
  ORDER BY o.created_at DESC
$$;

-- 8. RPC: métricas globales del negocio
CREATE OR REPLACE FUNCTION admin_metrics()
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE WHEN is_super_admin() THEN
    jsonb_build_object(
      'total_orgs',        (SELECT COUNT(*) FROM organizations WHERE NOT is_internal_account),
      'active_orgs',       (SELECT COUNT(*) FROM organizations WHERE subscription_status = 'active' AND NOT is_internal_account),
      'trial_orgs',        (SELECT COUNT(*) FROM organizations WHERE subscription_status = 'trialing' AND NOT is_internal_account),
      'combo_orgs',        (SELECT COUNT(*) FROM organizations WHERE is_combo_client),
      'combo_expiring_30d',(SELECT COUNT(*) FROM organizations
                              WHERE is_combo_client
                                AND combo_end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'),
      'total_users',       (SELECT COUNT(*) FROM user_profiles p
                              JOIN organizations o ON o.id = p.org_id
                              WHERE NOT o.is_internal_account),
      'orgs_created_30d',  (SELECT COUNT(*) FROM organizations
                              WHERE created_at > NOW() - INTERVAL '30 days'
                                AND NOT is_internal_account),
      'mrr_potential_usd', (SELECT COALESCE(SUM(pl.price_monthly_usd), 0)
                              FROM organizations o
                              JOIN plans pl ON pl.id = o.plan_id
                              WHERE o.subscription_status = 'active' AND NOT o.is_internal_account),
      'generated_at',      NOW()
    )
  ELSE NULL END
$$;

-- 9. RPC: extender trial de una org (con log)
CREATE OR REPLACE FUNCTION admin_extend_trial(p_org_id UUID, p_days INT, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_email TEXT;
  v_current_end TIMESTAMPTZ;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Solo super_admin puede extender trials';
  END IF;

  SELECT email INTO v_admin_email FROM auth.users WHERE id = auth.uid();
  SELECT trial_ends_at INTO v_current_end FROM organizations WHERE id = p_org_id;

  UPDATE organizations
     SET trial_ends_at = COALESCE(trial_ends_at, NOW()) + (p_days || ' days')::INTERVAL
   WHERE id = p_org_id;

  INSERT INTO admin_audit_log (admin_user_id, admin_email, action, target_org_id, payload, reason)
  VALUES (
    auth.uid(), v_admin_email, 'extend_trial', p_org_id,
    jsonb_build_object('days_added', p_days, 'previous_end', v_current_end),
    p_reason
  );
END;
$$;

-- 10. RPC: marcar/actualizar combo
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
         combo_notes      = COALESCE(p_notes,      combo_notes)
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

-- 11. RPC: cambiar plan de una org
CREATE OR REPLACE FUNCTION admin_change_plan(p_org_id UUID, p_new_plan_id TEXT, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_email TEXT;
  v_previous    TEXT;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Solo super_admin puede cambiar planes';
  END IF;

  SELECT email INTO v_admin_email FROM auth.users WHERE id = auth.uid();
  SELECT plan_id INTO v_previous FROM organizations WHERE id = p_org_id;

  UPDATE organizations SET plan_id = p_new_plan_id WHERE id = p_org_id;

  INSERT INTO admin_audit_log (admin_user_id, admin_email, action, target_org_id, payload, reason)
  VALUES (
    auth.uid(), v_admin_email, 'change_plan', p_org_id,
    jsonb_build_object('from', v_previous, 'to', p_new_plan_id),
    p_reason
  );
END;
$$;

-- 12. RPC: registrar impersonación (solo log — el front hace el redirect)
CREATE OR REPLACE FUNCTION admin_log_impersonation(p_org_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_email TEXT;
BEGIN
  IF NOT is_super_admin() THEN
    RAISE EXCEPTION 'Solo super_admin puede impersonar';
  END IF;

  SELECT email INTO v_admin_email FROM auth.users WHERE id = auth.uid();

  INSERT INTO admin_audit_log (admin_user_id, admin_email, action, target_org_id, reason)
  VALUES (auth.uid(), v_admin_email, 'impersonate_start', p_org_id, p_reason);
END;
$$;

-- 13. Refresh schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;

-- Verificación
SELECT
  u.email,
  p.is_super_admin,
  o.name AS org_name
FROM user_profiles p
JOIN auth.users u ON u.id = p.user_id
LEFT JOIN organizations o ON o.id = p.org_id
WHERE p.is_super_admin = true;
