import { colors, radius, font } from './tokens'

/**
 * Wrapper de campo con label arriba.
 * Uso: <Field label="Nombre *"><Input value={x} onChange={...} /></Field>
 */
export default function Field({ label, hint, error, children, flex = 1, required }) {
  return (
    <div style={{
      flex: `${flex} 1 160px`,
      display: 'flex', flexDirection: 'column', gap: '3px',
      marginBottom: '8px',
    }}>
      {label && (
        <label style={{ fontSize: font.sm, fontWeight: 600, color: colors.textMuted }}>
          {label}{required && <span style={{ color: colors.danger, marginLeft: '2px' }}>*</span>}
        </label>
      )}
      {children}
      {hint && !error && <span style={{ fontSize: font.xs, color: colors.textGhost }}>{hint}</span>}
      {error && <span style={{ fontSize: font.xs, color: colors.danger }}>{error}</span>}
    </div>
  )
}

// Estilo base reutilizable por Input/Select/Textarea
export const baseInputStyle = {
  width: '100%',
  padding: '7px 9px',
  border: `1px solid ${colors.borderStrong}`,
  borderRadius: radius.md,
  fontSize: font.md,
  boxSizing: 'border-box',
  background: 'white',
  color: colors.text,
  fontFamily: 'inherit',
}

export function Input({ style, ...rest }) {
  return <input {...rest} style={{ ...baseInputStyle, ...style }} />
}

export function Textarea({ rows = 3, style, ...rest }) {
  return <textarea rows={rows} {...rest} style={{ ...baseInputStyle, ...style }} />
}

export function Select({ style, children, ...rest }) {
  return <select {...rest} style={{ ...baseInputStyle, ...style }}>{children}</select>
}

export function Row({ children, gap = '10px' }) {
  return <div style={{ display: 'flex', gap, flexWrap: 'wrap' }}>{children}</div>
}

export function Section({ title, children }) {
  return (
    <fieldset style={{
      border: `1px solid ${colors.border}`,
      borderRadius: radius.lg,
      padding: '10px 12px',
      marginBottom: '10px',
      background: 'white',
    }}>
      {title && (
        <legend style={{ padding: '0 6px', fontWeight: 600, color: colors.textMuted, fontSize: font.md }}>
          {title}
        </legend>
      )}
      {children}
    </fieldset>
  )
}
