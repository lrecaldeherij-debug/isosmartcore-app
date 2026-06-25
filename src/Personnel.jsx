import { useEffect, useMemo, useState, useRef } from 'react'
import { createPortal } from 'react-dom'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  Users, Plus, Search, Filter, Eye, Pencil, Trash2, X, AlertTriangle,
  Sparkles, Loader2, ExternalLink, FileText, GraduationCap, Award,
  CheckCircle2, Upload, Link as LinkIcon, ClipboardCheck, History,
  Briefcase, Workflow, Calendar
} from 'lucide-react'
import ModalLinkEvidence from './ModalLinkEvidence'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import ExcelImporter from './ExcelImporter'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

// ─────── Constantes ───────
const STATUS_OPTIONS = ['Competente', 'En Formación', 'Brecha Detectada', 'Inactivo']

const STATUS_COLORS = {
  'Competente':       { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  'En Formación':     { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  'Brecha Detectada': { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' },
  'Inactivo':         { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
}

const EMPTY_FORM = {
  full_name: '', document_id: '', start_date: '',
  email: '', phone: '',
  job_id: '', process_id: '',
  education: '', education_institution: '', education_year: '',
  experience: '', skills: '',
  evidence_url: '',
  status: 'Competente',
  next_evaluation_date: ''
}

// ─────── Helpers IA ───────
function extractFirstJson(text) {
  if (!text) return null
  const start = text.indexOf('{') !== -1 ? text.indexOf('{') : text.indexOf('[')
  if (start === -1) return null
  let depth = 0, inStr = false, esc = false
  const open = text[start], close = open === '{' ? '}' : ']'
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (esc) { esc = false; continue }
    if (c === '\\') { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === open) depth++
    else if (c === close) { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)) } catch { return null } } }
  }
  return null
}

// Drive link helpers
function convertDriveLinkToDirect(value) {
  if (!value || typeof value !== 'string') return value
  const v = value.trim()
  const m = v.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/)
  if (m && m[1]) return `https://drive.google.com/file/d/${m[1]}/view`
  const m2 = v.match(/[?&]id=([a-zA-Z0-9_-]{10,})/)
  if (m2 && m2[1]) return `https://drive.google.com/file/d/${m2[1]}/view`
  return v
}
function isValidUrl(value) {
  try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}

// ─────── Subcomponentes ───────
function KPI({ icon: Icon, label, value, color = '#0ea5e9', sub }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>{label}</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  )
}

