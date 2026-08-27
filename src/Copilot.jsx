// =============================================================================
// Copilot — Asistente conversacional IA con contexto RAG.
//
// UX: botón flotante ⚡ abajo-derecha (siempre visible en /app). Click abre
// sidebar de 400px que desliza desde la derecha. Chat con historial de la
// sesión (no persistido — al recargar se pierde), citations clickeables
// que llevan al registro original.
//
// Backend: llama supabase.functions.invoke('copilot-chat') que hace el
// retrieval RAG contra rag_chunks + genera con gemini-3.6-flash. Cada
// llamada cuenta 1 uso IA (ver quota en org.ai_prompts_used_month).
// =============================================================================

import { useState, useRef, useEffect } from 'react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import { Sparkles, Send, X, Loader2, MessageSquarePlus, ExternalLink } from 'lucide-react'

// Mapa source_table → nombre de la vista del router para poder navegar.
// Coincide con los IDs de vistaActual en App.jsx.
const TABLE_TO_VIEW = {
  risk_matrix: 'riesgos',
  non_conformities: 'no_conformidades',
  documents_versions: 'documentos',
}

const CITATION_LABELS = {
  risk_matrix: 'Riesgo',
  non_conformities: 'No conformidad',
  documents_versions: 'Documento',
}

export default function Copilot() {
  const { org, profile } = useOrg()
  const [open, setOpen] = useState(false)
  // messages: [{ role: 'user' | 'assistant', text, citations?, model?, error? }]
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)

  // Autoscroll al último mensaje cuando llega uno nuevo
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  // Autofocus al input cuando abrís el panel
  useEffect(() => {
    if (open && inputRef.current) setTimeout(() => inputRef.current?.focus(), 100)
  }, [open])

  // Cerrar con Esc
  useEffect(() => {
    if (!open) return
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const send = async () => {
    const question = input.trim()
    if (!question || loading || !org?.id) return

    const userMsg = { role: 'user', text: question }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    // Ventana de historial que le pasamos al backend (últimos 6, sin la actual)
    const history = messages.slice(-6).map(m => ({ role: m.role, text: m.text }))

    const { data, error } = await supabase.functions.invoke('copilot-chat', {
      body: { question, history },
    })

    setLoading(false)

    if (error || !data?.text) {
      // Intentar leer el body del error (contiene el mensaje real)
      let errText = 'No se pudo obtener respuesta. Reintentá en un momento.'
      if (error?.context?.text) {
        try {
          const bodyText = await error.context.text()
          const parsed = JSON.parse(bodyText)
          if (parsed?.error) errText = parsed.error
        } catch { /* ignore */ }
      } else if (data?.error) {
        errText = data.error
      }
      setMessages([...newMessages, { role: 'assistant', text: errText, error: true }])
      return
    }

    setMessages([...newMessages, {
      role: 'assistant',
      text: data.text,
      citations: data.citations || [],
      model: data.model,
    }])
  }

  const clearChat = () => {
    setMessages([])
    setInput('')
    setTimeout(() => inputRef.current?.focus(), 50)
  }

  const onKeyDown = (e) => {
    // Enter envía, Shift+Enter hace newline
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const openCitation = (c) => {
    const view = TABLE_TO_VIEW[c.source_table]
    if (!view) return
    // Navegar a la vista correspondiente. App.jsx escucha popstate para
    // sincronizar vistaActual.
    const url = `/app/${view}?highlight=${c.source_id}`
    window.history.pushState({}, '', url)
    window.dispatchEvent(new PopStateEvent('popstate'))
    setOpen(false)
  }

  return (
    <>
      {/* FAB — botón flotante que abre/cierra el panel */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          title="Preguntá al Copiloto IA (Ctrl+/)"
          style={{
            position: 'fixed',
            bottom: '96px',      // arriba del HelpButton
            right: '24px',
            zIndex: 999,
            width: '56px',
            height: '56px',
            borderRadius: '28px',
            background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 10px 30px -8px rgba(79,70,229,0.55), 0 4px 12px rgba(0,0,0,0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.06)'
            e.currentTarget.style.boxShadow = '0 14px 40px -8px rgba(79,70,229,0.7), 0 6px 16px rgba(0,0,0,0.2)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.boxShadow = '0 10px 30px -8px rgba(79,70,229,0.55), 0 4px 12px rgba(0,0,0,0.15)'
          }}
        >
          <Sparkles size={26} />
        </button>
      )}

      {/* SIDEBAR — panel deslizante */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: open ? 0 : '-420px',
          height: '100vh',
          width: '400px',
          maxWidth: '95vw',
          background: 'white',
          boxShadow: open ? '-20px 0 50px -20px rgba(0,0,0,0.2)' : 'none',
          transition: 'right 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          borderLeft: '1px solid #e2e8f0',
        }}
      >
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
          color: 'white',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Sparkles size={20} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px' }}>Copiloto ISO</div>
              <div style={{ fontSize: '11px', opacity: 0.85 }}>Con contexto real de {org?.name || 'tu organización'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '4px' }}>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                title="Nueva conversación"
                style={fabIconBtn}
              >
                <MessageSquarePlus size={18} />
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              title="Cerrar (Esc)"
              style={fabIconBtn}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Mensajes */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            background: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}
        >
          {messages.length === 0 && (
            <EmptyState />
          )}
          {messages.map((m, i) => (
            <MessageBubble key={i} message={m} onCitationClick={openCitation} />
          ))}
          {loading && <TypingIndicator />}
        </div>

        {/* Input */}
        <div style={{
          padding: '12px 16px 16px 16px',
          background: 'white',
          borderTop: '1px solid #e2e8f0',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '8px',
            background: '#f1f5f9',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            padding: '8px 8px 8px 12px',
          }}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              rows={1}
              placeholder="Preguntá sobre tus riesgos, NCs, documentos…"
              disabled={loading}
              style={{
                flex: 1,
                border: 'none',
                background: 'transparent',
                resize: 'none',
                outline: 'none',
                fontFamily: 'inherit',
                fontSize: '14px',
                maxHeight: '120px',
                minHeight: '20px',
                padding: '4px 0',
                color: '#0f172a',
              }}
            />
            <button
              onClick={send}
              disabled={!input.trim() || loading}
              title="Enviar (Enter)"
              style={{
                background: input.trim() && !loading ? '#4f46e5' : '#cbd5e1',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                padding: '8px 10px',
                cursor: input.trim() && !loading ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                transition: 'background 0.15s ease',
              }}
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
          <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '6px', textAlign: 'center' }}>
            El copiloto puede equivocarse. Verificá siempre con la fuente citada.
          </div>
        </div>
      </div>

      {/* Backdrop en mobile — solo visible cuando el panel está abierto */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.4)',
            backdropFilter: 'blur(2px)',
            zIndex: 999,
            display: 'none',  // solo en mobile via media query — por ahora lo dejamos oculto
          }}
        />
      )}
    </>
  )
}

