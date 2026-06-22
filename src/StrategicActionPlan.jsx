import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  Target, Plus, Search, Filter, Eye, Pencil, Trash2, X, AlertTriangle,
  Sparkles, Loader2, ExternalLink, ListChecks, Columns, BarChart3,
  CheckCircle2, Calendar, TrendingUp, ShieldAlert, Clock, ArrowRight, Activity
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

// ───────────────────── Constantes ──────────────────────
const SOURCE_OPTIONS = ['Riesgo', 'Oportunidad', 'Objetivo', 'Revisión Dirección', 'Estratégica', 'Auditoría', 'Cliente']
const CATEGORY_OPTIONS = ['Preventiva', 'Correctiva', 'Mejora', 'Capitalizar', 'Mitigación']
const PRIORITY_OPTIONS = ['Alta', 'Media', 'Baja']
const STATUS_OPTIONS = ['Pendiente', 'En curso', 'Completada', 'Suspendida', 'Cancelada']

const STATUS_COLORS = {
  'Pendiente':   { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
  'En curso':    { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
  'Completada':  { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  'Suspendida':  { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  'Cancelada':   { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' },
}
const PRIORITY_COLORS = {
  'Alta':  { bg: '#fee2e2', color: '#991b1b' },
  'Media': { bg: '#fef3c7', color: '#92400e' },
  'Baja':  { bg: '#e0e7ff', color: '#3730a3' }
}
const SOURCE_COLORS = {
  'Riesgo':              '#dc2626',
  'Oportunidad':         '#16a34a',
  'Objetivo':            '#0ea5e9',
  'Revisión Dirección':  '#7c3aed',
  'Estratégica':         '#0891b2',
  'Auditoría':           '#f59e0b',
  'Cliente':             '#ec4899'
}

const KANBAN_COLS = ['Pendiente', 'En curso', 'Completada']
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const EMPTY_FORM = {
  title: '', description: '',
  source: 'Estratégica', category: 'Preventiva',
  risk_id: '', objective_id: '', review_id: '', process_id: '',
  responsible: '', resources_required: '', estimated_cost: '',
  priority: 'Media',
  planned_start: '', planned_end: '',
  status: 'Pendiente', actual_end: '', progress: 0,
  effectiveness_evaluation: '', effectiveness_result: '', effectiveness_evaluated_at: '',
  evidence_url: '', notes: ''
}

// ───────────────────── Helpers IA ──────────────────────
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

function parseAiArray(raw) {
  if (!raw) return []
  const parsed = extractFirstJson(raw)
  if (Array.isArray(parsed)) return parsed
  if (parsed && Array.isArray(parsed.actions)) return parsed.actions
  if (parsed && Array.isArray(parsed.items)) return parsed.items
  if (parsed && typeof parsed === 'object' && (parsed.title || parsed.description)) return [parsed]
  const out = []
  let depth = 0, start = -1, inStr = false, esc = false
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i]
    if (esc) { esc = false; continue }
    if (c === '\\') { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === '{') { if (depth === 0) start = i; depth++ }
    else if (c === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        try {
          const obj = JSON.parse(raw.slice(start, i + 1))
          if (obj && (obj.title || obj.description)) out.push(obj)
        } catch {}
        start = -1
      }
    }
  }
  return out
}

// ───────────────────── Subcomponentes ──────────────────────
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

// ───────────────────── Componente ──────────────────────
export default function StrategicActionPlan() {
  const [items, setItems] = useState([])
  const [risks, setRisks] = useState([])
  const [objectives, setObjectives] = useState([])
  const [reviews, setReviews] = useState([])
  const [processes, setProcesses] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [detailItem, setDetailItem] = useState(null)
  const [viewMode, setViewMode] = useState('list') // list | kanban | gantt
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear())

  const [filterStatus, setFilterStatus] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [search, setSearch] = useState('')

  // IA
  const [loadingIA, setLoadingIA] = useState(false)
  const [iaSuggestions, setIaSuggestions] = useState(null)
  const [iaSelected, setIaSelected] = useState(new Set())
  const [iaContext, setIaContext] = useState('') // 'risks' | 'objectives'

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true); setTableError(null)
    const [main, rk, ob, rv, pr] = await Promise.all([
      supabase.from('strategic_actions').select('*').order('planned_end', { ascending: true, nullsFirst: false }),
      supabase.from('risk_matrix').select('id, risk_description, process_area, probability_initial, impact_initial, status').limit(200),
      supabase.from('quality_objectives').select('id, objective, target_value, current_value, status').limit(200),
      supabase.from('management_review').select('id, review_date, review_type').limit(50),
      supabase.from('processes').select('id, name, process_type').order('name')
    ])
    if (main.error) { setTableError(main.error.message); setItems([]) }
    else setItems(main.data || [])
    setRisks(rk.data || [])
    setObjectives(ob.data || [])
    setReviews(rv.data || [])
    setProcesses(pr.data || [])
    setLoading(false)
  }

  // ───── Form helpers ─────
  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null) }
  const handleNew = (preset = {}) => { setForm({ ...EMPTY_FORM, ...preset }); setShowForm(true) }
  const handleCancel = () => { resetForm(); setShowForm(false) }

  const handleEdit = (item) => {
    setForm({
      ...EMPTY_FORM,
      ...Object.fromEntries(Object.keys(EMPTY_FORM).map(k => [k, item[k] ?? EMPTY_FORM[k]]))
    })
    setEditingId(item.id); setShowForm(true); setDetailItem(null)
  }

  const handleDelete = async (id) => {
    if (!await confirm('¿Eliminar esta acción?', { tone: 'danger', confirmText: 'Eliminar' })) return
    const { error } = await supabase.from('strategic_actions').delete().eq('id', id)
    if (error) toast.error(error.message); else { toast.success('Acción eliminada'); setDetailItem(null); fetchAll() }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = { ...form }
    ;['risk_id', 'objective_id', 'review_id', 'process_id'].forEach(k => { if (!payload[k]) payload[k] = null })
    ;['planned_start', 'planned_end', 'actual_end', 'effectiveness_evaluated_at'].forEach(k => { if (!payload[k]) payload[k] = null })
    payload.estimated_cost = payload.estimated_cost === '' ? null : Number(payload.estimated_cost)
    payload.progress = Number(payload.progress) || 0
    // Si estado = Completada y no hay fecha real, ponerla hoy
    if (payload.status === 'Completada' && !payload.actual_end) payload.actual_end = new Date().toISOString().slice(0, 10)
    if (payload.status === 'Completada') payload.progress = 100

    if (editingId) {
      const prev = items.find(i => i.id === editingId)
      const changes = []
      Object.keys(payload).forEach(k => {
        if (prev && JSON.stringify(prev[k] ?? '') !== JSON.stringify(payload[k] ?? '')) {
          changes.push({ field: k, from: prev[k] ?? null, to: payload[k] ?? null })
        }
      })
      payload.change_log = [...(prev?.change_log || []), { at: new Date().toISOString(), changes }]
      const { error } = await supabase.from('strategic_actions').update(payload).eq('id', editingId)
      if (error) return toast.error(error.message)
    } else {
      payload.change_log = [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: payload.title }] }]
      const { error } = await supabase.from('strategic_actions').insert([payload])
      if (error) return toast.error(error.message)
    }
    setShowForm(false); resetForm(); fetchAll()
  }

  // ───── Drag-like: cambiar status desde Kanban ─────
  const moveToColumn = async (id, newStatus) => {
    const prev = items.find(i => i.id === id)
    const updates = { status: newStatus }
    if (newStatus === 'Completada') {
      updates.progress = 100
      updates.actual_end = new Date().toISOString().slice(0, 10)
    } else if (newStatus === 'En curso' && (!prev?.progress || prev?.progress === 0)) {
      updates.progress = 10
    }
    const newLog = [...(prev?.change_log || []), { at: new Date().toISOString(), changes: [{ field: 'status', from: prev?.status, to: newStatus }] }]
    updates.change_log = newLog
    const { error } = await supabase.from('strategic_actions').update(updates).eq('id', id)
    if (error) toast.error(error.message); else fetchAll()
  }

  // ───── IA: sugerir desde riesgos críticos ─────
  const sugerirDesdeRiesgos = async () => {
    const criticos = risks
      .filter(r => Number(r.probability_initial) * Number(r.impact_initial) >= 25 && r.status !== 'Terminado')
      .slice(0, 8)
    if (!criticos.length) return toast.info('No hay riesgos críticos sin tratar (P×I ≥ 25)')
    setLoadingIA(true); setIaSuggestions(null); setIaContext('risks')
    try {
      const prompt = `Sos consultor ISO 9001. Proponé acciones preventivas/mitigación para tratar estos RIESGOS críticos según ISO 6.1.2.

RIESGOS CRÍTICOS:
${JSON.stringify(criticos.map(r => ({
  id: r.id,
  riesgo: r.risk_description,
  proceso: r.process_area,
  severidad: Number(r.probability_initial) * Number(r.impact_initial)
})), null, 2)}

Devolvé SOLO un JSON array, sin markdown. Cada acción:
- title (string, qué se hará)
- description (string)
- risk_id (string, id del riesgo asociado — usá los IDs EXACTOS)
- category (uno de: Preventiva, Mitigación)
- priority (Alta | Media | Baja, según severidad)
- responsible (string, rol)
- planned_end (string YYYY-MM-DD, fecha realista en próximos 3-6 meses)
- effectiveness_evaluation (string, cómo medir si funcionó)`
      const raw = await consultarIA(prompt, 'Devolvé ÚNICAMENTE JSON array válido.')
      console.log('[IA acciones riesgos] raw:', raw)
      const arr = parseAiArray(raw)
      if (!arr.length) throw new Error('La IA no devolvió acciones parseables')
      setIaSuggestions(arr.map(s => ({ ...s, source: 'Riesgo' })))
      setIaSelected(new Set(arr.map((_, i) => i)))
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    }
    setLoadingIA(false)
  }

  // ───── IA: sugerir desde objetivos no cumplidos ─────
  const sugerirDesdeObjetivos = async () => {
    const noCumplidos = objectives
      .filter(o => o.target_value && o.current_value !== null && Number(o.current_value) < Number(o.target_value))
      .slice(0, 8)
    if (!noCumplidos.length) return toast.info('No hay objetivos sin cumplir (current_value < target_value)')
    setLoadingIA(true); setIaSuggestions(null); setIaContext('objectives')
    try {
      const prompt = `Sos consultor ISO 9001. Proponé acciones de MEJORA para cerrar la brecha entre meta y valor actual de estos objetivos de calidad.

OBJETIVOS NO CUMPLIDOS:
${JSON.stringify(noCumplidos.map(o => ({
  id: o.id,
  objetivo: o.objective,
  meta: o.target_value,
  actual: o.current_value,
  brecha: Number(o.target_value) - Number(o.current_value)
})), null, 2)}

Devolvé SOLO un JSON array, sin markdown. Cada acción:
- title (string)
- description (string)
- objective_id (string, id del objetivo — usá los IDs EXACTOS)
- category (uno de: Mejora, Correctiva)
- priority (Alta | Media | Baja)
- responsible (string, rol)
- planned_end (string YYYY-MM-DD)
- effectiveness_evaluation (string, cómo medir)`
      const raw = await consultarIA(prompt, 'Devolvé ÚNICAMENTE JSON array válido.')
      console.log('[IA acciones objetivos] raw:', raw)
      const arr = parseAiArray(raw)
      if (!arr.length) throw new Error('La IA no devolvió acciones parseables')
      setIaSuggestions(arr.map(s => ({ ...s, source: 'Objetivo' })))
      setIaSelected(new Set(arr.map((_, i) => i)))
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    }
    setLoadingIA(false)
  }

  const saveIaSelected = async () => {
    if (!iaSuggestions) return
    const rows = iaSuggestions
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => iaSelected.has(i))
      .map(({ s }) => ({
        title: s.title || 'Acción sin título',
        description: s.description || '',
        source: SOURCE_OPTIONS.includes(s.source) ? s.source : 'Estratégica',
        category: CATEGORY_OPTIONS.includes(s.category) ? s.category : 'Preventiva',
        priority: PRIORITY_OPTIONS.includes(s.priority) ? s.priority : 'Media',
        status: 'Pendiente',
        responsible: s.responsible || 'Por asignar',
        planned_end: s.planned_end || null,
        risk_id: (iaContext === 'risks' && risks.find(r => r.id === s.risk_id)) ? s.risk_id : null,
        objective_id: (iaContext === 'objectives' && objectives.find(o => o.id === s.objective_id)) ? s.objective_id : null,
        effectiveness_evaluation: s.effectiveness_evaluation || '',
        change_log: [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: 'IA' }] }]
      }))
    if (!rows.length) return setIaSuggestions(null)
    const { error } = await supabase.from('strategic_actions').insert(rows)
    if (error) return toast.error(error.message)
    setIaSuggestions(null); fetchAll()
  }

  // ───── Filtros + stats ─────
  const filtered = useMemo(() => items.filter(it => {
    if (filterStatus && it.status !== filterStatus) return false
    if (filterSource && it.source !== filterSource) return false
    if (filterPriority && it.priority !== filterPriority) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [it.title, it.description, it.responsible].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [items, filterStatus, filterSource, filterPriority, search])

  const today = new Date().toISOString().slice(0, 10)
  const stats = useMemo(() => ({
    total: items.length,
    enCurso: items.filter(i => i.status === 'En curso').length,
    completadas: items.filter(i => i.status === 'Completada').length,
    vencidas: items.filter(i => i.planned_end && i.planned_end < today && i.status !== 'Completada' && i.status !== 'Cancelada').length,
    eficaciaEval: items.filter(i => i.effectiveness_evaluated_at).length,
    porSource: SOURCE_OPTIONS.reduce((acc, s) => { acc[s] = items.filter(i => i.source === s).length; return acc }, {})
  }), [items, today])

  const yearActions = useMemo(() => items.filter(i => {
    const yr = (i.planned_start || i.planned_end || '').slice(0, 4)
    return yr === String(yearFilter) || (!i.planned_start && !i.planned_end && yearFilter === new Date().getFullYear())
  }), [items, yearFilter])

  // Maps para mostrar nombres en lugar de IDs
  const riskById = useMemo(() => Object.fromEntries(risks.map(r => [r.id, r])), [risks])
  const objById = useMemo(() => Object.fromEntries(objectives.map(o => [o.id, o])), [objectives])
  const procById = useMemo(() => Object.fromEntries(processes.map(p => [p.id, p])), [processes])
  const reviewById = useMemo(() => Object.fromEntries(reviews.map(r => [r.id, r])), [reviews])

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1f2937', margin: 0 }}>
            <Target size={22} /> Plan de Acción Estratégico
          </h2>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: 13 }}>ISO 6.1.2 — Planificación, ejecución y eficacia de acciones</p>
        </div>
        {!showForm && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={sugerirDesdeRiesgos} disabled={loadingIA}
              style={{ padding: '8px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              {loadingIA && iaContext === 'risks' ? <Loader2 size={14} className="animate-spin" /> : <ShieldAlert size={14} />}
              Desde riesgos críticos
            </button>
            <button onClick={sugerirDesdeObjetivos} disabled={loadingIA}
              style={{ padding: '8px 14px', background: '#0891b2', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              {loadingIA && iaContext === 'objectives' ? <Loader2 size={14} className="animate-spin" /> : <TrendingUp size={14} />}
              Desde objetivos no cumplidos
            </button>
            <button onClick={() => handleNew()}
              style={{ padding: '8px 14px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <Plus size={16} /> Nueva acción
            </button>
          </div>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['6.1']} />

      {tableError && (
        <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13 }}>
          <strong>Tabla no encontrada:</strong> {tableError}. Aplicá <code>iso_migration_v44_strategic_actions.sql</code>.
        </div>
      )}

      {/* Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, margin: '16px 0' }}>
        <KPI icon={Target} label="Total acciones" value={stats.total} color="#0ea5e9" />
        <KPI icon={Activity} label="En curso" value={stats.enCurso} color="#3b82f6" />
        <KPI icon={CheckCircle2} label="Completadas" value={stats.completadas} color="#16a34a" />
        <KPI icon={AlertTriangle} label="Vencidas" value={stats.vencidas} color="#dc2626" />
        <KPI icon={BarChart3} label="Eficacia evaluada" value={`${stats.eficaciaEval}/${stats.completadas}`} color="#7c3aed" sub="ISO 6.1.2.b" />
      </div>

      {/* Filtros + vista */}
      {!showForm && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: 2 }}>
            <button onClick={() => setViewMode('list')} style={modeBtn(viewMode === 'list')}><ListChecks size={14} /> Lista</button>
            <button onClick={() => setViewMode('kanban')} style={modeBtn(viewMode === 'kanban')}><Columns size={14} /> Kanban</button>
            <button onClick={() => setViewMode('gantt')} style={modeBtn(viewMode === 'gantt')}><BarChart3 size={14} /> Gantt</button>
          </div>
          {viewMode === 'gantt' && (
            <input type="number" value={yearFilter} onChange={e => setYearFilter(Number(e.target.value))}
              style={{ width: 90, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
          )}
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#9ca3af' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
              style={{ width: '100%', padding: '8px 8px 8px 30px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
          </div>
          <Filter size={14} color="#6b7280" />
          <select value={filterSource} onChange={e => setFilterSource(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
            <option value="">Origen: Todos</option>
            {SOURCE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
            <option value="">Estado: Todos</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
            <option value="">Prioridad: Todas</option>
            {PRIORITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {/* FORM */}
      {showForm && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px 0', color: '#1f2937' }}>{editingId ? 'Editar' : 'Nueva'} Acción</h3>
          <form onSubmit={handleSubmit}>
            <FormSection title="Identificación">
              <Field label="Título *" required value={form.title} onChange={v => setForm({ ...form, title: v })} placeholder="Ej: Implementar control cruzado en compras" />
              <div style={{ marginTop: 10 }}>
                <TextArea label="Descripción" rows={3} value={form.description} onChange={v => setForm({ ...form, description: v })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 10 }}>
                <SelectField label="Origen" value={form.source} options={SOURCE_OPTIONS} onChange={v => setForm({ ...form, source: v })} />
                <SelectField label="Categoría" value={form.category} options={CATEGORY_OPTIONS} onChange={v => setForm({ ...form, category: v })} />
                <SelectField label="Prioridad" value={form.priority} options={PRIORITY_OPTIONS} onChange={v => setForm({ ...form, priority: v })} />
                <SelectField label="Estado" value={form.status} options={STATUS_OPTIONS} onChange={v => setForm({ ...form, status: v })} />
              </div>
            </FormSection>

            <FormSection title="Vínculos cross-module (trazabilidad ISO)">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <LinkSelect label="Riesgo de origen" value={form.risk_id} onChange={v => setForm({ ...form, risk_id: v })}
                  options={[{ id: '', label: '— ninguno —' }, ...risks.map(r => ({ id: r.id, label: `${r.risk_description?.slice(0, 60) || 'Sin descripción'} (${r.process_area || '—'})` }))]} />
                <LinkSelect label="Objetivo de calidad" value={form.objective_id} onChange={v => setForm({ ...form, objective_id: v })}
                  options={[{ id: '', label: '— ninguno —' }, ...objectives.map(o => ({ id: o.id, label: o.objective?.slice(0, 80) || 'Sin nombre' }))]} />
                <LinkSelect label="Revisión por la Dirección" value={form.review_id} onChange={v => setForm({ ...form, review_id: v })}
                  options={[{ id: '', label: '— ninguno —' }, ...reviews.map(r => ({ id: r.id, label: `${r.review_type} — ${r.review_date}` }))]} />
                <LinkSelect label="Proceso afectado" value={form.process_id} onChange={v => setForm({ ...form, process_id: v })}
                  options={[{ id: '', label: '— ninguno —' }, ...processes.map(p => ({ id: p.id, label: `${p.name} (${p.process_type})` }))]} />
              </div>
            </FormSection>

            <FormSection title="Planificación">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                <Field label="Responsable" value={form.responsible} onChange={v => setForm({ ...form, responsible: v })} placeholder="Nombre o rol" />
                <Field label="Inicio planificado" type="date" value={form.planned_start} onChange={v => setForm({ ...form, planned_start: v })} />
                <Field label="Fin planificado" type="date" value={form.planned_end} onChange={v => setForm({ ...form, planned_end: v })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10, marginTop: 10 }}>
                <Field label="Recursos requeridos" value={form.resources_required} onChange={v => setForm({ ...form, resources_required: v })} placeholder="Personal, equipos, presupuesto..." />
                <Field label="Costo estimado" type="number" value={form.estimated_cost} onChange={v => setForm({ ...form, estimated_cost: v })} />
              </div>
            </FormSection>

            <FormSection title="Ejecución y progreso">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Avance ({form.progress}%)</label>
                  <input type="range" min="0" max="100" step="5" value={form.progress}
                    onChange={e => setForm({ ...form, progress: Number(e.target.value) })}
                    style={{ width: '100%' }} />
                </div>
                <Field label="Fin real" type="date" value={form.actual_end} onChange={v => setForm({ ...form, actual_end: v })} />
              </div>
            </FormSection>

            <FormSection title="Evaluación de eficacia (ISO 6.1.2.b)" accent="#7c3aed">
              <div style={{ padding: 10, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, fontSize: 12, color: '#581c87', marginBottom: 10 }}>
                💡 ISO 6.1.2 exige <strong>evaluar si la acción funcionó</strong>. Definí cómo se medirá <em>antes</em>, y completá el resultado al cerrar.
              </div>
              <TextArea label="¿Cómo se evaluará la eficacia?" rows={2} value={form.effectiveness_evaluation} onChange={v => setForm({ ...form, effectiveness_evaluation: v })}
                placeholder="Ej: Reducción del 30% en NCs del proceso X medido a los 3 meses post-implementación" />
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr', gap: 10, marginTop: 10 }}>
                <TextArea label="Resultado de la evaluación" rows={2} value={form.effectiveness_result} onChange={v => setForm({ ...form, effectiveness_result: v })} placeholder="Completá tras la evaluación" />
                <Field label="Evaluada el" type="date" value={form.effectiveness_evaluated_at} onChange={v => setForm({ ...form, effectiveness_evaluated_at: v })} />
              </div>
            </FormSection>

            <FormSection title="Evidencia">
              <Field label="Link de evidencia (Drive)" value={form.evidence_url} onChange={v => setForm({ ...form, evidence_url: v })} placeholder="https://drive.google.com/..." />
              <div style={{ marginTop: 10 }}>
                <TextArea label="Notas" rows={2} value={form.notes} onChange={v => setForm({ ...form, notes: v })} />
              </div>
            </FormSection>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={handleCancel}
                style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button type="submit"
                style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                {editingId ? 'Guardar cambios' : 'Crear acción'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* VISTA LISTA */}
      {!showForm && viewMode === 'list' && (loading ? <p>Cargando...</p> : (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left', fontSize: 12, color: '#374151', textTransform: 'uppercase' }}>
                <th style={{ padding: 12 }}>Acción</th>
                <th style={{ padding: 12 }}>Origen</th>
                <th style={{ padding: 12 }}>Responsable</th>
                <th style={{ padding: 12 }}>Plazo</th>
                <th style={{ padding: 12 }}>Progreso</th>
                <th style={{ padding: 12 }}>Estado</th>
                <th style={{ padding: 12, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                  Sin acciones. Generá las primeras con <strong>"Desde riesgos críticos"</strong> o <strong>"Desde objetivos no cumplidos"</strong>.
                </td></tr>
              )}
              {filtered.map(item => {
                const st = STATUS_COLORS[item.status] || STATUS_COLORS['Pendiente']
                const pri = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS['Media']
                const vencida = item.planned_end && item.planned_end < today && item.status !== 'Completada' && item.status !== 'Cancelada'
                return (
                  <tr key={item.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 12 }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{item.title}</div>
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <span style={{ padding: '1px 6px', background: pri.bg, color: pri.color, fontSize: 10, borderRadius: 4, fontWeight: 700 }}>{item.priority}</span>
                        <span style={{ padding: '1px 6px', background: '#f3f4f6', color: '#6b7280', fontSize: 10, borderRadius: 4 }}>{item.category}</span>
                      </div>
                    </td>
                    <td style={{ padding: 12 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, background: (SOURCE_COLORS[item.source] || '#6b7280') + '20', color: SOURCE_COLORS[item.source] || '#6b7280', fontSize: 11, fontWeight: 700 }}>
                        {item.source}
                      </span>
                    </td>
                    <td style={{ padding: 12, fontSize: 13 }}>{item.responsible || '—'}</td>
                    <td style={{ padding: 12, fontSize: 12, color: vencida ? '#dc2626' : '#374151', fontWeight: vencida ? 700 : 400 }}>
                      {item.planned_end || '—'}
                      {vencida && <div style={{ fontSize: 10 }}>VENCIDA</div>}
                    </td>
                    <td style={{ padding: 12, width: 120 }}>
                      <div style={{ height: 6, background: '#e5e7eb', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ width: `${item.progress || 0}%`, height: '100%', background: item.progress >= 100 ? '#16a34a' : '#3b82f6' }} />
                      </div>
                      <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>{item.progress || 0}%</div>
                    </td>
                    <td style={{ padding: 12 }}>
                      <span style={{ padding: '3px 10px', borderRadius: 12, background: st.bg, color: st.color, fontSize: 11, fontWeight: 700, border: `1px solid ${st.border}` }}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: 12, textAlign: 'right' }}>
                      <button onClick={() => setDetailItem(item)} title="Detalle" style={iconBtn('#0ea5e9')}><Eye size={16} /></button>
                      <button onClick={() => handleEdit(item)} title="Editar" style={iconBtn('#f59e0b')}><Pencil size={16} /></button>
                      <button onClick={() => handleDelete(item.id)} title="Eliminar" style={iconBtn('#6b7280')}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* VISTA KANBAN */}
      {!showForm && viewMode === 'kanban' && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${KANBAN_COLS.length}, 1fr)`, gap: 12 }}>
          {KANBAN_COLS.map(col => {
            const list = filtered.filter(i => i.status === col)
            const colColor = STATUS_COLORS[col]
            return (
              <div key={col} style={{ background: '#f9fafb', borderRadius: 12, padding: 12, minHeight: 300 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, padding: '4px 8px', background: colColor.bg, color: colColor.color, borderRadius: 6 }}>
                  <strong style={{ fontSize: 12 }}>{col}</strong>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{list.length}</span>
                </div>
                {list.length === 0 && <div style={{ fontSize: 11, color: '#cbd5e1', textAlign: 'center', padding: 12 }}>— sin acciones —</div>}
                {list.map(item => {
                  const pri = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS['Media']
                  const vencida = item.planned_end && item.planned_end < today && col !== 'Completada'
                  return (
                    <div key={item.id} onClick={() => setDetailItem(item)}
                      style={{ background: 'white', borderRadius: 8, padding: 10, marginBottom: 8, cursor: 'pointer', borderLeft: `4px solid ${SOURCE_COLORS[item.source] || '#6b7280'}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', marginBottom: 4 }}>{item.title}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ padding: '1px 6px', background: pri.bg, color: pri.color, fontSize: 9, borderRadius: 4, fontWeight: 700 }}>{item.priority}</span>
                        {vencida && <span style={{ padding: '1px 6px', background: '#fee2e2', color: '#991b1b', fontSize: 9, borderRadius: 4, fontWeight: 700 }}>VENCIDA</span>}
                      </div>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>{item.responsible || 'Sin responsable'} · {item.planned_end || 'sin plazo'}</div>
                      <div style={{ marginTop: 6, height: 4, background: '#e5e7eb', borderRadius: 2 }}>
                        <div style={{ width: `${item.progress || 0}%`, height: '100%', background: '#3b82f6', borderRadius: 2 }} />
                      </div>
                      {/* Mover */}
                      <div style={{ marginTop: 6, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {KANBAN_COLS.filter(c => c !== col).map(c => (
                          <button key={c} onClick={(e) => { e.stopPropagation(); moveToColumn(item.id, c) }}
                            style={{ flex: 1, fontSize: 9, padding: '2px 4px', background: STATUS_COLORS[c].bg, color: STATUS_COLORS[c].color, border: 'none', borderRadius: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                            <ArrowRight size={9} /> {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* VISTA GANTT */}
      {!showForm && viewMode === 'gantt' && (
        <GanttView items={yearActions} year={yearFilter} today={today} onSelect={setDetailItem} />
      )}

      {/* MODAL DETALLE */}
      {detailItem && createPortal(
        <ModalShell onClose={() => setDetailItem(null)} title={detailItem.title} wide>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: 12, background: '#f8fafc', borderRadius: 6, fontSize: 12 }}>
            <Meta label="Origen" value={detailItem.source} />
            <Meta label="Categoría" value={detailItem.category} />
            <Meta label="Prioridad" value={detailItem.priority} />
            <Meta label="Estado" value={detailItem.status} />
            <Meta label="Responsable" value={detailItem.responsible} />
            <Meta label="Inicio plan." value={detailItem.planned_start} />
            <Meta label="Fin plan." value={detailItem.planned_end} />
            <Meta label="Fin real" value={detailItem.actual_end} />
          </div>

          {/* Progreso visual */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Progreso: {detailItem.progress || 0}%</div>
            <div style={{ height: 10, background: '#e5e7eb', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: `${detailItem.progress || 0}%`, height: '100%', background: detailItem.progress >= 100 ? '#16a34a' : '#3b82f6' }} />
            </div>
          </div>

          {detailItem.description && (
            <DetailSection title="Descripción">{detailItem.description}</DetailSection>
          )}

          {/* Cross-links */}
          <DetailSection title="Trazabilidad ISO (cross-module)">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
              {detailItem.risk_id && riskById[detailItem.risk_id] && (
                <CrossLinkCard icon={ShieldAlert} color="#dc2626" label="Riesgo origen" text={riskById[detailItem.risk_id].risk_description} />
              )}
              {detailItem.objective_id && objById[detailItem.objective_id] && (
                <CrossLinkCard icon={Target} color="#0ea5e9" label="Objetivo" text={objById[detailItem.objective_id].objective} />
              )}
              {detailItem.review_id && reviewById[detailItem.review_id] && (
                <CrossLinkCard icon={BarChart3} color="#7c3aed" label="Revisión Dirección" text={`${reviewById[detailItem.review_id].review_type} — ${reviewById[detailItem.review_id].review_date}`} />
              )}
              {detailItem.process_id && procById[detailItem.process_id] && (
                <CrossLinkCard icon={Activity} color="#16a34a" label="Proceso afectado" text={procById[detailItem.process_id].name} />
              )}
              {!detailItem.risk_id && !detailItem.objective_id && !detailItem.review_id && !detailItem.process_id && (
                <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Sin vínculos cross-module.</div>
              )}
            </div>
          </DetailSection>

          <DetailSection title="Planificación">
            <DetailRow label="Recursos" value={detailItem.resources_required} />
            <DetailRow label="Costo estimado" value={detailItem.estimated_cost} />
          </DetailSection>

          <DetailSection title="Eficacia (ISO 6.1.2.b)">
            <div style={{ padding: 10, background: detailItem.effectiveness_evaluated_at ? '#f0fdf4' : '#faf5ff', border: `1px solid ${detailItem.effectiveness_evaluated_at ? '#bbf7d0' : '#e9d5ff'}`, borderRadius: 8 }}>
              <DetailRow label="¿Cómo evaluar?" value={detailItem.effectiveness_evaluation} />
              <DetailRow label="Resultado" value={detailItem.effectiveness_result} />
              <DetailRow label="Evaluada el" value={detailItem.effectiveness_evaluated_at} />
              {!detailItem.effectiveness_evaluated_at && detailItem.status === 'Completada' && (
                <div style={{ marginTop: 8, padding: 8, background: '#fef3c7', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
                  ⚠️ Acción completada sin evaluar eficacia. ISO 6.1.2.b lo requiere.
                </div>
              )}
            </div>
          </DetailSection>

          <DetailSection title="Evidencia">
            {detailItem.evidence_url ? (
              <a href={detailItem.evidence_url} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Abrir <ExternalLink size={12} />
              </a>
            ) : <EmptyHint />}
            {detailItem.notes && <DetailRow label="Notas" value={detailItem.notes} />}
          </DetailSection>

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={() => handleEdit(detailItem)} style={{ padding: '8px 14px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Editar</button>
            <button onClick={() => handleDelete(detailItem.id)} style={{ padding: '8px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Eliminar</button>
          </div>
        </ModalShell>,
        document.body
      )}

      {/* MODAL IA */}
      {iaSuggestions && createPortal(
        <ModalShell onClose={() => setIaSuggestions(null)} title={`Acciones sugeridas por IA (${iaContext === 'risks' ? 'desde riesgos' : 'desde objetivos'})`} wide>
          <p style={{ color: '#6b7280', fontSize: 13 }}>Marcá las acciones a cargar. Quedan en estado <em>Pendiente</em>.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: 8, width: 30 }}></th>
                <th style={{ padding: 8 }}>Acción</th>
                <th style={{ padding: 8 }}>Cat.</th>
                <th style={{ padding: 8 }}>Prior.</th>
                <th style={{ padding: 8 }}>Responsable</th>
                <th style={{ padding: 8 }}>Plazo</th>
              </tr>
            </thead>
            <tbody>
              {iaSuggestions.map((s, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8 }}>
                    <input type="checkbox" checked={iaSelected.has(i)} onChange={e => {
                      const next = new Set(iaSelected)
                      if (e.target.checked) next.add(i); else next.delete(i)
                      setIaSelected(next)
                    }} />
                  </td>
                  <td style={{ padding: 8 }}>
                    <strong>{s.title}</strong>
                    {s.description && <div style={{ fontSize: 11, color: '#6b7280' }}>{s.description}</div>}
                  </td>
                  <td style={{ padding: 8 }}>{s.category}</td>
                  <td style={{ padding: 8 }}>{s.priority}</td>
                  <td style={{ padding: 8 }}>{s.responsible}</td>
                  <td style={{ padding: 8 }}>{s.planned_end}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={saveIaSelected}
              style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Cargar {iaSelected.size} acciones
            </button>
            <button onClick={() => setIaSuggestions(null)}
              style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Cancelar
            </button>
          </div>
        </ModalShell>,
        document.body
      )}
    </div>
  )
}

// ───────────── Vista Gantt ─────────────
function GanttView({ items, year, today, onSelect }) {
  const yearStart = new Date(year, 0, 1).getTime()
  const yearEnd = new Date(year, 11, 31).getTime()
  const yearMs = yearEnd - yearStart

  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      <h3 style={{ margin: '0 0 12px 0', fontSize: 14, color: '#1f2937' }}>Gantt {year}</h3>
      {/* Header con meses */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 8, marginBottom: 8 }}>
        <div></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12, 1fr)', gap: 1 }}>
          {MONTHS.map((m, i) => (
            <div key={i} style={{ fontSize: 10, color: '#6b7280', textAlign: 'center', padding: 2, background: '#f9fafb', borderRadius: 3 }}>{m}</div>
          ))}
        </div>
      </div>

      {items.length === 0 && <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: 20 }}>Sin acciones planificadas para {year}.</div>}

      {items.map(item => {
        const start = item.planned_start ? new Date(item.planned_start).getTime() : yearStart
        const end = item.planned_end ? new Date(item.planned_end).getTime() : yearEnd
        const left = Math.max(0, ((start - yearStart) / yearMs) * 100)
        const width = Math.min(100 - left, ((end - start) / yearMs) * 100) || 2
        const st = STATUS_COLORS[item.status] || STATUS_COLORS['Pendiente']
        const vencida = item.planned_end && item.planned_end < today && item.status !== 'Completada'
        return (
          <div key={item.id} style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 8, marginBottom: 4, alignItems: 'center' }}>
            <div onClick={() => onSelect(item)} style={{ fontSize: 11, padding: '4px 8px', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <strong>{item.title}</strong>
              <div style={{ fontSize: 9, color: '#6b7280' }}>{item.responsible || '—'}</div>
            </div>
            <div style={{ position: 'relative', height: 24, background: '#f3f4f6', borderRadius: 4 }}>
              <div onClick={() => onSelect(item)} title={`${item.planned_start || '?'} → ${item.planned_end || '?'}`}
                style={{
                  position: 'absolute', left: `${left}%`, width: `${width}%`, height: '100%',
                  background: vencida ? '#fee2e2' : st.bg,
                  border: `1px solid ${vencida ? '#dc2626' : st.color}`,
                  borderRadius: 4, cursor: 'pointer', display: 'flex', alignItems: 'center', padding: '0 4px',
                  fontSize: 9, color: st.color, fontWeight: 700, overflow: 'hidden'
                }}>
                {item.progress > 0 && (
                  <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: `${item.progress}%`, background: st.color, opacity: 0.3 }} />
                )}
                <span style={{ position: 'relative', zIndex: 1 }}>{item.progress || 0}%</span>
              </div>
            </div>
          </div>
        )
      })}
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
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ color: '#6b7280', fontSize: 13 }}>{label}</div>
      <div style={{ color: '#111827', fontSize: 13, whiteSpace: 'pre-wrap' }}>{value}</div>
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

function CrossLinkCard({ icon: Icon, color, label, text }) {
  return (
    <div style={{ padding: 10, background: color + '10', border: `1px solid ${color}40`, borderRadius: 8, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <Icon size={16} color={color} style={{ flexShrink: 0, marginTop: 2 }} />
      <div>
        <div style={{ fontSize: 10, color, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>{label}</div>
        <div style={{ fontSize: 12, color: '#111827' }}>{text}</div>
      </div>
    </div>
  )
}

function EmptyHint() {
  return <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: '6px 10px', background: '#f8fafc', borderRadius: 4 }}>Sin registros.</p>
}

function iconBtn(color) {
  return { background: 'transparent', border: 'none', cursor: 'pointer', color, padding: 6, marginLeft: 4 }
}

function modeBtn(active) {
  return {
    padding: '6px 12px', border: 'none', background: active ? '#0ea5e9' : 'transparent',
    color: active ? 'white' : '#374151', borderRadius: 6, cursor: 'pointer', fontSize: 13,
    fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6
  }
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