function FormSection({ title, children }) {
  return (
    <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px dashed #e5e7eb' }}>
      <h4 style={{ margin: '0 0 8px 0', color: '#1f2937', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</h4>
      {children}
    </div>
  )
}

// ─────── Componente ───────
export default function Personnel() {
  const [items, setItems] = useState([])
  const [jobs, setJobs] = useState([])
  const [processes, setProcesses] = useState([])
  const [trainingsByPerson, setTrainingsByPerson] = useState({})
  const [evalByPerson, setEvalByPerson] = useState({})
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [detailItem, setDetailItem] = useState(null)
  const [uploadingIds, setUploadingIds] = useState([])

  // Evaluación
  const [evaluateFor, setEvaluateFor] = useState(null)
  const [evalForm, setEvalForm] = useState({ evaluation_date: new Date().toISOString().slice(0, 10), score: 4, evaluator_name: '', notes: '', evidence_url: '' })
  const [savingEval, setSavingEval] = useState(false)

  // Filtros
  const [filterStatus, setFilterStatus] = useState('')
  const [filterJob, setFilterJob] = useState('')
  const [filterProcess, setFilterProcess] = useState('')
  const [search, setSearch] = useState('')

  // IA
  const [loadingGap, setLoadingGap] = useState(false)
  const [gapResult, setGapResult] = useState(null)
  const [loadingDotacion, setLoadingDotacion] = useState(false)
  const [dotacionResult, setDotacionResult] = useState(null)
  const [showDotacionModal, setShowDotacionModal] = useState(false)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true); setTableError(null)
    const main = await supabase.from('personnel').select('*').order('full_name')
    if (main.error) { setTableError(main.error.message); setItems([]); setLoading(false); return }
    setItems(main.data || [])

    const [jb, pr] = await Promise.all([
      supabase.from('job_descriptions').select('id, title, code, competencies_json').order('title'),
      supabase.from('processes').select('id, name, process_type').order('name')
    ])
    setJobs(jb.data || [])
    setProcesses(pr.data || [])

    if (main.data?.length) {
      const ids = main.data.map(d => d.id)
      const [tr, ev] = await Promise.all([
        supabase.from('training_attendees').select('person_id, training:training_id (course_name, training_date)').in('person_id', ids),
        supabase.from('performance_evaluations').select('*').in('person_id', ids).order('evaluation_date', { ascending: false })
      ])
      const grp = {}
      for (const t of tr.data || []) {
        if (!grp[t.person_id]) grp[t.person_id] = []
        if (t.training) grp[t.person_id].push({ course: t.training.course_name, date: t.training.training_date })
      }
      setTrainingsByPerson(grp)

      const eg = {}
      for (const e of ev.data || []) {
        if (!eg[e.person_id]) eg[e.person_id] = { history: [] }
        eg[e.person_id].history.push(e)
      }
      for (const v of Object.values(eg)) {
        v.lastScore = v.history[0]?.score
        v.lastDate = v.history[0]?.evaluation_date
      }
      setEvalByPerson(eg)
    }
    setLoading(false)
  }

  // ─────── Form helpers ───────
  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null) }
  const handleNew = () => { resetForm(); setShowForm(true) }
  const handleCancel = () => { resetForm(); setShowForm(false) }

  const handleEdit = (item) => {
    setForm({
      ...EMPTY_FORM,
      ...Object.fromEntries(Object.keys(EMPTY_FORM).map(k => [k, item[k] ?? EMPTY_FORM[k]]))
    })
    setEditingId(item.id); setShowForm(true); setDetailItem(null)
  }

  const handleDelete = async (id) => {
    if (!await confirm('¿Eliminar a este empleado?', { tone: 'danger', confirmText: 'Eliminar' })) return
    const { error } = await supabase.from('personnel').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Empleado eliminado')
    setDetailItem(null); fetchAll()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const selectedJob = jobs.find(j => j.id === form.job_id)
    const payload = {
      ...form,
      job_title: selectedJob?.title || form.job_title || '',
      education_year: form.education_year ? parseInt(form.education_year) : null,
      start_date: form.start_date || null,
      next_evaluation_date: form.next_evaluation_date || null,
      job_id: form.job_id || null,
      process_id: form.process_id || null,
      document_id: form.document_id || null,
      email: form.email || null,
      phone: form.phone || null,
      education_institution: form.education_institution || null,
      evidence_url: form.evidence_url || null
    }

    if (editingId) {
      const prev = items.find(i => i.id === editingId)
      const changes = []
      Object.keys(payload).forEach(k => {
        if (prev && JSON.stringify(prev[k] ?? '') !== JSON.stringify(payload[k] ?? '')) {
          changes.push({ field: k, from: prev[k] ?? null, to: payload[k] ?? null })
        }
      })
      payload.change_log = [...(prev?.change_log || []), { at: new Date().toISOString(), changes }]
      const { error } = await supabase.from('personnel').update(payload).eq('id', editingId)
      if (error) return toast.error(error.message)
      toast.success('Empleado actualizado')
    } else {
      payload.change_log = [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: payload.full_name }] }]
      const { error } = await supabase.from('personnel').insert([payload])
      if (error) return toast.error(error.message)
      toast.success('Empleado registrado')
    }
    setShowForm(false); resetForm(); fetchAll()
  }

  // ─────── Evaluación ───────
  const openEvaluate = (person) => {
    setEvaluateFor(person)
    setEvalForm({ evaluation_date: new Date().toISOString().slice(0, 10), score: 4, evaluator_name: '', notes: '', evidence_url: '' })
  }
  const handleSaveEvaluation = async () => {
    if (!evaluateFor) return
    const score = Number(evalForm.score)
    if (!Number.isFinite(score) || score < 1 || score > 5) return toast.warning('Score debe ser 1-5')
    setSavingEval(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error } = await supabase.from('performance_evaluations').insert([{
        person_id: evaluateFor.id,
        evaluation_date: evalForm.evaluation_date, score,
        evaluator_name: evalForm.evaluator_name || null,
        notes: evalForm.notes || null,
        evidence_url: evalForm.evidence_url || null,
        recorded_by: user?.id
      }])
      if (error) throw new Error(error.message)
      // Calcular próxima evaluación a 12 meses
      const next = new Date(evalForm.evaluation_date)
      next.setMonth(next.getMonth() + 12)
      await supabase.from('personnel').update({ next_evaluation_date: next.toISOString().slice(0, 10) }).eq('id', evaluateFor.id)
      toast.success('Evaluación registrada')
      setEvaluateFor(null); fetchAll()
    } catch (e) {
      toast.error('Error: ' + e.message)
    }
    setSavingEval(false)
  }

  // ─────── Upload archivo (concientización) ───────
  const uploadFileAndConfirm = async (id, file) => {
    if (!file) return
    const maxSize = 5 * 1024 * 1024
    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
    if (!allowed.includes(file.type)) return toast.warning('Tipo no permitido. Solo PDF/JPG/PNG')
    if (file.size > maxSize) return toast.warning('Máximo 5 MB')

    setUploadingIds(prev => [...prev, id])
    const today = new Date().toISOString().slice(0, 10)
    try {
      const orig = file.name || 'file'
      const norm = orig.normalize ? orig.normalize('NFKD').replace(/[̀-ͯ]/g, '') : orig
      const safe = norm.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '')
      const path = `conc/${uuidv4()}-${safe}`
      const { error: upErr } = await supabase.storage.from('evidencias-sgc').upload(path, file)
      if (upErr) { toast.error('Error subida: ' + upErr.message); return }
      const { data: urlData } = supabase.storage.from('evidencias-sgc').getPublicUrl(path)
      await supabase.from('personnel').update({ awareness_date: today, awareness_file_url: urlData?.publicUrl || null }).eq('id', id)
      toast.success('Concientización registrada')
      fetchAll()
    } finally {
      setUploadingIds(prev => prev.filter(x => x !== id))
    }
  }

  // ─────── IA: brecha de competencia ───────
  const analizarBrechaIA = async (person) => {
    if (!person.job_id) return toast.warning('Asigna primero un perfil de cargo formal al empleado')
    const job = jobs.find(j => j.id === person.job_id)
    if (!job?.competencies_json) return toast.warning('El perfil de cargo no tiene competencias requeridas. Edítalo en Roles 5.3')
    setLoadingGap(true); setGapResult({ person, analysis: null })
    try {
      const req = job.competencies_json || {}
      const actual = {
        educacion: person.education + (person.education_institution ? ' (' + person.education_institution + ')' : '') + (person.education_year ? ' ' + person.education_year : ''),
        experiencia: person.experience || 'N/D',
        habilidades: person.skills || 'N/D'
      }
      const prompt = `Eres consultor ISO 9001. Compara las competencias REQUERIDAS por el cargo con las DECLARADAS del empleado y devuelve un análisis de brecha (ISO 7.2).

CARGO: ${job.title}

REQUERIDO:
${JSON.stringify(req, null, 2)}

EMPLEADO: ${person.full_name}
DECLARADO:
${JSON.stringify(actual, null, 2)}

Devuelve SOLO JSON, sin markdown:
{
  "evaluacion_global": "Cubre" | "Brecha menor" | "Brecha mayor",
  "areas_cubiertas": ["..."],
  "areas_con_brecha": [
    { "area": "educacion|formacion|experiencia|habilidades", "brecha": "qué falta", "recomendacion": "qué hacer (curso, mentoría, etc)" }
  ],
  "resumen": "1-2 líneas"
}`
      const raw = await consultarIA(prompt, 'Devuelve únicamente JSON válido.')
      const data = extractFirstJson(raw)
      if (!data) throw new Error('IA no devolvió análisis')
      setGapResult({ person, analysis: data })

      // Guardar resumen + actualizar status
      let newStatus = person.status
      if (data.evaluacion_global === 'Brecha mayor') newStatus = 'Brecha Detectada'
      else if (data.evaluacion_global === 'Brecha menor') newStatus = 'En Formación'
      else if (data.evaluacion_global === 'Cubre') newStatus = 'Competente'

      await supabase.from('personnel').update({
        competency_gap: data.resumen,
        status: newStatus,
        change_log: [...(person.change_log || []), { at: new Date().toISOString(), changes: [{ field: 'gap_analyzed', from: null, to: data.evaluacion_global }] }]
      }).eq('id', person.id)
      fetchAll()
    } catch (e) {
      toast.error('Error IA: ' + e.message)
      setGapResult(null)
    }
    setLoadingGap(false)
  }

  // ─────── IA: análisis de dotación ───────
  const analizarDotacionIA = async () => {
    setLoadingDotacion(true); setShowDotacionModal(true); setDotacionResult(null)
    try {
      const procData = processes.map(p => ({ id: p.id, name: p.name, type: p.process_type }))
      const empData = items.map(e => ({
        name: e.full_name, job: e.job_title || 'sin cargo',
        process: processes.find(p => p.id === e.process_id)?.name || 'sin asignar',
        status: e.status
      }))
      const jobData = jobs.map(j => ({ title: j.title, code: j.code }))

      const prompt = `Eres consultor ISO 9001 experto en RRHH. Analiza la DOTACIÓN actual y detecta brechas según ISO 7.1.2.

PROCESOS DEL SGC:
${JSON.stringify(procData, null, 2)}

PERFILES DE CARGO DEFINIDOS:
${JSON.stringify(jobData, null, 2)}

EMPLEADOS ACTUALES:
${JSON.stringify(empData, null, 2)}

Devuelve SOLO JSON, sin markdown:
{
  "evaluacion_global": "Adecuada" | "Mejorable" | "Insuficiente",
  "procesos_sin_personal": ["..."],
  "cargos_sin_titular": ["..."],
  "recomendaciones": [
    { "tipo": "Contratar|Capacitar|Reasignar", "detalle": "qué hacer" }
  ],
  "resumen": "1-2 líneas"
}`
      const raw = await consultarIA(prompt, 'Devuelve únicamente JSON válido.')
      const data = extractFirstJson(raw)
      if (!data) throw new Error('IA no devolvió análisis')
      setDotacionResult(data)
    } catch (e) {
      toast.error('Error IA: ' + e.message)
      setShowDotacionModal(false)
    }
    setLoadingDotacion(false)
  }

  // ─────── Filtros + stats ───────
  const filtered = useMemo(() => items.filter(it => {
    if (filterStatus && it.status !== filterStatus) return false
    if (filterJob && it.job_id !== filterJob) return false
    if (filterProcess && it.process_id !== filterProcess) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [it.full_name, it.job_title, it.document_id, it.email, it.skills].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [items, filterStatus, filterJob, filterProcess, search])

  const today = new Date().toISOString().slice(0, 10)
  const stats = useMemo(() => ({
    total: items.length,
    competentes: items.filter(i => i.status === 'Competente').length,
    enFormacion: items.filter(i => i.status === 'En Formación').length,
    brechas: items.filter(i => i.status === 'Brecha Detectada').length,
    sinEvidencia: items.filter(i => !i.evidence_url).length,
    sinConcientizar: items.filter(i => !i.awareness_date).length,
    evalVencida: items.filter(i => i.next_evaluation_date && i.next_evaluation_date < today).length
  }), [items, today])

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1f2937', margin: 0 }}>
            <Users size={22} /> Talento Humano
          </h2>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: 13 }}>ISO 7.1.2 / 7.2 — Personas y competencia</p>
        </div>
        {!showForm && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={analizarDotacionIA} disabled={loadingDotacion || items.length === 0}
              style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              {loadingDotacion ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Analizar dotación
            </button>
            <ExcelImporter templateKey="personnel" onImported={fetchAll} />
            <button onClick={handleNew}
              style={{ padding: '8px 14px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <Plus size={16} /> Nuevo empleado
            </button>
          </div>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['7.1.2']} />

      {tableError && (
        <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13 }}>
          <strong>Tabla no encontrada:</strong> {tableError}. Aplica <code>iso_migration_v50_personnel_auditable.sql</code>.
        </div>
      )}

      {/* Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, margin: '16px 0' }}>
        <KPI icon={Users} label="Total" value={stats.total} color="#0ea5e9" />
        <KPI icon={CheckCircle2} label="Competentes" value={stats.competentes} color="#16a34a" />
        <KPI icon={GraduationCap} label="En Formación" value={stats.enFormacion} color="#f59e0b" />
        <KPI icon={AlertTriangle} label="Brechas" value={stats.brechas} color="#dc2626" />
        <KPI icon={FileText} label="Sin evidencia" value={stats.sinEvidencia} color="#7c3aed" />
        <KPI icon={ClipboardCheck} label="Sin concientizar" value={stats.sinConcientizar} color="#0891b2" />
        <KPI icon={Calendar} label="Eval. vencida" value={stats.evalVencida} color="#dc2626" />
      </div>

      {/* Filtros */}
      {!showForm && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#9ca3af' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
              style={{ width: '100%', padding: '8px 8px 8px 30px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
          </div>
          <Filter size={14} color="#6b7280" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
            <option value="">Estado: Todos</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterJob} onChange={e => setFilterJob(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
            <option value="">Cargo: Todos</option>
            {jobs.map(j => <option key={j.id} value={j.id}>{j.title}</option>)}
          </select>
          <select value={filterProcess} onChange={e => setFilterProcess(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
            <option value="">Proceso: Todos</option>
            {processes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}

      {/* FORM */}
      {showForm && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px 0', color: '#1f2937' }}>{editingId ? 'Editar' : 'Nuevo'} empleado</h3>
          <form onSubmit={handleSubmit}>
            <FormSection title="Identificación">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                <Field label="Nombre completo *" required value={form.full_name} onChange={v => setForm({ ...form, full_name: v })} />
                <Field label="Documento (CI/DNI)" value={form.document_id} onChange={v => setForm({ ...form, document_id: v })} />
                <Field label="Fecha ingreso" type="date" value={form.start_date} onChange={v => setForm({ ...form, start_date: v })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <Field label="Email" type="email" value={form.email} onChange={v => setForm({ ...form, email: v })} />
                <Field label="Teléfono" value={form.phone} onChange={v => setForm({ ...form, phone: v })} />
              </div>
            </FormSection>

            <FormSection title="Cargo, proceso y competencia">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 10 }}>
                <LinkSelect label="Cargo (perfil ISO 5.3)" value={form.job_id} onChange={v => setForm({ ...form, job_id: v })}
                  options={[{ id: '', label: '— sin asignar —' }, ...jobs.map(j => ({ id: j.id, label: `${j.title} (${j.code || 's/c'})` }))]} />
                <LinkSelect label="Proceso donde participa" value={form.process_id} onChange={v => setForm({ ...form, process_id: v })}
                  options={[{ id: '', label: '— sin asignar —' }, ...processes.map(p => ({ id: p.id, label: `${p.name} (${p.process_type})` }))]} />
                <SelectField label="Estado competencia" value={form.status} options={STATUS_OPTIONS} onChange={v => setForm({ ...form, status: v })} />
              </div>
            </FormSection>

            <FormSection title="Educación y experiencia">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 10 }}>
                <Field label="Formación (título)" value={form.education} onChange={v => setForm({ ...form, education: v })} placeholder="Ej: Ing. Industrial" />
                <Field label="Institución" value={form.education_institution} onChange={v => setForm({ ...form, education_institution: v })} />
                <Field label="Año" type="number" value={form.education_year} onChange={v => setForm({ ...form, education_year: v })} />
              </div>
              <div style={{ marginTop: 10 }}>
                <Field label="Experiencia previa" value={form.experience} onChange={v => setForm({ ...form, experience: v })} />
              </div>
              <div style={{ marginTop: 10 }}>
                <TextArea label="Habilidades clave" rows={2} value={form.skills} onChange={v => setForm({ ...form, skills: v })} />
              </div>
            </FormSection>

            <FormSection title="Evidencia y próxima evaluación">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <Field label="📂 Link CV / título / certificados" value={form.evidence_url} onChange={v => setForm({ ...form, evidence_url: v })} placeholder="https://drive.google.com/..." />
                <Field label="Próxima evaluación" type="date" value={form.next_evaluation_date} onChange={v => setForm({ ...form, next_evaluation_date: v })} />
              </div>
            </FormSection>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={handleCancel}
                style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button type="submit"
                style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                {editingId ? 'Guardar' : 'Crear empleado'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CARDS */}
      {!showForm && (loading ? <p>Cargando...</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#cbd5e1' }}>
              <Users size={48} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p style={{ margin: 0 }}>Sin empleados. Carga el primero o usa Excel.</p>
            </div>
          )}
          {filtered.map(item => {
            const st = STATUS_COLORS[item.status] || STATUS_COLORS['Competente']
            const ev = evalByPerson[item.id]
            const trs = trainingsByPerson[item.id] || []
            const evalVencida = item.next_evaluation_date && item.next_evaluation_date < today
            return (
              <div key={item.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, borderLeft: `5px solid ${st.color}`, padding: 14, cursor: 'pointer' }}
                onClick={() => setDetailItem(item)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ margin: 0, fontSize: 15, color: '#111827' }}>{item.full_name}</h4>
                    <div style={{ fontSize: 12, color: '#0ea5e9', fontWeight: 600 }}>{item.job_title || 'Sin cargo'}</div>
                    {item.document_id && <div style={{ fontSize: 11, color: '#94a3b8' }}>Doc: {item.document_id}</div>}
                  </div>
                  <span style={{ padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.color, fontSize: 10, fontWeight: 700, border: `1px solid ${st.border}` }}>{item.status}</span>
                </div>

                <div style={{ marginTop: 8, fontSize: 12, color: '#475569', display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {item.education && <div>🎓 {item.education}</div>}
                  {item.process_id && processes.find(p => p.id === item.process_id) && (
                    <div>⚙️ {processes.find(p => p.id === item.process_id).name}</div>
                  )}
                </div>

                <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                  {ev?.lastScore !== undefined ? (
                    <span><strong>📊</strong> <span style={{ color: ev.lastScore >= 4 ? '#16a34a' : ev.lastScore >= 3 ? '#f59e0b' : '#dc2626', fontWeight: 700 }}>{ev.lastScore}/5</span> · {ev.history.length} eval.</span>
                  ) : (
                    <span style={{ color: '#94a3b8' }}>Sin evaluar</span>
                  )}
                  {trs.length > 0 && <span style={{ fontSize: 11, color: '#1d4ed8' }}>🎓 {trs.length} cap.</span>}
                </div>

                {evalVencida && (
                  <div style={{ marginTop: 6, padding: 4, background: '#fee2e2', color: '#991b1b', borderRadius: 4, fontSize: 10, fontWeight: 700, textAlign: 'center' }}>
                    ⚠️ EVAL. VENCIDA ({item.next_evaluation_date})
                  </div>
                )}

                <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9', display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button onClick={(e) => { e.stopPropagation(); openEvaluate(item) }}
                    style={{ flex: 1, padding: 4, fontSize: 10, background: '#eff6ff', color: '#1d4ed8', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                    + Evaluar
                  </button>
                  {item.job_id && (
                    <button onClick={(e) => { e.stopPropagation(); analizarBrechaIA(item) }} disabled={loadingGap}
                      style={{ flex: 1, padding: 4, fontSize: 10, background: '#faf5ff', color: '#7c3aed', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}>
                      {loadingGap && gapResult?.person?.id === item.id ? '...' : 'Analizar brecha'}
                    </button>
                  )}
                  <button onClick={(e) => { e.stopPropagation(); handleEdit(item) }}
                    style={{ padding: 4, fontSize: 10, background: 'transparent', color: '#f59e0b', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                    <Pencil size={12} />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); handleDelete(item.id) }}
                    style={{ padding: 4, fontSize: 10, background: 'transparent', color: '#6b7280', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {/* MODAL DETALLE */}
      {detailItem && createPortal(
        <ModalShell onClose={() => setDetailItem(null)} title={detailItem.full_name} wide>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: 12, background: '#f8fafc', borderRadius: 6, fontSize: 12 }}>
            <Meta label="Cargo" value={detailItem.job_title} />
            <Meta label="Doc" value={detailItem.document_id} />
            <Meta label="Estado" value={detailItem.status} />
            <Meta label="Ingreso" value={detailItem.start_date} />
            <Meta label="Email" value={detailItem.email} />
            <Meta label="Teléfono" value={detailItem.phone} />
            <Meta label="Próx. eval" value={detailItem.next_evaluation_date} />
            <Meta label="Proceso" value={processes.find(p => p.id === detailItem.process_id)?.name} />
          </div>

          <DetailSection title="Educación y experiencia">
            <DetailRow label="Educación" value={`${detailItem.education || '—'}${detailItem.education_institution ? ' · ' + detailItem.education_institution : ''}${detailItem.education_year ? ' (' + detailItem.education_year + ')' : ''}`} />
            <DetailRow label="Experiencia" value={detailItem.experience} />
            <DetailRow label="Habilidades" value={detailItem.skills} />
          </DetailSection>

          {detailItem.competency_gap && (
            <DetailSection title="Análisis de brecha de competencia (IA)">
              <div style={{ padding: 10, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, fontSize: 13, color: '#581c87' }}>
                {detailItem.competency_gap}
              </div>
            </DetailSection>
          )}

          <DetailSection title="Histórico de evaluaciones">
            {(() => {
              const list = evalByPerson[detailItem.id]?.history || []
              if (!list.length) return <EmptyHint />
              return (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                    <th style={{ padding: 6 }}>Fecha</th><th style={{ padding: 6 }}>Score</th><th style={{ padding: 6 }}>Evaluador</th><th style={{ padding: 6 }}>Notas</th>
                  </tr></thead>
                  <tbody>
                    {list.map(ev => (
                      <tr key={ev.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ padding: 6 }}>{ev.evaluation_date}</td>
                        <td style={{ padding: 6, fontWeight: 700 }}>{ev.score}/5</td>
                        <td style={{ padding: 6 }}>{ev.evaluator_name || '—'}</td>
                        <td style={{ padding: 6, color: '#6b7280' }}>{ev.notes?.slice(0, 80) || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })()}
          </DetailSection>

          <DetailSection title="Capacitaciones recibidas">
            {(() => {
              const list = trainingsByPerson[detailItem.id] || []
              if (!list.length) return <EmptyHint />
              return (
                <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13 }}>
                  {list.map((t, i) => <li key={i}>{t.course} <span style={{ color: '#94a3b8' }}>· {new Date(t.date).toLocaleDateString()}</span></li>)}
                </ul>
              )
            })()}
          </DetailSection>

          <DetailSection title="Evidencias y concientización">
            {detailItem.evidence_url && (
              <a href={detailItem.evidence_url} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9', display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                📂 Ver CV/certificados <ExternalLink size={12} />
              </a>
            )}
            <ConscientizacionBadge item={detailItem} uploadingIds={uploadingIds} setUploadingIds={setUploadingIds} uploadFileAndConfirm={uploadFileAndConfirm} fetchItems={fetchAll} />
          </DetailSection>

          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => openEvaluate(detailItem)} style={{ padding: '8px 14px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ClipboardCheck size={14} /> Evaluar desempeño
            </button>
            {detailItem.job_id && (
              <button onClick={() => analizarBrechaIA(detailItem)} disabled={loadingGap}
                style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {loadingGap ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Analizar brecha
              </button>
            )}
            <button onClick={() => handleEdit(detailItem)} style={{ padding: '8px 14px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Editar</button>
            <button onClick={() => handleDelete(detailItem.id)} style={{ padding: '8px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Eliminar</button>
          </div>
        </ModalShell>,
        document.body
      )}

      {/* MODAL EVALUACIÓN */}
      {evaluateFor && createPortal(
        <ModalShell onClose={() => setEvaluateFor(null)} title={`Evaluación de desempeño — ${evaluateFor.full_name}`}>
          <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
            <strong>{evaluateFor.full_name}</strong>
            <div style={{ color: '#64748b', fontSize: 12 }}>{evaluateFor.job_title}</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
            <Field label="Fecha *" type="date" value={evalForm.evaluation_date} onChange={v => setEvalForm({ ...evalForm, evaluation_date: v })} />
            <Field label="Score (1-5) *" type="number" value={evalForm.score} onChange={v => setEvalForm({ ...evalForm, score: v })} />
          </div>
          <div style={{ marginTop: 10 }}>
            <Field label="Evaluador" value={evalForm.evaluator_name} onChange={v => setEvalForm({ ...evalForm, evaluator_name: v })} />
          </div>
          <div style={{ marginTop: 10 }}>
            <TextArea label="Notas" rows={3} value={evalForm.notes} onChange={v => setEvalForm({ ...evalForm, notes: v })} placeholder="Fortalezas, brechas, plan de mejora..." />
          </div>
          <div style={{ marginTop: 10 }}>
            <Field label="📂 Evidencia (link)" value={evalForm.evidence_url} onChange={v => setEvalForm({ ...evalForm, evidence_url: v })} />
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button onClick={handleSaveEvaluation} disabled={savingEval}
              style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              {savingEval ? 'Guardando...' : 'Guardar evaluación'}
            </button>
            <button onClick={() => setEvaluateFor(null)} style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
          </div>
        </ModalShell>,
        document.body
      )}

      {/* MODAL BRECHA IA */}
      {gapResult && gapResult.analysis && createPortal(
        <ModalShell onClose={() => setGapResult(null)} title={`Análisis de brecha — ${gapResult.person.full_name}`} wide>
          {(() => {
            const a = gapResult.analysis
            const verdictColor = a.evaluacion_global === 'Cubre' ? '#16a34a' : a.evaluacion_global === 'Brecha menor' ? '#f59e0b' : '#dc2626'
            const verdictBg = a.evaluacion_global === 'Cubre' ? '#dcfce7' : a.evaluacion_global === 'Brecha menor' ? '#fef3c7' : '#fee2e2'
            return (
              <>
                <div style={{ padding: 14, borderRadius: 10, background: verdictBg, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: verdictColor }}>Evaluación global</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: verdictColor, marginTop: 4 }}>{a.evaluacion_global}</div>
                  <div style={{ fontSize: 13, marginTop: 6, color: '#374151' }}>{a.resumen}</div>
                </div>
                {a.areas_cubiertas?.length > 0 && (
                  <DetailSection title="✅ Áreas cubiertas">
                    <ul style={{ margin: 4, fontSize: 13 }}>{a.areas_cubiertas.map((x, i) => <li key={i}>{x}</li>)}</ul>
                  </DetailSection>
                )}
                {a.areas_con_brecha?.length > 0 && (
                  <DetailSection title="⚠️ Brechas detectadas">
                    {a.areas_con_brecha.map((b, i) => (
                      <div key={i} style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 6 }}>
                        <div style={{ fontWeight: 700, color: '#991b1b', textTransform: 'capitalize', fontSize: 12 }}>{b.area}</div>
                        <div style={{ fontSize: 13, marginTop: 4 }}><strong>Brecha:</strong> {b.brecha}</div>
                        <div style={{ fontSize: 13, marginTop: 4, color: '#166534' }}><strong>💡 Recomendación:</strong> {b.recomendacion}</div>
                      </div>
                    ))}
                  </DetailSection>
                )}
              </>
            )
          })()}
        </ModalShell>,
        document.body
      )}

      {/* MODAL DOTACIÓN IA */}
      {showDotacionModal && createPortal(
        <ModalShell onClose={() => setShowDotacionModal(false)} title="Análisis de dotación (IA)" wide>
          {loadingDotacion && <div style={{ textAlign: 'center', padding: 30 }}><Loader2 size={32} className="animate-spin" /> Analizando dotación...</div>}
          {dotacionResult && (
            <>
              {(() => {
                const verdictColor = dotacionResult.evaluacion_global === 'Adecuada' ? '#16a34a' : dotacionResult.evaluacion_global === 'Mejorable' ? '#f59e0b' : '#dc2626'
                const verdictBg = dotacionResult.evaluacion_global === 'Adecuada' ? '#dcfce7' : dotacionResult.evaluacion_global === 'Mejorable' ? '#fef3c7' : '#fee2e2'
                return (
                  <div style={{ padding: 14, borderRadius: 10, background: verdictBg, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: verdictColor }}>Dotación</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: verdictColor, marginTop: 4 }}>{dotacionResult.evaluacion_global}</div>
                    <div style={{ fontSize: 13, marginTop: 6, color: '#374151' }}>{dotacionResult.resumen}</div>
                  </div>
                )
              })()}
              {dotacionResult.procesos_sin_personal?.length > 0 && (
                <DetailSection title="🚨 Procesos sin personal asignado">
                  <ul style={{ margin: 4, fontSize: 13, color: '#dc2626' }}>
                    {dotacionResult.procesos_sin_personal.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </DetailSection>
              )}
              {dotacionResult.cargos_sin_titular?.length > 0 && (
                <DetailSection title="🪑 Cargos sin titular">
                  <ul style={{ margin: 4, fontSize: 13, color: '#92400e' }}>
                    {dotacionResult.cargos_sin_titular.map((x, i) => <li key={i}>{x}</li>)}
                  </ul>
                </DetailSection>
              )}
              {dotacionResult.recomendaciones?.length > 0 && (
                <DetailSection title="💡 Recomendaciones">
                  {dotacionResult.recomendaciones.map((r, i) => (
                    <div key={i} style={{ padding: 8, background: '#f0f9ff', borderLeft: '3px solid #0ea5e9', borderRadius: 4, marginBottom: 6, fontSize: 13 }}>
                      <strong>{r.tipo}:</strong> {r.detalle}
                    </div>
                  ))}
                </DetailSection>
              )}
            </>
          )}
        </ModalShell>,
        document.body
      )}
    </div>
  )
}

// ─────── Concientización ───────
function ConscientizacionBadge({ item, uploadingIds, setUploadingIds, uploadFileAndConfirm, fetchItems }) {
  const fileInputRef = useRef(null)
  const [linkModalOpen, setLinkModalOpen] = useState(false)
  const [linkModalInitial, setLinkModalInitial] = useState('')
  const [linkModalLoading, setLinkModalLoading] = useState(false)
  const [linkModalMode, setLinkModalMode] = useState('paste')

  const isAware = item.awareness_date
  const dateStr = isAware ? new Date(item.awareness_date).toLocaleDateString() : 'Pendiente'

  const handleModalSave = async (raw) => {
    const value = raw == null ? '' : String(raw).trim()
    if (linkModalMode === 'edit' && value === '') {
      if (!await confirm('¿Eliminar enlace de evidencia?', { tone: 'danger', confirmText: 'Eliminar' })) return
      setLinkModalLoading(true)
      const { error } = await supabase.from('personnel').update({ awareness_date: null, awareness_file_url: null }).eq('id', item.id)
      setLinkModalLoading(false); setLinkModalOpen(false)
      if (error) toast.error('Error: ' + error.message)
      else { toast.success('Enlace eliminado'); fetchItems() }
      return
    }
    const conv = convertDriveLinkToDirect(value)
    if (!isValidUrl(conv)) return toast.warning('Enlace inválido (debe empezar con http/https)')
    if (!await confirm(`¿Guardar evidencia para ${item.full_name}?`)) return
    setLinkModalLoading(true); setUploadingIds(prev => [...prev, item.id])
    const today = new Date().toISOString().slice(0, 10)
    const { error } = await supabase.from('personnel').update({ awareness_date: today, awareness_file_url: conv }).eq('id', item.id)
    setUploadingIds(prev => prev.filter(x => x !== item.id))
    setLinkModalLoading(false); setLinkModalOpen(false)
    if (error) toast.error('Error: ' + error.message)
    else { toast.success('Evidencia guardada'); fetchItems() }
  }

  const triggerFile = () => fileInputRef.current?.click()
  const handleFileChange = async (e) => {
    const file = e.target.files[0]
    if (file && await confirm(`¿Subir "${file.name}" y confirmar concientización?`)) {
      uploadFileAndConfirm(item.id, file)
    }
    e.target.value = null
  }

  return (
    <div style={{ marginTop: 10, padding: 10, background: isAware ? '#f0fdf4' : '#fef3c7', borderRadius: 8 }}>
      <ModalLinkEvidence open={linkModalOpen} initialValue={linkModalInitial} onCancel={() => setLinkModalOpen(false)} onSave={handleModalSave} loading={linkModalLoading} inputId={`evidence-link-input-${item.id}`} />
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} accept=".pdf,.jpg,.jpeg,.png" />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
        <span style={{ fontWeight: 700, color: isAware ? '#166534' : '#92400e' }}>
          {isAware ? '✅' : '🚨'} Concientización: {dateStr}
        </span>
        <div style={{ display: 'flex', gap: 4 }}>
          {item.awareness_file_url && (
            <a href={item.awareness_file_url} target="_blank" rel="noreferrer" style={{ padding: '4px 8px', background: '#0ea5e9', color: 'white', borderRadius: 4, textDecoration: 'none', fontSize: 11 }}>Ver</a>
          )}
          <button onClick={triggerFile} disabled={uploadingIds.includes(item.id)}
            style={{ padding: '4px 8px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
            <Upload size={10} /> {uploadingIds.includes(item.id) ? '...' : 'Archivo'}
          </button>
          <button onClick={() => { setLinkModalInitial(item.awareness_file_url || ''); setLinkModalMode(isAware ? 'edit' : 'paste'); setLinkModalOpen(true) }}
            style={{ padding: '4px 8px', background: '#0891b2', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3 }}>
            <LinkIcon size={10} /> Link
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────── helpers UI ───────
function Field({ label, value, onChange, type = 'text', required = false, placeholder = '' }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>
      <input type={type} value={value ?? ''} required={required} placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
    </div>
  )
}

function TextArea({ label, value, onChange, rows = 3, placeholder = '' }) {
  return (
    <div>
      {label && <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>}
      <textarea value={value ?? ''} rows={rows} placeholder={placeholder} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
    </div>
  )
}

function SelectField({ label, value, options, onChange }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>
      <select value={value ?? ''} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: 'white' }}>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  )
}

function LinkSelect({ label, value, onChange, options }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>
      <select value={value ?? ''} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: 'white' }}>
        {options.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
      </select>
    </div>
  )
}

function Meta({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#111827' }}>{value || '—'}</div>
    </div>
  )
}

function DetailRow({ label, value }) {
  if (value === null || value === undefined || value === '' || value === '—') return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ color: '#6b7280', fontSize: 13 }}>{label}</div>
      <div style={{ color: '#111827', fontSize: 13 }}>{value}</div>
    </div>
  )
}

function DetailSection({ title, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <h4 style={{ margin: '0 0 6px 0', fontSize: 13, color: '#1f2937', borderBottom: '2px solid #e2e8f0', paddingBottom: 4 }}>{title}</h4>
      {typeof children === 'string' ? <p style={{ margin: 4, fontSize: 13 }}>{children}</p> : children}
    </div>
  )
}

function EmptyHint() {
  return <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: '6px 10px', background: '#f8fafc', borderRadius: 4 }}>Sin registros.</p>
}

function ModalShell({ title, onClose, children, wide = false }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)',
      backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 20
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{
          background: 'white', borderRadius: 14, maxWidth: wide ? 960 : 560, width: '100%',
          maxHeight: '92vh', overflowY: 'auto', padding: 24, position: 'relative',
          boxShadow: '0 20px 60px rgba(0,0,0,0.25)'
        }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, color: '#111827' }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
