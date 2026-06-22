import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useOrg } from './OrgContext'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import { colors, families, tracking, weight } from './components/ui/tokens'
import { MessageSquare, Mail, X, Send, Loader2, BookOpen, ExternalLink, Check, Sparkles } from 'lucide-react'

const SUPPORT_EMAIL = 'soporte@isosmartcore.com'

const GREETING = `Hola. Soy tu asistente IA de IsoSmartCore. Puedo ayudarte con:

• Cómo usar el software (módulos, formularios, exports)
• Conceptos de ISO 9001:2015 (cláusulas, requisitos, ejemplos)
• Dudas sobre tu proceso de certificación

⚠ Mis respuestas son orientativas. Para temas críticos de cumplimiento, validá con tu auditor certificado.

¿En qué te ayudo?`

const SYSTEM_BASE = `Sos el asistente IA de IsoSmartCore, un SaaS para gestión de calidad ISO 9001:2015. Tu rol es ayudar al usuario con: (1) cómo usar el software (módulos: ADN de Empresa, Contexto FODA, Stakeholders, Alcance, Procesos, Política de Calidad, Roles, Organigrama, Riesgos, Objetivos, Plan Estratégico, Personal, Formación, Clima Laboral, Comunicaciones, Calibración, Documentación, Pedidos, Producción, Liberación, Incidentes, Proveedores, Auditorías Internas, Revisión por la Dirección, No Conformidades, Mejora Continua); (2) conceptos de ISO 9001:2015 cláusulas 4 a 10; (3) dudas sobre el proceso de certificación.

REGLAS:
- Respuestas cortas y concretas (máximo 4-5 oraciones salvo que pidan detalle).
- Si NO estás seguro, decilo: "No estoy seguro, consultá con tu auditor certificado."
- NUNCA inventes números de cláusulas ni requisitos específicos si no estás 100% seguro.
- Si la pregunta no es de ISO 9001 ni del software, decí amable: "Solo puedo ayudarte con ISO 9001 y el uso del software."
- Español rioplatense neutral.`

