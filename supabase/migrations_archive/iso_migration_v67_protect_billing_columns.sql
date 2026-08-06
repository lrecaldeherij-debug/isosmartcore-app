-- =============================================================================
-- v67 — Bloquear auto-escalación de plan/facturación en `organizations`
--
-- Finding de auditoría: la policy `org_update_own` (v12) es
--   USING (id = auth_org_id() AND auth_role() = 'owner')
--   WITH CHECK (id = auth_org_id())
-- El WITH CHECK solo valida la fila NUEVA — no compara contra la fila vieja,
-- así que no puede exigir "esta columna no cambió". Por eso un owner
-- autenticado puede hacer, desde la consola del navegador:
--   supabase.from('organizations').update({ is_internal_account: true })
-- y auto-otorgarse cuenta ilimitada, o mover plan_id a 'enterprise',
-- reventar su trial, etc. La UI de la app nunca hace esto (Organization
-- Settings solo escribe `name`), pero nada en la base lo impedía.
--
-- Nota: max_users / max_processes / max_orgs NO viven en `organizations`
-- (están en `plans`, referenciada por plan_id). `plans` ya está protegida:
-- v56 solo le da una policy de SELECT, sin INSERT/UPDATE/DELETE para
-- `authenticated`, así que ese vector ya estaba cerrado. El único vector
-- real es escalar `organizations.plan_id` o `is_internal_account`.
--
-- Fix: un trigger BEFORE UPDATE que compara NEW vs OLD (esto sí lo puede
-- hacer un trigger, a diferencia de la policy) y rechaza el UPDATE completo
-- si alguna columna de plan/facturación/privilegio cambió y quien ejecuta
-- la sentencia no es `service_role`.
--
-- El trigger NO es SECURITY DEFINER a propósito: necesitamos que
-- `current_user` adentro del trigger sea el rol real de quien dispara el
-- UPDATE (authenticated / anon / service_role), no el dueño de la función.
-- Ver nota sobre `increment_ai_usage()` más abajo.
-- =============================================================================

CREATE OR REPLACE FUNCTION protect_organizations_privileged_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- `service_role` (llamadas server-side, ej. futuro webhook de Stripe) puede todo.
  --
  -- `postgres` también se permite: es el dueño de las funciones SECURITY DEFINER
  -- de este esquema (auth_org_id, auth_role, increment_ai_usage, etc.) y, al
  -- ejecutar una SECURITY DEFINER, current_user pasa a ser el dueño de la
  -- función, no el llamador original. increment_ai_usage() necesita seguir
  -- pudiendo tocar ai_prompts_used_month/ai_usage_reset_at para cualquier
  -- miembro autenticado (por diseño, no solo el owner) — por eso se permite
  -- 'postgres' aquí en vez de tocar esa función.
  IF current_user IN ('service_role', 'postgres') THEN
    RETURN NEW;
  END IF;

  IF NEW.is_internal_account     IS DISTINCT FROM OLD.is_internal_account
  OR NEW.internal_account_note   IS DISTINCT FROM OLD.internal_account_note
  OR NEW.plan_id                 IS DISTINCT FROM OLD.plan_id
  OR NEW.subscription_status     IS DISTINCT FROM OLD.subscription_status
  OR NEW.trial_ends_at           IS DISTINCT FROM OLD.trial_ends_at
  OR NEW.current_period_end      IS DISTINCT FROM OLD.current_period_end
  OR NEW.stripe_customer_id      IS DISTINCT FROM OLD.stripe_customer_id
  OR NEW.stripe_subscription_id  IS DISTINCT FROM OLD.stripe_subscription_id
  OR NEW.billing_cycle           IS DISTINCT FROM OLD.billing_cycle
  OR NEW.canceled_at             IS DISTINCT FROM OLD.canceled_at
  OR NEW.ai_prompts_used_month   IS DISTINCT FROM OLD.ai_prompts_used_month
  OR NEW.ai_usage_reset_at       IS DISTINCT FROM OLD.ai_usage_reset_at
  THEN
    RAISE EXCEPTION
      'No autorizado: las columnas de plan/facturación/privilegio de organizations solo pueden modificarse desde service_role.'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_organizations_privileged_columns ON organizations;
CREATE TRIGGER trg_protect_organizations_privileged_columns
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION protect_organizations_privileged_columns();

NOTIFY pgrst, 'reload schema';
