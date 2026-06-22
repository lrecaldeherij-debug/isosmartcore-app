import { colors, radius, shadow, font } from './tokens'

/**
 * Card básico con opciones de borderLeft (acento), hover y onClick.
 */
export default function Card({
  children, style, onClick, accentColor, accentSide = 'left',
  hover = false, padding = '14px',
}) {
  const accentBorder = accentColor
    ? { [`border${accentSide.charAt(0).toUpperCase() + accentSide.slice(1)}`]: `4px solid ${accentColor}` }
    : {}
  return (
    <div
      onClick={onClick}
      style={{
        background: 'white',
        border: `1px solid ${colors.border}`,
        borderRadius: radius.xl,
        padding,
        boxShadow: shadow.sm,
        cursor: onClick ? 'pointer' : 'default',
        transition: hover || onClick ? 'transform 0.15s, box-shadow 0.15s' : undefined,
        ...accentBorder,
        ...style,
      }}
      onMouseEnter={hover || onClick ? e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = shadow.lg
      } : undefined}
      onMouseLeave={hover || onClick ? e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = shadow.sm
      } : undefined}
    >
      {children}
    </div>
  )
}

/**
 * Kpi: tarjeta de KPI estándar con icono + label + valor + acentos.
 */
export function Kpi({ label, value, icon, color = colors.primary, onClick, subtitle }) {
  return (
    <Card
      onClick={onClick}
      accentColor={color}
      style={{ padding: '10px 12px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
        <span style={{ color }}>{icon}</span>
        <span style={{
          fontSize: font.xs, fontWeight: 600,
          textTransform: 'uppercase', color: colors.textFaint,
        }}>{label}</span>
      </div>
      <div style={{ fontSize: font['3xl'], fontWeight: 700, color: colors.text, lineHeight: 1 }}>{value}</div>
      {subtitle && <div style={{ fontSize: font.sm, color: colors.textFaint, marginTop: '4px' }}>{subtitle}</div>}
    </Card>
  )
}