export default function HelpSupport({ embedded = false, onClose }) {
  const { org } = useOrg()
  const [tab, setTab] = useState('chat')
  const [messages, setMessages] = useState([{ role: 'assistant', text: GREETING }])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [orgContext, setOrgContext] = useState(null)
  const scrollRef = useRef(null)

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from('company_profile').select('company_name, sector, size, main_products').maybeSingle()
        setOrgContext(data || null)
      } catch (err) {
        console.warn('HelpSupport: contexto org no disponible', err)
      }
    })()
  }, [])

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, loading])

  const send = async () => {
    const userMsg = input.trim()
    if (!userMsg || loading) return
    setInput('')
    setMessages(m => [...m, { role: 'user', text: userMsg }])
    setLoading(true)

    const ctxLine = orgContext
      ? `Contexto de la empresa del usuario: "${orgContext.company_name || 'sin nombre'}"${orgContext.sector ? ', sector: ' + orgContext.sector : ''}${orgContext.size ? ', tamaño: ' + orgContext.size : ''}. Usá este contexto si la pregunta lo amerita.`
      : 'Sin contexto de empresa cargado todavía.'
    const sys = `${SYSTEM_BASE}\n\n${ctxLine}`

    const historial = [...messages, { role: 'user', text: userMsg }]
      .slice(-10) // ventana últimos 10 mensajes para no inflar tokens
      .map(m => `${m.role === 'user' ? 'Usuario' : 'Asistente'}: ${m.text}`)
      .join('\n')
    const prompt = `${historial}\nAsistente:`

    try {
      const raw = await consultarIA(prompt, sys)
      let displayText = raw
      try {
        const parsed = JSON.parse(raw)
        if (parsed?.error) displayText = parsed.error
      } catch { /* raw es texto plano, caso normal */ }
      setMessages(m => [...m, { role: 'assistant', text: displayText }])
    } catch (err) {
      setMessages(m => [...m, {
        role: 'assistant',
        text: '⚠ No pude conectar con el asistente. Probá de nuevo o usá "Soporte humano".',
        isError: true,
      }])
    } finally {
      setLoading(false)
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  const Content = (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: embedded ? '100%' : '100%',
      background: colors.paper, color: colors.ink,
    }}>
      <div style={{
        display: 'flex', borderBottom: `1px solid ${colors.hairline}`,
        background: colors.paperWarm,
      }}>
        <TabBtn active={tab === 'chat'} onClick={() => setTab('chat')}>
          <MessageSquare size={14} /> Chat IA
        </TabBtn>
        <TabBtn active={tab === 'formacion'} onClick={() => setTab('formacion')}>
          <BookOpen size={14} /> Formación
        </TabBtn>
        <TabBtn active={tab === 'human'} onClick={() => setTab('human')}>
          <Mail size={14} /> Soporte
        </TabBtn>
      </div>

      {tab === 'chat' && (
        <>
          <div ref={scrollRef} style={{
            flex: 1, overflowY: 'auto', padding: '16px', minHeight: '280px',
          }}>
            {messages.map((m, i) => <ChatBubble key={i} role={m.role} text={m.text} isError={m.isError} />)}
            {loading && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '8px',
                color: colors.inkSoft, padding: '8px 4px', fontSize: '13px',
              }}>
                <Loader2 size={14} className="spin" /> Pensando…
              </div>
            )}
          </div>
          <div style={{
            borderTop: `1px solid ${colors.hairline}`,
            padding: '12px 16px', background: 'white',
          }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKey}
                placeholder="Preguntá lo que necesites… (Enter para enviar)"
                rows={2}
                style={{
                  flex: 1, padding: '8px 10px',
                  border: `1px solid ${colors.hairline}`, borderRadius: '4px',
                  fontFamily: families.body, fontSize: '14px',
                  resize: 'none', outline: 'none', color: colors.ink,
                }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                style={{
                  background: !input.trim() || loading ? colors.inkGhost : colors.seal,
                  color: colors.paper, border: 'none', padding: '0 16px',
                  borderRadius: '4px',
                  cursor: !input.trim() || loading ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                aria-label="Enviar"
              >
                <Send size={16} />
              </button>
            </div>
            <div style={{
              marginTop: '8px', fontSize: '10px', color: colors.inkSoft,
              fontFamily: families.mono, letterSpacing: tracking.wider,
              textTransform: 'uppercase', fontWeight: weight.semibold,
            }}>
              ⚠ Respuestas orientativas — validá temas críticos con tu auditor
            </div>
          </div>
        </>
      )}

      {tab === 'formacion' && <FormationTab orgId={org?.id} />}

      {tab === 'human' && <HumanSupportForm orgName={orgContext?.company_name || org?.name} />}
    </div>
  )

  if (embedded) {
    return (
      <div className="fade-in" style={{ padding: '20px', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{
          marginBottom: '20px', paddingBottom: '16px',
          borderBottom: `1px solid ${colors.hairline}`,
        }}>
          <div style={{
            fontFamily: families.mono, fontSize: '11px',
            letterSpacing: tracking.wider, color: colors.inkSoft,
            textTransform: 'uppercase', fontWeight: weight.semibold, marginBottom: '6px',
          }}>
            EXPEDIENTE · AYUDA Y SOPORTE
          </div>
          <h1 style={{
            margin: 0, fontFamily: families.display,
            fontSize: '32px', fontWeight: weight.semibold,
            color: colors.ink, letterSpacing: tracking.tight,
          }}>
            ¿En qué te ayudo?
          </h1>
          <p style={{ color: colors.inkMid, fontSize: '14px', marginTop: '8px', marginBottom: 0 }}>
            Preguntale a la IA sobre el software o sobre la norma ISO 9001:2015. Si necesitás respuesta humana, mandanos un correo.
          </p>
        </div>
        <div style={{
          border: `1px solid ${colors.hairline}`, background: 'white',
          height: '600px', overflow: 'hidden',
        }}>
          {Content}
        </div>
      </div>
    )
  }

  return createPortal(
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(46, 31, 26, 0.4)',
      backdropFilter: 'blur(2px)', zIndex: 9000,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end',
      padding: '20px',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: '440px', height: 'min(70vh, 640px)', minHeight: '480px',
        background: 'white', border: `1px solid ${colors.hairline}`,
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 20px 60px rgba(46,31,26,0.25)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', borderBottom: `1px solid ${colors.hairline}`,
          background: colors.paper,
        }}>
          <div>
            <div style={{
              fontFamily: families.mono, fontSize: '10px', letterSpacing: tracking.wider,
              color: colors.inkSoft, textTransform: 'uppercase', fontWeight: weight.semibold,
            }}>
              EXPEDIENTE · AYUDA
            </div>
            <div style={{
              fontFamily: families.display, fontSize: '18px', fontWeight: weight.semibold,
              color: colors.ink, marginTop: '2px',
            }}>
              ¿En qué te ayudo?
            </div>
          </div>
          <button onClick={onClose} aria-label="Cerrar" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: colors.inkMid, padding: '4px',
          }}>
            <X size={20} />
          </button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{Content}</div>
        </div>
      </div>
    </div>,
    document.body
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, background: active ? 'white' : 'transparent',
      border: 'none', borderBottom: `2px solid ${active ? colors.seal : 'transparent'}`,
      padding: '12px 10px', cursor: 'pointer',
      fontFamily: families.mono, fontSize: '11px', textTransform: 'uppercase',
      letterSpacing: tracking.wider, fontWeight: weight.semibold,
      color: active ? colors.seal : colors.inkMid,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
      transition: 'color 0.15s ease',
    }}>
      {children}
    </button>
  )
}

