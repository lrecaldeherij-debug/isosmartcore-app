import { colors, radius, font, variantColors } from './tokens'

/**
 * Botón universal.
 * Variantes: primary | secondary | success | danger | warning | info | ai | ghost
 * Tamaños:   sm | md | lg
 * Props:     variant, size, loading, icon, iconRight, disabled, onClick, type, style
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  iconRight,
  disabled = false,
  onClick,
  type = 'button',
  children,
  style,
  title,
  ...rest
}) {
  const base = variantColors[variant] || colors.primary
  const isGhost = variant === 'ghost'
  const isNeutral = variant === 'neutral'

  const sizes = {
    sm: { padding: '4px 8px', fontSize: font.xs, gap: '4px', radius: radius.sm },
    md: { padding: '7px 12px', fontSize: font.md, gap: '6px', radius: radius.md },
    lg: { padding: '10px 18px', fontSize: font.base, gap: '8px', radius: radius.lg },
  }
  const s = sizes[size] || sizes.md

  const styles = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: s.gap,
    padding: s.padding,
    background: isGhost ? 'transparent' : isNeutral ? colors.bgSubtle : base,
    color: isGhost ? colors.textMuted : isNeutral ? colors.text : 'white',
    border: isGhost ? '1px solid ' + colors.border : 'none',
    borderRadius: s.radius,
    cursor: disabled || loading ? 'not-allowed' : 'pointer',
    fontWeight: 600,
    fontSize: s.fontSize,
    opacity: disabled ? 0.6 : 1,
    transition: 'transform 0.1s, box-shadow 0.1s',
    whiteSpace: 'nowrap',
    ...style,
  }

  return (
    <button type={type} onClick={onClick} disabled={disabled || loading} title={title} style={styles} {...rest}>
      {loading ? <Spinner size={size === 'sm' ? 10 : 14} /> : icon}
      {children}
      {iconRight}
    </button>
  )
}

function Spinner({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ animation: 'spin 1s linear infinite' }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" strokeDasharray="40 60" />
    </svg>
  )
}
