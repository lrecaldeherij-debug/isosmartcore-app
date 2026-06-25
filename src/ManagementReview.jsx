import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Search, Filter, Plus, Eye, Pencil, Trash2, X, AlertTriangle, ClipboardCheck,
  Sparkles, Loader2, ExternalLink, Target, FileText, Users, BarChart3,
  ChevronDown, ChevronRight, ListChecks
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'
import { ChangeLogTimeline } from './components/ui'
import { useOrg } from './OrgContext'
import { exportManagementReview } from './exports/exportManagementReview'

const REVIEW_FIELD_LABELS = {
  review_type: 'Tipo', status: 'Estado', review_date: 'Fecha revisión',
  period_start: 'Inicio período', period_end: 'Fin período',
  chairperson: 'Presidente', attendees: 'Asistentes', agenda: 'Agenda',
  inputs_previous_actions: 'Acciones previas', inputs_changes: 'Cambios',
  inputs_performance: 'Desempeño', inputs_objectives: 'Objetivos',
  inputs_audit_results: 'Auditorías', inputs_nonconformities: 'NCs',
  inputs_supplier_performance: 'Proveedores', inputs_customer_feedback: 'Clientes',
  inputs_resources: 'Recursos', inputs_risks: 'Riesgos',
  outputs_improvement_opportunities: 'Oportunidades de mejora',
  outputs_changes_needed: 'Cambios necesarios', outputs_resource_needs: 'Necesidades de recursos',
  report_url: 'Acta',
}

// ───────────────────── Constantes ──────────────────────
const TYPE_OPTIONS = ['Anual', 'Semestral', 'Trimestral', 'Extraordinaria']
const STATUS_OPTIONS = ['Programada', 'En Ejecución', 'Cerrada', 'Cancelada']
const ACTION_STATUS = ['Pendiente', 'En curso', 'Cerrada', 'Cancelada']
const ACTION_PRIORITY = ['Alta', 'Media', 'Baja']
const ACTION_CATEGORY = ['Mejora', 'Cambio', 'Recurso']

