-- =============================================================================
-- v56 — Subscriptions / Billing schema
--
-- Habilita el SaaS comercial:
--   1. Tabla `plans` con los 3 tiers (Starter / Pro / Enterprise)
--   2. Extiende `organizations` con campos de suscripción + Stripe
--   3. Trigger que asigna trial 14d automático a cada org nueva
--   4. Vista `org_with_plan` para JOIN rápido desde el cliente
--   5. Función `org_plan_limits()` que devuelve los límites del plan actual
--
-- Stripe se conecta en Fase B (Edge Functions). Por ahora todas las orgs
-- arrancan en trial 14 días sobre el plan Starter.
-- =============================================================================

-- ─── 1. Tabla plans ───
CREATE TABLE IF NOT EXISTS plans (
  id                     TEXT PRIMARY KEY,
  name                   TEXT NOT NULL,
  price_monthly_usd      INT NOT NULL,
  price_yearly_usd       INT,
  max_users              INT,                  -- NULL = ilimitado
  max_processes          INT,                  -- NULL = ilimitado
  max_orgs               INT DEFAULT 1,        -- multi-org en Enterprise
  ai_prompts_per_month   INT,                  -- NULL = ilimitado
  features               JSONB DEFAULT '[]'::jsonb,
  stripe_price_id        TEXT,                 -- se llena en Fase B
  stripe_price_id_yearly TEXT,
  is_popular             BOOLEAN DEFAULT false,
  is_active              BOOLEAN DEFAULT true,
  display_order          INT DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Datos seed: 3 planes
INSERT INTO plans (id, name, price_monthly_usd, price_yearly_usd, max_users, max_processes, max_orgs, ai_prompts_per_month, features, is_popular, display_order)
VALUES
  ('starter',    'Starter',    49,  490,  1,    3,    1,  50,
   '["1 usuario administrador","Hasta 3 procesos","IA básica (50 prompts/mes)","Soporte por email","Todas las cláusulas ISO 9001","Export PDF básico"]'::jsonb,
   false, 1),
  ('pro',        'Pro',        149, 1490, 5,    NULL, 1,  500,
   '["5 usuarios","Procesos ilimitados","IA full (500 prompts/mes)","Export PDF profesional auditable","Análisis de cumplimiento IA","Plan estratégico desde IA","Soporte prioritario"]'::jsonb,
   true,  2),
  ('enterprise', 'Enterprise', 399, 3990, NULL, NULL, 10, NULL,
   '["Usuarios ilimitados","Hasta 10 organizaciones","IA premium ilimitada","Modo auditor read-only","Custom branding","Soporte dedicado","SLA 99.9%","Onboarding asistido"]'::jsonb,
   false, 3)
ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      price_monthly_usd = EXCLUDED.price_monthly_usd,
      price_yearly_usd = EXCLUDED.price_yearly_usd,
      max_users = EXCLUDED.max_users,
      max_processes = EXCLUDED.max_processes,
      max_orgs = EXCLUDED.max_orgs,
      ai_prompts_per_month = EXCLUDED.ai_prompts_per_month,
      features = EXCLUDED.features,
      is_popular = EXCLUDED.is_popular,
      display_order = EXCLUDED.display_order;

-- ─── 2. Extender organizations ───
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_id                 TEXT REFERENCES plans(id) DEFAULT 'starter';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subscription_status     TEXT DEFAULT 'trialing';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_ends_at           TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS current_period_end      TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id      TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id  TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_cycle           TEXT DEFAULT 'monthly';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS canceled_at             TIMESTAMPTZ;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_prompts_used_month   INT DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS ai_usage_reset_at       DATE DEFAULT CURRENT_DATE;

-- Default trial 14 días para orgs existentes que no lo tengan
UPDATE organizations
   SET trial_ends_at = COALESCE(created_at, now()) + INTERVAL '14 days'
 WHERE trial_ends_at IS NULL;

UPDATE organizations
   SET subscription_status = 'trialing'
 WHERE subscription_status IS NULL
    OR subscription_status NOT IN ('trialing','active','past_due','canceled','incomplete','incomplete_expired');

UPDATE organizations
   SET plan_id = 'starter'
 WHERE plan_id IS NULL;

-- Constraints
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_subscription_status_check;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_subscription_status_check
  CHECK (subscription_status IN ('trialing','active','past_due','canceled','incomplete','incomplete_expired'));

ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_billing_cycle_check;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_billing_cycle_check
  CHECK (billing_cycle IN ('monthly','yearly'));

-- ─── 3. Trigger trial automático para nuevas orgs ───
CREATE OR REPLACE FUNCTION set_default_trial()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.trial_ends_at IS NULL THEN
    NEW.trial_ends_at := now() + INTERVAL '14 days';
  END IF;
  IF NEW.subscription_status IS NULL THEN
    NEW.subscription_status := 'trialing';
  END IF;
  IF NEW.plan_id IS NULL THEN
    NEW.plan_id := 'starter';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_default_trial ON organizations;
CREATE TRIGGER trg_set_default_trial
  BEFORE INSERT ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION set_default_trial();

-- ─── 4. Vista cómoda para el cliente ───
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
  -- Helpers calculados
  CASE
    WHEN o.subscription_status = 'trialing' AND o.trial_ends_at < now() THEN 'expired'
    WHEN o.subscription_status = 'trialing' THEN 'trialing'
    ELSE o.subscription_status
  END AS effective_status,
  CASE
    WHEN o.subscription_status = 'trialing'
    THEN GREATEST(0, EXTRACT(DAY FROM (o.trial_ends_at - now()))::INT)
    ELSE NULL
  END AS trial_days_left,
  CASE
    WHEN p.ai_prompts_per_month IS NULL THEN NULL
    ELSE GREATEST(0, p.ai_prompts_per_month - COALESCE(o.ai_prompts_used_month, 0))
  END AS ai_prompts_remaining
FROM organizations o
LEFT JOIN plans p ON p.id = o.plan_id;

-- ─── 5. Función para chequear límites ───
CREATE OR REPLACE FUNCTION org_plan_limits(p_org_id UUID)
RETURNS TABLE (
  plan_id TEXT,
  max_users INT,
  max_processes INT,
  max_orgs INT,
  ai_prompts_per_month INT,
  ai_prompts_remaining INT,
  is_trial BOOLEAN,
  trial_days_left INT,
  effective_status TEXT
) AS $$
  SELECT
    p.id,
    p.max_users,
    p.max_processes,
    p.max_orgs,
    p.ai_prompts_per_month,
    CASE
      WHEN p.ai_prompts_per_month IS NULL THEN NULL
      ELSE GREATEST(0, p.ai_prompts_per_month - COALESCE(o.ai_prompts_used_month, 0))
    END,
    o.subscription_status = 'trialing',
    CASE
      WHEN o.subscription_status = 'trialing'
      THEN GREATEST(0, EXTRACT(DAY FROM (o.trial_ends_at - now()))::INT)
      ELSE NULL
    END,
    CASE
      WHEN o.subscription_status = 'trialing' AND o.trial_ends_at < now() THEN 'expired'
      WHEN o.subscription_status = 'trialing' THEN 'trialing'
      ELSE o.subscription_status
    END
  FROM organizations o
  LEFT JOIN plans p ON p.id = o.plan_id
  WHERE o.id = p_org_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION org_plan_limits(UUID) TO authenticated;

-- ─── 6. Función para incrementar contador IA ───
CREATE OR REPLACE FUNCTION increment_ai_usage(p_org_id UUID)
RETURNS INT AS $$
DECLARE
  v_used INT;
  v_today DATE := CURRENT_DATE;
BEGIN
  -- Reset si pasó un mes
  UPDATE organizations
     SET ai_prompts_used_month = 0,
         ai_usage_reset_at = v_today
   WHERE id = p_org_id
     AND ai_usage_reset_at < v_today - INTERVAL '30 days';

  UPDATE organizations
     SET ai_prompts_used_month = COALESCE(ai_prompts_used_month, 0) + 1
   WHERE id = p_org_id
  RETURNING ai_prompts_used_month INTO v_used;

  RETURN v_used;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION increment_ai_usage(UUID) TO authenticated;

-- ─── 7. RLS para plans (lectura pública para mostrar pricing) ───
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "plans_read_all" ON plans;
CREATE POLICY "plans_read_all" ON plans FOR SELECT USING (true);

-- ─── 8. Índices ───
CREATE INDEX IF NOT EXISTS idx_org_plan          ON organizations(plan_id);
CREATE INDEX IF NOT EXISTS idx_org_sub_status    ON organizations(subscription_status);
CREATE INDEX IF NOT EXISTS idx_org_stripe_cust   ON organizations(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_org_trial_ends    ON organizations(trial_ends_at);

NOTIFY pgrst, 'reload schema';
