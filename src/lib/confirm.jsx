// =============================================================================
// Confirm dialog programático sin window.confirm.
//
// Uso:
//   import { confirm } from './lib/confirm'
//   if (await confirm('¿Eliminar?')) { ... }
//   if (await confirm('¿Eliminar?', { tone: 'danger', confirmText: 'Eliminar' })) { ... }
//
// Necesita <ConfirmRoot /> montado en App.jsx una sola vez.
// =============================================================================

import { createPortal } from 'react-dom'
import { useEffect, useState } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'
import { colors, radius, shadow, font } from '../components/ui/tokens'

let listeners = new Set()
let queue = []

export function confirm(message, opts = {}) {
  return new Promise(resolve => {
    const item = {
      id: Math.random().toString(36).slice(2),
      message,
      title: opts.title,
      tone: opts.tone || 'info', // 'info' | 'danger' | 'warning'
      confirmText: opts.confirmText || 'Aceptar',
      cancelText: opts.cancelText || 'Cancelar',
      resolve,
    }
    queue = [...queue, item]
    listeners.forEach(l => l())
  })
}

function close(id, value) {
  const item = queue.find(q => q.id === id)
  if (item) item.resolve(value)
  queue = queue.filter(q => q.id !== id)
  listeners.forEach(l => l())
}

export function ConfirmRoot() {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force(x => x + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  if (queue.length === 0) return null
  const current = queue[0]

  const tones = {
    danger:  { accent: colors.danger,  icon: <AlertTriangle size={22} color={colors.danger} /> },
    warning: { accent: colors.warning, icon: <AlertTriangle size={22} color={colors.warning} /> },
    info:    { accent: colors.primary, icon: <Info size={22} color={colors.primary} /> },
  }
  const t = tones[current.tone] || tones.info

  return createPortal(
    <div
      onClick={() => close(current.id, false)}
      style={{
        position: 'fixed', inset: 0, zIndex: 1100,
        background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: radius['2xl'], boxShadow: shadow.xl,
          maxWidth: '440px', width: '100%', overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '14px',
          padding: '20px 22px',
        }}>
          <div style={{ flexShrink: 0, marginTop: '2px' }}>{t.icon}</div>
          <div style={{ flex: 1 }}>
            {current.title && (
              <h3 style={{ margin: '0 0 6px 0', fontSize: font.xl, color: colors.text }}>
                {current.title}
              </h3>
            )}
            <p style={{ margin: 0, color: colors.textMuted, fontSize: font.base, lineHeight: 1.4 }}>
              {current.message}
            </p>
          </div>
          <button
            onClick={() => close(current.id, false)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: '4px' }}
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>
        <div style={{
          display: 'flex', gap: '8px', padding: '12px 22px',
          borderTop: `1px solid ${colors.border}`, background: colors.bgMuted,
          justifyContent: 'flex-end',
        }}>
          <button
            onClick={() => close(current.id, false)}
            style={{
              padding: '8px 14px', border: `1px solid ${colors.borderStrong}`, background: 'white',
              borderRadius: radius.md, cursor: 'pointer', fontWeight: 600, fontSize: font.md,
              color: colors.textMuted,
            }}
          >
            {current.cancelText}
          </button>
          <button
            onClick={() => close(current.id, true)}
            style={{
              padding: '8px 14px', border: 'none', background: t.accent, color: 'white',
              borderRadius: radius.md, cursor: 'pointer', fontWeight: 600, fontSize: font.md,
            }}
            autoFocus
          >
            {current.confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