const STATUS_COLORS = {
  'Programada':   { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
  'En Ejecución': { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  'Cerrada':      { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  'Cancelada':    { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
}

const EMPTY_FORM = {
  review_type: 'Anual',
  review_date: new Date().toISOString().slice(0, 10),
  period_start: '',
  period_end: '',
  status: 'Programada',
  chairperson: '',
  agenda: '',
  attendees: '',  // CSV "Nombre|Cargo, Nombre|Cargo"
  inputs_previous_actions: '',
  inputs_changes: '',
  inputs_performance: '',
  inputs_audit_results: '',
  inputs_nonconformities: '',
  inputs_supplier_performance: '',
  inputs_customer_feedback: '',
  inputs_resources: '',
  inputs_risks: '',
  inputs_objectives: '',
  outputs_improvement_opportunities: '',
  outputs_changes_needed: '',
  outputs_resource_needs: '',
  report_url: '',
  review_inputs: '',
  review_outputs: '',
  review_status: 'Completa'
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
  if (parsed && typeof parsed === 'object') return [parsed]
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
        try { out.push(JSON.parse(raw.slice(start, i + 1))) } catch {}
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

function Collapsible({ title, children, defaultOpen = true, badge }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div style={{ marginBottom: 14, border: '1px solid #e5e7eb', borderRadius: 10, overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen(!open)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: '#f9fafb', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
        <span style={{ fontWeight: 700, fontSize: 13, color: '#1f2937', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 8 }}>
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {title}
        </span>
        {badge && <span style={{ fontSize: 11, color: '#6b7280' }}>{badge}</span>}
      </button>
      {open && <div style={{ padding: 14 }}>{children}</div>}
    </div>
  )
}

function DetailRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 10, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ color: '#6b7280', fontSize: 13 }}>{label}</div>
      <div style={{ color: '#111827', fontSize: 13, whiteSpace: 'pre-wrap' }}>{value}</div>
    </div>
  )
}

// ───────────────────── Componente ──────────────────────
export default function ManagementReview({ alReportar }) {
  const { org } = useOrg()
  const [items, setItems] = useState([])
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [detailItem, setDetailItem] = useState(null)
  const [actionModal, setActionModal] = useState(null) // { reviewId, editing }
  const [actionForm, setActionForm] = useState({
    description: '', responsible: '', due_date: '',
    status: 'Pendiente', priority: 'Media', category: 'Mejora', notes: ''
  })

  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [search, setSearch] = useState('')

  // IA
  const [loadingIA, setLoadingIA] = useState(false)
  const [iaSuggestions, setIaSuggestions] = useState(null)
  const [iaSelected, setIaSelected] = useState(new Set())
  const [loadingKPI, setLoadingKPI] = useState(false)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true); setTableError(null)
    const { data, error } = await supabase
      .from('management_review')
      .select('*')
      .order('review_date', { ascending: false })
    if (error) { setTableError(error.message); setItems([]) }
    else setItems(data || [])

    const { data: acts } = await supabase
      .from('management_review_actions')
      .select('*')
      .order('due_date', { ascending: true, nullsFirst: false })
    setActions(acts || [])
    setLoading(false)
  }

  // ─────────── Form principal ────────────
  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null) }
  const handleNew = () => { resetForm(); setShowForm(true) }
  const handleCancel = () => { resetForm(); setShowForm(false) }

  const exportarRevisionPdf = async (item) => {
    const t = toast.loading('Generando acta…')
    try {
      const doc = await exportManagementReview(org, item.id)
      doc.save(`REV-${(item.id || '').slice(0, 8).toUpperCase()}.pdf`)
      toast.done(t, 'Acta descargada')
    } catch (err) {
      toast.fail(t, 'Error generando acta: ' + err.message)
    }
  }

  const handleEdit = (item) => {
    setForm({
      ...EMPTY_FORM,
      ...Object.fromEntries(Object.keys(EMPTY_FORM).map(k => [k, item[k] ?? EMPTY_FORM[k]])),
      attendees: Array.isArray(item.attendees)
        ? item.attendees.map(a => `${a.name || ''}|${a.role || ''}`).join(', ')
        : (item.attendees || '')
    })
    setEditingId(item.id); setShowForm(true); setDetailItem(null)
  }

  const handleDelete = async (id) => {
    if (!await confirm('¿Eliminar esta revisión y sus acciones derivadas?', { tone: 'danger', confirmText: 'Eliminar' })) return
    const { error } = await supabase.from('management_review').delete().eq('id', id)
    if (error) toast.error(error.message); else { toast.success('Revisión eliminada'); fetchAll() }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = { ...form }
    ;['period_start', 'period_end', 'review_date'].forEach(k => { if (!payload[k]) payload[k] = null })
    // attendees parse "Nombre|Cargo, Nombre|Cargo"
    payload.attendees = (payload.attendees || '').toString().split(',').map(s => s.trim()).filter(Boolean)
      .map(s => { const [name, role] = s.split('|').map(x => (x || '').trim()); return { name, role: role || '' } })
    payload.review_status = payload.status === 'Cerrada' ? 'Completa' : 'Pendiente'
    // backward compat
    payload.review_inputs = payload.review_inputs || [
      payload.inputs_performance, payload.inputs_audit_results, payload.inputs_nonconformities
    ].filter(Boolean).join(' | ')
    payload.review_outputs = payload.review_outputs || [
      payload.outputs_improvement_opportunities, payload.outputs_changes_needed, payload.outputs_resource_needs
    ].filter(Boolean).join(' | ')

    if (editingId) {
      const prev = items.find(i => i.id === editingId)
      const changes = []
      Object.keys(payload).forEach(k => {
        if (prev && JSON.stringify(prev[k] ?? '') !== JSON.stringify(payload[k] ?? '')) {
          changes.push({ field: k, from: prev[k] ?? null, to: payload[k] ?? null })
        }
      })
      payload.change_log = [...(prev?.change_log || []), { at: new Date().toISOString(), changes }]
      const { error } = await supabase.from('management_review').update(payload).eq('id', editingId)
      if (error) return toast.error(error.message)
    } else {
      payload.change_log = [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: payload.review_type }] }]
      const { error } = await supabase.from('management_review').insert([payload])
      if (error) return toast.error(error.message)
    }
    setShowForm(false); resetForm(); fetchAll()
  }

  // ─────────── Cargar KPIs del período ────────────
  const cargarKPIsDelPeriodo = async () => {
    if (!form.period_start || !form.period_end) {
      return toast.warning('Define primero el período (inicio/fin) para calcular KPIs')
    }
    setLoadingKPI(true)
    try {
      const start = form.period_start, end = form.period_end
      const [ncs, audits, objs, suppliers, complaints] = await Promise.all([
        supabase.from('non_conformities').select('id, status, description, created_at').gte('created_at', start).lte('created_at', end + 'T23:59:59'),
        supabase.from('internal_audits').select('id, audit_process, status, findings_count, planned_date').gte('planned_date', start).lte('planned_date', end),
        supabase.from('quality_objectives').select('id, objective, target_value, current_value, status').limit(50),
        supabase.from('suppliers').select('id, name, evaluation_score, status').limit(100),
        supabase.from('non_conformities').select('id, description').eq('source', 'Queja Cliente').gte('created_at', start).lte('created_at', end + 'T23:59:59').limit(50)
      ])

      const ncRows = ncs.data || []
      const ncOpen = ncRows.filter(n => n.status !== 'Cerrado').length
      const ncClosed = ncRows.filter(n => n.status === 'Cerrado').length
      const auditRows = audits.data || []
      const auditClosed = auditRows.filter(a => a.status === 'Cerrada').length
      const findingsTotal = auditRows.reduce((s, a) => s + (a.findings_count || 0), 0)
      const objRows = objs.data || []
      const objCumplidos = objRows.filter(o => {
        if (o.current_value == null || o.target_value == null) return false
        const cur = Number(o.current_value), tgt = Number(o.target_value)
        return Number.isFinite(cur) && Number.isFinite(tgt) && cur >= tgt
      }).length
      const supRows = suppliers.data || []
      const supRej = supRows.filter(s => s.status === 'Rechazado').length
      const supCond = supRows.filter(s => s.status === 'Condicionado').length
      const supAvg = supRows.length ? (supRows.reduce((s, x) => s + (Number(x.evaluation_score) || 0), 0) / supRows.length).toFixed(1) : 'N/D'
      const complRows = complaints.data || []

      setForm(f => ({
        ...f,
        inputs_performance: f.inputs_performance ||
          `Período: ${start} a ${end}\n- Auditorías cerradas: ${auditClosed}\n- Hallazgos totales: ${findingsTotal}`,
        inputs_audit_results: f.inputs_audit_results ||
          auditRows.map(a => `${a.planned_date}: ${a.audit_process} (${a.status}, ${a.findings_count || 0} hallazgos)`).join('\n') || 'Sin auditorías en el período',
        inputs_nonconformities: f.inputs_nonconformities ||
          `NCs abiertas en el período: ${ncOpen}\nNCs cerradas en el período: ${ncClosed}\nTotal: ${ncRows.length}`,
        inputs_supplier_performance: f.inputs_supplier_performance ||
          `Proveedores evaluados: ${supRows.length}\nScore promedio: ${supAvg}\nCondicionados: ${supCond}\nRechazados: ${supRej}`,
        inputs_customer_feedback: f.inputs_customer_feedback ||
          (complRows.length ? `Quejas registradas en el período: ${complRows.length}` : 'Sin quejas registradas en el período'),
        inputs_objectives: f.inputs_objectives ||
          `Objetivos totales: ${objRows.length}\nCumplidos: ${objCumplidos}\nDetalle:\n${objRows.map(o => `- ${o.objective}: ${o.current_value}/${o.target_value} (${o.status})`).join('\n')}`
      }))
      toast.success(`KPIs cargados: ${ncRows.length} NCs · ${auditRows.length} auditorías · ${objRows.length} objetivos · ${supRows.length} proveedores`)
    } catch (err) {
      toast.error('Error cargando KPIs: ' + err.message)
    } finally {
      setLoadingKPI(false)
    }
  }

  // ─────────── IA sugerir decisiones ────────────
  const sugerirDecisionesIA = async () => {
    setLoadingIA(true); setIaSuggestions(null)
    try {
      const inputsText = [
        ['Acciones previas', form.inputs_previous_actions],
        ['Cambios', form.inputs_changes],
        ['Desempeño', form.inputs_performance],
        ['Auditorías', form.inputs_audit_results],
        ['NCs', form.inputs_nonconformities],
        ['Proveedores', form.inputs_supplier_performance],
        ['Clientes', form.inputs_customer_feedback],
        ['Recursos', form.inputs_resources],
        ['Riesgos', form.inputs_risks],
        ['Objetivos', form.inputs_objectives]
      ].filter(([, v]) => v).map(([k, v]) => `## ${k}\n${v}`).join('\n\n')

      if (!inputsText.trim()) return toast.warning('Carga al menos algunas entradas primero (usa "Cargar KPIs" o completa manualmente)')

      const prompt = `Eres un consultor ISO 9001 facilitando una Revisión por la Dirección. A partir de estas ENTRADAS, propón 5-8 DECISIONES concretas con responsable y fecha límite.

ENTRADAS DE LA REVISIÓN:
${inputsText}

Devuelve SOLO un JSON array, sin texto antes ni después. Cada decisión:
- description (string, qué se va a hacer)
- responsible (string, rol o "Por asignar")
- due_date (string YYYY-MM-DD, fecha realista en próximos 6 meses)
- priority (Alta | Media | Baja)
- category (Mejora | Cambio | Recurso)`

      const raw = await consultarIA(prompt, 'Devuelve únicamente JSON válido.')
      const arr = parseAiArray(raw)
      if (!arr.length) throw new Error('La IA no devolvió decisiones parseables')
      setIaSuggestions(arr)
      setIaSelected(new Set(arr.map((_, i) => i)))
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    } finally {
      setLoadingIA(false)
    }
  }

  const saveIaSelected = async () => {
    if (!iaSuggestions || !editingId) {
      return toast.warning('Guarda primero la revisión para poder asociar las decisiones')
    }
    const rows = iaSuggestions
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => iaSelected.has(i))
      .map(({ s }) => ({
        review_id: editingId,
        description: s.description || 'Decisión sin descripción',
        responsible: s.responsible || 'Por asignar',
        due_date: s.due_date || null,
        priority: ACTION_PRIORITY.includes(s.priority) ? s.priority : 'Media',
        category: ACTION_CATEGORY.includes(s.category) ? s.category : 'Mejora',
        status: 'Pendiente'
      }))
    if (!rows.length) return setIaSuggestions(null)
    const { error } = await supabase.from('management_review_actions').insert(rows)
    if (error) return toast.error(error.message)
    setIaSuggestions(null); fetchAll()
  }

  // ─────────── Acciones derivadas (manual) ────────────
  const openActionModal = (reviewId, editing = null) => {
    if (editing) {
      setActionForm({
        description: editing.description || '', responsible: editing.responsible || '',
        due_date: editing.due_date || '', status: editing.status || 'Pendiente',
        priority: editing.priority || 'Media', category: editing.category || 'Mejora',
        notes: editing.notes || ''
      })
    } else {
      setActionForm({ description: '', responsible: '', due_date: '', status: 'Pendiente', priority: 'Media', category: 'Mejora', notes: '' })
    }
    setActionModal({ reviewId, editing })
  }

  const saveAction = async (e) => {
    e.preventDefault()
    if (!actionModal) return
    const payload = { ...actionForm, review_id: actionModal.reviewId }
    if (!payload.due_date) payload.due_date = null
    if (actionModal.editing) {
      const { error } = await supabase.from('management_review_actions').update(payload).eq('id', actionModal.editing.id)
      if (error) return toast.error(error.message)
    } else {
      const { error } = await supabase.from('management_review_actions').insert([payload])
      if (error) return toast.error(error.message)
    }
    setActionModal(null); fetchAll()
  }

  const deleteAction = async (id) => {
    if (!await confirm('¿Eliminar esta acción?', { tone: 'danger', confirmText: 'Eliminar' })) return
    const { error } = await supabase.from('management_review_actions').delete().eq('id', id)
    if (error) toast.error(error.message); else { toast.success('Acción eliminada'); fetchAll() }
  }

  // ─────────── Filtros / stats ────────────
  const filtered = useMemo(() => items.filter(it => {
    if (filterStatus && it.status !== filterStatus) return false
    if (filterType && it.review_type !== filterType) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [it.review_type, it.chairperson, it.agenda, it.outputs_improvement_opportunities].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [items, filterStatus, filterType, search])

  const today = new Date().toISOString().slice(0, 10)
  const stats = useMemo(() => ({
    total: items.length,
    programadas: items.filter(i => i.status === 'Programada').length,
    cerradas: items.filter(i => i.status === 'Cerrada').length,
    accionesPend: actions.filter(a => a.status !== 'Cerrada' && a.status !== 'Cancelada').length,
    accionesVencidas: actions.filter(a => a.due_date && a.due_date < today && a.status !== 'Cerrada' && a.status !== 'Cancelada').length,
    proxima: (() => {
      const upcoming = items.filter(i => i.review_date && i.review_date >= today).sort((a, b) => a.review_date.localeCompare(b.review_date))
      return upcoming[0]?.review_date || '—'
    })()
  }), [items, actions, today])

  const actionsForReview = (id) => actions.filter(a => a.review_id === id)

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1f2937', margin: 0 }}>
            <BarChart3 size={22} /> Revisión por la Dirección
          </h2>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: 13 }}>ISO 9.3 — Análisis estratégico del SGC</p>
        </div>
        {!showForm && (
          <button onClick={handleNew}
            style={{ padding: '8px 14px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            <Plus size={16} /> Nueva Revisión
          </button>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['9.3']} />

      {tableError && (
        <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13 }}>
          <strong>Tabla no encontrada:</strong> {tableError}. Aplica <code>iso_migration_v41_management_review_auditable.sql</code>.
        </div>
      )}

      {/* Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '16px 0' }}>
        <KPI icon={BarChart3} label="Total revisiones" value={stats.total} color="#0ea5e9" />
        <KPI icon={ClipboardCheck} label="Cerradas" value={stats.cerradas} color="#16a34a" />
        <KPI icon={ListChecks} label="Acciones pendientes" value={stats.accionesPend} color="#f59e0b" />
        <KPI icon={AlertTriangle} label="Acciones vencidas" value={stats.accionesVencidas} color="#dc2626" />
        <KPI icon={Target} label="Próxima revisión" value={stats.proxima} color="#7c3aed" />
      </div>

      {/* Filtros */}
      {!showForm && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
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
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
            <option value="">Tipo: Todos</option>
            {TYPE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {/* FORM */}
      {showForm && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, color: '#1f2937' }}>{editingId ? 'Editar' : 'Nueva'} Revisión</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={cargarKPIsDelPeriodo} disabled={loadingKPI}
                style={{ padding: '8px 14px', background: '#0891b2', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {loadingKPI ? <Loader2 size={14} className="animate-spin" /> : <BarChart3 size={14} />}
                Cargar KPIs del período
              </button>
              <button type="button" onClick={sugerirDecisionesIA} disabled={loadingIA}
                style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                {loadingIA ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Sugerir decisiones IA
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <Collapsible title="Planificación" defaultOpen>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <SelectField label="Tipo" value={form.review_type} options={TYPE_OPTIONS} onChange={v => setForm({ ...form, review_type: v })} />
                <SelectField label="Estado" value={form.status} options={STATUS_OPTIONS} onChange={v => setForm({ ...form, status: v })} />
                <Field label="Fecha reunión" type="date" value={form.review_date} onChange={v => setForm({ ...form, review_date: v })} />
                <Field label="Presidente" value={form.chairperson} onChange={v => setForm({ ...form, chairperson: v })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
                <Field label="Período desde" type="date" value={form.period_start} onChange={v => setForm({ ...form, period_start: v })} />
                <Field label="Período hasta" type="date" value={form.period_end} onChange={v => setForm({ ...form, period_end: v })} />
              </div>
            </Collapsible>

            <Collapsible title="Agenda y asistentes" defaultOpen={false}>
              <TextArea label="Agenda" rows={3} value={form.agenda} onChange={v => setForm({ ...form, agenda: v })} />
              <div style={{ marginTop: 10 }}>
                <Field label="Asistentes (formato: Nombre|Cargo, Nombre|Cargo)" value={form.attendees} onChange={v => setForm({ ...form, attendees: v })} placeholder="Ana López|Gerente, Juan Pérez|Calidad" />
              </div>
            </Collapsible>

            <Collapsible title="Entradas — ISO 9.3.2" defaultOpen>
              <TextArea label="a) Estado de acciones de revisiones previas" rows={2} value={form.inputs_previous_actions} onChange={v => setForm({ ...form, inputs_previous_actions: v })} />
              <TextArea label="b) Cambios internos/externos relevantes" rows={2} value={form.inputs_changes} onChange={v => setForm({ ...form, inputs_changes: v })} />
              <TextArea label="c) Desempeño y eficacia del SGC (KPIs, procesos)" rows={2} value={form.inputs_performance} onChange={v => setForm({ ...form, inputs_performance: v })} />
              <TextArea label="c.1) Cumplimiento de objetivos de calidad" rows={2} value={form.inputs_objectives} onChange={v => setForm({ ...form, inputs_objectives: v })} />
              <TextArea label="c.2) Resultados de auditorías internas" rows={2} value={form.inputs_audit_results} onChange={v => setForm({ ...form, inputs_audit_results: v })} />
              <TextArea label="c.3) No conformidades y acciones correctivas" rows={2} value={form.inputs_nonconformities} onChange={v => setForm({ ...form, inputs_nonconformities: v })} />
              <TextArea label="c.4) Desempeño de proveedores externos" rows={2} value={form.inputs_supplier_performance} onChange={v => setForm({ ...form, inputs_supplier_performance: v })} />
              <TextArea label="c.5) Retroalimentación del cliente / quejas" rows={2} value={form.inputs_customer_feedback} onChange={v => setForm({ ...form, inputs_customer_feedback: v })} />
              <TextArea label="d) Adecuación de los recursos" rows={2} value={form.inputs_resources} onChange={v => setForm({ ...form, inputs_resources: v })} />
              <TextArea label="e) Eficacia de acciones para riesgos y oportunidades" rows={2} value={form.inputs_risks} onChange={v => setForm({ ...form, inputs_risks: v })} />
            </Collapsible>

            <Collapsible title="Salidas / Decisiones — ISO 9.3.3" defaultOpen>
              <TextArea label="a) Oportunidades de mejora" rows={2} value={form.outputs_improvement_opportunities} onChange={v => setForm({ ...form, outputs_improvement_opportunities: v })} />
              <TextArea label="b) Cambios necesarios al SGC" rows={2} value={form.outputs_changes_needed} onChange={v => setForm({ ...form, outputs_changes_needed: v })} />
              <TextArea label="c) Necesidades de recursos" rows={2} value={form.outputs_resource_needs} onChange={v => setForm({ ...form, outputs_resource_needs: v })} />
              <div style={{ marginTop: 10, padding: 10, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
                💡 Cada decisión concreta cárgala como <strong>acción derivada</strong> (con responsable + fecha límite) en el detalle de la revisión.
              </div>
            </Collapsible>

            <Collapsible title="Acta / evidencia" defaultOpen={false}>
              <Field label="Link al acta (Drive)" value={form.report_url} onChange={v => setForm({ ...form, report_url: v })} placeholder="https://drive.google.com/..." />
            </Collapsible>

            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button type="submit" style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                {editingId ? 'Guardar cambios' : 'Crear revisión'}
              </button>
              <button type="button" onClick={handleCancel} style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TABLA */}
      {!showForm && (loading ? <p>Cargando...</p> : (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left', fontSize: 12, color: '#374151', textTransform: 'uppercase' }}>
                <th style={{ padding: 12 }}>Fecha</th>
                <th style={{ padding: 12 }}>Tipo</th>
                <th style={{ padding: 12 }}>Período</th>
                <th style={{ padding: 12 }}>Presidente</th>
                <th style={{ padding: 12 }}>Acciones derivadas</th>
                <th style={{ padding: 12 }}>Estado</th>
                <th style={{ padding: 12, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                  Sin revisiones. Programá la primera con el botón <strong>Nueva Revisión</strong>.
                </td></tr>
              )}
              {filtered.map(item => {
                const st = STATUS_COLORS[item.status] || STATUS_COLORS['Programada']
                const acts = actionsForReview(item.id)
                const pendientes = acts.filter(a => a.status !== 'Cerrada' && a.status !== 'Cancelada').length
                return (
                  <tr key={item.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 12, fontSize: 13 }}>{item.review_date || '—'}</td>
                    <td style={{ padding: 12, fontSize: 13 }}>{item.review_type}</td>
                    <td style={{ padding: 12, fontSize: 12, color: '#6b7280' }}>
                      {item.period_start || '?'} → {item.period_end || '?'}
                    </td>
                    <td style={{ padding: 12, fontSize: 13 }}>{item.chairperson || '—'}</td>
                    <td style={{ padding: 12, fontSize: 13 }}>
                      <strong>{acts.length}</strong>
                      {pendientes > 0 && <span style={{ color: '#dc2626', marginLeft: 6 }}>({pendientes} pend.)</span>}
                    </td>
                    <td style={{ padding: 12 }}>
                      <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, border: `1px solid ${st.border}` }}>
                        {item.status || 'Programada'}
                      </span>
                    </td>
                    <td style={{ padding: 12, textAlign: 'right' }}>
                      {item.report_url && (
                        <a href={item.report_url} target="_blank" rel="noreferrer" title="Ver acta"
                          style={{ ...iconBtn('#0ea5e9'), textDecoration: 'none', display: 'inline-flex' }}><FileText size={16} /></a>
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

      {/* MODAL DETALLE */}
      {detailItem && createPortal(
        <ModalShell onClose={() => setDetailItem(null)} title={`Revisión ${detailItem.review_type} — ${detailItem.review_date}`} wide>
          <DetailRow label="Estado" value={detailItem.status} />
          <DetailRow label="Período" value={`${detailItem.period_start || '?'} → ${detailItem.period_end || '?'}`} />
          <DetailRow label="Presidente" value={detailItem.chairperson} />
          <DetailRow label="Asistentes" value={
            Array.isArray(detailItem.attendees) && detailItem.attendees.length
              ? detailItem.attendees.map(a => `${a.name}${a.role ? ' (' + a.role + ')' : ''}`).join(', ')
              : null
          } />
          <DetailRow label="Agenda" value={detailItem.agenda} />

          <h4 style={{ margin: '20px 0 8px 0', fontSize: 13, fontWeight: 700, color: '#1f2937', textTransform: 'uppercase' }}>Entradas (9.3.2)</h4>
          <DetailRow label="Acciones previas" value={detailItem.inputs_previous_actions} />
          <DetailRow label="Cambios" value={detailItem.inputs_changes} />
          <DetailRow label="Desempeño" value={detailItem.inputs_performance} />
          <DetailRow label="Objetivos" value={detailItem.inputs_objectives} />
          <DetailRow label="Auditorías" value={detailItem.inputs_audit_results} />
          <DetailRow label="NCs" value={detailItem.inputs_nonconformities} />
          <DetailRow label="Proveedores" value={detailItem.inputs_supplier_performance} />
          <DetailRow label="Clientes" value={detailItem.inputs_customer_feedback} />
          <DetailRow label="Recursos" value={detailItem.inputs_resources} />
          <DetailRow label="Riesgos" value={detailItem.inputs_risks} />

          <h4 style={{ margin: '20px 0 8px 0', fontSize: 13, fontWeight: 700, color: '#1f2937', textTransform: 'uppercase' }}>Salidas (9.3.3)</h4>
          <DetailRow label="Oportunidades de mejora" value={detailItem.outputs_improvement_opportunities} />
          <DetailRow label="Cambios necesarios" value={detailItem.outputs_changes_needed} />
          <DetailRow label="Necesidades de recursos" value={detailItem.outputs_resource_needs} />
          {detailItem.report_url && (
            <DetailRow label="Acta" value={
              <a href={detailItem.report_url} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Abrir acta <ExternalLink size={12} />
              </a>
            } />
          )}

          {/* Acciones derivadas */}
          <div style={{ marginTop: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1f2937', textTransform: 'uppercase' }}>
              <ListChecks size={14} style={{ verticalAlign: 'middle' }} /> Acciones derivadas
            </h4>
            <button onClick={() => openActionModal(detailItem.id)}
              style={{ padding: '6px 12px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
              <Plus size={12} /> Nueva acción
            </button>
          </div>
          {(() => {
            const list = actionsForReview(detailItem.id)
            if (!list.length) return <div style={{ fontSize: 13, color: '#9ca3af', padding: 8 }}>Sin acciones derivadas todavía.</div>
            return (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 8 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', color: '#6b7280', textAlign: 'left' }}>
                    <th style={{ padding: 6 }}>Descripción</th>
                    <th style={{ padding: 6 }}>Responsable</th>
                    <th style={{ padding: 6 }}>Plazo</th>
                    <th style={{ padding: 6 }}>Prioridad</th>
                    <th style={{ padding: 6 }}>Estado</th>
                    <th style={{ padding: 6 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(a => {
                    const vencida = a.due_date && a.due_date < today && a.status !== 'Cerrada'
                    return (
                      <tr key={a.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ padding: 6 }}>{a.description}</td>
                        <td style={{ padding: 6 }}>{a.responsible || '—'}</td>
                        <td style={{ padding: 6, color: vencida ? '#dc2626' : '#374151', fontWeight: vencida ? 700 : 400 }}>
                          {a.due_date || '—'}{vencida && ' ⚠️'}
                        </td>
                        <td style={{ padding: 6 }}>{a.priority}</td>
                        <td style={{ padding: 6 }}>{a.status}</td>
                        <td style={{ padding: 6, textAlign: 'right' }}>
                          <button onClick={() => openActionModal(detailItem.id, a)} style={iconBtn('#f59e0b')}><Pencil size={12} /></button>
                          <button onClick={() => deleteAction(a.id)} style={iconBtn('#6b7280')}><Trash2 size={12} /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )
          })()}

          <h4 style={{ margin: '20px 0 8px 0', fontSize: 13, fontWeight: 700, color: '#1f2937', textTransform: 'uppercase' }}>
            🕓 Historial de cambios
          </h4>
          <ChangeLogTimeline entries={detailItem.change_log || []} fieldLabels={REVIEW_FIELD_LABELS} max={5} compact />

          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => exportarRevisionPdf(detailItem)} style={{ padding: '8px 14px', background: '#0891b2', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FileText size={14} /> Exportar acta PDF
            </button>
            <button onClick={() => { handleEdit(detailItem) }} style={{ padding: '8px 14px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Editar revisión</button>
          </div>
        </ModalShell>,
        document.body
      )}

      {/* MODAL ACCIÓN */}
      {actionModal && createPortal(
        <ModalShell onClose={() => setActionModal(null)} title={actionModal.editing ? 'Editar acción' : 'Nueva acción derivada'}>
          <form onSubmit={saveAction}>
            <TextArea label="Descripción de la acción *" rows={2} value={actionForm.description} onChange={v => setActionForm({ ...actionForm, description: v })} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <Field label="Responsable" value={actionForm.responsible} onChange={v => setActionForm({ ...actionForm, responsible: v })} />
              <Field label="Fecha límite" type="date" value={actionForm.due_date} onChange={v => setActionForm({ ...actionForm, due_date: v })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginTop: 10 }}>
              <SelectField label="Categoría" value={actionForm.category} options={ACTION_CATEGORY} onChange={v => setActionForm({ ...actionForm, category: v })} />
              <SelectField label="Prioridad" value={actionForm.priority} options={ACTION_PRIORITY} onChange={v => setActionForm({ ...actionForm, priority: v })} />
              <SelectField label="Estado" value={actionForm.status} options={ACTION_STATUS} onChange={v => setActionForm({ ...actionForm, status: v })} />
            </div>
            <div style={{ marginTop: 10 }}>
              <TextArea label="Notas" rows={2} value={actionForm.notes} onChange={v => setActionForm({ ...actionForm, notes: v })} />
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button type="submit" style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Guardar</button>
              <button type="button" onClick={() => setActionModal(null)} style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
            </div>
          </form>
        </ModalShell>,
        document.body
      )}

      {/* MODAL IA decisiones */}
      {iaSuggestions && createPortal(
        <ModalShell onClose={() => setIaSuggestions(null)} title="Decisiones sugeridas por IA" wide>
          {!editingId && (
            <div style={{ padding: 10, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 13, color: '#92400e', marginBottom: 10 }}>
              ⚠️ Guarda primero la revisión para asociar las decisiones.
            </div>
          )}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: 8, width: 30 }}></th>
                <th style={{ padding: 8 }}>Decisión</th>
                <th style={{ padding: 8 }}>Responsable</th>
                <th style={{ padding: 8 }}>Plazo</th>
                <th style={{ padding: 8 }}>Cat.</th>
                <th style={{ padding: 8 }}>Prior.</th>
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
                  <td style={{ padding: 8 }}>{s.description}</td>
                  <td style={{ padding: 8 }}>{s.responsible}</td>
                  <td style={{ padding: 8 }}>{s.due_date}</td>
                  <td style={{ padding: 8 }}>{s.category}</td>
                  <td style={{ padding: 8 }}>{s.priority}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={saveIaSelected} disabled={!editingId} style={{ padding: '10px 20px', background: editingId ? '#16a34a' : '#94a3b8', color: 'white', border: 'none', borderRadius: 8, cursor: editingId ? 'pointer' : 'not-allowed', fontWeight: 600 }}>
              Guardar {iaSelected.size} decisiones
            </button>
            <button onClick={() => setIaSuggestions(null)} style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Cancelar
            </button>
          </div>
        </ModalShell>,
        document.body
      )}
    </div>
  )
}

// ───────────── helpers UI ──────────────
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

function TextArea({ label, value, onChange, rows = 3 }) {
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>
      <textarea value={value ?? ''} rows={rows} onChange={e => onChange(e.target.value)}
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

function iconBtn(color) {
  return { background: 'transparent', border: 'none', cursor: 'pointer', color, padding: 6, marginLeft: 4 }
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
          maxHeight: '90vh', overflowY: 'auto', padding: 24, position: 'relative',
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
