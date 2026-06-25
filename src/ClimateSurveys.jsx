import { useEffect, useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  Sparkles, Loader2, Send, User, Pencil, Trash2, X,
  Eye, ExternalLink, BarChart3, Filter, TrendingUp, MailPlus, Check, AlertTriangle
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

const CATEGORIES = [
  { id: 'A', title: 'INSERCION AL PUESTO DE TRABAJO', questions: [
      { id: 'A1', text: 'Cuando ingresé a la empresa, recibí capacitación.' },
      { id: 'A2', text: 'Conozco las políticas de la empresa.' },
      { id: 'A3', text: 'Me indicaron cuales eran mis funciones de acuerdo al puesto de trabajo.' },
      { id: 'A4', text: 'Me brindaron la colaboración necesaria para realizar mis labores.' },
      { id: 'A5', text: 'Recibí el apoyo y confianza del inmediato superior.' },
      { id: 'A6', text: 'Recibí el apoyo y confianza de mis compañeros de trabajo.' }
  ]},
  { id: 'B', title: 'RELACION CON EL INMEDIATO SUPERIOR', questions: [
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
  { id: 'D', title: 'RELACION CON LOS COMPAÑEROS DE TRABAJO', questions: [
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

const TOTAL_QUESTIONS = Object.keys(EMPTY_RESPONSES).length
const MAX_SCORE = TOTAL_QUESTIONS * 5

// ---- Helpers ----
function categoryAverage(responses, catId) {
  const cat = CATEGORIES.find(c => c.id === catId)
  if (!cat) return 0
  const vals = cat.questions.map(q => Number(responses?.[q.id] ?? 0))
  const sum = vals.reduce((a, b) => a + b, 0)
  return vals.length ? sum / vals.length : 0
}

function overallAverage(responses) {
  const vals = Object.values(responses || {}).map(v => Number(v) || 0)
  const sum = vals.reduce((a, b) => a + b, 0)
  return vals.length ? sum / vals.length : 0
}

function scoreColor(avg) {
  if (avg >= 4) return 'var(--success-color)'
  if (avg >= 3) return 'var(--warning-color)'
  return 'var(--danger-color)'
}

export default function ClimateSurveys() {
  const [personnel, setPersonnel] = useState([])
  const [surveys, setSurveys] = useState([])
  const [loading, setLoading] = useState(true)
  const [mostrandoForm, setMostrandoForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [detailSurvey, setDetailSurvey] = useState(null)
  const [filterEmployee, setFilterEmployee] = useState('')

  // IA
  const [loadingIA, setLoadingIA] = useState(false)
  const [iaAnalysis, setIaAnalysis] = useState(null)

  // Envío de campañas por email
  const [showSendModal, setShowSendModal] = useState(false)
  const [campaignName, setCampaignName] = useState('')
  const [campaignDesc, setCampaignDesc] = useState('')
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState(null)

  const [form, setForm] = useState({
    employee_id: '',
    survey_date: new Date().toISOString().substring(0, 10),
    evidence_url: '',
    notes: '',
    responses: { ...EMPTY_RESPONSES }
  })

  useEffect(() => {
    fetchPersonnel()
    fetchSurveys()
  }, [])

  const fetchPersonnel = async () => {
    const { data } = await supabase.from('personnel').select('id, full_name, email').order('full_name')
    setPersonnel(data || [])
  }

  const fetchSurveys = async () => {
    setLoading(true)
    const { data } = await supabase
      .from('climate_surveys')
      .select('*, personnel(full_name)')
      .order('survey_date', { ascending: false, nullsFirst: false })
    setSurveys(data || [])
    setLoading(false)
  }

  const resetForm = () => {
    setForm({
      employee_id: '',
      survey_date: new Date().toISOString().substring(0, 10),
      evidence_url: '',
      notes: '',
      responses: { ...EMPTY_RESPONSES }
    })
    setEditingId(null)
  }

  const handleNew = () => {
    resetForm()
    setMostrandoForm(true)
  }

  const handleCancel = () => {
    setMostrandoForm(false)
    resetForm()
  }

  const handleEdit = (s) => {
    setForm({
      employee_id: s.employee_id || '',
      survey_date: s.survey_date || new Date().toISOString().substring(0, 10),
      evidence_url: s.evidence_url || '',
      notes: s.notes || '',
      responses: { ...EMPTY_RESPONSES, ...(s.responses_json || {}) }
    })
    setEditingId(s.id)
    setMostrandoForm(true)
    setDetailSurvey(null)
  }

  const handleDelete = async (s) => {
    if (!await confirm(`¿Eliminar la encuesta de ${s.personnel?.full_name || 'este empleado'}?`)) return
    const { error } = await supabase.from('climate_surveys').delete().eq('id', s.id)
    if (error) return toast.error(error.message)
    setDetailSurvey(null)
    fetchSurveys()
  }

  const handleRatingChange = (qId, val) => {
    setForm({
      ...form,
      responses: { ...form.responses, [qId]: val }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.employee_id) return toast.warning('Selecciona un empleado')

    const total = Object.values(form.responses).reduce((a, b) => a + Number(b), 0)
    const payload = {
      employee_id: form.employee_id,
      responses_json: form.responses,
      total_score: total,
      survey_date: form.survey_date || null,
      evidence_url: form.evidence_url || null,
      notes: form.notes || null,
    }

    let error
    if (editingId) {
      ({ error } = await supabase.from('climate_surveys').update(payload).eq('id', editingId))
    } else {
      ({ error } = await supabase.from('climate_surveys').insert([payload]))
    }
    if (error) return toast.error(error.message)

    setMostrandoForm(false)
    resetForm()
    fetchSurveys()
  }

  // ---- Envío de invitaciones por email ----
  const openSendModal = () => {
    setCampaignName(`Clima Laboral · ${new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`)
    setCampaignDesc('')
    setSelectedIds(new Set())
    setSendResult(null)
    setShowSendModal(true)
  }

  const togglePerson = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = () => {
    const eligible = personnel.filter(p => p.email)
    if (selectedIds.size === eligible.length) setSelectedIds(new Set())
    else setSelectedIds(new Set(eligible.map(p => p.id)))
  }

  const handleSendCampaign = async () => {
    if (!campaignName.trim()) return toast.warning('Poné un nombre a la campaña')
    if (!selectedIds.size) return toast.warning('Selecciona al menos un empleado')

    setSending(true)
    setSendResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('send-survey-invitations', {
        body: {
          campaign_name: campaignName.trim(),
          description: campaignDesc.trim(),
          person_ids: Array.from(selectedIds),
          app_url: window.location.origin,
          expires_in_days: 14,
          from_name: 'Equipo de Calidad',
        }
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      setSendResult(data)
    } catch (err) {
      setSendResult({ error: err?.message || String(err) })
    } finally {
      setSending(false)
    }
  }

  // ---- Análisis IA agregado ----
  const handleAnalisisIA = async () => {
    if (!surveys.length) return toast.warning('Necesitas al menos una encuesta para analizar')
    setLoadingIA(true)
    setIaAnalysis(null)
    try {
      const resumen = surveys.slice(0, 30).map(s => ({
        fecha: s.survey_date || (s.created_at || '').substring(0, 10),
        empleado: s.personnel?.full_name || 'N/D',
        promedios_por_categoria: {
          A_insercion: categoryAverage(s.responses_json, 'A').toFixed(2),
          B_relacion_jefe: categoryAverage(s.responses_json, 'B').toFixed(2),
          C_liderazgo: categoryAverage(s.responses_json, 'C').toFixed(2),
          D_companeros: categoryAverage(s.responses_json, 'D').toFixed(2),
        },
        total: s.total_score,
      }))
      const prompt = `
Analiza los resultados agregados de estas ${resumen.length} encuestas de clima laboral (escala 1=muy malo, 5=excelente). Las categorías son:
A. Inserción al puesto, B. Relación con jefe inmediato, C. Liderazgo del jefe, D. Relación con compañeros.

Datos: ${JSON.stringify(resumen)}

Responde EXCLUSIVAMENTE con un JSON con este formato:
{
  "promedios_globales": { "A": 0.0, "B": 0.0, "C": 0.0, "D": 0.0, "general": 0.0 },
  "fortalezas": ["...", "..."],
  "areas_criticas": ["...", "..."],
  "recomendaciones": ["...", "...", "..."],
  "riesgo_general": "bajo|medio|alto"
}
`
      const respuesta = await consultarIA(
        prompt,
        'Eres un consultor experto en ISO 9001 cláusula 7.1.4 (ambiente para la operación de los procesos) y clima organizacional. Responde ÚNICAMENTE con el JSON pedido, sin markdown ni texto extra.'
      )
      let cleanText = respuesta.replace(/```json/g, '').replace(/```/g, '').trim()
      if (!cleanText.startsWith('{') && cleanText.includes('{')) cleanText = cleanText.substring(cleanText.indexOf('{'))
      if (!cleanText.endsWith('}') && cleanText.includes('}')) cleanText = cleanText.substring(0, cleanText.lastIndexOf('}') + 1)
      const data = JSON.parse(cleanText)
      setIaAnalysis(data)
    } catch (err) {
      toast.error('No pudimos procesarla. ' + (err?.message || ''))
    } finally {
      setLoadingIA(false)
    }
  }

  // ---- Filtrado y agregaciones para el dashboard ----
  const filteredSurveys = useMemo(() => {
    if (!filterEmployee) return surveys
    return surveys.filter(s => s.employee_id === filterEmployee)
  }, [surveys, filterEmployee])

  const dashboard = useMemo(() => {
    if (!filteredSurveys.length) return null
    const acc = { A: 0, B: 0, C: 0, D: 0, total: 0 }
    filteredSurveys.forEach(s => {
      acc.A += categoryAverage(s.responses_json, 'A')
      acc.B += categoryAverage(s.responses_json, 'B')
      acc.C += categoryAverage(s.responses_json, 'C')
      acc.D += categoryAverage(s.responses_json, 'D')
      acc.total += overallAverage(s.responses_json)
    })
    const n = filteredSurveys.length
    return {
      A: acc.A / n, B: acc.B / n, C: acc.C / n, D: acc.D / n,
      general: acc.total / n,
      count: n
    }
  }, [filteredSurveys])

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h2 style={{ margin: 0 }}>📊 Encuestas de Clima Laboral</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>Análisis de satisfacción y ambiente de trabajo (ISO 9001 - 7.1.4)</p>
        </div>
        {!mostrandoForm && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleAnalisisIA}
              className="btn btn-ghost"
              disabled={loadingIA || !surveys.length}
              title="Análisis agregado con IA"
            >
              {loadingIA ? <Loader2 className="animate-spin" size={16} /> : <Sparkles size={16} />}
              Analizar con IA
            </button>
            <button
              onClick={openSendModal}
              className="btn btn-ghost"
              title="Enviar invitaciones por email"
            >
              <MailPlus size={16} /> Enviar a empleados
            </button>
            <button onClick={handleNew} className="btn btn-primary">+ Nueva Encuesta</button>
          </div>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['7.1.4']} />

      {/* ===== Dashboard agregado ===== */}
      {!mostrandoForm && dashboard && (
        <div className="card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart3 size={18} /> Resumen agregado ({dashboard.count} encuesta{dashboard.count !== 1 ? 's' : ''})
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Filter size={14} style={{ color: 'var(--text-tertiary)' }} />
              <select
                className="form-select"
                style={{ minWidth: '220px', padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
                value={filterEmployee}
                onChange={e => setFilterEmployee(e.target.value)}
              >
                <option value="">Todos los empleados</option>
                {personnel.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
            <DashboardKPI label="Promedio general" value={dashboard.general} highlight />
            <DashboardKPI label="A · Inserción"    value={dashboard.A} />
            <DashboardKPI label="B · Jefe directo" value={dashboard.B} />
            <DashboardKPI label="C · Liderazgo"    value={dashboard.C} />
            <DashboardKPI label="D · Compañeros"   value={dashboard.D} />
          </div>
        </div>
      )}

      {/* ===== Análisis IA ===== */}
      {!mostrandoForm && iaAnalysis && (
        <div className="card" style={{
          marginBottom: '1.5rem', padding: '1.25rem',
          background: 'linear-gradient(135deg, #faf5ff, #f3e8ff)',
          border: '1px solid #d8b4fe'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6b21a8' }}>
              <Sparkles size={18} /> Análisis IA del clima laboral
            </h4>
            <button onClick={() => setIaAnalysis(null)} className="btn-ghost" style={{ padding: '0.25rem' }}>
              <X size={16} />
            </button>
          </div>
          {iaAnalysis.riesgo_general && (
            <div style={{ marginBottom: '0.75rem' }}>
              <span style={{
                padding: '0.2rem 0.6rem', borderRadius: '999px', fontSize: '0.75rem',
                background: iaAnalysis.riesgo_general === 'alto' ? '#fee2e2' : iaAnalysis.riesgo_general === 'medio' ? '#fef3c7' : '#dcfce7',
                color:      iaAnalysis.riesgo_general === 'alto' ? '#991b1b' : iaAnalysis.riesgo_general === 'medio' ? '#92400e' : '#166534',
                fontWeight: 600
              }}>
                Riesgo: {iaAnalysis.riesgo_general.toUpperCase()}
              </span>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
            <IAList title="✅ Fortalezas"        items={iaAnalysis.fortalezas} color="#166534" />
            <IAList title="⚠️ Áreas críticas"   items={iaAnalysis.areas_criticas} color="#991b1b" />
            <IAList title="💡 Recomendaciones" items={iaAnalysis.recomendaciones} color="#1e40af" />
          </div>
        </div>
      )}

      {/* ===== Formulario ===== */}
      {mostrandoForm && (
        <div className="card fade-in" style={{ marginBottom: '2rem', padding: '2rem' }}>
          <div style={{ borderBottom: '1px solid #eee', marginBottom: '2rem', paddingBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>{editingId ? 'Editar encuesta' : 'Formulario de Encuesta (FORM-53)'}</h3>
            <button onClick={handleCancel} className="btn-ghost">Cancelar</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
              <div className="form-group">
                <label className="form-label">Colaborador Evaluado *</label>
                <select required className="form-select" value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}>
                  <option value="">-- Seleccionar --</option>
                  {personnel.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Fecha de la encuesta</label>
                <input
                  type="date"
                  className="form-input"
                  value={form.survey_date}
                  onChange={e => setForm({ ...form, survey_date: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Link evidencia (PDF firmado)</label>
                <input
                  type="url"
                  className="form-input"
                  placeholder="https://drive.google.com/..."
                  value={form.evidence_url}
                  onChange={e => setForm({ ...form, evidence_url: e.target.value })}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label className="form-label">Observaciones del responsable</label>
              <textarea
                className="form-textarea"
                rows={2}
                placeholder="Contexto, comentarios verbales relevantes, condiciones de la entrevista..."
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {CATEGORIES.map(cat => {
              const avg = categoryAverage(form.responses, cat.id)
              return (
                <div key={cat.id} style={{ marginTop: '2.5rem' }}>
                  <h4 style={{
                    background: '#f8fafc', padding: '10px 14px', borderRadius: '4px',
                    color: 'var(--primary-color)', fontSize: '0.9rem',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: 0
                  }}>
                    <span>{cat.id}. {cat.title}</span>
                    <span style={{ fontSize: '0.85rem', color: scoreColor(avg) }}>
                      Promedio: {avg.toFixed(2)}
                    </span>
                  </h4>
                  <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: '1rem' }}>
                    <thead>
                      <tr style={{ fontSize: '0.8rem', color: '#64748b', textAlign: 'center' }}>
                        <th style={{ textAlign: 'left', padding: '10px' }}>Pregunta</th>
                        <th style={{ width: '50px' }}>5</th>
                        <th style={{ width: '50px' }}>4</th>
                        <th style={{ width: '50px' }}>3</th>
                        <th style={{ width: '50px' }}>2</th>
                        <th style={{ width: '50px' }}>1</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cat.questions.map(q => (
                        <tr key={q.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '12px 10px', fontSize: '0.9rem' }}>{q.id}. {q.text}</td>
                          {[5, 4, 3, 2, 1].map(num => (
                            <td key={num} style={{ textAlign: 'center' }}>
                              <input
                                type="radio"
                                name={q.id}
                                checked={form.responses[q.id] === num}
                                onChange={() => handleRatingChange(q.id, num)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })}

            <div style={{ marginTop: '3rem', textAlign: 'right', background: '#f8fafc', padding: '1.5rem', borderRadius: '8px' }}>
              <button type="submit" className="btn btn-primary" style={{ padding: '0.8rem 2.5rem' }}>
                <Send size={18} /> {editingId ? 'Guardar cambios' : 'Guardar Evaluación Final'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ===== Lista de encuestas ===== */}
      {!mostrandoForm && (
        <>
          {loading && <p style={{ color: '#64748b' }}>Cargando...</p>}
          {!loading && !surveys.length && (
            <div className="card" style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
              Todavía no hay encuestas registradas. Tocá <strong>+ Nueva Encuesta</strong> para crear la primera.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.5rem' }}>
            {filteredSurveys.map(s => {
              const avg = overallAverage(s.responses_json)
              const avgA = categoryAverage(s.responses_json, 'A')
              const avgB = categoryAverage(s.responses_json, 'B')
              const avgC = categoryAverage(s.responses_json, 'C')
              const avgD = categoryAverage(s.responses_json, 'D')
              const fecha = s.survey_date || (s.created_at || '').substring(0, 10)
              return (
                <div key={s.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <div style={{ background: 'var(--bg-color)', padding: '0.5rem', borderRadius: '50%' }}><User size={20} /></div>
                      <div>
                        <strong style={{ display: 'block' }}>{s.personnel?.full_name || '— Sin asignar —'}</strong>
                        <span style={{ fontSize: '0.8rem', color: '#64748b' }}>{fecha}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: scoreColor(avg) }}>
                        {avg.toFixed(2)} <span style={{ fontSize: '0.7rem', color: '#64748b' }}>/ 5</span>
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#64748b' }}>{s.total_score} / {MAX_SCORE} pts</span>
                    </div>
                  </div>

                  {/* Breakdown por categoría */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.4rem' }}>
                    <CategoryChip label="A" value={avgA} />
                    <CategoryChip label="B" value={avgB} />
                    <CategoryChip label="C" value={avgC} />
                    <CategoryChip label="D" value={avgD} />
                  </div>

                  <div style={{ height: '6px', background: '#f1f5f9', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${(s.total_score / MAX_SCORE) * 100}%`,
                      height: '100%',
                      background: scoreColor(avg)
                    }} />
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <button
                      onClick={() => setDetailSurvey(s)}
                      className="btn btn-ghost"
                      style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                    >
                      <Eye size={14} /> Ver detalle
                    </button>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {s.evidence_url && (
                        <a href={s.evidence_url} target="_blank" rel="noreferrer" className="btn-ghost" title="Evidencia" style={{ padding: '0.4rem' }}>
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <button onClick={() => handleEdit(s)} className="btn-ghost" title="Editar" style={{ padding: '0.4rem' }}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => handleDelete(s)} className="btn-ghost" title="Eliminar" style={{ padding: '0.4rem', color: 'var(--danger-color)' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* ===== Modal detalle (auditable) ===== */}
      {detailSurvey && createPortal((
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{
            background: 'white', maxWidth: '780px', width: '100%', padding: 0,
            maxHeight: '90vh', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.6)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <User size={18} /> {detailSurvey.personnel?.full_name || '—'}
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Fecha: {detailSurvey.survey_date || (detailSurvey.created_at || '').substring(0, 10)}
                </span>
              </div>
              <button onClick={() => setDetailSurvey(null)} className="btn-ghost" style={{ padding: '0.25rem' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ overflow: 'auto', padding: '1.25rem', display: 'grid', gap: '1.25rem' }}>
              {/* Resumen */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.5rem' }}>
                <DashboardKPI label="General" value={overallAverage(detailSurvey.responses_json)} highlight />
                {CATEGORIES.map(c => (
                  <DashboardKPI key={c.id} label={c.id} value={categoryAverage(detailSurvey.responses_json, c.id)} />
                ))}
              </div>

              {detailSurvey.notes && (
                <div style={{ background: '#f8fafc', padding: '0.75rem', borderRadius: '6px', fontSize: '0.9rem' }}>
                  <strong style={{ fontSize: '0.8rem', color: '#64748b' }}>Observaciones:</strong>
                  <p style={{ margin: '0.25rem 0 0 0' }}>{detailSurvey.notes}</p>
                </div>
              )}

              {detailSurvey.evidence_url && (
                <a href={detailSurvey.evidence_url} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}>
                  <ExternalLink size={14} /> Ver evidencia firmada
                </a>
              )}

              {/* Respuestas por categoría */}
              {CATEGORIES.map(cat => (
                <div key={cat.id}>
                  <h5 style={{
                    margin: 0, marginBottom: '0.5rem',
                    background: '#f8fafc', padding: '8px 12px', borderRadius: '4px',
                    color: 'var(--primary-color)', fontSize: '0.85rem',
                    display: 'flex', justifyContent: 'space-between'
                  }}>
                    <span>{cat.id}. {cat.title}</span>
                    <span style={{ color: scoreColor(categoryAverage(detailSurvey.responses_json, cat.id)) }}>
                      {categoryAverage(detailSurvey.responses_json, cat.id).toFixed(2)} / 5
                    </span>
                  </h5>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <tbody>
                      {cat.questions.map(q => {
                        const val = Number(detailSurvey.responses_json?.[q.id] ?? 0)
                        return (
                          <tr key={q.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 10px', color: '#64748b', width: '40px' }}>{q.id}</td>
                            <td style={{ padding: '8px 10px' }}>{q.text}</td>
                            <td style={{ padding: '8px 10px', textAlign: 'right', fontWeight: 600, color: scoreColor(val), width: '50px' }}>
                              {val}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => handleDelete(detailSurvey)} className="btn btn-ghost" style={{ color: 'var(--danger-color)' }}>
                <Trash2 size={14} /> Eliminar
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setDetailSurvey(null)} className="btn btn-ghost">Cerrar</button>
                <button onClick={() => handleEdit(detailSurvey)} className="btn btn-primary">
                  <Pencil size={14} /> Editar
                </button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ===== Modal envío campaña ===== */}
      {showSendModal && createPortal((
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{
            background: 'white', maxWidth: '620px', width: '100%', padding: 0,
            maxHeight: '90vh', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
            border: '1px solid rgba(255,255,255,0.6)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
              <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <MailPlus size={18} /> Enviar encuesta por email
              </h4>
              <button onClick={() => setShowSendModal(false)} className="btn-ghost" style={{ padding: '0.25rem' }}>
                <X size={18} />
              </button>
            </div>

            {/* Resultado del envío */}
            {sendResult ? (
              <div style={{ padding: '1.5rem', overflow: 'auto' }}>
                {sendResult.error ? (
                  <div style={{ padding: '1rem', background: '#fee2e2', borderRadius: '8px', color: '#991b1b' }}>
                    <strong><AlertTriangle size={16} style={{ verticalAlign: 'middle' }} /> No pudimos enviar:</strong>
                    <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>{sendResult.error}</p>
                  </div>
                ) : (
                  <>
                    <div style={{ padding: '1rem', background: '#dcfce7', borderRadius: '8px', color: '#166534', marginBottom: '1rem' }}>
                      <strong><Check size={16} style={{ verticalAlign: 'middle' }} /> Envío completado</strong>
                      <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem' }}>
                        Enviados: <strong>{sendResult.sent}</strong> · Fallidos: <strong>{sendResult.failed}</strong>
                      </p>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '0.78rem' }}>
                          <th style={{ textAlign: 'left', padding: '8px 10px' }}>Empleado</th>
                          <th style={{ textAlign: 'left', padding: '8px 10px' }}>Email</th>
                          <th style={{ textAlign: 'left', padding: '8px 10px' }}>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(sendResult.results || []).map(r => (
                          <tr key={r.person_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <td style={{ padding: '8px 10px' }}>{r.full_name}</td>
                            <td style={{ padding: '8px 10px', color: '#64748b' }}>{r.email}</td>
                            <td style={{ padding: '8px 10px' }}>
                              {r.ok
                                ? <span style={{ color: '#166534' }}>✓ Enviado</span>
                                : <span style={{ color: '#991b1b' }} title={r.error}>✗ {r.error || 'Error'}</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </>
                )}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
                  <button onClick={() => setShowSendModal(false)} className="btn btn-primary">Cerrar</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ padding: '1.25rem', overflow: 'auto', display: 'grid', gap: '1rem' }}>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.85rem' }}>Nombre de la campaña *</label>
                    <input
                      className="form-input"
                      value={campaignName}
                      onChange={e => setCampaignName(e.target.value)}
                      placeholder="Clima Laboral · Q2 2026"
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ fontSize: '0.85rem' }}>Mensaje (opcional)</label>
                    <textarea
                      className="form-textarea"
                      rows={2}
                      value={campaignDesc}
                      onChange={e => setCampaignDesc(e.target.value)}
                      placeholder="Mensaje breve que verán los empleados en el email..."
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <label className="form-label" style={{ fontSize: '0.85rem', margin: 0 }}>
                        Destinatarios ({selectedIds.size} seleccionados)
                      </label>
                      <button type="button" onClick={toggleAll} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}>
                        {selectedIds.size === personnel.filter(p => p.email).length ? 'Limpiar' : 'Seleccionar todos'}
                      </button>
                    </div>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', maxHeight: '280px', overflow: 'auto' }}>
                      {!personnel.length && (
                        <div style={{ padding: '1rem', color: '#94a3b8', textAlign: 'center', fontSize: '0.85rem' }}>
                          No hay empleados cargados.
                        </div>
                      )}
                      {personnel.map(p => {
                        const hasEmail = !!p.email
                        return (
                          <label key={p.id} style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem',
                            padding: '0.5rem 0.75rem', borderBottom: '1px solid #f1f5f9',
                            cursor: hasEmail ? 'pointer' : 'not-allowed',
                            opacity: hasEmail ? 1 : 0.5,
                            background: selectedIds.has(p.id) ? '#eef2ff' : 'transparent'
                          }}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(p.id)}
                              disabled={!hasEmail}
                              onChange={() => togglePerson(p.id)}
                            />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '0.9rem' }}>{p.full_name}</div>
                              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                {hasEmail ? p.email : 'Sin email — cárgalo en Personal'}
                              </div>
                            </div>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748b' }}>
                    Cada empleado recibirá un link personal y único, válido por 14 días.
                    Al responder, la encuesta se carga automáticamente en este módulo.
                  </p>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0' }}>
                  <button onClick={() => setShowSendModal(false)} className="btn btn-ghost" disabled={sending}>Cancelar</button>
                  <button onClick={handleSendCampaign} className="btn btn-primary" disabled={sending || !selectedIds.size}>
                    {sending ? <><Loader2 className="animate-spin" size={14} /> Enviando...</> : <><Send size={14} /> Enviar a {selectedIds.size} empleado{selectedIds.size !== 1 ? 's' : ''}</>}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      ), document.body)}
    </div>
  )
}

// ----- Subcomponentes -----
function DashboardKPI({ label, value, highlight }) {
  const v = Number(value) || 0
  return (
    <div style={{
      background: highlight ? '#eef2ff' : '#f8fafc',
      borderRadius: '8px', padding: '0.6rem 0.75rem',
      textAlign: 'center',
      border: highlight ? '1px solid #c7d2fe' : '1px solid #e2e8f0'
    }}>
      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: scoreColor(v) }}>{v.toFixed(2)}</div>
    </div>
  )
}

function CategoryChip({ label, value }) {
  const v = Number(value) || 0
  return (
    <div style={{
      background: '#f8fafc', borderRadius: '6px', padding: '0.35rem 0.5rem',
      textAlign: 'center', border: '1px solid #e2e8f0'
    }}>
      <div style={{ fontSize: '0.65rem', color: '#64748b' }}>{label}</div>
      <div style={{ fontSize: '0.95rem', fontWeight: 600, color: scoreColor(v) }}>{v.toFixed(1)}</div>
    </div>
  )
}

function IAList({ title, items, color }) {
  if (!items || !items.length) return null
  return (
    <div>
      <strong style={{ fontSize: '0.85rem', color }}>{title}</strong>
      <ul style={{ margin: '0.4rem 0 0 0', paddingLeft: '1.1rem', fontSize: '0.85rem', color: '#334155' }}>
        {items.map((it, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{it}</li>)}
      </ul>
    </div>
  )
}
