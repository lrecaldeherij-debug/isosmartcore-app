import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { Loader2, Send, CheckCircle, AlertTriangle } from 'lucide-react'
import { toast } from './lib/toast'

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

export default function PublicSurvey({ token }) {
  const [loading, setLoading] = useState(true)
  const [invitation, setInvitation] = useState(null)
  const [errorCode, setErrorCode] = useState(null)
  const [responses, setResponses] = useState({ ...EMPTY_RESPONSES })
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    (async () => {
      if (!token) {
        setErrorCode('invitation_not_found')
        setLoading(false)
        return
      }
      const { data, error } = await supabase.rpc('get_survey_invitation', { p_token: token })
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
  }, [token])

  const handleRating = (qId, val) => {
    setResponses(r => ({ ...r, [qId]: val }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    const { data, error } = await supabase.rpc('submit_survey_response', {
      p_token: token,
      p_responses: responses,
      p_notes: notes || null,
    })
    setSubmitting(false)
    if (error) return toast.error('Error: ' + error.message)
    if (data?.error) {
      // Errores terminales: bloquean re-envío y muestran la pantalla de error.
      if (['already_completed', 'invitation_not_found', 'expired'].includes(data.error)) {
        setErrorCode(data.error)
        return
      }
      return toast.error('Error: ' + data.error)
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
      invitation_not_found: { title: 'Invitación no encontrada', msg: 'El link que abriste no existe o ya fue eliminado.' },
      already_completed:    { title: 'Ya respondiste', msg: 'Esta encuesta ya fue completada. ¡Gracias por tu participación!' },
      expired:              { title: 'Invitación expirada', msg: 'El plazo para responder ya venció. Contacta a tu responsable si necesitas un nuevo link.' },
      rpc_error:            { title: 'Error de conexión', msg: 'No pudimos validar el link. Vuelve a intentar en unos minutos.' },
    }
    const m = messages[errorCode] || messages.invitation_not_found
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
          <h1 style={{ margin: 0, fontSize: '1.5rem' }}>📊 {invitation.campaign_name}</h1>
          <p style={{ margin: '0.4rem 0 0 0', opacity: 0.9, fontSize: '0.95rem' }}>
            Hola <strong>{invitation.person_name}</strong> — tus respuestas son confidenciales.
          </p>
          {invitation.campaign_description && (
            <p style={{ margin: '0.6rem 0 0 0', opacity: 0.85, fontSize: '0.85rem' }}>
              {invitation.campaign_description}
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit} style={{ background: '#fff', padding: '2rem', borderRadius: '0 0 12px 12px', boxShadow: '0 4px 24px rgba(15,23,42,0.06)' }}>
          <p style={{ margin: '0 0 1.5rem 0', padding: '0.75rem 1rem', background: '#eef2ff', borderRadius: '8px', fontSize: '0.9rem', color: '#3730a3' }}>
            Indicá tu nivel de acuerdo con cada afirmación. Escala: <strong>5 = Totalmente de acuerdo</strong> · 4 = De acuerdo · 3 = Neutral · 2 = En desacuerdo · <strong>1 = Totalmente en desacuerdo</strong>.
          </p>

          {CATEGORIES.map(cat => (
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
