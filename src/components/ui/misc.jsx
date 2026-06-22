import { Loader2 } from 'lucide-react'
import { colors, radius, font } from './tokens'

/**
 * EmptyState — para mostrar cuando no hay items.
 */
export function EmptyState({ icon, message, action }) {
  return (
    <div style={{
      textAlign: 'center',
      padding: '40px 20px',
      background: 'white',
      border: `1px dashed ${colors.borderStrong}`,
      borderRadius: radius.xl,
    }}>
      {icon && <div style={{ color: colors.borderStrong, marginBottom: '8px' }}>{icon}</div>}
      <p style={{ color: colors.textFaint, marginTop: '8px', marginBottom: action ? '12px' : 0 }}>{message}</p>
      {action}
    </div>
  )
}

/**
 * Spinner inline.
 */
export function Spinner({ size = 16, color = 'currentColor' }) {
  return <Loader2 size={size} color={color} style={{ animation: 'spin 1s linear infinite' }} />
}

/**
 * Loading screen pantalla completa.
 */
export function LoadingScreen({ message = 'Cargando…' }) {
  return (
    <div style={{
      padding: '40px', textAlign: 'center', color: colors.textFaint,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px',
    }}>
      <Spinner size={32} color={colors.primary} />
      <div>{message}</div>
    </div>
  )
}

/**
 * Grid responsive con minmax.
 */
export function Grid({ children, min = '240px', gap = '12px' }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(auto-fit, minmax(${min}, 1fr))`,
      gap,
    }}>
      {children}
    </div>
  )
}

/**
 * PageHeader — el header de cada página con título + subtítulo + acciones.
 */
export function PageHeader({ icon, title, subtitle, actions }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between',
      alignItems: 'flex-start', marginBottom: '20px',
      flexWrap: 'wrap', gap: '12px',
    }}>
      <div>
        <h2 style={{
          color: colors.text, margin: 0,
          display: 'flex', alignItems: 'center', gap: '10px',
          fontSize: font['4xl'],
        }}>
          {icon} {title}
        </h2>
        {subtitle && (
          <p style={{ color: colors.textFaint, margin: '5px 0 0 0', fontSize: font.base }}>
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {actions}
        </div>
      )}
    </div>
  )
}