// ─────────── Sub-componentes ───────────

function EmptyState() {
  const examples = [
    '¿Cuáles son mis 3 riesgos más críticos?',
    'Resumime las NCs abiertas',
    '¿Qué documentos tengo próximos a revisión?',
    'Preparame un resumen para la revisión por la dirección',
  ]
  return (
    <div style={{
      textAlign: 'center',
      padding: '32px 16px',
      color: '#64748b',
    }}>
      <div style={{
        width: '56px',
        height: '56px',
        margin: '0 auto 16px',
        borderRadius: '50%',
        background: 'linear-gradient(135deg, #ede9fe, #fce7f3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Sparkles size={26} color="#7c3aed" />
      </div>
      <h3 style={{ margin: '0 0 8px 0', fontSize: '15px', color: '#1e293b' }}>
        Preguntá sobre tu SGC
      </h3>
      <p style={{ margin: '0 0 16px 0', fontSize: '13px', lineHeight: 1.5 }}>
        Respondo con contexto real de tu organización y te muestro las fuentes exactas.
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {examples.map((ex, i) => (
          <ExampleChip key={i} text={ex} />
        ))}
      </div>
    </div>
  )
}

function ExampleChip({ text }) {
  // Los ejemplos son solo visuales — clickearlos podría pre-llenar el input.
  // Por ahora los dejamos como sugerencias visuales para no complicar el estado.
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      padding: '10px 12px',
      fontSize: '12px',
      color: '#475569',
      textAlign: 'left',
    }}>
      {text}
    </div>
  )
}

