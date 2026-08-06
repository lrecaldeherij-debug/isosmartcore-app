-- =============================================================================
-- v66 — Cuentas internas / cortesía
--
-- Habilita el caso "el founder usa su propio producto" sin trial ni billing.
-- Marca una org con is_internal_account = true → el código respeta el flag:
--   • Sin banner de trial / expiración
--   • Sin checks de límites de plan (usuarios, procesos, IA, etc.)
--   • BillingSettings muestra "Cuenta interna · ilimitada"
--
-- Usos típicos: cuenta del founder (Herij), cuentas de demo para sales,
-- beta testers acordados, partners estratégicos.
-- =============================================================================

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS is_internal_account BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS internal_account_note TEXT;  -- "Cuenta founder", "Demo sales", etc.

COMMENT ON COLUMN organizations.is_internal_account IS
  'Si true, la org tiene acceso ilimitado y NO se le aplican límites de plan ni checks de trial/billing. Se marca manualmente desde service_role.';

-- Recrear la vista org_with_plan para exponer el flag al cliente
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
    WHEN o.is_internal_account THEN 'active'  -- cuentas internas siempre activas
    WHEN o.subscription_status = 'trialing' AND o.trial_ends_at < now() THEN 'expired'
    WHEN o.subscription_status = 'trialing' THEN 'trialing'
    ELSE o.subscription_status
  END AS effective_status,
  CASE
    WHEN o.is_internal_account THEN NULL  -- sin countdown
    WHEN o.subscription_status = 'trialing'
    THEN GREATEST(0, EXTRACT(DAY FROM (o.trial_ends_at - now()))::INT)
    ELSE NULL
  END AS trial_days_left,
  CASE
    WHEN o.is_internal_account THEN NULL  -- ilimitado
    WHEN p.ai_prompts_per_month IS NULL THEN NULL
    ELSE GREATEST(0, p.ai_prompts_per_month - COALESCE(o.ai_prompts_used_month, 0))
  END AS ai_prompts_remaining
FROM organizations o
LEFT JOIN plans p ON p.id = o.plan_id;

-- Actualizar también org_plan_limits() para respetar el flag
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
  effective_status TEXT,
  is_internal_account BOOLEAN
) AS $$
  SELECT
    p.id,
    CASE WHEN o.is_internal_account THEN NULL ELSE p.max_users END,
    CASE WHEN o.is_internal_account THEN NULL ELSE p.max_processes END,
    CASE WHEN o.is_internal_account THEN NULL ELSE p.max_orgs END,
    CASE WHEN o.is_internal_account THEN NULL ELSE p.ai_prompts_per_month END,
    CASE
      WHEN o.is_internal_account THEN NULL
      WHEN p.ai_prompts_per_month IS NULL THEN NULL
      ELSE GREATEST(0, p.ai_prompts_per_month - COALESCE(o.ai_prompts_used_month, 0))
    END,
    CASE WHEN o.is_internal_account THEN false ELSE o.subscription_status = 'trialing' END,
    CASE
      WHEN o.is_internal_account THEN NULL
      WHEN o.subscription_status = 'trialing'
      THEN GREATEST(0, EXTRACT(DAY FROM (o.trial_ends_at - now()))::INT)
      ELSE NULL
    END,
    CASE
      WHEN o.is_internal_account THEN 'active'
      WHEN o.subscription_status = 'trialing' AND o.trial_ends_at < now() THEN 'expired'
      WHEN o.subscription_status = 'trialing' THEN 'trialing'
      ELSE o.subscription_status
    END,
    o.is_internal_account
  FROM organizations o
  LEFT JOIN plans p ON p.id = o.plan_id
  WHERE o.id = p_org_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION org_plan_limits(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
