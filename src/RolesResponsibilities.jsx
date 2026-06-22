import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  Sparkles, Loader2, UserCircle, Briefcase, Trash2, ExternalLink, FileText, X,
  Plus, Search, Filter, Eye, Pencil, AlertTriangle, ShieldCheck, Award,
  Network, Users
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import ModuleSeedBanner from './ModuleSeedBanner'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

// ───────────── Constantes ─────────────
const STATUS_OPTIONS = ['Activo', 'Vacante', 'Borrador', 'Inactivo']
const LEVEL_OPTIONS = ['Estratégico', 'Táctico', 'Operativo']
const PERIODICIDAD_OPTIONS = ['Diaria', 'Semanal', 'Mensual', 'Trimestral', 'Ocasional']
const FUNCION_TIPO = ['Ejecución', 'Análisis', 'Dirección', 'Control']
const RACI_ROLES = ['R', 'A', 'C', 'I']  // Responsible, Accountable, Consulted, Informed

const STATUS_COLORS = {
  'Activo':    { bg: '#dcfce7', color: '#166534' },
  'Vacante':   { bg: '#fef3c7', color: '#92400e' },
  'Borrador':  { bg: '#e0e7ff', color: '#3730a3' },
  'Inactivo':  { bg: '#f3f4f6', color: '#6b7280' },
}

const LEVEL_COLORS = {
  'Estratégico': '#10b981',
  'Táctico':     '#3b82f6',
  'Operativo':   '#8b5cf6',
}

const RACI_LABELS = {
  R: { label: 'Responsable (R)', color: '#3b82f6', desc: 'Hace el trabajo' },
  A: { label: 'Aprueba (A)',     color: '#dc2626', desc: 'Rinde cuentas, decide' },
  C: { label: 'Consultado (C)',  color: '#f59e0b', desc: 'Aporta input' },
  I: { label: 'Informado (I)',   color: '#6b7280', desc: 'Recibe info' }
}

const DEFAULT_RESP = {
  bienes_valores:           { nivel: 'Bajo', detalle: '' },
  informacion:              { nivel: 'Bajo', detalle: '' },
  relaciones_interpersonales: { nivel: 'Bajo', detalle: '' },
  direccion_coordinacion:   { nivel: 'Bajo', detalle: '' }
}

const DEFAULT_COMP = {
  educacion: '', formacion: '', experiencia: '', habilidades: ''
}

const EMPTY_FORM = {
  title: '', code: '', level: 'Operativo', dependency: '',
  mission: '', document_url: '',
  current_holder: '', current_holder_since: '',
  status: 'Activo', is_sgc_responsible: false,
  functions_json: [{ funcion: '', periodicidad: 'Diaria', tipo: 'Ejecución' }],
  authorities_json: [''],
  responsibilities_json: DEFAULT_RESP,
  competencies_json: DEFAULT_COMP,
  raci_json: [],
  elaborated_by: '', revised_by: '', approved_by: ''
}

// ───────────── Helpers IA ─────────────
function extractFirstJson(text) {
  if (!text) return null
  const i0 = text.indexOf('{'), i1 = text.indexOf('[')
  const start = i0 === -1 ? i1 : (i1 === -1 ? i0 : Math.min(i0, i1))
  if (start === -1) return null
  let depth = 0, inStr = false, esc = false
  const open = text[start], close = open === '[' ? ']' : '}'
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

// ───────────── Subcomponentes ─────────────
function KPI({ icon: Icon, label, value, color = '#0ea5e9', sub }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 10, background: color + '20', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#111827', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
      </div>
    </div>
  )
}

function FormSection({ title, children, accent }) {
  return (
    <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: '1px dashed #e5e7eb' }}>
      <h4 style={{ margin: '0 0 10px 0', color: accent || '#1f2937', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</h4>
      {children}
    </div>
  )
}

