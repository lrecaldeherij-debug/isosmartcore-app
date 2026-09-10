import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { Loader2, Send, CheckCircle, AlertTriangle } from 'lucide-react'
import { toast } from './lib/toast'
import {
  DIMENSIONS, SCALE_LABELS, isSatisfactionSurvey,
} from './lib/customerSatisfaction'

// Mismas 4 categorías que ClimateSurveys.jsx — mantenidas aquí para que la
// página pública sea autocontenida y no dependa del módulo logueado.
const CATEGORIES = [
  { id: 'A', title: 'INSERCIÓN AL PUESTO DE TRABAJO', questions: [
      { id: 'A1', text: 'Cuando ingresé a la empresa, recibí capacitación.' },
      { id: 'A2', text: 'Conozco las políticas de la empresa.' },
      { id: 'A3', text: 'Me indicaron cuales eran mis funciones de acuerdo al puesto de trabajo.' },
      { id: 'A4', text: 'Me brindaron la colaboración necesaria para realizar mis labores.' },
      { id: 'A5', text: 'Recibí el apoyo y confianza del inmediato superior.' },
      { id: 'A6', text: 'Recibí el apoyo y confianza de mis compañeros de trabajo.' }
  ]},
  { id: 'B', title: 'RELACIÓN CON EL INMEDIATO SUPERIOR', questions: [
      { id: 'B1', text: 'Es una persona con la que se puede conversar temas labores.' },
      { id: 'B2', text: 'Es una persona con la que se puede conversar temas personales.' },
      { id: 'B3', text: 'Acepta opiniones.' },
      { id: 'B4', text: 'Reconoce sus errores.' },
      { id: 'B5', text: 'Separa situaciones personales de las laborales.' },
      { id: 'B6', text: 'Reacciona de buena manera ante una situación inesperada.' },
      { id: 'B7', text: 'Fomenta una relación positiva entre los compañeros.' }
  ]},
  { id: 'C', title: 'LIDERAZGO DEL INMEDIATO SUPERIOR', questions: [
      { id: 'C1', text: 'Me brinda herramientas que me ayudan a mejorar en el trabajo.' },
      { id: 'C2', text: 'Estimula el desarrollo de mis capacidades.' },
      { id: 'C3', text: 'Acepta ideas y sugerencias de parte del equipo.' },
      { id: 'C4', text: 'Proporciona retroalimentación cuando se ha implementado una estrategia.' },
      { id: 'C5', text: 'Cuando cometo un error recibo orientación de forma adecuada.' },
      { id: 'C6', text: 'Tiene palabras de ánimo cuando se presentan adversidades.' },
      { id: 'C7', text: 'Reconoce cuando alguien no se encuentra bien, se muestra comprensivo.' },
      { id: 'C8', text: 'Planifica y organiza de forma adecuada las actividades de grupo.' },
      { id: 'C9', text: 'Se involucra en la ejecución de las actividades de grupo.' }
  ]},
  { id: 'D', title: 'RELACIÓN CON LOS COMPAÑEROS DE TRABAJO', questions: [
      { id: 'D1', text: 'Puedo conversar abiertamente con mis compañeros de trabajo.' },
      { id: 'D2', text: 'Existe un trato respetuoso entre los integrantes de mi grupo.' },
      { id: 'D3', text: 'Existe unión en el grupo.' },
      { id: 'D4', text: 'Me siento a gusto en mi grupo de trabajo.' },
      { id: 'D5', text: 'Los compañeros de trabajo son colaboradores.' },
      { id: 'D6', text: 'Los compañeros de trabajo son personas confiables.' }
  ]}
]

const EMPTY_RESPONSES = CATEGORIES.reduce((acc, cat) => {
  cat.questions.forEach(q => { acc[q.id] = 3 })
  return acc
}, {})

// Fingerprint simple del dispositivo: combina propiedades del navegador
// que son estables entre visitas del mismo user + un ID aleatorio persistido
// en localStorage. No identifica a la persona real, solo al dispositivo — sirve
// para evitar que la MISMA persona responda 2 veces desde el mismo celu.
function getDeviceFingerprint() {
  try {
    const key = 'isc_device_fp'
    let fp = localStorage.getItem(key)
    if (!fp) {
      const rand = Math.random().toString(36).slice(2) + Date.now().toString(36)
      const nav = `${navigator.userAgent}|${navigator.language}|${screen.width}x${screen.height}`
      fp = btoa(nav).slice(0, 20) + '_' + rand.slice(0, 12)
      localStorage.setItem(key, fp)
    }
    return fp
  } catch {
    return null  // Modo incógnito o sin localStorage: sin fingerprint, permitir
  }
}

