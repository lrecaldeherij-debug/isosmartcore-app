import { colors, radius, font } from './tokens'

/**
 * Badge / pill.
 * Variantes: success, danger, warning, info, neutral, primary, ai
 * O pasale colores custom con { bg, color }
 */
export default function Badge({ variant, bg, color, border, children, style, icon }) {
  const palette = bg
    ? { bg, color, border }
    : VARIANTS[variant] || VARIANTS.neutral
  return (
    <span style={{
      background: palette.bg,
      color: palette.color,
      border: palette.border ? `1px solid ${palette.border}` : 'none',
      padding: '2px 8px',
      borderRadius: radius.pill,
      fontSize: font.xs,
      fontWeight: 600,
      display: 'inline-flex',
      alignItems: 'center',
      gap: '3px',
      whiteSpace: 'nowrap',
      ...style,
    }}>
      {icon}
      {children}
    </span>
  )
}

const VARIANTS = {
  success: { bg: colors.successLight, color: colors.successText, border: '#bbf7d0' },
  danger:  { bg: colors.dangerLight,  color: colors.dangerText,  border: '#fca5a5' },
  warning: { bg: colors.warningLight, color: colors.warningText, border: '#fde68a' },
  info:    { bg: colors.infoLight,    color: colors.infoText,    border: '#a5f3fc' },
  neutral: { bg: colors.bgSubtle,     color: colors.textMuted,   border: colors.border },
  primary: { bg: colors.primaryLight, color: colors.primaryDark, border: '#a5f3fc' },
  ai:      { bg: colors.aiLight,      color: '#6b21a8',          border: '#d8b4fe' },
}