// ───────────── Componente ─────────────
export default function RolesResponsibilities() {
  const [jobs, setJobs] = useState([])
  const [processes, setProcesses] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [detailItem, setDetailItem] = useState(null)
  const [filterStatus, setFilterStatus] = useState('')
  const [filterLevel, setFilterLevel] = useState('')
  const [search, setSearch] = useState('')

  const [loadingIA, setLoadingIA] = useState(false)
  const [loadingIARACI, setLoadingIARACI] = useState(false)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true); setTableError(null)
    const { data, error } = await supabase.from('job_descriptions').select('*').order('title')
    if (error) { setTableError(error.message); setJobs([]) }
    else setJobs(data || [])
    const { data: pr } = await supabase.from('processes').select('id, name, process_type').order('name')
    setProcesses(pr || [])
    setLoading(false)
  }

  // ───── Form helpers ─────
  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null) }
  const handleNew = () => { resetForm(); setShowForm(true) }
  const handleCancel = () => { resetForm(); setShowForm(false) }

  const sugerirCodigo = () => {
    const dep = (form.dependency || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'GE'
    const existing = jobs.filter(j => j.code?.startsWith(`M-${dep}-`))
    const numbers = existing.map(j => parseInt(j.code.split('-')[2])).filter(n => !isNaN(n))
    const next = numbers.length ? Math.max(...numbers) + 1 : 1
    setForm({ ...form, code: `M-${dep}-${String(next).padStart(2, '0')}` })
  }

  const handleAddFunction = () => {
    setForm({ ...form, functions_json: [...form.functions_json, { funcion: '', periodicidad: 'Diaria', tipo: 'Ejecución' }] })
  }
  const handleUpdateFunction = (i, field, value) => {
    const updated = [...form.functions_json]; updated[i] = { ...updated[i], [field]: value }
    setForm({ ...form, functions_json: updated })
  }
  const handleRemoveFunction = (i) => {
    setForm({ ...form, functions_json: form.functions_json.filter((_, idx) => idx !== i) })
  }

  const handleAddAuthority = () => setForm({ ...form, authorities_json: [...form.authorities_json, ''] })
  const handleUpdateAuthority = (i, value) => {
    const updated = [...form.authorities_json]; updated[i] = value
    setForm({ ...form, authorities_json: updated })
  }
  const handleRemoveAuthority = (i) => setForm({ ...form, authorities_json: form.authorities_json.filter((_, idx) => idx !== i) })

  const handleUpdateResp = (key, field, value) => {
    setForm({ ...form, responsibilities_json: { ...form.responsibilities_json, [key]: { ...form.responsibilities_json[key], [field]: value } } })
  }

  const handleUpdateComp = (field, value) => {
    setForm({ ...form, competencies_json: { ...form.competencies_json, [field]: value } })
  }

  const handleAddRaci = () => {
    setForm({ ...form, raci_json: [...form.raci_json, { process_id: '', process_name: '', role: 'R' }] })
  }
  const handleUpdateRaci = (i, field, value) => {
    const updated = [...form.raci_json]
    updated[i] = { ...updated[i], [field]: value }
    if (field === 'process_id') {
      const p = processes.find(p => p.id === value)
      updated[i].process_name = p?.name || ''
    }
    setForm({ ...form, raci_json: updated })
  }
  const handleRemoveRaci = (i) => setForm({ ...form, raci_json: form.raci_json.filter((_, idx) => idx !== i) })

  // ───── IA generar perfil completo ─────
  const generarPerfilIA = async () => {
    if (!form.title) return toast.warning('Escribí primero el nombre del cargo')
    setLoadingIA(true)
    try {
      const prompt = `
Cargo: "${form.title}"
Área: "${form.dependency || 'no especificada'}"
Nivel: "${form.level}"

Generá perfil profesional ISO 9001. Devolvé SOLO JSON válido, sin markdown:

{
  "mision": "Misión clara del cargo en 2-3 líneas",
  "funciones": [
    {"funcion":"...","periodicidad":"Diaria|Semanal|Mensual|Ocasional","tipo":"Ejecución|Análisis|Dirección|Control"}
  ],
  "autoridades": ["Decidir/aprobar X", "Autorizar Y", "..."],
  "competencias": {
    "educacion": "Nivel educativo requerido",
    "formacion": "Cursos / certificaciones",
    "experiencia": "Años y tipo de experiencia",
    "habilidades": "Habilidades blandas y técnicas"
  },
  "responsabilidades": {
    "bienes": "...",
    "informacion": "...",
    "relaciones": "...",
    "direccion": "..."
  }
}

Reglas:
- 5 funciones mínimo
- 3-5 autoridades concretas (qué puede decidir/aprobar)
- Competencias específicas, no genéricas`
      const raw = await consultarIA(prompt, 'Eres experto en RRHH e ISO 9001. Devolvé solo JSON válido.')
      const data = extractFirstJson(raw)
      if (!data) throw new Error('IA no devolvió JSON válido')
      setForm({
        ...form,
        mission: data.mision || form.mission,
        functions_json: Array.isArray(data.funciones) && data.funciones.length ? data.funciones : form.functions_json,
        authorities_json: Array.isArray(data.autoridades) && data.autoridades.length ? data.autoridades : form.authorities_json,
        competencies_json: data.competencias || form.competencies_json,
        responsibilities_json: data.responsabilidades ? {
          bienes_valores: { nivel: 'Medio', detalle: data.responsabilidades.bienes || '' },
          informacion: { nivel: 'Medio', detalle: data.responsabilidades.informacion || '' },
          relaciones_interpersonales: { nivel: 'Medio', detalle: data.responsabilidades.relaciones || '' },
          direccion_coordinacion: { nivel: 'Medio', detalle: data.responsabilidades.direccion || '' }
        } : form.responsibilities_json
      })
    } catch (e) {
      toast.error('Error IA: ' + e.message)
    }
    setLoadingIA(false)
  }

  // ───── IA sugerir RACI cruzando con procesos ─────
  const sugerirRACI_IA = async () => {
    if (!form.title) return toast.warning('Definí primero el cargo')
    if (processes.length < 2) return toast.warning('Cargá al menos 2 procesos para que la IA arme la matriz RACI')
    setLoadingIARACI(true)
    try {
      const procData = processes.map(p => ({ id: p.id, name: p.name, type: p.process_type }))
      const prompt = `Sos consultor ISO 9001. Para el cargo "${form.title}" (${form.level}, ${form.dependency || 'sin área'}), definí su rol RACI en cada proceso.

Roles:
R = Responsible (hace el trabajo)
A = Accountable (rinde cuentas, aprueba)
C = Consulted (consultado, aporta)
I = Informed (informado)

PROCESOS:
${JSON.stringify(procData, null, 2)}

INSTRUCCIONES:
- Solo incluí los procesos donde este cargo TIENE rol (no incluyas los que no le aplican).
- Usá los IDs EXACTOS.
- Devolvé SOLO un JSON array, sin markdown.

FORMATO:
[
  {"process_id":"<id>","process_name":"Nombre","role":"R"}
]`
      const raw = await consultarIA(prompt, 'Devolvé únicamente JSON array válido.')
      const arr = extractFirstJson(raw)
      let result = []
      if (Array.isArray(arr)) result = arr
      else if (arr && Array.isArray(arr.raci)) result = arr.raci
      else if (arr && Array.isArray(arr.items)) result = arr.items
      else throw new Error('IA no devolvió array RACI')

      // Sanear: solo válidos, mapear nombre si IDs no coinciden
      const idSet = new Set(processes.map(p => p.id))
      const nameToId = {}
      processes.forEach(p => { nameToId[p.name.toLowerCase().trim()] = p.id })

      const cleaned = result.map(r => {
        const process_id = idSet.has(r.process_id) ? r.process_id : nameToId[(r.process_name || '').toLowerCase().trim()]
        const p = processes.find(p => p.id === process_id)
        return {
          process_id,
          process_name: p?.name || r.process_name,
          role: RACI_ROLES.includes(r.role) ? r.role : 'R'
        }
      }).filter(r => r.process_id)

      if (!cleaned.length) throw new Error('No se pudo mapear ninguna entrada RACI')
      setForm({ ...form, raci_json: cleaned })
    } catch (e) {
      toast.error('Error IA RACI: ' + e.message)
    }
    setLoadingIARACI(false)
  }

  // ───── CRUD ─────
  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = { ...form }
    payload.authorities_json = payload.authorities_json.filter(a => a && a.trim())
    if (!payload.current_holder_since) payload.current_holder_since = null

    if (editingId) {
      const prev = jobs.find(j => j.id === editingId)
      const changes = []
      Object.keys(payload).forEach(k => {
        if (prev && JSON.stringify(prev[k] ?? '') !== JSON.stringify(payload[k] ?? '')) {
          changes.push({ field: k, from: prev[k] ?? null, to: payload[k] ?? null })
        }
      })
      payload.change_log = [...(prev?.change_log || []), { at: new Date().toISOString(), changes }]
      const { error } = await supabase.from('job_descriptions').update(payload).eq('id', editingId)
      if (error) return toast.error(error.message)
    } else {
      payload.change_log = [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: payload.title }] }]
      const { error } = await supabase.from('job_descriptions').insert([payload])
      if (error) return toast.error(error.message)
    }
    setShowForm(false); resetForm(); fetchAll()
  }

  const handleEdit = (job) => {
    setForm({
      ...EMPTY_FORM,
      ...Object.fromEntries(Object.entries(job).map(([k, v]) => [k, v ?? EMPTY_FORM[k] ?? ''])),
      functions_json: job.functions_json?.length ? job.functions_json : EMPTY_FORM.functions_json,
      authorities_json: Array.isArray(job.authorities_json) && job.authorities_json.length ? job.authorities_json : [''],
      responsibilities_json: job.responsibilities_json || DEFAULT_RESP,
      competencies_json: job.competencies_json || DEFAULT_COMP,
      raci_json: Array.isArray(job.raci_json) ? job.raci_json : [],
      is_sgc_responsible: !!job.is_sgc_responsible
    })
    setEditingId(job.id); setShowForm(true); setDetailItem(null)
  }

  const handleDelete = async (id) => {
    if (!await confirm('¿Eliminar este perfil?', { tone: 'danger', confirmText: 'Eliminar' })) return
    const { error } = await supabase.from('job_descriptions').delete().eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Perfil eliminado'); setDetailItem(null); fetchAll() }
  }

  // ───── Filtros + stats ─────
  const filtered = useMemo(() => jobs.filter(j => {
    if (filterStatus && j.status !== filterStatus) return false
    if (filterLevel && j.level !== filterLevel) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [j.title, j.code, j.dependency, j.current_holder, j.mission].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [jobs, filterStatus, filterLevel, search])

  const stats = useMemo(() => ({
    total: jobs.length,
    activos: jobs.filter(j => j.status === 'Activo').length,
    vacantes: jobs.filter(j => j.status === 'Vacante' || (!j.current_holder && j.status === 'Activo')).length,
    sinTitular: jobs.filter(j => !j.current_holder).length,
    sgcResponsable: jobs.find(j => j.is_sgc_responsible)
  }), [jobs])

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1f2937', margin: 0 }}>
            <Briefcase size={22} /> Roles, Responsabilidades y Autoridades
          </h2>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: 13 }}>ISO 5.3 — Manual de funciones y matriz RACI</p>
        </div>
        {!showForm && (
          <button onClick={handleNew}
            style={{ padding: '8px 14px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            <Plus size={16} /> Nuevo Perfil
          </button>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['5.3']} />
      <ModuleSeedBanner moduleKey="roles" label="perfiles de cargo" visible={jobs.length === 0 && !loading} onSeeded={fetchAll} />

      {tableError && (
        <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13 }}>
          <strong>Tabla no encontrada:</strong> {tableError}. Aplicá <code>iso_migration_v43_job_descriptions_auditable.sql</code>.
        </div>
      )}

      {/* Banner Responsable del SGC */}
      {stats.sgcResponsable && (
        <div style={{ marginTop: 12, padding: 12, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, fontSize: 13, color: '#166534', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShieldCheck size={18} />
          <span><strong>Responsable del SGC asignado:</strong> {stats.sgcResponsable.title} ({stats.sgcResponsable.current_holder || 'sin titular'})</span>
        </div>
      )}
      {!stats.sgcResponsable && jobs.length > 0 && (
        <div style={{ marginTop: 12, padding: 12, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, color: '#92400e', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={18} />
          <span><strong>Sin Responsable del SGC asignado</strong> — ISO 5.3 lo requiere. Editá un perfil y marcalo.</span>
        </div>
      )}

      {/* Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, margin: '16px 0' }}>
        <KPI icon={Briefcase} label="Total perfiles" value={stats.total} color="#0ea5e9" />
        <KPI icon={UserCircle} label="Activos" value={stats.activos} color="#16a34a" />
        <KPI icon={AlertTriangle} label="Vacantes" value={stats.vacantes} color="#dc2626" />
        <KPI icon={Users} label="Sin titular" value={stats.sinTitular} color="#f59e0b" />
        <KPI icon={ShieldCheck} label="Resp. SGC" value={stats.sgcResponsable ? '✓' : '—'} color={stats.sgcResponsable ? '#16a34a' : '#dc2626'} />
      </div>

      {/* Filtros */}
      {!showForm && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#9ca3af' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cargo, titular, área..."
              style={{ width: '100%', padding: '8px 8px 8px 30px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
          </div>
          <Filter size={14} color="#6b7280" />
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
            <option value="">Estado: Todos</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterLevel} onChange={e => setFilterLevel(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
            <option value="">Nivel: Todos</option>
            {LEVEL_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {/* FORM */}
      {showForm && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, color: '#1f2937' }}>{editingId ? 'Editar' : 'Nuevo'} Perfil de Cargo</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={generarPerfilIA} disabled={loadingIA}
                style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {loadingIA ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Generar perfil con IA
              </button>
              <button type="button" onClick={sugerirRACI_IA} disabled={loadingIARACI || processes.length < 2}
                style={{ padding: '8px 14px', background: '#0891b2', color: 'white', border: 'none', borderRadius: 8, cursor: processes.length < 2 ? 'not-allowed' : 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6, opacity: processes.length < 2 ? 0.5 : 1 }}>
                {loadingIARACI ? <Loader2 size={14} className="animate-spin" /> : <Network size={14} />}
                Sugerir RACI IA
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <FormSection title="Identificación del cargo">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto 1fr 1fr', gap: 10, alignItems: 'end' }}>
                <Field label="Denominación *" required value={form.title} onChange={v => setForm({ ...form, title: v })} placeholder="Ej: Gerente de Operaciones" />
                <Field label="Código" value={form.code} onChange={v => setForm({ ...form, code: v })} placeholder="M-AR-01" />
                <button type="button" onClick={sugerirCodigo}
                  style={{ padding: 8, background: '#e0e7ff', color: '#3730a3', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, height: 36 }}>
                  Sugerir
                </button>
                <SelectField label="Nivel" value={form.level} options={LEVEL_OPTIONS} onChange={v => setForm({ ...form, level: v })} />
                <SelectField label="Estado" value={form.status} options={STATUS_OPTIONS} onChange={v => setForm({ ...form, status: v })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <Field label="Área / Dependencia" value={form.dependency} onChange={v => setForm({ ...form, dependency: v })} placeholder="Ej: Recursos Humanos" />
                <Field label="📂 Manual firmado (Drive)" value={form.document_url} onChange={v => setForm({ ...form, document_url: v })} placeholder="https://drive.google.com/..." />
              </div>
              <div style={{ marginTop: 10, padding: 10, background: form.is_sgc_responsible ? '#f0fdf4' : '#f9fafb', border: `1px solid ${form.is_sgc_responsible ? '#bbf7d0' : '#e5e7eb'}`, borderRadius: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_sgc_responsible} onChange={e => setForm({ ...form, is_sgc_responsible: e.target.checked })} />
                  <ShieldCheck size={14} color={form.is_sgc_responsible ? '#16a34a' : '#6b7280'} />
                  <span><strong>Este cargo es el Responsable del SGC</strong> (ISO 5.3 — reporta desempeño a la Alta Dirección)</span>
                </label>
              </div>
            </FormSection>

            <FormSection title="Titular actual">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                <Field label="Nombre del titular" value={form.current_holder} onChange={v => setForm({ ...form, current_holder: v })} placeholder="Ej: Ana López — dejar vacío si Vacante" />
                <Field label="En el cargo desde" type="date" value={form.current_holder_since} onChange={v => setForm({ ...form, current_holder_since: v })} />
              </div>
            </FormSection>

            <FormSection title="Objeto general (misión)">
              <TextArea rows={3} value={form.mission} onChange={v => setForm({ ...form, mission: v })} placeholder="Por qué existe este cargo, qué resultado entrega" />
            </FormSection>

            <FormSection title="Funciones">
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8 }}>
                {form.functions_json.map((f, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <div style={{ background: '#0ea5e9', color: 'white', width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>{i + 1}</div>
                    <input style={{ flex: 3, padding: 6, border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12 }} placeholder="Descripción de la función" value={f.funcion || ''} onChange={e => handleUpdateFunction(i, 'funcion', e.target.value)} />
                    <select style={{ flex: 1, padding: 6, border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12 }} value={f.periodicidad || 'Diaria'} onChange={e => handleUpdateFunction(i, 'periodicidad', e.target.value)}>
                      {PERIODICIDAD_OPTIONS.map(p => <option key={p}>{p}</option>)}
                    </select>
                    <select style={{ flex: 1, padding: 6, border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12 }} value={f.tipo || 'Ejecución'} onChange={e => handleUpdateFunction(i, 'tipo', e.target.value)}>
                      {FUNCION_TIPO.map(p => <option key={p}>{p}</option>)}
                    </select>
                    <button type="button" onClick={() => handleRemoveFunction(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={14} /></button>
                  </div>
                ))}
                <button type="button" onClick={handleAddFunction}
                  style={{ width: '100%', padding: 6, background: 'white', border: '1px dashed #94a3b8', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: '#475569' }}>+ Agregar función</button>
              </div>
            </FormSection>

            <FormSection title="Autoridades (ISO 5.3 — qué puede decidir/aprobar)" accent="#dc2626">
              <div style={{ background: '#fef2f2', padding: 12, borderRadius: 8, border: '1px solid #fecaca' }}>
                <div style={{ fontSize: 11, color: '#991b1b', marginBottom: 8 }}>💡 Esta es la diferencia clave que pide ISO 5.3 — no solo qué hace, sino <strong>qué puede DECIDIR sin pedir permiso</strong>.</div>
                {form.authorities_json.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <input style={{ flex: 1, padding: 6, border: '1px solid #fecaca', borderRadius: 4, fontSize: 12 }} placeholder="Ej: Aprobar órdenes de compra hasta USD 5000" value={a} onChange={e => handleUpdateAuthority(i, e.target.value)} />
                    <button type="button" onClick={() => handleRemoveAuthority(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={14} /></button>
                  </div>
                ))}
                <button type="button" onClick={handleAddAuthority}
                  style={{ width: '100%', padding: 6, background: 'white', border: '1px dashed #fca5a5', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: '#991b1b' }}>+ Agregar autoridad</button>
              </div>
            </FormSection>

            <FormSection title="Competencias requeridas (ISO 7.2)">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <TextArea label="Educación" rows={2} value={form.competencies_json.educacion} onChange={v => handleUpdateComp('educacion', v)} />
                <TextArea label="Formación / cursos" rows={2} value={form.competencies_json.formacion} onChange={v => handleUpdateComp('formacion', v)} />
                <TextArea label="Experiencia" rows={2} value={form.competencies_json.experiencia} onChange={v => handleUpdateComp('experiencia', v)} />
                <TextArea label="Habilidades" rows={2} value={form.competencies_json.habilidades} onChange={v => handleUpdateComp('habilidades', v)} />
              </div>
            </FormSection>

            <FormSection title="Matriz de responsabilidades">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: '#f8fafc' }}>
                    <th style={{ padding: 8, textAlign: 'left', color: '#475569' }}>Categoría</th>
                    <th style={{ padding: 8, textAlign: 'left', color: '#475569' }}>Detalle</th>
                    <th style={{ padding: 8, textAlign: 'left', color: '#475569', width: 110 }}>Nivel</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(form.responsibilities_json).map(key => (
                    <tr key={key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: 6, fontWeight: 600 }}>{key.replace(/_/g, ' ')}</td>
                      <td style={{ padding: 4 }}>
                        <input value={form.responsibilities_json[key].detalle} onChange={e => handleUpdateResp(key, 'detalle', e.target.value)}
                          style={{ width: '100%', padding: 6, border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12 }} placeholder="Detalle del alcance" />
                      </td>
                      <td style={{ padding: 4 }}>
                        <select value={form.responsibilities_json[key].nivel} onChange={e => handleUpdateResp(key, 'nivel', e.target.value)}
                          style={{ width: '100%', padding: 6, border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 12 }}>
                          <option>Bajo</option><option>Medio</option><option>Alto</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </FormSection>

            <FormSection title="Matriz RACI por proceso" accent="#0891b2">
              <div style={{ background: '#ecfeff', padding: 12, borderRadius: 8, border: '1px solid #a5f3fc' }}>
                <div style={{ fontSize: 11, color: '#155e75', marginBottom: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {Object.entries(RACI_LABELS).map(([k, v]) => (
                    <span key={k} style={{ color: v.color }}><strong>{k}</strong> = {v.desc}</span>
                  ))}
                </div>
                {form.raci_json.length === 0 && (
                  <div style={{ fontSize: 12, color: '#0e7490', padding: 6 }}>Sin asignaciones. Agregá manualmente o usá <strong>Sugerir RACI IA</strong>.</div>
                )}
                {form.raci_json.map((r, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                    <select value={r.process_id} onChange={e => handleUpdateRaci(i, 'process_id', e.target.value)}
                      style={{ flex: 3, padding: 6, border: '1px solid #a5f3fc', borderRadius: 4, fontSize: 12 }}>
                      <option value="">— seleccionar proceso —</option>
                      {processes.map(p => <option key={p.id} value={p.id}>{p.name} ({p.process_type})</option>)}
                    </select>
                    <select value={r.role} onChange={e => handleUpdateRaci(i, 'role', e.target.value)}
                      style={{ flex: 1, padding: 6, border: '1px solid #a5f3fc', borderRadius: 4, fontSize: 12 }}>
                      {RACI_ROLES.map(role => <option key={role} value={role}>{role} — {RACI_LABELS[role].label}</option>)}
                    </select>
                    <button type="button" onClick={() => handleRemoveRaci(i)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc2626' }}><X size={14} /></button>
                  </div>
                ))}
                <button type="button" onClick={handleAddRaci}
                  style={{ width: '100%', padding: 6, background: 'white', border: '1px dashed #67e8f9', borderRadius: 4, cursor: 'pointer', fontSize: 12, color: '#155e75' }}>+ Agregar asignación RACI</button>
              </div>
            </FormSection>

            <FormSection title="Aprobaciones">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <Field label="Elaborado por" value={form.elaborated_by} onChange={v => setForm({ ...form, elaborated_by: v })} />
                <Field label="Revisado por" value={form.revised_by} onChange={v => setForm({ ...form, revised_by: v })} />
                <Field label="Aprobado por" value={form.approved_by} onChange={v => setForm({ ...form, approved_by: v })} />
              </div>
            </FormSection>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={handleCancel}
                style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button type="submit"
                style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                {editingId ? 'Guardar cambios' : 'Crear perfil'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* CARDS */}
      {!showForm && (loading ? <p>Cargando perfiles...</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
          {filtered.length === 0 && (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: '#cbd5e1' }}>
              <UserCircle size={48} style={{ opacity: 0.3, marginBottom: 8 }} />
              <p style={{ margin: 0 }}>Sin perfiles. Creá el primero con el botón <strong>Nuevo Perfil</strong>.</p>
            </div>
          )}
          {filtered.map(job => {
            const st = STATUS_COLORS[job.status] || STATUS_COLORS['Activo']
            const lvlColor = LEVEL_COLORS[job.level] || '#6b7280'
            const isVacante = !job.current_holder
            return (
              <div key={job.id} style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, borderLeft: `5px solid ${lvlColor}`, padding: 14, cursor: 'pointer', position: 'relative' }}
                onClick={() => setDetailItem(job)}>
                {job.is_sgc_responsible && (
                  <div style={{ position: 'absolute', top: 8, right: 8, background: '#16a34a', color: 'white', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ShieldCheck size={10} /> SGC
                  </div>
                )}
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <div style={{ background: lvlColor + '20', padding: 8, borderRadius: 10, color: lvlColor }}>
                    <Briefcase size={20} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h4 style={{ margin: 0, fontSize: 14, color: '#111827' }}>{job.title}</h4>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{job.code || 'sin código'} · {job.dependency || 'sin área'}</div>
                  </div>
                </div>
                <p style={{ marginTop: 10, fontSize: 12, color: '#475569', maxHeight: 36, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                  {job.mission || 'Sin misión definida'}
                </p>
                <div style={{ marginTop: 8, padding: 6, background: isVacante ? '#fef3c7' : '#f0fdf4', borderRadius: 6, fontSize: 11, color: isVacante ? '#92400e' : '#166534', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <UserCircle size={12} />
                  {isVacante ? <strong>VACANTE</strong> : job.current_holder}
                </div>
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span style={{ padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.color, fontSize: 10, fontWeight: 700 }}>{job.status}</span>
                    {job.level && <span style={{ padding: '2px 8px', borderRadius: 10, background: lvlColor + '20', color: lvlColor, fontSize: 10, fontWeight: 700 }}>{job.level}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {job.document_url && (
                      <a href={job.document_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} title="Manual firmado" style={{ color: '#0ea5e9' }}>
                        <FileText size={14} />
                      </a>
                    )}
                    <button onClick={(e) => { e.stopPropagation(); handleEdit(job) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#f59e0b' }}>
                      <Pencil size={14} />
                    </button>
                    <button onClick={(e) => { e.stopPropagation(); handleDelete(job.id) }} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#6b7280' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      ))}

      {/* MODAL DETALLE */}
      {detailItem && createPortal(
        <ModalShell onClose={() => setDetailItem(null)} title={detailItem.title} wide>
          {detailItem.is_sgc_responsible && (
            <div style={{ padding: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, marginBottom: 14, fontSize: 13, color: '#166534', display: 'flex', alignItems: 'center', gap: 8 }}>
              <ShieldCheck size={18} /> <strong>Responsable del SGC</strong> — reporta desempeño a la Alta Dirección
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: 12, background: '#f8fafc', borderRadius: 6, fontSize: 12 }}>
            <Meta label="Código" value={detailItem.code} />
            <Meta label="Nivel" value={detailItem.level} />
            <Meta label="Área" value={detailItem.dependency} />
            <Meta label="Estado" value={detailItem.status} />
            <Meta label="Titular" value={detailItem.current_holder || 'VACANTE'} />
            <Meta label="Desde" value={detailItem.current_holder_since} />
            <Meta label="Elaborado por" value={detailItem.elaborated_by} />
            <Meta label="Aprobado por" value={detailItem.approved_by} />
          </div>

          <DetailSection title="Misión">{detailItem.mission || '—'}</DetailSection>

          <DetailSection title="Funciones">
            {detailItem.functions_json?.length ? (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                  <th style={{ padding: 6 }}>#</th><th style={{ padding: 6 }}>Función</th><th style={{ padding: 6 }}>Periodicidad</th><th style={{ padding: 6 }}>Tipo</th>
                </tr></thead>
                <tbody>
                  {detailItem.functions_json.map((f, i) => (
                    <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: 6, color: '#94a3b8' }}>{i + 1}</td>
                      <td style={{ padding: 6 }}>{f.funcion}</td>
                      <td style={{ padding: 6 }}>{f.periodicidad}</td>
                      <td style={{ padding: 6 }}>{f.tipo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyHint />}
          </DetailSection>

          <DetailSection title="Autoridades">
            {Array.isArray(detailItem.authorities_json) && detailItem.authorities_json.length ? (
              <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 13 }}>
                {detailItem.authorities_json.filter(Boolean).map((a, i) => <li key={i}>{a}</li>)}
              </ul>
            ) : <EmptyHint />}
          </DetailSection>

          <DetailSection title="Competencias requeridas">
            {detailItem.competencies_json && Object.values(detailItem.competencies_json).some(v => v) ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {['educacion', 'formacion', 'experiencia', 'habilidades'].map(k => detailItem.competencies_json[k] && (
                  <div key={k} style={{ padding: 8, background: '#f8fafc', borderRadius: 4, fontSize: 12 }}>
                    <strong style={{ textTransform: 'capitalize' }}>{k}:</strong> {detailItem.competencies_json[k]}
                  </div>
                ))}
              </div>
            ) : <EmptyHint />}
          </DetailSection>

          <DetailSection title="Matriz de responsabilidades">
            {detailItem.responsibilities_json && Object.values(detailItem.responsibilities_json).some(v => v?.detalle) ? (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                  <th style={{ padding: 6 }}>Categoría</th><th style={{ padding: 6 }}>Detalle</th><th style={{ padding: 6, width: 80 }}>Nivel</th>
                </tr></thead>
                <tbody>
                  {Object.entries(detailItem.responsibilities_json).map(([k, v]) => (
                    <tr key={k} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: 6, textTransform: 'capitalize', fontWeight: 600 }}>{k.replace(/_/g, ' ')}</td>
                      <td style={{ padding: 6 }}>{v?.detalle || '—'}</td>
                      <td style={{ padding: 6 }}>{v?.nivel || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <EmptyHint />}
          </DetailSection>

          <DetailSection title="Matriz RACI por proceso">
            {Array.isArray(detailItem.raci_json) && detailItem.raci_json.length ? (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead><tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                  <th style={{ padding: 6 }}>Proceso</th><th style={{ padding: 6, width: 60 }}>Rol</th><th style={{ padding: 6 }}>Significa</th>
                </tr></thead>
                <tbody>
                  {detailItem.raci_json.map((r, i) => {
                    const lbl = RACI_LABELS[r.role] || RACI_LABELS.R
                    return (
                      <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ padding: 6 }}>{r.process_name || '(proceso eliminado)'}</td>
                        <td style={{ padding: 6 }}>
                          <span style={{ padding: '2px 8px', borderRadius: 10, background: lbl.color + '20', color: lbl.color, fontWeight: 700 }}>{r.role}</span>
                        </td>
                        <td style={{ padding: 6, color: '#6b7280' }}>{lbl.desc}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : <EmptyHint />}
          </DetailSection>

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            {detailItem.document_url && (
              <a href={detailItem.document_url} target="_blank" rel="noreferrer"
                style={{ padding: '8px 14px', background: '#0ea5e9', color: 'white', borderRadius: 8, textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <FileText size={14} /> Ver manual firmado
              </a>
            )}
            <button onClick={() => handleEdit(detailItem)} style={{ padding: '8px 14px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Editar</button>
            <button onClick={() => handleDelete(detailItem.id)} style={{ padding: '8px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Eliminar</button>
          </div>
        </ModalShell>,
        document.body
      )}
    </div>
  )
}

// ───────────── helpers UI ─────────────
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

function Meta({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: 10, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 13, color: '#111827' }}>{value || '—'}</div>
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
          background: 'white', borderRadius: 14, maxWidth: wide ? 960 : 720, width: '100%',
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
