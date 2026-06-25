import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Truck, Plus, Search, Filter, Eye, Pencil, Trash2, X, AlertTriangle,
  Sparkles, Loader2, BarChart3, ClipboardCheck, ExternalLink, History
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import ExcelImporter from './ExcelImporter'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

// ───────────────────────── Constantes ────────────────────────────
const STATUS_OPTIONS = ['Aprobado', 'Condicionado', 'Rechazado', 'En Evaluación']
const CRITICALITY_OPTIONS = ['Crítico', 'Estratégico', 'Normal']
const CATEGORY_OPTIONS = [
  'Materia Prima', 'Insumos', 'Servicios Profesionales', 'Mantenimiento',
  'Logística', 'Software / SaaS', 'Calibración / Laboratorio', 'Otro'
]
const DECISION_OPTIONS = ['Mantener', 'Condicionar', 'Rechazar']

const STATUS_COLORS = {
  'Aprobado':       { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  'Condicionado':   { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  'Rechazado':      { bg: '#fee2e2', color: '#991b1b', border: '#fecaca' },
  'En Evaluación':  { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
}
const CRIT_COLORS = {
  'Crítico':      { bg: '#fee2e2', color: '#991b1b' },
  'Estratégico':  { bg: '#fef3c7', color: '#92400e' },
  'Normal':       { bg: '#e0e7ff', color: '#3730a3' },
}

const EMPTY_FORM = {
  name: '', product_service: '', category: 'Materia Prima', criticality: 'Normal',
  tax_id: '', address: '', country: '', website: '',
  contact_name: '', contact_email: '', contact_phone: '', contact_info: '',
  requirements_communicated: '', requirements_communicated_at: '',
  criteria_quality: '', criteria_delivery: '', criteria_price: '', criteria_service: '',
  evaluation_date: '', last_evaluation_by: '', next_evaluation_date: '',
  evidence_url: '', notes: '', status: 'En Evaluación'
}

// ───────────────────────── Helpers JSON IA ────────────────────────────
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
    else if (c === close) {
      depth--
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

function parseAiArray(raw) {
  if (!raw) return []
  const parsed = extractFirstJson(raw)
  if (Array.isArray(parsed)) return parsed
  if (parsed && Array.isArray(parsed.suppliers)) return parsed.suppliers
  if (parsed && Array.isArray(parsed.items)) return parsed.items
  if (parsed && typeof parsed === 'object') return [parsed]
  // NDJSON-like fallback
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

// ───────────────────────── Subcomponentes ────────────────────────────
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

function FormSection({ title, children }) {
  return (
    <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: '1px dashed #e5e7eb' }}>
      <h4 style={{ margin: '0 0 10px 0', color: '#1f2937', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</h4>
      {children}
    </div>
  )
}

function DetailRow({ label, value, mono }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 10, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ color: '#6b7280', fontSize: 13 }}>{label}</div>
      <div style={{ color: '#111827', fontSize: 13, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</div>
    </div>
  )
}

// Promedio de criterios → score
function avgCriteria(q, d, p, s) {
  const vals = [q, d, p, s].map(v => Number(v)).filter(v => !isNaN(v) && v >= 0)
  if (!vals.length) return null
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length
  return Math.round(avg * 10) / 10
}

// ────────────────────────── Componente ───────────────────────────
export default function Suppliers({ alReportar }) {
  const [items, setItems] = useState([])
  const [evaluations, setEvaluations] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [detailItem, setDetailItem] = useState(null)
  const [evalSupplier, setEvalSupplier] = useState(null) // proveedor seleccionado para nueva evaluación
  const [evalForm, setEvalForm] = useState({
    evaluation_date: new Date().toISOString().slice(0, 10),
    evaluator_name: '',
    criteria_quality: '', criteria_delivery: '', criteria_price: '', criteria_service: '',
    decision: 'Mantener', comments: '', evidence_url: ''
  })

  const [filterStatus, setFilterStatus] = useState('')
  const [filterCriticality, setFilterCriticality] = useState('')
  const [search, setSearch] = useState('')

  // IA
  const [loadingIA, setLoadingIA] = useState(false)
  const [iaSuggestions, setIaSuggestions] = useState(null)
  const [iaSelected, setIaSelected] = useState(new Set())

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    setTableError(null)
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      setTableError(error.message)
      setItems([])
    } else {
      setItems(data || [])
    }

    const { data: evals, error: evErr } = await supabase
      .from('supplier_evaluations')
      .select('*')
      .order('evaluation_date', { ascending: false })
    if (!evErr) setEvaluations(evals || [])
    setLoading(false)
  }

  // ─────────── Form principal ────────────
  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null) }

  const handleNew = () => { resetForm(); setShowForm(true) }
  const handleCancel = () => { resetForm(); setShowForm(false) }

  const handleEdit = (item) => {
    setForm({
      ...EMPTY_FORM,
      ...Object.fromEntries(Object.keys(EMPTY_FORM).map(k => [k, item[k] ?? EMPTY_FORM[k]]))
    })
    setEditingId(item.id)
    setShowForm(true)
    setDetailItem(null)
  }

  const handleDelete = async (id) => {
    if (!await confirm('¿Eliminar este proveedor y todas sus evaluaciones?', { tone: 'danger', confirmText: 'Eliminar' })) return
    const { error } = await supabase.from('suppliers').delete().eq('id', id)
    if (error) toast.error(error.message); else { toast.success('Proveedor eliminado'); fetchAll() }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = { ...form }
    // numéricos
    ;['criteria_quality', 'criteria_delivery', 'criteria_price', 'criteria_service'].forEach(k => {
      payload[k] = payload[k] === '' || payload[k] === null ? null : Number(payload[k])
    })
    payload.evaluation_score = avgCriteria(
      payload.criteria_quality, payload.criteria_delivery,
      payload.criteria_price, payload.criteria_service
    )
    // fechas vacías → null
    ;['requirements_communicated_at', 'evaluation_date', 'next_evaluation_date'].forEach(k => {
      if (!payload[k]) payload[k] = null
    })

    if (editingId) {
      const prev = items.find(i => i.id === editingId)
      const changes = []
      Object.keys(payload).forEach(k => {
        if (prev && JSON.stringify(prev[k] ?? '') !== JSON.stringify(payload[k] ?? '')) {
          changes.push({ field: k, from: prev[k] ?? null, to: payload[k] ?? null })
        }
      })
      const newLog = [
        ...(prev?.change_log || []),
        { at: new Date().toISOString(), changes }
      ]
      payload.change_log = newLog
      const { error } = await supabase.from('suppliers').update(payload).eq('id', editingId)
      if (error) return toast.error(error.message)
    } else {
      payload.change_log = [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: payload.name }] }]
      const { error } = await supabase.from('suppliers').insert([payload])
      if (error) return toast.error(error.message)
    }
    setShowForm(false); resetForm(); fetchAll()
  }

  // ─────────── Evaluación rápida ────────────
  const openEvaluation = (supplier) => {
    setEvalSupplier(supplier)
    setEvalForm({
      evaluation_date: new Date().toISOString().slice(0, 10),
      evaluator_name: '',
      criteria_quality: '', criteria_delivery: '', criteria_price: '', criteria_service: '',
      decision: 'Mantener', comments: '', evidence_url: ''
    })
  }

  const saveEvaluation = async (e) => {
    e.preventDefault()
    if (!evalSupplier) return
    const q = Number(evalForm.criteria_quality), d = Number(evalForm.criteria_delivery)
    const p = Number(evalForm.criteria_price), s = Number(evalForm.criteria_service)
    const score = avgCriteria(q, d, p, s)
    const decisionToStatus = {
      'Mantener': 'Aprobado',
      'Condicionar': 'Condicionado',
      'Rechazar': 'Rechazado'
    }
    // Insertar histórico
    const { error: insErr } = await supabase.from('supplier_evaluations').insert([{
      supplier_id: evalSupplier.id,
      evaluation_date: evalForm.evaluation_date,
      evaluator_name: evalForm.evaluator_name,
      criteria_quality: isNaN(q) ? null : q,
      criteria_delivery: isNaN(d) ? null : d,
      criteria_price: isNaN(p) ? null : p,
      criteria_service: isNaN(s) ? null : s,
      score_total: score,
      decision: evalForm.decision,
      comments: evalForm.comments,
      evidence_url: evalForm.evidence_url
    }])
    if (insErr) return toast.error(insErr.message)

    // Actualizar última evaluación en suppliers
    const nextDate = (() => {
      const base = new Date(evalForm.evaluation_date)
      base.setMonth(base.getMonth() + (evalSupplier.criticality === 'Crítico' ? 6 : 12))
      return base.toISOString().slice(0, 10)
    })()
    const newLog = [
      ...(evalSupplier.change_log || []),
      { at: new Date().toISOString(), changes: [{ field: 'evaluation', from: evalSupplier.evaluation_score, to: score }] }
    ]
    await supabase.from('suppliers').update({
      criteria_quality: isNaN(q) ? null : q,
      criteria_delivery: isNaN(d) ? null : d,
      criteria_price: isNaN(p) ? null : p,
      criteria_service: isNaN(s) ? null : s,
      evaluation_score: score,
      evaluation_date: evalForm.evaluation_date,
      last_evaluation_by: evalForm.evaluator_name,
      next_evaluation_date: nextDate,
      status: decisionToStatus[evalForm.decision] || evalSupplier.status,
      change_log: newLog
    }).eq('id', evalSupplier.id)

    setEvalSupplier(null)
    fetchAll()
  }

  // ─────────── IA: sugerir proveedores típicos del sector ────────────
  const handleSugerirConIA = async () => {
    setLoadingIA(true)
    setIaSuggestions(null)
    try {
      const { data: profileRows } = await supabase.from('company_profile').select('*').limit(1)
      const profile = profileRows?.[0] || {}
      const ctx = `Empresa: ${profile.company_name || 'N/D'} | Sector: ${profile.industry || 'N/D'} | Tamaño: ${profile.size || 'N/D'} | Productos: ${profile.main_products || 'N/D'}`

      const prompt = `Eres un consultor ISO 9001. Para esta empresa, sugiere 6 categorías típicas de PROVEEDORES que debería tener registradas, con un ejemplo de proveedor y los requisitos a comunicarles según ISO 8.4.3.

Contexto: ${ctx}

Devuelve SOLO un JSON array, sin texto antes ni después. Cada item con estas claves:
- name (string, nombre genérico ej "Proveedor de materia prima")
- product_service (string)
- category (uno de: ${CATEGORY_OPTIONS.join(', ')})
- criticality (uno de: Crítico, Estratégico, Normal)
- requirements_communicated (string, 2-3 requisitos clave)
- notes (string corto)`

      const raw = await consultarIA(prompt, 'Devuelve únicamente JSON válido.')
      const arr = parseAiArray(raw)
      if (!arr.length) throw new Error('La IA no devolvió sugerencias parseables')
      setIaSuggestions(arr)
      setIaSelected(new Set(arr.map((_, i) => i)))
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    } finally {
      setLoadingIA(false)
    }
  }

  const saveIaSelected = async () => {
    if (!iaSuggestions) return
    const rows = iaSuggestions
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => iaSelected.has(i))
      .map(({ s }) => ({
        name: s.name || 'Proveedor sin nombre',
        product_service: s.product_service || '',
        category: CATEGORY_OPTIONS.includes(s.category) ? s.category : 'Otro',
        criticality: CRITICALITY_OPTIONS.includes(s.criticality) ? s.criticality : 'Normal',
        requirements_communicated: s.requirements_communicated || '',
        notes: s.notes || '',
        status: 'En Evaluación',
        change_log: [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: 'IA' }] }]
      }))
    if (!rows.length) return setIaSuggestions(null)
    const { error } = await supabase.from('suppliers').insert(rows)
    if (error) return toast.error(error.message)
    setIaSuggestions(null)
    fetchAll()
  }

  // Reportar fallo → NC
  const reportarFallo = (proveedor) => {
    alReportar?.('hallazgos', {
      description: `Fallo en desempeño del proveedor ${proveedor.name}. Calificación: ${proveedor.evaluation_score ?? 'N/D'}/100. ${proveedor.notes || ''}`.trim(),
      source: 'Proveedor',
      responsible: 'Jefe de Compras',
      root_cause: 'Incumplimiento de requisitos de servicio/producto.',
    })
  }

  // ─────────── Filtros y stats ────────────
  const filtered = useMemo(() => {
    return items.filter(it => {
      if (filterStatus && it.status !== filterStatus) return false
      if (filterCriticality && it.criticality !== filterCriticality) return false
      if (search) {
        const q = search.toLowerCase()
        const hay = [it.name, it.product_service, it.category, it.contact_name, it.tax_id]
          .filter(Boolean).join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [items, filterStatus, filterCriticality, search])

  const today = new Date().toISOString().slice(0, 10)
  const stats = useMemo(() => ({
    total: items.length,
    criticos: items.filter(i => i.criticality === 'Crítico').length,
    aprobados: items.filter(i => i.status === 'Aprobado').length,
    condicionados: items.filter(i => i.status === 'Condicionado').length,
    vencidos: items.filter(i => i.next_evaluation_date && i.next_evaluation_date < today).length,
  }), [items, today])

  const supplierEvaluations = (supplierId) =>
    evaluations.filter(e => e.supplier_id === supplierId)

  // ─────────── Render ────────────
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1f2937', margin: 0 }}>
            <Truck size={22} /> Proveedores
          </h2>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: 13 }}>ISO 8.4 — Control de procesos, productos y servicios externos</p>
        </div>
        {!showForm && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <ExcelImporter templateKey="suppliers" onImported={fetchAll} />
            <button onClick={handleSugerirConIA} disabled={loadingIA}
              style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              {loadingIA ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Sugerir con IA
            </button>
            <button onClick={handleNew}
              style={{ padding: '8px 14px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <Plus size={16} /> Nuevo Proveedor
            </button>
          </div>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['8.4']} />

      {tableError && (
        <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13 }}>
          <strong>Tabla no encontrada:</strong> {tableError}. Aplica la migración <code>iso_migration_v39_suppliers_auditable.sql</code>.
        </div>
      )}

      {/* Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '16px 0' }}>
        <KPI icon={Truck} label="Total" value={stats.total} color="#0ea5e9" />
        <KPI icon={AlertTriangle} label="Críticos" value={stats.criticos} color="#dc2626" />
        <KPI icon={ClipboardCheck} label="Aprobados" value={stats.aprobados} color="#16a34a" />
        <KPI icon={BarChart3} label="Condicionados" value={stats.condicionados} color="#f59e0b" />
        <KPI icon={History} label="Reevaluación vencida" value={stats.vencidos} color="#ef4444" sub={stats.vencidos ? 'Revisar urgente' : 'Al día'} />
      </div>

      {/* Filtros */}
      {!showForm && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#9ca3af' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar nombre, RUT, contacto..."
              style={{ width: '100%', padding: '8px 8px 8px 30px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Filter size={14} color="#6b7280" />
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
              <option value="">Estado: Todos</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filterCriticality} onChange={e => setFilterCriticality(e.target.value)}
              style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
              <option value="">Criticidad: Todas</option>
              {CRITICALITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* FORM */}
      {showForm && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px 0', color: '#1f2937' }}>{editingId ? 'Editar' : 'Registrar'} Proveedor</h3>
          <form onSubmit={handleSubmit}>

            <FormSection title="Identificación">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 10 }}>
                <Field label="Nombre / Razón Social *" required value={form.name} onChange={v => setForm({ ...form, name: v })} />
                <Field label="RUT / CUIT / RFC" value={form.tax_id} onChange={v => setForm({ ...form, tax_id: v })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Field label="Producto / Servicio" value={form.product_service} onChange={v => setForm({ ...form, product_service: v })} />
                <Field label="Dirección" value={form.address} onChange={v => setForm({ ...form, address: v })} />
                <Field label="País" value={form.country} onChange={v => setForm({ ...form, country: v })} />
              </div>
              <div style={{ marginTop: 10 }}>
                <Field label="Sitio Web" value={form.website} onChange={v => setForm({ ...form, website: v })} placeholder="https://..." />
              </div>
            </FormSection>

            <FormSection title="Contacto">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Field label="Contacto (nombre)" value={form.contact_name} onChange={v => setForm({ ...form, contact_name: v })} />
                <Field label="Email" value={form.contact_email} onChange={v => setForm({ ...form, contact_email: v })} placeholder="ventas@..." />
                <Field label="Teléfono" value={form.contact_phone} onChange={v => setForm({ ...form, contact_phone: v })} />
              </div>
              <div style={{ marginTop: 10 }}>
                <Field label="Otras notas de contacto" value={form.contact_info} onChange={v => setForm({ ...form, contact_info: v })} />
              </div>
            </FormSection>

            <FormSection title="Clasificación (nivel de control ISO 8.4.1)">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <SelectField label="Categoría" value={form.category} options={CATEGORY_OPTIONS} onChange={v => setForm({ ...form, category: v })} />
                <SelectField label="Criticidad" value={form.criticality} options={CRITICALITY_OPTIONS} onChange={v => setForm({ ...form, criticality: v })} />
                <SelectField label="Estado" value={form.status} options={STATUS_OPTIONS} onChange={v => setForm({ ...form, status: v })} />
              </div>
              <div style={{ marginTop: 8, padding: 10, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, fontSize: 12, color: '#92400e' }}>
                💡 <strong>Crítico</strong> = el incumplimiento afecta calidad del producto final. Reevaluación cada 6 meses.
                <br/><strong>Normal</strong> = reevaluación anual.
              </div>
            </FormSection>

            <FormSection title="Requisitos comunicados (ISO 8.4.3)">
              <textarea value={form.requirements_communicated} onChange={e => setForm({ ...form, requirements_communicated: e.target.value })}
                rows={3} placeholder="Ej: cumplir especificación X, certificado ISO al día, lead time máx 5 días, factura electrónica..."
                style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
              <div style={{ marginTop: 8 }}>
                <Field label="Fecha de comunicación" type="date" value={form.requirements_communicated_at} onChange={v => setForm({ ...form, requirements_communicated_at: v })} />
              </div>
            </FormSection>

            <FormSection title="Última evaluación (ISO 8.4.2)">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 10 }}>
                <Field label="Calidad (0-100)" type="number" value={form.criteria_quality} onChange={v => setForm({ ...form, criteria_quality: v })} />
                <Field label="Cumplimiento plazos" type="number" value={form.criteria_delivery} onChange={v => setForm({ ...form, criteria_delivery: v })} />
                <Field label="Precio / valor" type="number" value={form.criteria_price} onChange={v => setForm({ ...form, criteria_price: v })} />
                <Field label="Atención / soporte" type="number" value={form.criteria_service} onChange={v => setForm({ ...form, criteria_service: v })} />
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 8, background: '#f0f9ff', borderRadius: 6, fontSize: 13 }}>
                <strong>Score automático:</strong> {avgCriteria(form.criteria_quality, form.criteria_delivery, form.criteria_price, form.criteria_service) ?? '—'} / 100
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 10 }}>
                <Field label="Fecha evaluación" type="date" value={form.evaluation_date} onChange={v => setForm({ ...form, evaluation_date: v })} />
                <Field label="Evaluado por" value={form.last_evaluation_by} onChange={v => setForm({ ...form, last_evaluation_by: v })} />
                <Field label="Próxima reevaluación" type="date" value={form.next_evaluation_date} onChange={v => setForm({ ...form, next_evaluation_date: v })} />
              </div>
            </FormSection>

            <FormSection title="Evidencia y notas">
              <Field label="Link de evidencia (contrato, certificado ISO)" value={form.evidence_url} onChange={v => setForm({ ...form, evidence_url: v })} placeholder="https://..." />
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Notas</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2}
                  style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
              </div>
            </FormSection>

            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button type="submit" style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                {editingId ? 'Guardar cambios' : 'Crear proveedor'}
              </button>
              <button type="button" onClick={handleCancel} style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TABLA */}
      {loading ? <p>Cargando proveedores...</p> : (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left', fontSize: 12, color: '#374151', textTransform: 'uppercase' }}>
                <th style={{ padding: 12 }}>Proveedor</th>
                <th style={{ padding: 12 }}>Categoría</th>
                <th style={{ padding: 12 }}>Criticidad</th>
                <th style={{ padding: 12 }}>Score</th>
                <th style={{ padding: 12 }}>Estado</th>
                <th style={{ padding: 12 }}>Próx. reeval</th>
                <th style={{ padding: 12, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                  Sin proveedores. Carga uno o usa <strong>Sugerir con IA</strong>.
                </td></tr>
              )}
              {filtered.map(item => {
                const st = STATUS_COLORS[item.status] || STATUS_COLORS['Aprobado']
                const cr = CRIT_COLORS[item.criticality] || CRIT_COLORS['Normal']
                const vencido = item.next_evaluation_date && item.next_evaluation_date < today
                return (
                  <tr key={item.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 12 }}>
                      <strong style={{ color: '#111827' }}>{item.name}</strong>
                      <div style={{ fontSize: 12, color: '#6b7280' }}>{item.product_service}</div>
                    </td>
                    <td style={{ padding: 12, fontSize: 13 }}>{item.category || '—'}</td>
                    <td style={{ padding: 12 }}>
                      <span style={{ background: cr.bg, color: cr.color, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                        {item.criticality || 'Normal'}
                      </span>
                    </td>
                    <td style={{ padding: 12, fontSize: 13 }}>{item.evaluation_score ?? '—'}</td>
                    <td style={{ padding: 12 }}>
                      <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, border: `1px solid ${st.border}` }}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ padding: 12, fontSize: 13, color: vencido ? '#dc2626' : '#374151', fontWeight: vencido ? 700 : 400 }}>
                      {item.next_evaluation_date || '—'}
                      {vencido && <div style={{ fontSize: 10, color: '#dc2626' }}>VENCIDA</div>}
                    </td>
                    <td style={{ padding: 12, textAlign: 'right' }}>
                      <button onClick={() => openEvaluation(item)} title="Registrar evaluación"
                        style={iconBtn('#7c3aed')}><ClipboardCheck size={16} /></button>
                      <button onClick={() => setDetailItem(item)} title="Ver detalle"
                        style={iconBtn('#0ea5e9')}><Eye size={16} /></button>
                      <button onClick={() => handleEdit(item)} title="Editar"
                        style={iconBtn('#f59e0b')}><Pencil size={16} /></button>
                      {(item.status === 'Rechazado' || item.status === 'Condicionado' || (item.evaluation_score != null && item.evaluation_score < 70)) && (
                        <button onClick={() => reportarFallo(item)} title="Reportar fallo → NC"
                          style={iconBtn('#dc2626')}><AlertTriangle size={16} /></button>
                      )}
                      <button onClick={() => handleDelete(item.id)} title="Eliminar"
                        style={iconBtn('#6b7280')}><Trash2 size={16} /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* MODAL DETALLE */}
      {detailItem && createPortal(
        <ModalShell onClose={() => setDetailItem(null)} title={detailItem.name}>
          <DetailRow label="RUT / CUIT" value={detailItem.tax_id} />
          <DetailRow label="Producto / Servicio" value={detailItem.product_service} />
          <DetailRow label="Categoría" value={detailItem.category} />
          <DetailRow label="Criticidad" value={detailItem.criticality} />
          <DetailRow label="Estado" value={detailItem.status} />
          <DetailRow label="Dirección" value={detailItem.address} />
          <DetailRow label="País" value={detailItem.country} />
          <DetailRow label="Sitio web" value={detailItem.website} />
          <DetailRow label="Contacto" value={detailItem.contact_name} />
          <DetailRow label="Email" value={detailItem.contact_email} />
          <DetailRow label="Teléfono" value={detailItem.contact_phone} />
          <DetailRow label="Requisitos comunicados" value={detailItem.requirements_communicated} />
          <DetailRow label="Comunicados el" value={detailItem.requirements_communicated_at} />
          <DetailRow label="Score actual" value={detailItem.evaluation_score} />
          <DetailRow label="Calidad" value={detailItem.criteria_quality} />
          <DetailRow label="Plazos" value={detailItem.criteria_delivery} />
          <DetailRow label="Precio" value={detailItem.criteria_price} />
          <DetailRow label="Servicio" value={detailItem.criteria_service} />
          <DetailRow label="Última evaluación" value={detailItem.evaluation_date} />
          <DetailRow label="Evaluado por" value={detailItem.last_evaluation_by} />
          <DetailRow label="Próxima reeval" value={detailItem.next_evaluation_date} />
          <DetailRow label="Notas" value={detailItem.notes} />
          {detailItem.evidence_url && (
            <DetailRow label="Evidencia" value={
              <a href={detailItem.evidence_url} target="_blank" rel="noopener noreferrer" style={{ color: '#0ea5e9', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Abrir <ExternalLink size={12} />
              </a>
            } />
          )}

          {/* Histórico */}
          <h4 style={{ margin: '20px 0 8px 0', color: '#1f2937', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <History size={14} style={{ verticalAlign: 'middle' }} /> Histórico de evaluaciones
          </h4>
          {(() => {
            const list = supplierEvaluations(detailItem.id)
            if (!list.length) return <div style={{ fontSize: 13, color: '#9ca3af', padding: 8 }}>Aún no hay evaluaciones registradas.</div>
            return (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 4 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', color: '#6b7280', textAlign: 'left' }}>
                    <th style={{ padding: 6 }}>Fecha</th>
                    <th style={{ padding: 6 }}>Evaluador</th>
                    <th style={{ padding: 6 }}>Score</th>
                    <th style={{ padding: 6 }}>Decisión</th>
                    <th style={{ padding: 6 }}>Comentarios</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(e => (
                    <tr key={e.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: 6 }}>{e.evaluation_date}</td>
                      <td style={{ padding: 6 }}>{e.evaluator_name || '—'}</td>
                      <td style={{ padding: 6, fontWeight: 700 }}>{e.score_total ?? '—'}</td>
                      <td style={{ padding: 6 }}>{e.decision}</td>
                      <td style={{ padding: 6, color: '#6b7280' }}>{e.comments || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          })()}

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={() => { openEvaluation(detailItem); setDetailItem(null) }}
              style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <ClipboardCheck size={16} /> Registrar evaluación
            </button>
            <button onClick={() => { handleEdit(detailItem) }}
              style={{ padding: '8px 14px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Editar
            </button>
          </div>
        </ModalShell>,
        document.body
      )}

      {/* MODAL EVALUACIÓN */}
      {evalSupplier && createPortal(
        <ModalShell onClose={() => setEvalSupplier(null)} title={`Nueva evaluación — ${evalSupplier.name}`}>
          <form onSubmit={saveEvaluation}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Fecha" type="date" value={evalForm.evaluation_date} onChange={v => setEvalForm({ ...evalForm, evaluation_date: v })} />
              <Field label="Evaluador" value={evalForm.evaluator_name} onChange={v => setEvalForm({ ...evalForm, evaluator_name: v })} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginTop: 10 }}>
              <Field label="Calidad" type="number" value={evalForm.criteria_quality} onChange={v => setEvalForm({ ...evalForm, criteria_quality: v })} />
              <Field label="Plazos" type="number" value={evalForm.criteria_delivery} onChange={v => setEvalForm({ ...evalForm, criteria_delivery: v })} />
              <Field label="Precio" type="number" value={evalForm.criteria_price} onChange={v => setEvalForm({ ...evalForm, criteria_price: v })} />
              <Field label="Servicio" type="number" value={evalForm.criteria_service} onChange={v => setEvalForm({ ...evalForm, criteria_service: v })} />
            </div>
            <div style={{ padding: 10, background: '#f0f9ff', borderRadius: 6, marginTop: 10, fontSize: 13 }}>
              <strong>Score automático:</strong> {avgCriteria(evalForm.criteria_quality, evalForm.criteria_delivery, evalForm.criteria_price, evalForm.criteria_service) ?? '—'} / 100
            </div>
            <div style={{ marginTop: 10 }}>
              <SelectField label="Decisión" value={evalForm.decision} options={DECISION_OPTIONS} onChange={v => setEvalForm({ ...evalForm, decision: v })} />
            </div>
            <div style={{ marginTop: 10 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Comentarios</label>
              <textarea value={evalForm.comments} onChange={e => setEvalForm({ ...evalForm, comments: e.target.value })} rows={3}
                style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
            </div>
            <div style={{ marginTop: 10 }}>
              <Field label="Evidencia (link)" value={evalForm.evidence_url} onChange={v => setEvalForm({ ...evalForm, evidence_url: v })} />
            </div>
            <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
              <button type="submit" style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                Guardar evaluación
              </button>
              <button type="button" onClick={() => setEvalSupplier(null)}
                style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                Cancelar
              </button>
            </div>
          </form>
        </ModalShell>,
        document.body
      )}

      {/* MODAL IA */}
      {iaSuggestions && createPortal(
        <ModalShell onClose={() => setIaSuggestions(null)} title="Sugerencias de la IA" wide>
          <p style={{ color: '#6b7280', fontSize: 13 }}>Marcá los proveedores tipo a importar. Se cargarán en estado <em>En Evaluación</em>.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: 8, width: 30 }}></th>
                <th style={{ padding: 8 }}>Nombre</th>
                <th style={{ padding: 8 }}>Producto/Servicio</th>
                <th style={{ padding: 8 }}>Categoría</th>
                <th style={{ padding: 8 }}>Criticidad</th>
                <th style={{ padding: 8 }}>Requisitos</th>
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
                  <td style={{ padding: 8, fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: 8 }}>{s.product_service}</td>
                  <td style={{ padding: 8 }}>{s.category}</td>
                  <td style={{ padding: 8 }}>{s.criticality}</td>
                  <td style={{ padding: 8, color: '#6b7280' }}>{s.requirements_communicated}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={saveIaSelected}
              style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Guardar {iaSelected.size} seleccionados
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

// ───────────── helpers de UI inline ──────────────
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
  return {
    background: 'transparent', border: 'none', cursor: 'pointer',
    color, padding: 6, marginLeft: 4
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
          background: 'white', borderRadius: 14, maxWidth: wide ? 920 : 720, width: '100%',
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