function ChatBubble({ role, text, isError }) {
  const isUser = role === 'user'
  return (
    <div style={{
      display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start',
      marginBottom: '10px',
    }}>
      <div style={{
        maxWidth: '85%', padding: '10px 14px', borderRadius: '8px',
        background: isError ? colors.alertLight : (isUser ? colors.seal : colors.paperWarm),
        color: isError ? colors.alertText : (isUser ? colors.paper : colors.ink),
        border: isError ? `1px solid ${colors.alert}` : 'none',
        fontFamily: families.body, fontSize: '14px', lineHeight: 1.5,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {text}
      </div>
    </div>
  )
}

function HumanSupportForm({ orgName }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [sent, setSent] = useState(false)

  const submit = (e) => {
    e.preventDefault()
    if (!subject.trim() || !message.trim()) return
    const body = `Empresa: ${orgName || '(no especificada)'}\n\nConsulta:\n${message}`
    const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('[Soporte] ' + subject)}&body=${encodeURIComponent(body)}`
    window.location.href = url
    setSent(true)
  }

  if (sent) {
    return (
      <div style={{ padding: '40px 24px', textAlign: 'center', flex: 1 }}>
        <div style={{
          fontFamily: families.mono, fontSize: '11px', color: colors.approveText,
          marginBottom: '12px', letterSpacing: tracking.wider, fontWeight: weight.semibold,
          textTransform: 'uppercase',
        }}>
          ENVIADO
        </div>
        <h3 style={{
          margin: '0 0 12px 0', fontFamily: families.display,
          fontSize: '20px', fontWeight: weight.semibold, color: colors.ink,
        }}>
          Listo, te abrimos el correo.
        </h3>
        <p style={{ color: colors.inkMid, fontSize: '14px', margin: 0 }}>
          Si el cliente de correo no se abrió, escribinos directo a <strong>{SUPPORT_EMAIL}</strong>.
        </p>
        <button onClick={() => { setSent(false); setSubject(''); setMessage('') }} style={{
          marginTop: '20px', background: 'none', border: `1px solid ${colors.hairlineStrong}`,
          color: colors.ink, padding: '10px 16px', borderRadius: '4px', cursor: 'pointer',
          fontFamily: families.body, fontSize: '13px', fontWeight: weight.medium,
        }}>
          Enviar otra consulta
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} style={{
      padding: '20px', display: 'flex', flexDirection: 'column',
      gap: '14px', flex: 1, overflowY: 'auto',
    }}>
      <p style={{ color: colors.inkMid, fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
        Contanos qué necesitás. Te respondemos por correo en menos de 24 horas hábiles.
      </p>
      <div>
        <label style={fieldLabel}>ASUNTO</label>
        <input value={subject} onChange={e => setSubject(e.target.value)} required style={fieldInput} placeholder="Ej: Cómo creo una No Conformidad" />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
        <label style={fieldLabel}>MENSAJE</label>
        <textarea value={message} onChange={e => setMessage(e.target.value)} required rows={6} style={{
          ...fieldInput, resize: 'vertical', minHeight: '120px', flex: 1, fontFamily: 'inherit',
        }} placeholder="Describí tu consulta con el detalle que puedas…" />
      </div>
      <button type="submit" style={{
        background: colors.seal, color: colors.paper, border: 'none',
        padding: '12px', cursor: 'pointer', fontFamily: families.body,
        fontSize: '14px', fontWeight: weight.semibold, letterSpacing: tracking.wide,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
        borderRadius: '4px',
      }}>
        <Mail size={16} /> Enviar a soporte
      </button>
    </form>
  )
}

const fieldLabel = {
  display: 'block', fontFamily: families.mono, fontSize: '10px',
  letterSpacing: tracking.wider, color: colors.inkSoft,
  textTransform: 'uppercase', fontWeight: weight.semibold, marginBottom: '6px',
}
const fieldInput = {
  width: '100%', padding: '8px 10px', border: `1px solid ${colors.hairline}`,
  borderRadius: '4px', fontFamily: 'inherit', fontSize: '14px',
  outline: 'none', boxSizing: 'border-box', color: colors.ink,
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMACIÓN — cursos curados + lista de espera Academia
// ═══════════════════════════════════════════════════════════════════════════

const COURSES = [
  {
    title: 'Auditor Interno SGI (ISO 9001 + 14001 + 45001)',
    provider: 'Centro de Educación Continua EPN',
    region: 'ECUADOR · QUITO',
    modality: 'Presencial / Virtual',
    language: 'Español',
    duration: '24 horas',
    price: 'US$120-200',
    certification: 'Universitario',
    note: 'Reconocido localmente. Buena opción si querés certificación con sello universidad.',
    url: 'https://www.cec-epn.edu.ec/cursos/curso/auditor-interno-de-sgi',
  },
  {
    title: 'Auditor Líder Internacional ISO 9001:2015 (IRCA)',
    provider: 'Bureau Veritas Perú',
    region: 'LATAM · ONLINE',
    modality: 'Online live',
    language: 'Español',
    duration: '40 horas',
    price: 'US$1,500-2,500',
    certification: 'IRCA · Internacional',
    note: 'El estándar de oro. Necesario si querés ser auditor EXTERNO o trabajar en certificadoras.',
    url: 'https://capacitaciones.bureauveritas.com.pe/online/certificacion-internacional-de-auditor-lider-iso-90012015-pr328',
  },
  {
    title: 'ISO 9001 Lead Auditor (PECB Certified)',
    provider: 'PECB',
    region: 'GLOBAL · ONLINE',
    modality: 'E-learning self-paced',
    language: 'Inglés / Español parcial',
    duration: '40 horas',
    price: 'US$799-899',
    certification: 'PECB · Internacional',
    note: 'Examen + primer reintento incluidos. Buena relación precio/reconocimiento.',
    url: 'https://pecb.com/en/education-and-certification-for-individuals/iso-9001/iso-9001-lead-auditor',
  },
  {
    title: 'Quality Management — catálogo de universidades',
    provider: 'Coursera',
    region: 'GLOBAL · ONLINE',
    modality: 'Self-paced',
    language: 'Inglés (subtítulos español)',
    duration: 'Variable',
    price: 'US$49/mes',
    certification: 'Universidad emisora',
    note: 'Bueno para fundamentos y soft skills. La mayoría NO son IRCA-certified.',
    url: 'https://www.coursera.org/courses?query=iso%209001',
  },
  {
    title: 'Cursos cortos ISO 9001 — introducción',
    provider: 'Udemy',
    region: 'GLOBAL · ONLINE',
    modality: 'Self-paced',
    language: 'Español disponible',
    duration: '6-12 horas',
    price: 'US$15-80',
    certification: 'Certificado Udemy (no IRCA)',
    note: 'Entry-level. Calidad varía mucho — revisá reviews y syllabus antes de comprar.',
    url: 'https://www.udemy.com/topic/iso-9001/',
  },
]

const INTERESTS = [
  { id: 'auditor_interno', label: 'Auditor Interno ISO 9001' },
  { id: 'comunicacion_asertiva', label: 'Comunicación asertiva para auditores' },
  { id: 'liderazgo_cambio', label: 'Liderazgo del cambio (cláusula 6.3)' },
  { id: 'manejo_hallazgos', label: 'Manejo de hallazgos sin generar resistencia' },
  { id: 'negociacion_auditoria', label: 'Negociación con auditores externos' },
  { id: 'coaching_procesos', label: 'Coaching de procesos' },
  { id: 'storytelling_direccion', label: 'Storytelling para presentar a la dirección' },
]

function FormationTab({ orgId }) {
  const [waitlistEntry, setWaitlistEntry] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) { setLoading(false); return }
        const { data } = await supabase.from('academy_waitlist')
          .select('id, interests, notes, created_at')
          .eq('user_id', user.id)
          .maybeSingle()
        if (data) setWaitlistEntry(data)
      } catch (err) {
        console.warn('FormationTab: no se pudo cargar waitlist', err)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
      {/* Intro */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{
          fontFamily: families.mono, fontSize: '10px',
          letterSpacing: tracking.wider, color: colors.inkSoft,
          textTransform: 'uppercase', fontWeight: weight.semibold, marginBottom: '6px',
        }}>
          PROVEEDORES CURADOS
        </div>
        <h3 style={{
          margin: '0 0 8px 0', fontFamily: families.display,
          fontSize: '18px', fontWeight: weight.semibold, color: colors.ink,
          lineHeight: 1.2,
        }}>
          Formá a tu equipo de auditores.
        </h3>
        <p style={{ color: colors.inkMid, fontSize: '13px', margin: 0, lineHeight: 1.5 }}>
          ISO 9001:2015 exige competencia (cláusulas 7.2 + 9.2.2) pero NO un certificado externo específico. Estas son opciones reales, de cercano a global.
        </p>
      </div>

      {/* Cursos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
        {COURSES.map((c, i) => <CourseCard key={i} course={c} />)}
      </div>

      {/* Disclaimer */}
      <div style={{
        background: colors.paperCool, padding: '10px 12px',
        border: `1px solid ${colors.hairline}`, borderRadius: '4px',
        fontSize: '11px', color: colors.inkMid, lineHeight: 1.5, marginBottom: '24px',
      }}>
        <strong>Importante:</strong> IsoSmartCore no es proveedor ni certifica estos cursos. Validá que el curso esté reconocido por tu organismo de certificación antes de invertir.
      </div>

      {/* Academia waitlist CTA */}
      <div style={{
        background: colors.paperWarm, border: `1.5px solid ${colors.seal}`,
        padding: '20px', borderRadius: '4px',
      }}>
        <div style={{
          fontFamily: families.mono, fontSize: '10px',
          letterSpacing: tracking.wider, color: colors.seal,
          textTransform: 'uppercase', fontWeight: weight.bold, marginBottom: '8px',
          display: 'flex', alignItems: 'center', gap: '6px',
        }}>
          <Sparkles size={12} /> PRÓXIMAMENTE · ACADEMIA ISOSMARTCORE
        </div>
        <h3 style={{
          margin: '0 0 8px 0', fontFamily: families.display,
          fontSize: '17px', fontWeight: weight.semibold, color: colors.ink,
          lineHeight: 1.25,
        }}>
          Curso propio de Auditor Interno + habilidades blandas.
        </h3>
        <p style={{ color: colors.inkMid, fontSize: '13px', margin: '0 0 14px 0', lineHeight: 1.5 }}>
          Estamos preparando un curso con módulos que no encontrás en otro lado: comunicación asertiva, manejo de hallazgos, liderazgo del cambio, negociación con auditores. Sumate a la lista de espera y sos de los primeros en acceder.
        </p>

        {loading ? (
          <div style={{ color: colors.inkSoft, fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Loader2 size={12} className="spin" /> Verificando…
          </div>
        ) : waitlistEntry ? (
          <EnrolledState entry={waitlistEntry} />
        ) : showForm ? (
          <WaitlistForm orgId={orgId} onDone={(entry) => { setWaitlistEntry(entry); setShowForm(false) }} onCancel={() => setShowForm(false)} />
        ) : (
          <button onClick={() => setShowForm(true)} style={{
            background: colors.seal, color: colors.paper,
            border: 'none', padding: '10px 16px', borderRadius: '4px',
            cursor: 'pointer', fontFamily: families.body, fontSize: '13px',
            fontWeight: weight.semibold, letterSpacing: tracking.wide,
            display: 'inline-flex', alignItems: 'center', gap: '8px',
          }}>
            <Sparkles size={14} /> Sumarme a la lista de espera
          </button>
        )}
      </div>
    </div>
  )
}

function CourseCard({ course }) {
  return (
    <a href={course.url} target="_blank" rel="noopener noreferrer" style={{
      display: 'block', textDecoration: 'none', color: 'inherit',
      background: 'white', border: `1px solid ${colors.hairline}`,
      padding: '12px 14px', borderRadius: '4px',
      transition: 'border-color 0.15s ease, transform 0.15s ease',
    }}
    onMouseEnter={e => { e.currentTarget.style.borderColor = colors.seal }}
    onMouseLeave={e => { e.currentTarget.style.borderColor = colors.hairline }}
    >
      <div style={{
        fontFamily: families.mono, fontSize: '9px',
        letterSpacing: tracking.wider, color: colors.inkSoft,
        textTransform: 'uppercase', fontWeight: weight.semibold, marginBottom: '4px',
      }}>
        {course.region} · {course.provider}
      </div>
      <div style={{
        fontFamily: families.display, fontWeight: weight.semibold,
        fontSize: '15px', color: colors.ink, lineHeight: 1.25, marginBottom: '6px',
        display: 'flex', alignItems: 'flex-start', gap: '6px', justifyContent: 'space-between',
      }}>
        <span>{course.title}</span>
        <ExternalLink size={14} style={{ color: colors.inkSoft, flexShrink: 0, marginTop: '2px' }} />
      </div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px',
      }}>
        <Pill>{course.modality}</Pill>
        <Pill>{course.language}</Pill>
        <Pill>{course.duration}</Pill>
        <Pill highlight>{course.price}</Pill>
        <Pill>{course.certification}</Pill>
      </div>
      <div style={{ fontSize: '12px', color: colors.inkMid, lineHeight: 1.45 }}>
        {course.note}
      </div>
    </a>
  )
}

function Pill({ children, highlight }) {
  return (
    <span style={{
      fontFamily: families.mono, fontSize: '9px',
      letterSpacing: tracking.wide, textTransform: 'uppercase',
      padding: '2px 6px', borderRadius: '2px',
      background: highlight ? colors.goldLight : colors.paperCool,
      color: highlight ? colors.goldText : colors.inkMid,
      fontWeight: weight.semibold,
      border: `1px solid ${highlight ? colors.gold : colors.hairline}`,
    }}>
      {children}
    </span>
  )
}

function EnrolledState({ entry }) {
  return (
    <div style={{
      background: colors.approveLight, border: `1px solid ${colors.approve}`,
      padding: '12px 14px', borderRadius: '4px',
      display: 'flex', alignItems: 'flex-start', gap: '10px',
    }}>
      <Check size={18} color={colors.approveText} style={{ flexShrink: 0, marginTop: '2px' }} />
      <div>
        <div style={{
          fontFamily: families.mono, fontSize: '10px',
          letterSpacing: tracking.wider, color: colors.approveText,
          textTransform: 'uppercase', fontWeight: weight.bold, marginBottom: '4px',
        }}>
          YA ESTÁS EN LA LISTA
        </div>
        <div style={{ fontSize: '13px', color: colors.approveText, lineHeight: 1.5 }}>
          Te vamos a avisar por correo cuando abramos la Academia.
          {entry.interests?.length > 0 && (
            <div style={{ marginTop: '6px', fontSize: '11px', color: colors.inkMid }}>
              Temas que marcaste: {entry.interests.map(id => INTERESTS.find(i => i.id === id)?.label || id).join(' · ')}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function WaitlistForm({ orgId, onDone, onCancel }) {
  const [selected, setSelected] = useState(new Set(['auditor_interno']))
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const toggle = (id) => {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    if (saving) return
    setSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        alert('No pudimos identificar tu sesión. Refrescá la página.')
        setSaving(false)
        return
      }
      const payload = {
        user_id: user.id,
        org_id: orgId || null,
        email: user.email,
        interests: Array.from(selected),
        notes: notes.trim() || null,
      }
      const { data, error } = await supabase.from('academy_waitlist').insert([payload]).select().single()
      if (error) {
        // Si ya existe (unique constraint), tratamos como éxito y leemos la entrada existente
        if (error.code === '23505') {
          const { data: existing } = await supabase.from('academy_waitlist')
            .select('id, interests, notes, created_at')
            .eq('user_id', user.id)
            .maybeSingle()
          if (existing) { onDone(existing); return }
        }
        alert('No pudimos guardarte: ' + error.message)
        setSaving(false)
        return
      }
      onDone(data)
    } catch (err) {
      console.error('Waitlist insert error:', err)
      alert('Error al guardar. Probá de nuevo.')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div>
        <div style={{
          fontFamily: families.mono, fontSize: '10px',
          letterSpacing: tracking.wider, color: colors.inkSoft,
          textTransform: 'uppercase', fontWeight: weight.semibold, marginBottom: '8px',
        }}>
          ¿QUÉ TEMAS TE INTERESAN?
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {INTERESTS.map(it => (
            <label key={it.id} style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              cursor: 'pointer', fontSize: '13px', color: colors.ink,
              padding: '4px 0',
            }}>
              <input
                type="checkbox"
                checked={selected.has(it.id)}
                onChange={() => toggle(it.id)}
                style={{ accentColor: colors.seal }}
              />
              {it.label}
            </label>
          ))}
        </div>
      </div>

      <div>
        <label style={fieldLabel}>COMENTARIOS (OPCIONAL)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={3}
          placeholder="¿Algún tema específico que te interese, formato preferido, etc.?"
          style={{ ...fieldInput, resize: 'vertical', fontFamily: 'inherit' }}
        />
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          type="submit"
          disabled={saving || selected.size === 0}
          style={{
            background: saving || selected.size === 0 ? colors.inkGhost : colors.seal,
            color: colors.paper, border: 'none', padding: '10px 16px',
            borderRadius: '4px', cursor: saving || selected.size === 0 ? 'default' : 'pointer',
            fontFamily: families.body, fontSize: '13px',
            fontWeight: weight.semibold, letterSpacing: tracking.wide,
            display: 'inline-flex', alignItems: 'center', gap: '6px',
          }}
        >
          {saving ? <><Loader2 size={14} className="spin" /> Guardando…</> : <><Check size={14} /> Sumarme</>}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          style={{
            background: 'none', border: `1px solid ${colors.hairlineStrong}`,
            color: colors.ink, padding: '10px 16px', borderRadius: '4px',
            cursor: saving ? 'default' : 'pointer',
            fontFamily: families.body, fontSize: '13px', fontWeight: weight.medium,
          }}
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}
