// =============================================================================
// usePlan() — hook que combina la suscripción de la org actual con los helpers
// de límites. Centraliza la lógica de "qué puede hacer este usuario hoy".
//
// Uso:
//   const plan = usePlan()
//   if (!plan.canCreate('processes', currentCount)) {
//     return <UpgradeBanner reason="Llegaste al límite de procesos del plan Starter" />
//   }
//   plan.daysLeft         // null si no es trial, número si lo es
//   plan.aiPromptsLeft    // null si ilimitado, número restante si limitado
//   plan.isTrialing
//   plan.isExpired
//   plan.upgradeUrl       // ruta a /pricing
// =============================================================================

import { useMemo } from 'react'
import { useOrg } from '../OrgContext'
import { PLANS, canCreate as _canCreate, nextPlan } from './plans'

export function usePlan() {
  const { org } = useOrg()

  return useMemo(() => {
    if (!org) return EMPTY_PLAN

    const planId = org.plan_id || 'starter'
    const plan = PLANS[planId] || PLANS.starter
    const status = org.effective_status || org.subscription_status || 'trialing'

    const isTrialing = status === 'trialing'
    const isExpired  = status === 'expired'
    const isActive   = status === 'active' || status === 'trialing'
    const isPastDue  = status === 'past_due'
    const isCanceled = status === 'canceled'

    const daysLeft = org.trial_days_left ?? null
    const aiPromptsUsed = org.ai_prompts_used_month || 0
    const aiPromptsMax  = plan.ai_prompts_per_month
    const aiPromptsLeft = aiPromptsMax === null ? null : Math.max(0, aiPromptsMax - aiPromptsUsed)
    const aiPromptsPct  = aiPromptsMax === null ? 0 : Math.min(100, Math.round((aiPromptsUsed / aiPromptsMax) * 100))

    const next = nextPlan(planId)

    return {
      // Datos del plan
      planId,
      plan,
      planName: plan.name,
      status,
      isTrialing,
      isExpired,
      isActive,
      isPastDue,
      isCanceled,

      // Trial
      daysLeft,
      trialEndsAt: org.trial_ends_at,

      // Límites
      maxUsers:     plan.max_users,
      maxProcesses: plan.max_processes,
      maxOrgs:      plan.max_orgs,

      // IA usage
      aiPromptsUsed,
      aiPromptsMax,
      aiPromptsLeft,
      aiPromptsPct,
      hasAiCapacity: aiPromptsLeft === null || aiPromptsLeft > 0,

      // Upgrade target
      nextPlan: next,

      // Helpers
      canCreate(entity, currentCount) {
        const max = ({
          users:     plan.max_users,
          processes: plan.max_processes,
          orgs:      plan.max_orgs,
        })[entity]
        return _canCreate(max, currentCount)
      },

      // Banner de bloqueo si está expirado o past_due
      needsAttention: isExpired || isPastDue || (isTrialing && daysLeft !== null && daysLeft <= 3),
    }
  }, [org])
}

const EMPTY_PLAN = {
  planId: 'starter',
  plan: PLANS.starter,
  planName: 'Starter',
  status: 'trialing',
  isTrialing: true,
  isExpired: false,
  isActive: true,
  isPastDue: false,
  isCanceled: false,
  daysLeft: null,
  trialEndsAt: null,
  maxUsers: 1, maxProcesses: 3, maxOrgs: 1,
  aiPromptsUsed: 0, aiPromptsMax: 50, aiPromptsLeft: 50, aiPromptsPct: 0,
  hasAiCapacity: true,
  nextPlan: PLANS.pro,
  canCreate: () => true,
  needsAttention: false,
}