export default function PublicSurvey({ token, slug }) {
  // Modo: 'token' = invitación individual, 'slug' = campaña pública QR
  const mode = token ? 'token' : (slug ? 'slug' : 'invalid')
  const [loading, setLoading] = useState(true)
  const [invitation, setInvitation] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [responses, setResponses] = useState({ ...EMPTY_RESPONSES })
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  // Estado propio de la encuesta de satisfacción de cliente (9.1.2). Arranca
  // vacío a propósito: un default de 4 sesgaría el resultado hacia arriba si
  // el cliente envía sin tocar nada.
  const [satScores, setSatScores] = useState({})
  const [npsScore, setNpsScore] = useState(null)
  const [customerName, setCustomerName] = useState('')

  // Qué formulario mostrar. La campaña lo declara en survey_type; las de clima
  // (default histórico) siguen con el cuestionario de 4 categorías.
  const isSatisfaction = isSatisfactionSurvey(invitation?.survey_type)

  useEffect(() => {
    (async () => {
      if (mode === 'invalid') {
        setErrorCode('invitation_unavailable')
        setLoading(false)
        return
      }

      // Modo público: primero chequear localStorage para no cargar la campaña
      // si ya respondiste desde este dispositivo. Ahorra un roundtrip.
      if (mode === 'slug') {
        try {
          if (localStorage.getItem(`isc_survey_done_${slug}`)) {
            setErrorCode('already_responded')
            setLoading(false)
            return
          }
        } catch {}
      }

      const rpcName = mode === 'token' ? 'get_survey_invitation' : 'get_public_survey_by_slug'
      const rpcArgs = mode === 'token' ? { p_token: token } : { p_slug: slug }

      const { data, error } = await supabase.rpc(rpcName, rpcArgs)
      if (error) {
        setErrorCode('rpc_error')
        setLoading(false)
        return
      }
      if (data?.error) {
        setErrorCode(data.error)
      } else if (data?.ok) {
        setInvitation(data)
      }
      setLoading(false)
    })()
  }, [mode, token, slug])

  const handleRating = (qId, val) => {
    setResponses(r => ({ ...r, [qId]: val }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // En satisfacción todo es opcional campo por campo, pero enviar el
    // formulario entero vacío solo ensucia el indicador con una fila nula.
    if (isSatisfaction) {
      const answered = Object.values(satScores).filter(v => v != null).length
      if (answered === 0 && npsScore == null) {
        toast.error('Respondé al menos una pregunta antes de enviar.')
        return
      }
    }

    setSubmitting(true)

    let data, error
    if (isSatisfaction && mode !== 'slug') {
      // Las encuestas de satisfacción solo se responden por link público: no
      // hay flujo de invitación individual todavía. Sin este guard, la RPC
      // recibiría p_slug undefined y devolvería un error opaco.
      setSubmitting(false)
      toast.error('Esta encuesta solo puede responderse desde su link público.')
      return
    }
    if (isSatisfaction) {
      // Encuesta de satisfacción de cliente: RPC propia, que escribe en
      // customer_satisfaction_surveys y no en climate_surveys.
      // Solo existe en modo link público — no hay invitación por token todavía.
      const fp = getDeviceFingerprint()
      ;({ data, error } = await supabase.rpc('submit_customer_satisfaction', {
        p_slug: slug,
        p_scores: satScores,
        p_nps: npsScore,
        p_comments: notes || null,
        p_customer: customerName.trim() || null,
        p_fingerprint: fp,
      }))
    } else if (mode === 'token') {
      ({ data, error } = await supabase.rpc('submit_survey_response', {
        p_token: token,
        p_responses: responses,
        p_notes: notes || null,
      }))
    } else {
      // Modo público: agregar fingerprint para anti-doble-respuesta server-side
      const fp = getDeviceFingerprint()
      ;({ data, error } = await supabase.rpc('submit_public_survey_response', {
        p_slug: slug,
        p_responses: responses,
        p_fingerprint: fp,
        p_notes: notes || null,
      }))
    }

    setSubmitting(false)
    if (error) return toast.error('Error: ' + error.message)
    if (data?.error) {
      // Errores terminales: bloquean re-envío y muestran la pantalla de error.
      // Post-audit #45: los codigos generados en BD se unificaron para no
      // filtrar existencia de slugs (anti-enum). Los viejos siguen aca por
      // backward-compat con BD sin la migracion 20260904160000 aplicada.
      const terminal = [
        'already_completed', 'already_responded', 'rate_limited',
        'invitation_unavailable', 'campaign_unavailable',
        // Legacy (BD pre-20260904160000)
        'invitation_not_found', 'expired',
        'campaign_not_found', 'campaign_closed', 'campaign_expired',
      ]
      if (terminal.includes(data.error)) {
        setErrorCode(data.error)
        return
      }
      return toast.error('Error: ' + data.error)
    }
    // Persistir en localStorage para modo público: bloquea reenvío desde
    // este dispositivo aunque limpie el fingerprint (double defense).
    if (mode === 'slug') {
      try { localStorage.setItem(`isc_survey_done_${slug}`, new Date().toISOString()) } catch {}
    }
    setDone(true)
  }

  // ----- Pantallas -----
  if (loading) {
    return (
      <CenteredCard>
        <Loader2 className="animate-spin" size={32} style={{ color: '#4f46e5' }} />
        <p style={{ marginTop: '1rem', color: '#64748b' }}>Validando invitación...</p>
      </CenteredCard>
    )
  }

  if (errorCode) {
    const messages = {
      // Codigos nuevos (post-audit #45): unificados anti-enum
      invitation_unavailable: { title: 'Link no disponible', msg: 'Este link ya no está disponible. Puede haber vencido o el link no es válido. Contactá a tu responsable si necesitás un nuevo acceso.' },
      campaign_unavailable:   { title: 'Encuesta no disponible', msg: 'Esta encuesta ya no está disponible. Puede estar cerrada, vencida o el link no es válido. Contactá a tu responsable si necesitás más info.' },
      // Codigos que se mantienen (no filtran enum)
      already_completed:    { title: 'Ya respondiste', msg: 'Esta encuesta ya fue completada. ¡Gracias por tu participación!' },
      already_responded:    { title: 'Ya respondiste', msg: 'Ya respondiste esta encuesta desde este dispositivo. Gracias por tu participación.' },
      rate_limited:         { title: 'Demasiadas respuestas', msg: 'Estamos recibiendo un volumen inusual. Intentá de nuevo en unos minutos.' },
      rpc_error:            { title: 'Error de conexión', msg: 'No pudimos validar el link. Volvé a intentar en unos minutos.' },
      // Legacy (BD pre-migracion) — mismos textos genericos que los unificados
      invitation_not_found: { title: 'Link no disponible', msg: 'Este link ya no está disponible. Contactá a tu responsable si necesitás un nuevo acceso.' },
      campaign_not_found:   { title: 'Encuesta no disponible', msg: 'Esta encuesta ya no está disponible. Contactá a tu responsable.' },
      expired:              { title: 'Link no disponible', msg: 'Este link ya no está disponible.' },
      campaign_closed:      { title: 'Encuesta no disponible', msg: 'Esta encuesta ya no está disponible.' },
      campaign_expired:     { title: 'Encuesta no disponible', msg: 'Esta encuesta ya no está disponible.' },
      rate_limit_exceeded:  { title: 'Demasiadas respuestas', msg: 'Estamos recibiendo un volumen inusual. Intentá de nuevo en unos minutos.' },
    }
    const m = messages[errorCode] || messages.invitation_unavailable
    return (
      <CenteredCard>
        <AlertTriangle size={48} style={{ color: '#f59e0b' }} />
        <h2 style={{ margin: '1rem 0 0.5rem 0' }}>{m.title}</h2>
        <p style={{ color: '#64748b', textAlign: 'center', maxWidth: '380px' }}>{m.msg}</p>
      </CenteredCard>
    )
  }

  if (done) {
    return (
      <CenteredCard>
        <CheckCircle size={48} style={{ color: '#16a34a' }} />
        <h2 style={{ margin: '1rem 0 0.5rem 0' }}>¡Gracias por responder!</h2>
        <p style={{ color: '#64748b', textAlign: 'center', maxWidth: '380px' }}>
          Tus respuestas se registraron correctamente. Ya puedes cerrar esta ventana.
        </p>
      </CenteredCard>
    )
  }

  // ----- Formulario principal -----
  return (
    <div style={{
      minHeight: '100vh', background: '#f1f5f9', padding: '2rem 1rem',
      fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{ maxWidth: '780px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          padding: '2rem', borderRadius: '12px 12px 0 0', color: '#fff'
        }}>
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>
            {isSatisfaction ? '⭐' : '📊'} {invitation.campaign_name}
          </h1>
          <p style={{ margin: '0.4rem 0 0 0', opacity: 0.9, fontSize: '0.95rem' }}>
            {isSatisfaction ? (
              // En satisfacción el nombre es opcional y lo decide el cliente,
              // así que no prometemos anonimato total como en clima laboral.
              <>Tu opinión nos ayuda a mejorar. Toma menos de 2 minutos.</>
            ) : mode === 'token' ? (
              <>Hola <strong>{invitation.person_name}</strong> — tus respuestas son confidenciales.</>
            ) : (
              <>🔒 Tu respuesta es <strong>100% anónima</strong>. No guardamos tu nombre, teléfono ni datos personales.</>
            )}
          </p>
          {invitation.campaign_description && (
            <p style={{ margin: '0.6rem 0 0 0', opacity: 0.85, fontSize: '0.85rem' }}>
              {invitation.campaign_description}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ background: '#fff', padding: '2rem', borderRadius: '0 0 12px 12px', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
          {!isSatisfaction && (
            <p style={{ margin: '0 0 1.5rem 0', padding: '0.75rem 1rem', background: '#eef2ff', borderRadius: '8px', fontSize: '0.9rem', color: '#3730a3' }}>
              Indicá tu nivel de acuerdo con cada afirmación. Escala: <strong>5 = Totalmente de acuerdo</strong> · 4 = De acuerdo · 3 = Neutral · 2 = En desacuerdo · <strong>1 = Totalmente en desacuerdo</strong>.
            </p>
          )}

          {isSatisfaction && (
            <SatisfactionForm
              scores={satScores}
              onScore={(k, v) => setSatScores(s => ({ ...s, [k]: v }))}
              nps={npsScore}
              onNps={setNpsScore}
              customerName={customerName}
              onCustomerName={setCustomerName}
            />
          )}

          {!isSatisfaction && CATEGORIES.map(cat => (
            <div key={cat.id} style={{ marginBottom: '2rem' }}>
              <h3 style={{
                background: '#f8fafc', padding: '12px 16px', borderRadius: '6px',
                color: '#4f46e5', fontSize: '0.95rem', margin: 0
              }}>
                {cat.id}. {cat.title}
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '0.75rem' }}>
                <thead>
                  <tr style={{ fontSize: '0.78rem', color: '#64748b' }}>
                    <th style={{ textAlign: 'left', padding: '8px 10px' }}>Pregunta</th>
                    <th style={{ width: '44px', textAlign: 'center' }}>5</th>
                    <th style={{ width: '44px', textAlign: 'center' }}>4</th>
                    <th style={{ width: '44px', textAlign: 'center' }}>3</th>
                    <th style={{ width: '44px', textAlign: 'center' }}>2</th>
                    <th style={{ width: '44px', textAlign: 'center' }}>1</th>
                  </tr>
                </thead>
                <tbody>
                  {cat.questions.map(q => (
                    <tr key={q.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '10px', fontSize: '0.88rem' }}>{q.id}. {q.text}</td>
                      {[5, 4, 3, 2, 1].map(num => (
                        <td key={num} style={{ textAlign: 'center' }}>
                          <input
                            type="radio"
                            name={q.id}
                            checked={responses[q.id] === num}
                            onChange={() => handleRating(q.id, num)}
                            style={{ cursor: 'pointer', width: '18px', height: '18px' }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}

          <div style={{ marginBottom: '1.5rem' }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: '#334155' }}>
              Comentarios adicionales (opcional)
            </label>
            <textarea
              rows={3}
              placeholder="Si quieres agregar algo en tus palabras..."
              value={notes}
              onChange={e => setNotes(e.target.value)}
              style={{
                width: '100%', padding: '0.75rem', borderRadius: '6px',
                border: '1px solid #cbd5e1', fontSize: '0.9rem',
                fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box'
              }}
            />
          </div>

          <div style={{ background: '#f8fafc', padding: '1.25rem', borderRadius: '8px', textAlign: 'center' }}>
            <button
              type="submit"
              disabled={submitting}
              style={{
                background: '#4f46e5', color: '#fff', padding: '0.9rem 2.5rem',
                border: 'none', borderRadius: '8px', fontSize: '0.95rem',
                fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.7 : 1,
                display: 'inline-flex', alignItems: 'center', gap: '0.5rem'
              }}
            >
              {submitting ? <Loader2 className="animate-spin" size={16} /> : <Send size={16} />}
              {submitting ? 'Enviando...' : 'Enviar mis respuestas'}
            </button>
          </div>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', color: '#94a3b8', fontSize: '0.8rem' }}>
          IsoSmartCore · Sistema de Gestión de Calidad ISO 9001
        </p>
      </div>
    </div>
  )
}

// ─── Formulario de satisfacción del cliente (9.1.2) ─────────────────────────
//
// Botonera en vez de radios de tabla: el cliente casi siempre abre esto desde
// el celular escaneando un QR, y una tabla de 6 columnas es inusable ahí.
function SatisfactionForm({
  scores, onScore, nps, onNps, customerName, onCustomerName,
}) {
  return (
    <>
      <p style={{
        margin: '0 0 1.25rem 0', padding: '0.75rem 1rem', background: '#eef2ff',
        borderRadius: '8px', fontSize: '0.9rem', color: '#3730a3',
      }}>
        Calificá cada aspecto del 1 al 5, donde <strong>5 = Totalmente de acuerdo</strong> y
        <strong> 1 = Totalmente en desacuerdo</strong>. Podés dejar en blanco lo que no aplique.
      </p>

      {DIMENSIONS.map(d => (
        <div key={d.key} style={{ marginBottom: '1.4rem' }}>
          <label style={{
            display: 'block', fontSize: '0.92rem', color: '#1e293b',
            fontWeight: 600, marginBottom: '0.5rem',
          }}>
            {d.publicQuestion}
          </label>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {[1, 2, 3, 4, 5].map(n => {
              const active = scores[d.key] === n
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => onScore(d.key, active ? undefined : n)}
                  title={SCALE_LABELS[n]}
                  style={{
                    flex: '1 1 52px', minWidth: '52px', minHeight: '46px',
                    borderRadius: '8px', cursor: 'pointer',
                    border: `1px solid ${active ? scoreTone(n) : '#cbd5e1'}`,
                    background: active ? scoreTone(n) : '#fff',
                    color: active ? '#fff' : '#475569',
                    fontSize: '1rem', fontWeight: 700, fontFamily: 'inherit',
                    transition: 'all 0.12s',
                  }}
                >
                  {n}
                </button>
              )
            })}
          </div>
          {scores[d.key] && (
            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '4px' }}>
              {SCALE_LABELS[scores[d.key]]}
            </div>
          )}
        </div>
      ))}

      <div style={{
        margin: '1.75rem 0 1.5rem 0', padding: '1rem',
        background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0',
      }}>
        <label style={{
          display: 'block', fontSize: '0.95rem', color: '#1e293b',
          fontWeight: 700, marginBottom: '0.3rem',
        }}>
          ¿Qué tan probable es que nos recomiendes a un colega?
        </label>
        <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '0.7rem' }}>
          0 = nada probable · 10 = muy probable
        </div>
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
          {Array.from({ length: 11 }, (_, n) => {
            const active = nps === n
            const tone = n >= 9 ? '#16a34a' : n >= 7 ? '#f59e0b' : '#dc2626'
            return (
              <button
                key={n}
                type="button"
                onClick={() => onNps(active ? null : n)}
                style={{
                  flex: '1 1 40px', minWidth: '40px', minHeight: '44px',
                  borderRadius: '8px', cursor: 'pointer',
                  border: `1px solid ${active ? tone : '#cbd5e1'}`,
                  background: active ? tone : '#fff',
                  color: active ? '#fff' : '#475569',
                  fontSize: '0.95rem', fontWeight: 700, fontFamily: 'inherit',
                }}
              >
                {n}
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ marginBottom: '1.5rem' }}>
        <label style={{
          display: 'block', marginBottom: '0.4rem',
          fontSize: '0.9rem', color: '#334155',
        }}>
          Tu nombre o empresa <span style={{ color: '#94a3b8' }}>(opcional)</span>
        </label>
        <input
          type="text"
          value={customerName}
          onChange={e => onCustomerName(e.target.value)}
          placeholder="Dejalo en blanco si preferís responder de forma anónima"
          style={{
            width: '100%', padding: '0.75rem', borderRadius: '6px',
            border: '1px solid #cbd5e1', fontSize: '0.9rem',
            fontFamily: 'inherit', boxSizing: 'border-box',
          }}
        />
      </div>
    </>
  )
}

function scoreTone(n) {
  if (n >= 4) return '#16a34a'
  if (n === 3) return '#f59e0b'
  return '#dc2626'
}

function CenteredCard({ children }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#f1f5f9',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
      fontFamily: '-apple-system, "Segoe UI", Roboto, sans-serif'
    }}>
      <div style={{
        background: '#fff', padding: '3rem 2.5rem', borderRadius: '12px',
        boxShadow: '0 4px 24px rgba(15,23,42,0.08)', textAlign: 'center',
        maxWidth: '440px', width: '100%'
      }}>
        {children}
      </div>
    </div>
  )
}
