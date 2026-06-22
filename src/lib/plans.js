// =============================================================================
// Plan definitions (mirror del seed en plans table)
// Si cambiás precios o límites, actualizá AMBOS lados: SQL seed + esto.
// =============================================================================

export const PLANS = {
  starter: {
    id: 'starter',
    name: 'Starter',
    price_monthly: 49,
    price_yearly: 490,
    max_users: 1,
    max_processes: 3,
    max_orgs: 1,
    ai_prompts_per_month: 50,
    is_popular: false,
    features: [
      '1 usuario administrador',
      'Hasta 3 procesos',
      'IA básica (50 prompts/mes)',
      'Soporte por email',
      'Todas las cláusulas ISO 9001',
      'Export PDF básico',
    ],
    cta: 'Empezar 14 días gratis',
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price_monthly: 149,
    price_yearly: 1490,
    max_users: 5,
    max_processes: null, // ilimitado
    max_orgs: 1,
    ai_prompts_per_month: 500,
    is_popular: true,
    features: [
      '5 usuarios',
      'Procesos ilimitados',
      'IA full (500 prompts/mes)',
      'Export PDF profesional auditable',
      'Análisis de cumplimiento IA',
      'Plan estratégico desde IA',
      'Soporte prioritario',
    ],
    cta: 'Empezar 14 días gratis',
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price_monthly: 399,
    price_yearly: 3990,
    max_users: null,
    max_processes: null,
    max_orgs: 10,
    ai_prompts_per_month: null,
    is_popular: false,
    features: [
      'Usuarios ilimitados',
      'Hasta 10 organizaciones',
      'IA premium ilimitada',
      'Modo auditor read-only',
      'Custom branding',
      'Soporte dedicado',
      'SLA 99.9%',
      'Onboarding asistido',
    ],
    cta: 'Contactar ventas',
  },
}

export const PLAN_ORDER = ['starter', 'pro', 'enterprise']

// ─── Helpers ───────────────────────────────────────────

/**
 * ¿Puede crear N más? Pasale el límite del plan y la cantidad actual.
 * Si max es null → ilimitado, devuelve true.
 */
export function canCreate(maxAllowed, currentCount) {
  if (maxAllowed === null || maxAllowed === undefined) return true
  return currentCount < maxAllowed
}

/**
 * Devuelve { allowed, used, max, percentage, isUnlimited }
 * para mostrar barra de progreso de uso.
 */
export function usageStats(used, max) {
  if (max === null || max === undefined) {
    return { allowed: true, used, max: null, percentage: 0, isUnlimited: true }
  }
  const percentage = Math.min(100, Math.round((used / max) * 100))
  return {
    allowed: used < max,
    used,
    max,
    percentage,
    isUnlimited: false,
  }
}

/**
 * Da el siguiente plan superior. Útil para upgrade prompts.
 */
export function nextPlan(currentPlanId) {
  const idx = PLAN_ORDER.indexOf(currentPlanId)
  if (idx === -1 || idx >= PLAN_ORDER.length - 1) return null
  return PLANS[PLAN_ORDER[idx + 1]]
}

/**
 * Formatea precio con separador de miles.
 */
export function formatPrice(usd, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(usd)
}

/**
 * Status visual: { label, color }
 */
export function subscriptionStatusLabel(status) {
  switch (status) {
    case 'trialing':            return { label: 'Trial', color: '#3730a3' }
    case 'active':              return { label: 'Activa', color: '#16a34a' }
    case 'past_due':            return { label: 'Pago vencido', color: '#dc2626' }
    case 'canceled':            return { label: 'Cancelada', color: '#6b7280' }
    case 'incomplete':          return { label: 'Incompleta', color: '#f59e0b' }
    case 'incomplete_expired':  return { label: 'Expirada', color: '#7f1d1d' }
    case 'expired':             return { label: 'Trial expirado', color: '#dc2626' }
    default:                    return { label: status || 'Desconocido', color: '#6b7280' }
  }
}
