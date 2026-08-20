-- =============================================================================
-- Fix: cliente combo aparece como "trial expirado" pese a tener combo activo.
--
-- La vista org_with_plan calculaba effective_status solo mirando trial_ends_at,
-- sin considerar is_combo_client + combo_end_date. Cuando el trial original
-- vencia (ej. -5 dias) aunque el combo dijera "hasta 2027-02-01", el sistema
-- marcaba como expired y bloqueaba al cliente.
--
-- Descubierto con Talleres Mejia - FIAM: combo hasta 2027-02-01, pero trial
-- original ya vencio -> aparecia expired.
-- =============================================================================

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
  -- Prioridad para effective_status:
  --   1. Cuenta interna -> siempre active
  --   2. Cliente combo con combo_end_date en el futuro -> active (combo)
  --   3. Cliente combo con combo_end_date pasado -> expired
  --   4. Trial normal con trial_ends_at en el futuro -> trialing
  --   5. Trial normal vencido -> expired
  --   6. Cualquier otro estado -> tal cual
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
  -- trial_days_left: si es combo, usar combo_end_date; sino, trial_ends_at
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

-- Idem para el RPC org_plan_limits (usado por otras rutas)
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
      WHEN o.is_combo_client AND o.combo_end_date IS NOT NULL
        THEN GREATEST(0, (o.combo_end_date - CURRENT_DATE)::INT)
      WHEN o.subscription_status = 'trialing'
        THEN GREATEST(0, EXTRACT(DAY FROM (o.trial_ends_at - now()))::INT)
      ELSE NULL
    END,
    CASE
      WHEN o.is_internal_account THEN 'active'
      WHEN o.is_combo_client AND o.combo_end_date IS NOT NULL
           AND o.combo_end_date >= CURRENT_DATE THEN 'active'
      WHEN o.is_combo_client AND o.combo_end_date IS NOT NULL
           AND o.combo_end_date < CURRENT_DATE THEN 'expired'
      WHEN o.subscription_status = 'trialing' AND o.trial_ends_at < now() THEN 'expired'
      WHEN o.subscription_status = 'trialing' THEN 'trialing'
      ELSE o.subscription_status
    END,
    o.is_internal_account
  FROM organizations o
  LEFT JOIN plans p ON p.id = o.plan_id
  WHERE o.id = p_org_id;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';

-- Verificación para Talleres Mejía y otras
SELECT name, subscription_status, is_combo_client, combo_end_date, effective_status, trial_days_left
FROM org_with_plan
WHERE NOT is_internal_account
ORDER BY name;
