import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { colors, radius, shadow, font } from './tokens'

/**
 * Sistema de modal universal.
 *
 * Uso:
 *   <Modal open={open} onClose={fn} title="Foo" maxWidth="820px">
 *     <Modal.Section title="Datos">...</Modal.Section>
 *     <Modal.Section title="Más">...</Modal.Section>
 *     <Modal.Footer>
 *       <Button onClick={save}>Guardar</Button>
 *       <Button variant="ghost" onClick={close}>Cancelar</Button>
 *     </Modal.Footer>
 *   </Modal>
 *
 * Si no usas <Modal.Footer>, pones botones donde quieras y se renderiza como children.
 */
export default function Modal({ open, onClose, title, children, maxWidth = '780px', headerExtras }) {
  if (!open) return null
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 640
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(15,23,42,0.5)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex', alignItems: isMobile ? 'stretch' : 'center', justifyContent: 'center',
        padding: isMobile ? '0' : '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: isMobile ? '100%' : maxWidth,
          maxHeight: isMobile ? '100vh' : '92vh', overflowY: 'auto',
        }}
      >
        <div style={{
          background: colors.bg,
          borderRadius: isMobile ? '0' : radius['2xl'],
          boxShadow: shadow.xl, overflow: 'hidden',
          minHeight: isMobile ? '100vh' : 'auto',
        }}>
          {title && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '14px 16px', borderBottom: `1px solid ${colors.border}`,
              background: colors.bgMuted, gap: '10px',
            }}>
              <h2 style={{ margin: 0, fontSize: font.xl, color: colors.text, flex: 1 }}>{title}</h2>
              {headerExtras && (
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                  {headerExtras}
                </div>
              )}
              <button
                onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: '4px' }}
                aria-label="Cerrar"
              >
                <X size={20} />
              </button>
            </div>
          )}
          {children}
        </div>
      </div>
    </div>,
    document.body
  )
}

Modal.Section = function Section({ title, children }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: `1px solid ${colors.bgSubtle}` }}>
      {title && (
        <h4 style={{
          margin: '0 0 8px 0', fontSize: font.md, color: colors.textMuted,
          textTransform: 'uppercase', letterSpacing: '0.04em',
        }}>
          {title}
        </h4>
      )}
      {children}
    </div>
  )
}

Modal.Footer = function Footer({ children, align = 'right' }) {
  return (
    <div style={{
      display: 'flex', gap: '8px', padding: '12px 16px',
      borderTop: `1px solid ${colors.border}`, background: colors.bgMuted,
      justifyContent: align === 'right' ? 'flex-end' : align === 'between' ? 'space-between' : 'flex-start',
      flexWrap: 'wrap',
    }}>
      {children}
    </div>
  )
}
