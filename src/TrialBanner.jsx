import { Clock, AlertTriangle, ArrowRight, X } from 'lucide-react'
import { useState } from 'react'
import { usePlan } from './lib/usePlan'
import { colors, radius, font } from './components/ui/tokens'
import { formatPrice } from './lib/plans'

/**
 * Banner persistente top de la app que comunica el estado de la suscripción.
 * - Trialing con días: cyan suave
 * - Trial últimos 3 días: ámbar urgente
 * - Expirado / past_due: rojo bloqueante
 * - Active: no se muestra
 */
export default function TrialBanner({ onUpgrade }) {
  const plan = usePlan()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null
  // Mostrar SIEMPRE si está expirado o past_due. Trialing con >3 días puede dismissarse.
  if (plan.status === 'active') return null
  if (!plan.isTrialing && !plan.isExpired && !plan.isPastDue && !plan.isCanceled) return null

  const variants = {
    expired: {
      bg: '#fee2e2', border: '#fca5a5', color: '#991b1b',
      icon: <AlertTriangle size={18} />,
      message: 'Tu trial expiró. Suscribite para recuperar acceso completo.',
      dismissable: false,
    },
    past_due: {
      bg: '#fee2e2', border: '#fca5a5', color: '#991b1b',
      icon: <AlertTriangle size={18} />,
      message: 'El último pago falló. Actualizá tu método de pago para seguir usando IsoSmartCore.',
      dismissable: false,
    },
    canceled: {
      bg: '#f3f4f6', border: '#cbd5e1', color: '#374151',
      icon: <Clock size={18} />,
      message: 'Tu suscripción está cancelada. Podés reactivarla cuando quieras.',
      dismissable: true,
    },
    urgent: {
      bg: '#fef3c7', border: '#fde68a', color: '#92400e',
      icon: <AlertTriangle size={18} />,
      message: `Tu trial vence en ${plan.daysLeft} día${plan.daysLeft === 1 ? '' : 's'}. Suscribite ahora para no perder acceso.`,
      dismissable: false,
    },
    trial: {
      bg: '#e0f2fe', border: '#7dd3fc', color: '#075985',
      icon: <Clock size={18} />,
      message: `Estás en trial · ${plan.daysLeft} día${plan.daysLeft === 1 ? '' : 's'} restantes en plan ${plan.planName}.`,
      dismissable: true,
    },
  }

  let v
  if (plan.isExpired) v = variants.expired
  else if (plan.isPastDue) v = variants.past_due
  else if (plan.isCanceled) v = variants.canceled
  else if (plan.isTrialing && plan.daysLeft !== null && plan.daysLeft <= 3) v = variants.urgent
  else if (plan.isTrialing) v = variants.trial
  else return null

  const cta = plan.nextPlan
    ? `Subir a ${plan.nextPlan.name} · ${formatPrice(plan.nextPlan.price_monthly)}/mes`
    : 'Ver planes'

  return (
    <div style={{
      background: v.bg,
      borderBottom: `1px solid ${v.border}`,
      padding: '10px 16px',
      display: 'flex', alignItems: 'center', gap: '12px',
      color: v.color, fontSize: font.md,
    }}>
      <div style={{ flexShrink: 0 }}>{v.icon}</div>
      <div style={{ flex: 1 }}>
        <strong>{v.message}</strong>
      </div>
      <button onClick={onUpgrade} style={{
        background: v.color, color: 'white', border: 'none',
        padding: '6px 14px', borderRadius: radius.md, cursor: 'pointer',
        fontWeight: 600, fontSize: font.sm,
        display: 'inline-flex', alignItems: 'center', gap: '6px',
        whiteSpace: 'nowrap',
      }}>
        {cta} <ArrowRight size={14} />
      </button>
      {v.dismissable && (
        <button onClick={() => setDismissed(true)} style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: v.color, opacity: 0.6, padding: '4px',
        }} aria-label="Cerrar">
          <X size={16} />
        </button>
      )}
    </div>
  )
}
