import {
  CreditCard, Calendar, Sparkles, Zap, ArrowUp, Check,
  Users, Workflow, Building2, AlertTriangle, Clock, Shield
} from 'lucide-react'
import { usePlan } from './lib/usePlan'
import { PLANS, formatPrice, subscriptionStatusLabel } from './lib/plans'
import { colors, radius, font, shadow } from './components/ui/tokens'
import Button from './components/ui/Button'
import Badge from './components/ui/Badge'
import { PageHeader, Grid } from './components/ui/misc'
import { toast } from './lib/toast'

/**
 * BillingSettings — página interna donde el usuario ve su plan, días restantes,
 * uso de IA, y los botones para upgrade/cancelar (Fase B se conecta a Stripe).
 */
export default function BillingSettings({ onUpgrade }) {
  const plan = usePlan()
  const status = subscriptionStatusLabel(plan.status)

  return (
    <div style={{ padding: '20px', maxWidth: '1100px', margin: '0 auto' }}>
      <PageHeader
        icon={<CreditCard size={28} color={colors.primary} />}
        title="Facturación y plan"
        subtitle="Tu suscripción, uso del mes y opciones de plan"
      />

      {/* Card del plan actual */}
      <div style={{
        background: 'white',
        border: `1px solid ${colors.border}`,
        borderRadius: radius['2xl'],
        padding: '24px',
        marginBottom: '20px',
        boxShadow: shadow.sm,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap', marginBottom: '16px' }}>
          <div>
            <div style={{ fontSize: font.sm, color: colors.textFaint, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
              {plan.isInternal ? 'Cuenta interna' : 'Plan actual'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <h2 style={{ margin: 0, fontSize: font['4xl'], color: colors.text }}>
                {plan.isInternal ? 'Acceso ilimitado' : plan.planName}
              </h2>
              {plan.isInternal ? (
                <Badge bg={colors.primary + '22'} color={colors.primary}>SIN LÍMITES</Badge>
              ) : (
                <>
                  <Badge bg={status.color + '22'} color={status.color}>{status.label}</Badge>
                  {plan.planId === 'pro' && <Badge variant="ai">⭐ POPULAR</Badge>}
                </>
              )}
            </div>
            <div style={{ marginTop: '6px', color: colors.textFaint, fontSize: font.lg }}>
              {plan.isInternal
                ? (plan.internalNote || 'Cuenta interna · sin facturación')
                : `${formatPrice(plan.plan.price_monthly)}/mes`}
            </div>
          </div>

          {!plan.isInternal && (
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              {plan.nextPlan && (
                <Button
                  variant="primary"
                  size="lg"
                  icon={<ArrowUp size={16} />}
                  onClick={onUpgrade}
                >
                  Subir a {plan.nextPlan.name}
                </Button>
              )}
              {plan.isActive && !plan.isTrialing && (
                <Button
                  variant="ghost"
                  onClick={() => toast.info('La cancelación se habilita en Fase B con Stripe Customer Portal')}
                >
                  Cancelar suscripción
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Estado especial para cuenta interna */}
        {plan.isInternal && (
          <div style={{
            background: colors.primary + '11',
            border: `1px solid ${colors.primary}33`,
            borderRadius: radius.lg,
            padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: '10px',
            color: colors.primary,
          }}>
            <Shield size={18} />
            <div>
              <strong>Cuenta interna</strong>
              <div style={{ fontSize: font.sm, marginTop: '2px', color: colors.textMuted }}>
                Sin trial, sin límites de plan, sin facturación. Acceso completo a todos los módulos y funciones IA de forma ilimitada.
              </div>
            </div>
          </div>
        )}

        {/* Trial countdown */}
        {plan.isTrialing && (
          <div style={{
            background: plan.daysLeft <= 3 ? '#fef3c7' : '#e0f2fe',
            border: `1px solid ${plan.daysLeft <= 3 ? '#fde68a' : '#7dd3fc'}`,
            borderRadius: radius.lg,
            padding: '12px 14px',
            display: 'flex', alignItems: 'center', gap: '10px',
            color: plan.daysLeft <= 3 ? '#92400e' : '#075985',
          }}>
            {plan.daysLeft <= 3 ? <AlertTriangle size={18} /> : <Clock size={18} />}
            <div>
              <strong>Trial activo · {plan.daysLeft} día{plan.daysLeft === 1 ? '' : 's'} restantes</strong>
              <div style={{ fontSize: font.sm, marginTop: '2px' }}>
                Vence el {plan.trialEndsAt ? new Date(plan.trialEndsAt).toLocaleDateString() : '—'}.
                Suscríbete antes para no perder acceso.
              </div>
            </div>
          </div>
        )}

        {plan.isExpired && (
          <div style={{
            background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: radius.lg,
            padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '10px', color: '#991b1b',
          }}>
            <AlertTriangle size={18} />
            <div>
              <strong>Tu trial expiró</strong>
              <div style={{ fontSize: font.sm, marginTop: '2px' }}>
                Tu cuenta está en modo solo-lectura. Suscríbete para recuperar acceso completo (no perdiste datos).
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Uso del mes */}
      <Grid min="240px" gap="14px">
        <UsageCard
          icon={<Sparkles size={20} color={colors.ai} />}
          title="IA del mes"
          used={plan.aiPromptsUsed}
          max={plan.aiPromptsMax}
          unit="prompts"
          color={colors.ai}
        />
        <UsageCard
          icon={<Users size={20} color={colors.primary} />}
          title="Usuarios"
          used={1}
          max={plan.maxUsers}
          unit="user"
          color={colors.primary}
        />
        <UsageCard
          icon={<Workflow size={20} color={colors.warning} />}
          title="Procesos"
          used={null}
          max={plan.maxProcesses}
          unit="procesos"
          color={colors.warning}
          subtitle="Se calcula al usar"
        />
        <UsageCard
          icon={<Building2 size={20} color={colors.success} />}
          title="Organizaciones"
          used={1}
          max={plan.maxOrgs}
          unit="org"
          color={colors.success}
        />
      </Grid>

      {/* Comparativa rápida con otros planes */}
      <div style={{ marginTop: '32px' }}>
        <h3 style={{ fontSize: font.xl, color: colors.text, marginBottom: '12px' }}>
          Otros planes disponibles
        </h3>
        <Grid min="260px" gap="14px">
          {Object.values(PLANS).filter(p => p.id !== plan.planId).map(p => (
            <OtherPlanCard key={p.id} plan={p} onUpgrade={onUpgrade} currentPlanPrice={plan.plan.price_monthly} />
          ))}
        </Grid>
      </div>
    </div>
  )
}

// ─────────────────── Subcomponentes ───────────────────

function UsageCard({ icon, title, used, max, unit, color, subtitle }) {
  const isUnlimited = max === null || max === undefined
  const isAvailable = used === null || used === undefined
  const pct = isUnlimited || isAvailable ? 0 : Math.min(100, Math.round((used / max) * 100))
  const isWarn = pct >= 80

  return (
    <div style={{
      background: 'white', border: `1px solid ${colors.border}`,
      borderRadius: radius.xl, padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {icon}
        <span style={{ fontSize: font.sm, color: colors.textMuted, fontWeight: 600 }}>{title}</span>
      </div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: colors.text, lineHeight: 1 }}>
        {isUnlimited ? '∞' : isAvailable ? `— / ${max}` : `${used} / ${max}`}
        <span style={{ fontSize: font.sm, color: colors.textFaint, fontWeight: 'normal', marginLeft: '6px' }}>
          {unit}
        </span>
      </div>
      {!isUnlimited && !isAvailable && (
        <div style={{ background: colors.bgSubtle, borderRadius: radius.pill, height: '6px', overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: isWarn ? colors.warning : color,
            borderRadius: radius.pill, transition: 'width 0.5s',
          }} />
        </div>
      )}
      {isUnlimited && (
        <div style={{ fontSize: font.xs, color: colors.success, fontWeight: 600 }}>✓ Ilimitado</div>
      )}
      {subtitle && (
        <div style={{ fontSize: font.xs, color: colors.textGhost }}>{subtitle}</div>
      )}
    </div>
  )
}

function OtherPlanCard({ plan, onUpgrade, currentPlanPrice }) {
  const isUpgrade = plan.price_monthly > currentPlanPrice
  return (
    <div style={{
      background: 'white', border: `1px solid ${plan.is_popular ? colors.primary : colors.border}`,
      borderRadius: radius.xl, padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h4 style={{ margin: 0, color: colors.text, fontSize: font.xl }}>{plan.name}</h4>
        {plan.is_popular && <Badge variant="primary">Popular</Badge>}
      </div>
      <div style={{ fontSize: '24px', fontWeight: 700, color: colors.text }}>
        {formatPrice(plan.price_monthly)}<span style={{ fontSize: font.sm, color: colors.textFaint, fontWeight: 'normal' }}>/mes</span>
      </div>
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {plan.features.slice(0, 4).map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: font.sm, color: colors.textMuted }}>
            <Check size={12} color={colors.success} style={{ flexShrink: 0, marginTop: '4px' }} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Button
        variant={isUpgrade ? 'primary' : 'ghost'}
        size="md"
        onClick={onUpgrade}
        style={{ marginTop: 'auto' }}
        icon={isUpgrade ? <ArrowUp size={14} /> : undefined}
      >
        {isUpgrade ? `Subir a ${plan.name}` : `Cambiar a ${plan.name}`}
      </Button>
    </div>
  )
}