function MessageBubble({ message, onCitationClick }) {
  const isUser = message.role === 'user'
  const isError = message.error === true

  return (
    <div style={{
      display: 'flex',
      justifyContent: isUser ? 'flex-end' : 'flex-start',
    }}>
      <div style={{
        maxWidth: '85%',
        background: isUser ? '#4f46e5' : (isError ? '#fef2f2' : 'white'),
        color: isUser ? 'white' : (isError ? '#991b1b' : '#0f172a'),
        border: isUser ? 'none' : `1px solid ${isError ? '#fecaca' : '#e2e8f0'}`,
        borderRadius: isUser ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
        padding: '10px 14px',
        fontSize: '13.5px',
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}>
        <div>{message.text}</div>
        {message.citations && message.citations.length > 0 && (
          <div style={{
            marginTop: '10px',
            paddingTop: '10px',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}>
            <div style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#64748b', fontWeight: 700 }}>
              Fuentes consultadas
            </div>
            {message.citations.map(c => (
              <button
                key={c.source_id}
                onClick={() => onCitationClick(c)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#f8fafc',
                  border: '1px solid #e2e8f0',
                  borderRadius: '6px',
                  padding: '6px 8px',
                  fontSize: '11.5px',
                  color: '#334155',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s ease',
                }}
                onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
                onMouseLeave={e => e.currentTarget.style.background = '#f8fafc'}
              >
                <span style={{
                  background: '#4f46e5',
                  color: 'white',
                  borderRadius: '3px',
                  fontSize: '9px',
                  fontWeight: 700,
                  padding: '2px 5px',
                  minWidth: '14px',
                  textAlign: 'center',
                }}>
                  {c.index}
                </span>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.title || `${CITATION_LABELS[c.source_table]} sin título`}
                </span>
                <ExternalLink size={11} style={{ opacity: 0.6, flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}
        {message.model && !isUser && (
          <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '6px' }}>
            {message.model}
          </div>
        )}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
      <div style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: '12px 12px 12px 4px',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
      }}>
        <TypingDot delay={0} />
        <TypingDot delay={150} />
        <TypingDot delay={300} />
      </div>
    </div>
  )
}

function TypingDot({ delay }) {
  return (
    <div style={{
      width: '6px',
      height: '6px',
      borderRadius: '50%',
      background: '#7c3aed',
      animation: `copilot-pulse 1.2s ease-in-out ${delay}ms infinite`,
    }} />
  )
}

const fabIconBtn = {
  background: 'rgba(255,255,255,0.15)',
  border: 'none',
  color: 'white',
  padding: '6px',
  borderRadius: '6px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 0.15s ease',
}

// Keyframes CSS necesarios para el typing indicator. Los inyectamos una sola
// vez en el head (idempotente por el id).
if (typeof document !== 'undefined' && !document.getElementById('copilot-styles')) {
  const style = document.createElement('style')
  style.id = 'copilot-styles'
  style.textContent = `
    @keyframes copilot-pulse {
      0%, 60%, 100% { opacity: 0.3; transform: translateY(0); }
      30% { opacity: 1; transform: translateY(-3px); }
    }
  `
  document.head.appendChild(style)
}
