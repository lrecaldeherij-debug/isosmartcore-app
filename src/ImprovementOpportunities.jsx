import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  TrendingUp, Plus, Search, Filter, Eye, Pencil, Trash2, X,
  Sparkles, Loader2, ExternalLink, ListChecks, Columns,
  CheckCircle2, AlertTriangle, Target, ArrowRight, Lightbulb,
  Award, DollarSign, BarChart3
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'
import { ChangeLogTimeline } from './components/ui'

const OPP_FIELD_LABELS = {
  title: 'Título', description: 'Descripción', source: 'Origen', area: 'Área',
  priority: 'Prioridad', status: 'Estado', priority_score: 'Score prioridad',
  proposed_by: 'Propuesto por', approved_by: 'Aprobado por',
  implementation_start: 'Inicio impl.', implementation_end: 'Fin impl.',
  expected_benefit: 'Beneficio esperado', estimated_cost: 'Costo estimado',
  roi_estimate: 'ROI estimado', actual_benefit: 'Beneficio real',
  effectiveness_score: 'Score eficacia', effectiveness_evaluated_at: 'Eficacia evaluada',
  lessons_learned: 'Lecciones aprendidas',
  process_id: 'Proceso', objective_id: 'Objetivo', strategic_action_id: 'Acción estratégica',
  evidence_url: 'Evidencia',
}

// ───────────────────── Constantes ──────────────────────
const SOURCE_OPTIONS = ['Cliente', 'Empleado', 'Auditoría', 'Revisión Dirección', 'Análisis NCs', 'Indicador', 'Benchmarking', 'Espontánea']
const STATUS_OPTIONS = ['Identificada', 'En evaluación', 'Aprobada', 'En implementación', 'Implementada', 'Descartada']
const PRIORITY_OPTIONS = ['Alta', 'Media', 'Baja']

