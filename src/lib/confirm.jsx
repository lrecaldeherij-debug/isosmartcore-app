// =============================================================================
// Diálogos programáticos: confirm() y promptText() sin window.*.
//
// Uso:
//   import { confirm, promptText } from './lib/confirm'
//
//   if (await confirm('¿Eliminar?')) { ... }
//   if (await confirm('¿Eliminar?', { tone: 'danger', confirmText: 'Eliminar' })) { ... }
//
//   const note = await promptText('Comentario de aprobación (opcional)')
//   if (note === null) return   // usuario canceló
//
//   const reason = await promptText('Motivo del rechazo', { required: true, tone: 'danger' })
//   if (!reason) return
//
// Necesita <ConfirmRoot /> montado en App.jsx una sola vez.
// window.prompt() y window.confirm() están bloqueados en Chrome mobile / iframe
// / samesite — este helper funciona en todos los navegadores y respeta el
// estilo de la app.
// =============================================================================

import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Info, X } from 'lucide-react'
import { colors, radius, shadow, font } from '../components/ui/tokens'

let listeners = new Set()
let queue = []

export function confirm(message, opts = {}) {
  return new Promise(resolve => {
    const item = {
      id: Math.random().toString(36).slice(2),
      kind: 'confirm',
      message,
      title: opts.title,
      tone: opts.tone || 'info',
      confirmText: opts.confirmText || 'Aceptar',
      cancelText: opts.cancelText || 'Cancelar',
      resolve,
    }
    queue = [...queue, item]
    listeners.forEach(l => l())
  })
}

/**
 * Modal-based text prompt. Replaces window.prompt() which is blocked in mobile
 * Chrome / samesite / iframe contexts.
 *
 * @param {string} title - Prompt shown to the user.
 * @param {object} opts
 * @param {string}  [opts.placeholder]  - Placeholder inside the textarea.
 * @param {string}  [opts.defaultValue] - Initial content.
 * @param {boolean} [opts.required]     - If true, empty submit is blocked.
 * @param {number}  [opts.rows]         - Textarea rows (default 3).
 * @param {string}  [opts.tone]         - 'info' | 'danger' | 'warning'.
 * @param {string}  [opts.confirmText]  - Submit button text.
 * @param {string}  [opts.cancelText]   - Cancel button text.
 * @returns {Promise<string|null>} trimmed text, or null if user cancelled.
 */
export function promptText(title, opts = {}) {
  return new Promise(resolve => {
    const item = {
      id: Math.random().toString(36).slice(2),
      kind: 'prompt',
      title,
      placeholder: opts.placeholder || '',
      defaultValue: opts.defaultValue || '',
      required: !!opts.required,
      rows: opts.rows || 3,
      tone: opts.tone || 'info',
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

const tones = () => ({
  danger:  { accent: colors.danger,  icon: <AlertTriangle size={22} color={colors.danger} /> },
  warning: { accent: colors.warning, icon: <AlertTriangle size={22} color={colors.warning} /> },
  info:    { accent: colors.primary, icon: <Info size={22} color={colors.primary} /> },
})

export function ConfirmRoot() {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force(x => x + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])

  if (queue.length === 0) return null
  const current = queue[0]
  const t = tones()[current.tone] || tones().info

  return createPortal(
    <div
      onClick={() => close(current.id, current.kind === 'prompt' ? null : false)}
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
          maxWidth: '480px', width: '100%', overflow: 'hidden',
        }}
      >
        {current.kind === 'prompt'
          ? <PromptBody current={current} accent={t.accent} icon={t.icon} />
          : <ConfirmBody current={current} accent={t.accent} icon={t.icon} />}
      </div>
    </div>,
    document.body
  )
}

function ConfirmBody({ current, accent, icon }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '20px 22px' }}>
        <div style={{ flexShrink: 0, marginTop: '2px' }}>{icon}</div>
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
            padding: '8px 14px', border: 'none', background: accent, color: 'white',
            borderRadius: radius.md, cursor: 'pointer', fontWeight: 600, fontSize: font.md,
          }}
          autoFocus
        >
          {current.confirmText}
        </button>
      </div>
    </>
  )
}

function PromptBody({ current, accent, icon }) {
  const [value, setValue] = useState(current.defaultValue)
  const [attempted, setAttempted] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    // Autofocus dentro del portal necesita un tick para que el textarea esté montado
    const id = setTimeout(() => ref.current?.focus(), 30)
    return () => clearTimeout(id)
  }, [])

  const submit = () => {
    const trimmed = value.trim()
    if (current.required && !trimmed) {
      setAttempted(true)
      ref.current?.focus()
      return
    }
    close(current.id, trimmed || null)
  }

  const handleKey = (e) => {
    // Ctrl+Enter (o Cmd+Enter) submitea rápido, Esc cancela
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); submit() }
    if (e.key === 'Escape') { e.preventDefault(); close(current.id, null) }
  }

  const missing = current.required && attempted && !value.trim()

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px', padding: '20px 22px 12px' }}>
        <div style={{ flexShrink: 0, marginTop: '2px' }}>{icon}</div>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: '0 0 4px 0', fontSize: font.xl, color: colors.text }}>
            {current.title}
          </h3>
          {current.required && (
            <p style={{ margin: '0 0 8px 0', fontSize: font.sm, color: colors.textFaint }}>
              Obligatorio.
            </p>
          )}
        </div>
        <button
          onClick={() => close(current.id, null)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.textFaint, padding: '4px' }}
          aria-label="Cerrar"
        >
          <X size={18} />
        </button>
      </div>
      <div style={{ padding: '0 22px 12px' }}>
        <textarea
          ref={ref}
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={handleKey}
          placeholder={current.placeholder}
          rows={current.rows}
          style={{
            width: '100%', boxSizing: 'border-box',
            padding: '10px 12px',
            border: `1px solid ${missing ? colors.danger : colors.borderStrong}`,
            borderRadius: radius.md,
            fontSize: font.base, fontFamily: 'inherit', resize: 'vertical',
            outline: 'none', minHeight: '80px',
          }}
        />
        {missing && (
          <p style={{ margin: '4px 0 0 0', fontSize: font.sm, color: colors.danger }}>
            Escribí un motivo antes de continuar.
          </p>
        )}
        <p style={{ margin: '6px 0 0 0', fontSize: font.sm, color: colors.textFaint }}>
          Ctrl + Enter para enviar · Esc para cancelar
        </p>
      </div>
      <div style={{
        display: 'flex', gap: '8px', padding: '12px 22px',
        borderTop: `1px solid ${colors.border}`, background: colors.bgMuted,
        justifyContent: 'flex-end',
      }}>
        <button
          onClick={() => close(current.id, null)}
          style={{
            padding: '8px 14px', border: `1px solid ${colors.borderStrong}`, background: 'white',
            borderRadius: radius.md, cursor: 'pointer', fontWeight: 600, fontSize: font.md,
            color: colors.textMuted,
          }}
        >
          {current.cancelText}
        </button>
        <button
          onClick={submit}
          style={{
            padding: '8px 14px', border: 'none', background: accent, color: 'white',
            borderRadius: radius.md, cursor: 'pointer', fontWeight: 600, fontSize: font.md,
          }}
        >
          {current.confirmText}
        </button>
      </div>
    </>
  )
}