const STATUS_COLORS = {
  'Identificada':       { bg: '#e0e7ff', color: '#3730a3', border: '#c7d2fe' },
  'En evaluación':      { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  'Aprobada':           { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
  'En implementación':  { bg: '#cffafe', color: '#155e75', border: '#a5f3fc' },
  'Implementada':       { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  'Descartada':         { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
}
const PRIORITY_COLORS = {
  'Alta':  { bg: '#fee2e2', color: '#991b1b' },
  'Media': { bg: '#fef3c7', color: '#92400e' },
  'Baja':  { bg: '#e0e7ff', color: '#3730a3' }
}
const SOURCE_COLORS = {
  'Cliente':              '#ec4899',
  'Empleado':             '#0891b2',
  'Auditoría':            '#f59e0b',
  'Revisión Dirección':   '#7c3aed',
  'Análisis NCs':         '#dc2626',
  'Indicador':            '#0ea5e9',
  'Benchmarking':         '#16a34a',
  'Espontánea':           '#6b7280'
}

// Orden del pipeline para vista Kanban (descarta no entra al pipeline visual)
const PIPELINE_COLS = ['Identificada', 'En evaluación', 'Aprobada', 'En implementación', 'Implementada']

const EMPTY_FORM = {
  title: '', description: '',
  source: 'Espontánea', area: '',
  process_id: '', objective_id: '', review_id: '',
  status: 'Identificada',
  expected_benefit: '', estimated_cost: '', roi_estimate: '',
  priority_score: 50, priority: 'Media',
  proposed_by: '', proposed_at: new Date().toISOString().slice(0, 10),
  evaluated_by: '', evaluated_at: '',
  approved_by: '', approved_at: '',
  implementation_start: '', implementation_end: '',
  effectiveness_evaluated_at: '', actual_benefit: '',
  effectiveness_score: '', lessons_learned: '',
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
  if (parsed && Array.isArray(parsed.opportunities)) return parsed.opportunities
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
export default function ImprovementOpportunities() {
  const [items, setItems] = useState([])
  const [processes, setProcesses] = useState([])
  const [objectives, setObjectives] = useState([])
  const [reviews, setReviews] = useState([])
  const [ncs, setNcs] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [detailItem, setDetailItem] = useState(null)
  const [viewMode, setViewMode] = useState('list')  // list | pipeline

  const [filterStatus, setFilterStatus] = useState('')
  const [filterSource, setFilterSource] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [search, setSearch] = useState('')

  // IA
  const [loadingIA, setLoadingIA] = useState(false)
  const [iaSuggestions, setIaSuggestions] = useState(null)
  const [iaSelected, setIaSelected] = useState(new Set())
  const [iaContext, setIaContext] = useState('')

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true); setTableError(null)
    const [main, pr, ob, rv, nc] = await Promise.all([
      supabase.from('improvement_opportunities').select('*').order('created_at', { ascending: false }),
      supabase.from('processes').select('id, name, process_type').order('name'),
      supabase.from('quality_objectives').select('id, objective, target_value, current_value, status').limit(100),
      supabase.from('management_review').select('id, review_date, review_type, outputs_improvement_opportunities').limit(50),
      supabase.from('non_conformities').select('id, description, root_cause, status, source, created_at').limit(200)
    ])
    if (main.error) { setTableError(main.error.message); setItems([]) }
    else setItems(main.data || [])
    setProcesses(pr.data || [])
    setObjectives(ob.data || [])
    setReviews(rv.data || [])
    setNcs(nc.data || [])
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
    if (!await confirm('¿Eliminar esta oportunidad?', { tone: 'danger', confirmText: 'Eliminar' })) return
    const { error } = await supabase.from('improvement_opportunities').delete().eq('id', id)
    if (error) toast.error(error.message); else { toast.success('Oportunidad eliminada'); setDetailItem(null); fetchAll() }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = { ...form }
    ;['process_id', 'objective_id', 'review_id'].forEach(k => { if (!payload[k]) payload[k] = null })
    ;['proposed_at', 'evaluated_at', 'approved_at', 'implementation_start', 'implementation_end', 'effectiveness_evaluated_at'].forEach(k => {
      if (!payload[k]) payload[k] = null
    })
    payload.estimated_cost = payload.estimated_cost === '' ? null : Number(payload.estimated_cost)
    payload.priority_score = Number(payload.priority_score) || 0
    payload.effectiveness_score = payload.effectiveness_score === '' ? null : Number(payload.effectiveness_score)

    if (editingId) {
      const prev = items.find(i => i.id === editingId)
      const changes = []
      Object.keys(payload).forEach(k => {
        if (prev && JSON.stringify(prev[k] ?? '') !== JSON.stringify(payload[k] ?? '')) {
          changes.push({ field: k, from: prev[k] ?? null, to: payload[k] ?? null })
        }
      })
      payload.change_log = [...(prev?.change_log || []), { at: new Date().toISOString(), changes }]
      const { error } = await supabase.from('improvement_opportunities').update(payload).eq('id', editingId)
      if (error) return toast.error(error.message)
    } else {
      payload.change_log = [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: payload.title }] }]
      const { error } = await supabase.from('improvement_opportunities').insert([payload])
      if (error) return toast.error(error.message)
    }
    setShowForm(false); resetForm(); fetchAll()
  }

  // ───── Mover de columna (Kanban) ─────
  const moveToStatus = async (id, newStatus) => {
    const prev = items.find(i => i.id === id)
    const updates = { status: newStatus }
    const today = new Date().toISOString().slice(0, 10)
    if (newStatus === 'Aprobada' && !prev.approved_at) updates.approved_at = today
    if (newStatus === 'En implementación' && !prev.implementation_start) updates.implementation_start = today
    if (newStatus === 'Implementada' && !prev.implementation_end) updates.implementation_end = today
    updates.change_log = [...(prev?.change_log || []), { at: new Date().toISOString(), changes: [{ field: 'status', from: prev?.status, to: newStatus }] }]
    const { error } = await supabase.from('improvement_opportunities').update(updates).eq('id', id)
    if (error) toast.error(error.message); else fetchAll()
  }

  // ───── Convertir a Acción Estratégica ─────
  const convertirAAccion = async (item) => {
    if (!await confirm(`¿Crear una Acción Estratégica para implementar "${item.title}"?`, { title: 'Convertir a Plan Estratégico' })) return
    const action = {
      title: item.title,
      description: item.description || '',
      source: 'Estratégica',
      category: 'Mejora',
      priority: item.priority || 'Media',
      status: 'Pendiente',
      responsible: item.approved_by || item.proposed_by || 'Por asignar',
      planned_start: new Date().toISOString().slice(0, 10),
      planned_end: item.implementation_end || null,
      objective_id: item.objective_id || null,
      review_id: item.review_id || null,
      process_id: item.process_id || null,
      effectiveness_evaluation: item.expected_benefit || '',
      notes: `Originada en Mejora Continua. Opp ID: ${item.id}`,
      change_log: [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: 'from improvement_opportunity' }] }]
    }
    const { data, error } = await supabase.from('strategic_actions').insert([action]).select().single()
    if (error) return toast.error('Error creando acción: ' + error.message)
    // Vincular la oportunidad con la acción
    await supabase.from('improvement_opportunities').update({
      strategic_action_id: data.id,
      status: item.status === 'Identificada' || item.status === 'En evaluación' ? 'Aprobada' : item.status
    }).eq('id', item.id)
    toast.success('Acción estratégica creada · Mirala en Plan de Acción Estratégico')
    fetchAll()
  }

  // ───── IA: sugerir mejoras desde NCs recurrentes ─────
  const sugerirDesdeNCs = async () => {
    if (ncs.length < 3) return toast.warning('Necesitas al menos 3 NCs registradas para analizar patrones')
    setLoadingIA(true); setIaSuggestions(null); setIaContext('ncs')
    try {
      const ncData = ncs.slice(0, 30).map(n => ({
        description: n.description?.slice(0, 200),
        root_cause: n.root_cause?.slice(0, 150),
        source: n.source
      }))
      const prompt = `Eres consultor ISO 9001 experto en mejora continua. Analiza estas no conformidades, detecta patrones/causas raíz recurrentes, y propón MEJORAS SISTÉMICAS (no parches reactivos) que eliminen los problemas de raíz según ISO 10.3.

NO CONFORMIDADES:
${JSON.stringify(ncData, null, 2)}

Devuelve SOLO un JSON array, sin markdown. Cada oportunidad de mejora:
- title (string, qué se mejorará)
- description (string, descripción de la mejora)
- area (string, área impactada)
- expected_benefit (string, beneficio esperado)
- priority (Alta | Media | Baja)
- estimated_cost (number en USD, estimado conservador)`
      const raw = await consultarIA(prompt, 'Devuelve ÚNICAMENTE JSON array válido.')
      console.log('[IA mejoras NCs] raw:', raw)
      const arr = parseAiArray(raw)
      if (!arr.length) throw new Error('La IA no devolvió mejoras parseables')
      setIaSuggestions(arr.map(s => ({ ...s, source: 'Análisis NCs' })))
      setIaSelected(new Set(arr.map((_, i) => i)))
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    }
    setLoadingIA(false)
  }

  // ───── IA: importar desde salidas de Revisión Dirección ─────
  const sugerirDesdeRevision = async () => {
    const conSalidas = reviews.filter(r => r.outputs_improvement_opportunities)
    if (!conSalidas.length) return toast.warning('Ninguna revisión por la dirección tiene oportunidades de mejora cargadas')
    setLoadingIA(true); setIaSuggestions(null); setIaContext('review')
    try {
      const reviewsText = conSalidas.map(r => `Revisión ${r.review_type} (${r.review_date}):\n${r.outputs_improvement_opportunities}`).join('\n\n')
      const prompt = `Eres consultor ISO 9001. Convierte estas oportunidades de mejora identificadas en revisiones por la dirección en items concretos para el módulo de mejora continua (ISO 10.3).

SALIDAS DE REVISIONES:
${reviewsText}

Devuelve SOLO un JSON array, sin markdown. Cada oportunidad:
- title (string, qué se hará)
- description (string)
- area (string)
- expected_benefit (string)
- priority (Alta | Media | Baja)`
      const raw = await consultarIA(prompt, 'Devuelve ÚNICAMENTE JSON array válido.')
      const arr = parseAiArray(raw)
      if (!arr.length) throw new Error('La IA no devolvió mejoras parseables')
      const reviewId = conSalidas[0].id
      setIaSuggestions(arr.map(s => ({ ...s, source: 'Revisión Dirección', review_id: reviewId })))
      setIaSelected(new Set(arr.map((_, i) => i)))
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    }
    setLoadingIA(false)
  }

  const saveIaSelected = async () => {
    if (!iaSuggestions) return
    const today = new Date().toISOString().slice(0, 10)
    const rows = iaSuggestions
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => iaSelected.has(i))
      .map(({ s }) => ({
        title: s.title || 'Mejora sin título',
        description: s.description || '',
        source: SOURCE_OPTIONS.includes(s.source) ? s.source : 'Espontánea',
        area: s.area || '',
        expected_benefit: s.expected_benefit || '',
        estimated_cost: s.estimated_cost ? Number(s.estimated_cost) : null,
        priority: PRIORITY_OPTIONS.includes(s.priority) ? s.priority : 'Media',
        status: 'Identificada',
        proposed_by: 'IA',
        proposed_at: today,
        review_id: s.review_id || null,
        change_log: [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: 'IA' }] }]
      }))
    if (!rows.length) return setIaSuggestions(null)
    const { error } = await supabase.from('improvement_opportunities').insert(rows)
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
      const hay = [it.title, it.description, it.area, it.proposed_by].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [items, filterStatus, filterSource, filterPriority, search])

  const thisYear = new Date().getFullYear()
  const stats = useMemo(() => ({
    total: items.length,
    enPipeline: items.filter(i => i.status !== 'Implementada' && i.status !== 'Descartada').length,
    implementadasYr: items.filter(i => i.status === 'Implementada' && i.implementation_end?.startsWith(String(thisYear))).length,
    eficaciaProm: (() => {
      const evaluadas = items.filter(i => i.effectiveness_score !== null && i.effectiveness_score !== undefined)
      if (!evaluadas.length) return '—'
      const avg = evaluadas.reduce((s, i) => s + Number(i.effectiveness_score), 0) / evaluadas.length
      return Math.round(avg) + '%'
    })(),
    beneficio: items.filter(i => i.status === 'Implementada' && i.estimated_cost).reduce((s, i) => s + Number(i.estimated_cost), 0)
  }), [items, thisYear])

  const procById = useMemo(() => Object.fromEntries(processes.map(p => [p.id, p])), [processes])
  const objById = useMemo(() => Object.fromEntries(objectives.map(o => [o.id, o])), [objectives])

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1f2937', margin: 0 }}>
            <TrendingUp size={22} /> Mejora Continua
          </h2>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: 13 }}>ISO 10.3 — Pipeline proactivo de oportunidades de mejora</p>
        </div>
        {!showForm && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={sugerirDesdeNCs} disabled={loadingIA}
              style={{ padding: '8px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              {loadingIA && iaContext === 'ncs' ? <Loader2 size={14} className="animate-spin" /> : <AlertTriangle size={14} />}
              Desde NCs recurrentes
            </button>
            <button onClick={sugerirDesdeRevision} disabled={loadingIA}
              style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              {loadingIA && iaContext === 'review' ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Desde Revisión Dirección
            </button>
            <button onClick={() => handleNew()}
              style={{ padding: '8px 14px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <Plus size={16} /> Nueva oportunidad
            </button>
          </div>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['10.3']} />

      {tableError && (
        <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13 }}>
          <strong>Tabla no encontrada:</strong> {tableError}. Aplica <code>iso_migration_v45_improvement_opportunities.sql</code>.
        </div>
      )}

      {/* Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, margin: '16px 0' }}>
        <KPI icon={Lightbulb} label="Total oportunidades" value={stats.total} color="#0ea5e9" />
        <KPI icon={Target} label="En pipeline" value={stats.enPipeline} color="#3b82f6" sub="Aún no cerradas" />
        <KPI icon={CheckCircle2} label={`Implementadas ${thisYear}`} value={stats.implementadasYr} color="#16a34a" />
        <KPI icon={Award} label="Eficacia promedio" value={stats.eficaciaProm} color="#7c3aed" sub="Post-implementación" />
        <KPI icon={DollarSign} label="Inversión total" value={stats.beneficio.toLocaleString()} color="#f59e0b" sub="USD implementado" />
      </div>

      {/* Filtros + vista */}
      {!showForm && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: 2 }}>
            <button onClick={() => setViewMode('list')} style={modeBtn(viewMode === 'list')}><ListChecks size={14} /> Lista</button>
            <button onClick={() => setViewMode('pipeline')} style={modeBtn(viewMode === 'pipeline')}><Columns size={14} /> Pipeline</button>
          </div>
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
          <h3 style={{ margin: '0 0 14px 0', color: '#1f2937' }}>{editingId ? 'Editar' : 'Nueva'} Oportunidad de Mejora</h3>
          <form onSubmit={handleSubmit}>
            <FormSection title="Identificación">
              <Field label="Título *" required value={form.title} onChange={v => setForm({ ...form, title: v })} placeholder="Ej: Digitalizar control de inventario" />
              <div style={{ marginTop: 10 }}>
                <TextArea label="Descripción" rows={3} value={form.description} onChange={v => setForm({ ...form, description: v })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 10 }}>
                <SelectField label="Origen" value={form.source} options={SOURCE_OPTIONS} onChange={v => setForm({ ...form, source: v })} />
                <Field label="Área impactada" value={form.area} onChange={v => setForm({ ...form, area: v })} placeholder="Ej: Logística" />
                <SelectField label="Prioridad" value={form.priority} options={PRIORITY_OPTIONS} onChange={v => setForm({ ...form, priority: v })} />
                <SelectField label="Estado" value={form.status} options={STATUS_OPTIONS} onChange={v => setForm({ ...form, status: v })} />
              </div>
            </FormSection>

            <FormSection title="Vínculos cross-module">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <LinkSelect label="Proceso impactado" value={form.process_id} onChange={v => setForm({ ...form, process_id: v })}
                  options={[{ id: '', label: '— ninguno —' }, ...processes.map(p => ({ id: p.id, label: `${p.name} (${p.process_type})` }))]} />
                <LinkSelect label="Objetivo asociado" value={form.objective_id} onChange={v => setForm({ ...form, objective_id: v })}
                  options={[{ id: '', label: '— ninguno —' }, ...objectives.map(o => ({ id: o.id, label: (o.objective || '').slice(0, 60) }))]} />
                <LinkSelect label="Revisión Dirección origen" value={form.review_id} onChange={v => setForm({ ...form, review_id: v })}
                  options={[{ id: '', label: '— ninguno —' }, ...reviews.map(r => ({ id: r.id, label: `${r.review_type} — ${r.review_date}` }))]} />
              </div>
            </FormSection>

            <FormSection title="Evaluación / business case">
              <TextArea label="Beneficio esperado" rows={2} value={form.expected_benefit} onChange={v => setForm({ ...form, expected_benefit: v })}
                placeholder="Ej: Reducir tiempos de inventario un 40%, eliminar errores manuales" />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
                <Field label="Costo estimado (USD)" type="number" value={form.estimated_cost} onChange={v => setForm({ ...form, estimated_cost: v })} />
                <Field label="ROI estimado" value={form.roi_estimate} onChange={v => setForm({ ...form, roi_estimate: v })} placeholder="Ej: 6 meses" />
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Score prioridad ({form.priority_score})</label>
                  <input type="range" min="0" max="100" step="5" value={form.priority_score}
                    onChange={e => setForm({ ...form, priority_score: Number(e.target.value) })}
                    style={{ width: '100%' }} />
                </div>
              </div>
            </FormSection>

            <FormSection title="Trazabilidad de aprobaciones">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <Field label="Propuesto por" value={form.proposed_by} onChange={v => setForm({ ...form, proposed_by: v })} />
                <Field label="Evaluado por" value={form.evaluated_by} onChange={v => setForm({ ...form, evaluated_by: v })} />
                <Field label="Aprobado por" value={form.approved_by} onChange={v => setForm({ ...form, approved_by: v })} />
                <Field label="Fecha propuesta" type="date" value={form.proposed_at} onChange={v => setForm({ ...form, proposed_at: v })} />
                <Field label="Fecha evaluación" type="date" value={form.evaluated_at} onChange={v => setForm({ ...form, evaluated_at: v })} />
                <Field label="Fecha aprobación" type="date" value={form.approved_at} onChange={v => setForm({ ...form, approved_at: v })} />
              </div>
            </FormSection>

            <FormSection title="Implementación">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Inicio implementación" type="date" value={form.implementation_start} onChange={v => setForm({ ...form, implementation_start: v })} />
                <Field label="Fin implementación" type="date" value={form.implementation_end} onChange={v => setForm({ ...form, implementation_end: v })} />
              </div>
            </FormSection>

            <FormSection title="Eficacia post-implementación (ISO 10.3)" accent="#7c3aed">
              <div style={{ padding: 10, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8, fontSize: 12, color: '#581c87', marginBottom: 10 }}>
                💡 ISO 10.3 cierra el ciclo: <strong>la mejora solo cuenta si se verificó que funcionó</strong>.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Fecha evaluación eficacia" type="date" value={form.effectiveness_evaluated_at} onChange={v => setForm({ ...form, effectiveness_evaluated_at: v })} />
                <Field label="Score eficacia (0-100)" type="number" value={form.effectiveness_score} onChange={v => setForm({ ...form, effectiveness_score: v })} />
              </div>
              <div style={{ marginTop: 10 }}>
                <TextArea label="Beneficio real obtenido" rows={2} value={form.actual_benefit} onChange={v => setForm({ ...form, actual_benefit: v })} />
              </div>
              <div style={{ marginTop: 10 }}>
                <TextArea label="Lecciones aprendidas" rows={2} value={form.lessons_learned} onChange={v => setForm({ ...form, lessons_learned: v })} />
              </div>
            </FormSection>

            <FormSection title="Evidencia y notas">
              <Field label="Evidencia (link)" value={form.evidence_url} onChange={v => setForm({ ...form, evidence_url: v })} placeholder="https://..." />
              <div style={{ marginTop: 10 }}>
                <TextArea label="Notas" rows={2} value={form.notes} onChange={v => setForm({ ...form, notes: v })} />
              </div>
            </FormSection>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={handleCancel}
                style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button type="submit"
                style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                {editingId ? 'Guardar cambios' : 'Crear oportunidad'}
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
                <th style={{ padding: 12 }}>Oportunidad</th>
                <th style={{ padding: 12 }}>Origen</th>
                <th style={{ padding: 12 }}>Área</th>
                <th style={{ padding: 12 }}>Prioridad</th>
                <th style={{ padding: 12 }}>Estado</th>
                <th style={{ padding: 12 }}>Eficacia</th>
                <th style={{ padding: 12, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                  Sin oportunidades. Carga la primera con <strong>Nueva oportunidad</strong> o usa IA.
                </td></tr>
              )}
              {filtered.map(item => {
                const st = STATUS_COLORS[item.status] || STATUS_COLORS['Identificada']
                const pri = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS['Media']
                return (
                  <tr key={item.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 12 }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{item.title}</div>
                      {item.description && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2, maxWidth: 380, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.description}</div>}
                    </td>
                    <td style={{ padding: 12 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, background: (SOURCE_COLORS[item.source] || '#6b7280') + '20', color: SOURCE_COLORS[item.source] || '#6b7280', fontSize: 11, fontWeight: 700 }}>
                        {item.source}
                      </span>
                    </td>
                    <td style={{ padding: 12, fontSize: 13 }}>{item.area || '—'}</td>
                    <td style={{ padding: 12 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, background: pri.bg, color: pri.color, fontSize: 11, fontWeight: 700 }}>{item.priority}</span>
                    </td>
                    <td style={{ padding: 12 }}>
                      <span style={{ padding: '3px 10px', borderRadius: 12, background: st.bg, color: st.color, fontSize: 11, fontWeight: 700, border: `1px solid ${st.border}` }}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: 12, fontSize: 13 }}>
                      {item.effectiveness_score !== null && item.effectiveness_score !== undefined
                        ? <span style={{ fontWeight: 700, color: item.effectiveness_score >= 70 ? '#16a34a' : '#dc2626' }}>{item.effectiveness_score}%</span>
                        : '—'}
                    </td>
                    <td style={{ padding: 12, textAlign: 'right' }}>
                      {!item.strategic_action_id && (item.status === 'Aprobada' || item.status === 'En implementación') && (
                        <button onClick={() => convertirAAccion(item)} title="Convertir en Acción Estratégica"
                          style={iconBtn('#16a34a')}><ArrowRight size={16} /></button>
                      )}
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

      {/* VISTA PIPELINE (KANBAN) */}
      {!showForm && viewMode === 'pipeline' && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${PIPELINE_COLS.length}, 1fr)`, gap: 10 }}>
          {PIPELINE_COLS.map(col => {
            const list = filtered.filter(i => i.status === col)
            const colColor = STATUS_COLORS[col]
            return (
              <div key={col} style={{ background: '#f9fafb', borderRadius: 12, padding: 10, minHeight: 300 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '4px 8px', background: colColor.bg, color: colColor.color, borderRadius: 6 }}>
                  <strong style={{ fontSize: 11 }}>{col}</strong>
                  <span style={{ fontSize: 11, fontWeight: 700 }}>{list.length}</span>
                </div>
                {list.length === 0 && <div style={{ fontSize: 11, color: '#cbd5e1', textAlign: 'center', padding: 12 }}>— vacío —</div>}
                {list.map(item => {
                  const pri = PRIORITY_COLORS[item.priority] || PRIORITY_COLORS['Media']
                  const nextCol = PIPELINE_COLS[PIPELINE_COLS.indexOf(col) + 1]
                  return (
                    <div key={item.id} onClick={() => setDetailItem(item)}
                      style={{ background: 'white', borderRadius: 6, padding: 8, marginBottom: 6, cursor: 'pointer', borderLeft: `3px solid ${SOURCE_COLORS[item.source] || '#6b7280'}`, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: '#111827', marginBottom: 4 }}>{item.title}</div>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
                        <span style={{ padding: '1px 5px', background: pri.bg, color: pri.color, fontSize: 9, borderRadius: 3, fontWeight: 700 }}>{item.priority}</span>
                        {item.area && <span style={{ padding: '1px 5px', background: '#f3f4f6', color: '#6b7280', fontSize: 9, borderRadius: 3 }}>{item.area}</span>}
                      </div>
                      {item.estimated_cost && <div style={{ fontSize: 10, color: '#6b7280' }}>${Number(item.estimated_cost).toLocaleString()}</div>}
                      {nextCol && (
                        <button onClick={(e) => { e.stopPropagation(); moveToStatus(item.id, nextCol) }}
                          style={{ marginTop: 6, width: '100%', fontSize: 9, padding: '3px 4px', background: STATUS_COLORS[nextCol].bg, color: STATUS_COLORS[nextCol].color, border: 'none', borderRadius: 3, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                          <ArrowRight size={9} /> {nextCol}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL DETALLE */}
      {detailItem && createPortal(
        <ModalShell onClose={() => setDetailItem(null)} title={detailItem.title} wide>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: 12, background: '#f8fafc', borderRadius: 6, fontSize: 12 }}>
            <Meta label="Origen" value={detailItem.source} />
            <Meta label="Área" value={detailItem.area} />
            <Meta label="Prioridad" value={detailItem.priority} />
            <Meta label="Estado" value={detailItem.status} />
            <Meta label="Propuesto por" value={detailItem.proposed_by} />
            <Meta label="Aprobado por" value={detailItem.approved_by} />
            <Meta label="Inicio impl." value={detailItem.implementation_start} />
            <Meta label="Fin impl." value={detailItem.implementation_end} />
          </div>

          {detailItem.description && <DetailSection title="Descripción">{detailItem.description}</DetailSection>}

          <DetailSection title="Business case">
            <DetailRow label="Beneficio esperado" value={detailItem.expected_benefit} />
            <DetailRow label="Costo estimado" value={detailItem.estimated_cost ? `$${Number(detailItem.estimated_cost).toLocaleString()}` : null} />
            <DetailRow label="ROI estimado" value={detailItem.roi_estimate} />
            <DetailRow label="Score prioridad" value={detailItem.priority_score} />
          </DetailSection>

          {/* Cross-links */}
          <DetailSection title="Trazabilidad cross-module">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
              {detailItem.process_id && procById[detailItem.process_id] && (
                <CrossLinkCard icon={Target} color="#16a34a" label="Proceso impactado" text={procById[detailItem.process_id].name} />
              )}
              {detailItem.objective_id && objById[detailItem.objective_id] && (
                <CrossLinkCard icon={BarChart3} color="#0ea5e9" label="Objetivo asociado" text={objById[detailItem.objective_id].objective} />
              )}
              {detailItem.strategic_action_id && (
                <CrossLinkCard icon={ArrowRight} color="#16a34a" label="Acción estratégica" text={`Vinculada (ID: ${detailItem.strategic_action_id.slice(0, 8)}...)`} />
              )}
              {!detailItem.process_id && !detailItem.objective_id && !detailItem.strategic_action_id && (
                <div style={{ gridColumn: '1 / -1', fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>Sin vínculos cross-module.</div>
              )}
            </div>
          </DetailSection>

          <DetailSection title="Eficacia post-implementación">
            <div style={{ padding: 10, background: detailItem.effectiveness_evaluated_at ? '#f0fdf4' : '#faf5ff', border: `1px solid ${detailItem.effectiveness_evaluated_at ? '#bbf7d0' : '#e9d5ff'}`, borderRadius: 8 }}>
              <DetailRow label="Evaluada el" value={detailItem.effectiveness_evaluated_at} />
              <DetailRow label="Score" value={detailItem.effectiveness_score !== null ? `${detailItem.effectiveness_score}%` : null} />
              <DetailRow label="Beneficio real" value={detailItem.actual_benefit} />
              <DetailRow label="Lecciones aprendidas" value={detailItem.lessons_learned} />
              {!detailItem.effectiveness_evaluated_at && detailItem.status === 'Implementada' && (
                <div style={{ marginTop: 8, padding: 8, background: '#fef3c7', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
                  ⚠️ Implementada pero sin evaluar eficacia. ISO 10.3 lo requiere.
                </div>
              )}
            </div>
          </DetailSection>

          {detailItem.evidence_url && (
            <DetailSection title="Evidencia">
              <a href={detailItem.evidence_url} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Abrir <ExternalLink size={12} />
              </a>
            </DetailSection>
          )}

          <DetailSection title="🕓 Historial de cambios">
            <ChangeLogTimeline entries={detailItem.change_log || []} fieldLabels={OPP_FIELD_LABELS} max={5} compact />
          </DetailSection>

          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {!detailItem.strategic_action_id && detailItem.status !== 'Descartada' && detailItem.status !== 'Implementada' && (
              <button onClick={() => { convertirAAccion(detailItem); setDetailItem(null) }}
                style={{ padding: '8px 14px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                <ArrowRight size={14} /> Convertir en Acción Estratégica
              </button>
            )}
            <button onClick={() => handleEdit(detailItem)} style={{ padding: '8px 14px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Editar</button>
            <button onClick={() => handleDelete(detailItem.id)} style={{ padding: '8px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Eliminar</button>
          </div>
        </ModalShell>,
        document.body
      )}

      {/* MODAL IA */}
      {iaSuggestions && createPortal(
        <ModalShell onClose={() => setIaSuggestions(null)} title={`Oportunidades sugeridas por IA (${iaContext === 'ncs' ? 'desde NCs' : 'desde Revisión Dirección'})`} wide>
          <p style={{ color: '#6b7280', fontSize: 13 }}>Marcá las oportunidades a cargar al pipeline. Quedan en estado <em>Identificada</em>.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: 8, width: 30 }}></th>
                <th style={{ padding: 8 }}>Oportunidad</th>
                <th style={{ padding: 8 }}>Área</th>
                <th style={{ padding: 8 }}>Prior.</th>
                <th style={{ padding: 8 }}>Beneficio esperado</th>
                <th style={{ padding: 8 }}>Costo</th>
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
                  <td style={{ padding: 8 }}>{s.area || '—'}</td>
                  <td style={{ padding: 8 }}>{s.priority}</td>
                  <td style={{ padding: 8, color: '#6b7280' }}>{s.expected_benefit}</td>
                  <td style={{ padding: 8 }}>{s.estimated_cost ? `$${Number(s.estimated_cost).toLocaleString()}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={saveIaSelected}
              style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Cargar {iaSelected.size} oportunidades
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
