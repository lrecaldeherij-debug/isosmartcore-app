import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  Users, Plus, Search, Filter, Eye, Pencil, Trash2, X, AlertTriangle,
  Sparkles, Loader2, ExternalLink, Grid3x3, ListChecks, Building2,
  Briefcase, Landmark, UserCircle, Award, Globe2, CheckCircle2
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import ModuleSeedBanner from './ModuleSeedBanner'
import DocumentImporter from './DocumentImporter'
import ArrayPreviewTable from './ArrayPreviewTable'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

// ─────── Constantes ───────
const CATEGORY_OPTIONS = ['Cliente', 'Proveedor', 'Empleado', 'Accionista', 'Regulador', 'Sociedad', 'Otro']
const LEVEL_OPTIONS = ['Alto', 'Medio', 'Bajo']
const STATUS_OPTIONS = ['Pendiente', 'En proceso', 'Cumplido', 'No aplica']
const FREQ_OPTIONS = ['Mensual', 'Trimestral', 'Semestral', 'Anual', 'Ocasional']

const CATEGORY_META = {
  'Cliente':    { icon: UserCircle, color: '#0ea5e9' },
  'Proveedor':  { icon: Briefcase, color: '#f59e0b' },
  'Empleado':   { icon: Users, color: '#16a34a' },
  'Accionista': { icon: Award, color: '#7c3aed' },
  'Regulador':  { icon: Landmark, color: '#dc2626' },
  'Sociedad':   { icon: Globe2, color: '#0891b2' },
  'Otro':       { icon: Building2, color: '#6b7280' },
}

const STATUS_COLORS = {
  'Pendiente':  { bg: '#fef3c7', color: '#92400e' },
  'En proceso': { bg: '#dbeafe', color: '#1e40af' },
  'Cumplido':   { bg: '#dcfce7', color: '#166534' },
  'No aplica':  { bg: '#f3f4f6', color: '#6b7280' },
}

// Matriz Poder-Interés (Mendelow)
// Poder Alto + Interés Alto → Gestionar de cerca
// Poder Alto + Interés Bajo → Mantener satisfecho
// Poder Bajo + Interés Alto → Mantener informado
// Poder Bajo + Interés Bajo → Monitorear
function deriveStrategy(power, interest) {
  const P = power || 'Medio', I = interest || 'Medio'
  if (P === 'Alto' && I === 'Alto') return 'Gestionar de cerca'
  if (P === 'Alto') return 'Mantener satisfecho'
  if (I === 'Alto') return 'Mantener informado'
  if (P === 'Medio' || I === 'Medio') return 'Mantener informado'
  return 'Monitorear'
}

const STRATEGY_COLORS = {
  'Gestionar de cerca':   { bg: '#fee2e2', color: '#991b1b' },
  'Mantener satisfecho':  { bg: '#fef3c7', color: '#92400e' },
  'Mantener informado':   { bg: '#dbeafe', color: '#1e40af' },
  'Monitorear':           { bg: '#f3f4f6', color: '#6b7280' },
}

const EMPTY_FORM = {
  name: '', category: 'Cliente',
  expectations: '',
  influence_level: 'Medio',
  power_level: 'Medio', interest_level: 'Medio',
  engagement_strategy: '', communication_strategy: '',
  is_sgc_requirement: false, follow_up_frequency: 'Anual',
  planning_in_sgc: '', evaluation_method: '',
  responsible: '', evidence_url: '', compliance_date: '',
  status: 'Pendiente',
  next_review_date: ''
}

// ─────── Helpers IA ───────
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
  if (parsed && Array.isArray(parsed.stakeholders)) return parsed.stakeholders
  if (parsed && Array.isArray(parsed.items)) return parsed.items
  if (parsed && typeof parsed === 'object' && parsed.name) return [parsed]
  return []
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
export default function Stakeholders() {
  const [items, setItems] = useState([])
  const [companyProfile, setCompanyProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [detailItem, setDetailItem] = useState(null)

  const [viewMode, setViewMode] = useState('matrix')  // matrix | list
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')

  const [loadingIA, setLoadingIA] = useState(false)
  const [loadingIASector, setLoadingIASector] = useState(false)
  const [iaSuggestion, setIaSuggestion] = useState(null)
  const [iaSectorList, setIaSectorList] = useState(null)
  const [iaSelected, setIaSelected] = useState(new Set())

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [main, prof] = await Promise.all([
      supabase.from('stakeholders').select('*').order('created_at', { ascending: false }),
      supabase.from('company_profile').select('*').limit(1).maybeSingle()
    ])
    setItems(main.data || [])
    setCompanyProfile(prof.data || null)
    setLoading(false)
  }

  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); setIaSuggestion(null) }
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
    if (!await confirm('¿Eliminar esta parte interesada?', { tone: 'danger', confirmText: 'Eliminar' })) return
    const { error } = await supabase.from('stakeholders').delete().eq('id', id)
    if (error) toast.error(error.message); else { toast.success('Parte interesada eliminada'); setDetailItem(null); fetchAll() }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = { ...form }
    if (!payload.compliance_date) payload.compliance_date = null
    if (!payload.next_review_date) payload.next_review_date = null
    // Auto-derivar estrategia si está vacía
    if (!payload.engagement_strategy) {
      payload.engagement_strategy = deriveStrategy(payload.power_level, payload.interest_level)
    }
    if (!editingId) payload.last_reviewed_at = new Date().toISOString().slice(0, 10)

    if (editingId) {
      const prev = items.find(i => i.id === editingId)
      const changes = []
      Object.keys(payload).forEach(k => {
        if (prev && JSON.stringify(prev[k] ?? '') !== JSON.stringify(payload[k] ?? '')) {
          changes.push({ field: k, from: prev[k] ?? null, to: payload[k] ?? null })
        }
      })
      payload.change_log = [...(prev?.change_log || []), { at: new Date().toISOString(), changes }]
      const { error } = await supabase.from('stakeholders').update(payload).eq('id', editingId)
      if (error) return toast.error(error.message)
    } else {
      payload.change_log = [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: payload.name }] }]
      const { error } = await supabase.from('stakeholders').insert([payload])
      if (error) return toast.error(error.message)
    }
    setShowForm(false); resetForm(); fetchAll()
  }

  const handleQuickUpdate = async (id, field, value) => {
    const prev = items.find(i => i.id === id)
    const newLog = [...(prev?.change_log || []), { at: new Date().toISOString(), changes: [{ field, from: prev?.[field], to: value }] }]
    const { error } = await supabase.from('stakeholders').update({ [field]: value, change_log: newLog }).eq('id', id)
    if (error) toast.error(error.message); else fetchAll()
  }

  // ─────── IA: completar expectativas + planning ───────
  const completarConIA = async () => {
    if (!form.name) return toast.warning('Escribí el nombre de la parte interesada primero')
    setLoadingIA(true); setIaSuggestion(null)
    try {
      const ctx = companyProfile ? `Empresa: ${companyProfile.company_name || ''} | Sector: ${companyProfile.industry || ''} | Productos: ${companyProfile.main_products || ''}` : ''
      const prompt = `Sos consultor ISO 9001. Estoy analizando esta parte interesada:

Nombre: "${form.name}"
Categoría: ${form.category}
${ctx ? 'Contexto empresa: ' + ctx : ''}

Tarea (todo según ISO 4.2):
1. Expectativas pertinentes al SGC (máx 250 chars)
2. Planificación: cómo cumplir esas expectativas (máx 200 chars)
3. Método de evaluación / verificación (máx 150 chars)
4. Comunicación: cómo comunicarnos (máx 150 chars)
5. Power / Interest sugerido (Alto / Medio / Bajo)

Devolvé SOLO JSON sin markdown:
{
  "expectations": "...",
  "planning_in_sgc": "...",
  "evaluation_method": "...",
  "communication_strategy": "...",
  "power_level": "Alto" | "Medio" | "Bajo",
  "interest_level": "Alto" | "Medio" | "Bajo"
}`
      const raw = await consultarIA(prompt, 'Devolvé únicamente JSON válido.')
      const data = extractFirstJson(raw)
      if (!data) throw new Error('IA no devolvió JSON')
      setIaSuggestion(data)
    } catch (e) {
      toast.error('Error IA: ' + e.message)
    }
    setLoadingIA(false)
  }

  const aplicarSugerencia = () => {
    if (!iaSuggestion) return
    setForm({
      ...form,
      expectations: iaSuggestion.expectations || form.expectations,
      planning_in_sgc: iaSuggestion.planning_in_sgc || form.planning_in_sgc,
      evaluation_method: iaSuggestion.evaluation_method || form.evaluation_method,
      communication_strategy: iaSuggestion.communication_strategy || form.communication_strategy,
      power_level: LEVEL_OPTIONS.includes(iaSuggestion.power_level) ? iaSuggestion.power_level : form.power_level,
      interest_level: LEVEL_OPTIONS.includes(iaSuggestion.interest_level) ? iaSuggestion.interest_level : form.interest_level,
    })
    setIaSuggestion(null)
  }

  // ─────── IA: Sugerir partes del sector ───────
  const sugerirDelSectorIA = async () => {
    setLoadingIASector(true); setIaSectorList(null)
    try {
      const ctx = companyProfile
        ? `Empresa: ${companyProfile.company_name || ''} | Sector: ${companyProfile.industry || ''} | Tamaño: ${companyProfile.size || ''} | Productos: ${companyProfile.main_products || ''}`
        : 'Sin perfil de empresa cargado.'

      const prompt = `Sos consultor ISO 9001. Sugerí 6-10 PARTES INTERESADAS típicas y pertinentes al SGC de esta empresa.

CONTEXTO: ${ctx}

Devolvé SOLO JSON array, sin markdown:
[
  {
    "name": "Nombre del grupo de interés",
    "category": "Cliente" | "Proveedor" | "Empleado" | "Accionista" | "Regulador" | "Sociedad" | "Otro",
    "expectations": "Expectativas pertinentes al SGC",
    "power_level": "Alto" | "Medio" | "Bajo",
    "interest_level": "Alto" | "Medio" | "Bajo",
    "is_sgc_requirement": true | false,
    "follow_up_frequency": "Mensual" | "Trimestral" | "Semestral" | "Anual"
  }
]`
      const raw = await consultarIA(prompt, 'Devolvé únicamente JSON array válido.')
      console.log('[IA stakeholders sector] raw:', raw)
      const arr = parseAiArray(raw)
      if (!arr.length) throw new Error('La IA no devolvió partes parseables')
      setIaSectorList(arr)
      setIaSelected(new Set(arr.map((_, i) => i)))
    } catch (e) {
      toast.error('Error IA: ' + e.message)
    }
    setLoadingIASector(false)
  }

  const saveIaSectorSelected = async () => {
    if (!iaSectorList) return
    const today = new Date().toISOString().slice(0, 10)
    const rows = iaSectorList
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => iaSelected.has(i))
      .map(({ s }) => ({
        name: s.name || 'Sin nombre',
        category: CATEGORY_OPTIONS.includes(s.category) ? s.category : 'Otro',
        expectations: s.expectations || '',
        power_level: LEVEL_OPTIONS.includes(s.power_level) ? s.power_level : 'Medio',
        interest_level: LEVEL_OPTIONS.includes(s.interest_level) ? s.interest_level : 'Medio',
        engagement_strategy: deriveStrategy(s.power_level, s.interest_level),
        influence_level: s.power_level || 'Medio',
        is_sgc_requirement: !!s.is_sgc_requirement,
        follow_up_frequency: FREQ_OPTIONS.includes(s.follow_up_frequency) ? s.follow_up_frequency : 'Anual',
        status: 'Pendiente',
        last_reviewed_at: today,
        change_log: [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: 'IA sector' }] }]
      }))
    if (!rows.length) return setIaSectorList(null)
    const { error } = await supabase.from('stakeholders').insert(rows)
    if (error) return toast.error(error.message)
    setIaSectorList(null); fetchAll()
  }

  // ─────── Filtros + stats ───────
  const filtered = useMemo(() => items.filter(it => {
    if (filterCategory && it.category !== filterCategory) return false
    if (filterStatus && it.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [it.name, it.expectations, it.responsible].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [items, filterCategory, filterStatus, search])

  const today = new Date().toISOString().slice(0, 10)
  const stats = useMemo(() => ({
    total: items.length,
    sgc: items.filter(i => i.is_sgc_requirement).length,
    criticos: items.filter(i => deriveStrategy(i.power_level, i.interest_level) === 'Gestionar de cerca').length,
    pendientes: items.filter(i => i.status === 'Pendiente').length,
    porRevisar: items.filter(i => i.next_review_date && i.next_review_date < today).length
  }), [items, today])

  // Para matriz Poder-Interés: 2x2 simplificado (Alto/Bajo, agrupando Medio con Bajo para visual)
  // pero más rico: 3x3 con strategy derivada
  const matrixCells = [
    { p: 'Alto',  i: 'Alto',  strat: 'Gestionar de cerca' },
    { p: 'Alto',  i: 'Medio', strat: 'Mantener satisfecho' },
    { p: 'Alto',  i: 'Bajo',  strat: 'Mantener satisfecho' },
    { p: 'Medio', i: 'Alto',  strat: 'Mantener informado' },
    { p: 'Medio', i: 'Medio', strat: 'Mantener informado' },
    { p: 'Medio', i: 'Bajo',  strat: 'Monitorear' },
    { p: 'Bajo',  i: 'Alto',  strat: 'Mantener informado' },
    { p: 'Bajo',  i: 'Medio', strat: 'Monitorear' },
    { p: 'Bajo',  i: 'Bajo',  strat: 'Monitorear' }
  ]

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1f2937', margin: 0 }}>
            <Users size={22} /> Partes Interesadas
          </h2>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: 13 }}>ISO 4.2 — Necesidades y expectativas + matriz Poder-Interés</p>
        </div>
        {!showForm && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={sugerirDelSectorIA} disabled={loadingIASector}
              style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              {loadingIASector ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Sugerir del sector
            </button>
            <DocumentImporter
              targetModule="stakeholders" label="partes interesadas"
              onImported={async (data) => {
                const items2 = Array.isArray(data.stakeholders) ? data.stakeholders : []
                if (!items2.length) throw new Error('La IA no extrajo items válidos')
                const payload = items2.map(s => ({
                  name: s.name || '', expectations: s.expectations || '',
                  category: s.category || 'Otro',
                  power_level: s.power_level || 'Medio', interest_level: s.interest_level || 'Medio',
                  influence_level: s.influence_level || 'Medio',
                  is_sgc_requirement: !!s.is_sgc_requirement,
                  follow_up_frequency: s.follow_up_frequency || 'Anual',
                  status: 'Pendiente'
                }))
                const { error } = await supabase.from('stakeholders').insert(payload)
                if (error) throw new Error(error.message)
                fetchAll()
              }}
              renderPreview={(data, setData) => (
                <ArrayPreviewTable
                  items={data.stakeholders}
                  setItems={next => setData({ ...data, stakeholders: next })}
                  emptyTemplate={{ name: '', category: 'Otro', expectations: '', power_level: 'Medio', interest_level: 'Medio' }}
                  columns={[
                    { key: 'name', label: 'Nombre', type: 'text' },
                    { key: 'category', label: 'Cat.', type: 'select', options: CATEGORY_OPTIONS, width: '110px' },
                    { key: 'expectations', label: 'Expectativas', type: 'textarea' },
                    { key: 'power_level', label: 'Poder', type: 'select', options: LEVEL_OPTIONS, width: '90px' },
                    { key: 'interest_level', label: 'Interés', type: 'select', options: LEVEL_OPTIONS, width: '90px' }
                  ]}
                />
              )}
            />
            <button onClick={handleNew}
              style={{ padding: '8px 14px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <Plus size={16} /> Nueva parte interesada
            </button>
          </div>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['4.2']} />
      <ModuleSeedBanner moduleKey="stakeholders" label="partes interesadas" visible={!loading && items.length === 0} onSeeded={fetchAll} />

      {/* Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, margin: '16px 0' }}>
        <KPI icon={Users} label="Total" value={stats.total} color="#0ea5e9" />
        <KPI icon={CheckCircle2} label="Aplican al SGC" value={stats.sgc} color="#16a34a" />
        <KPI icon={AlertTriangle} label="Críticos (P+I altos)" value={stats.criticos} color="#dc2626" sub="Gestionar de cerca" />
        <KPI icon={Building2} label="Pendientes" value={stats.pendientes} color="#f59e0b" />
        <KPI icon={AlertTriangle} label="Por revisar" value={stats.porRevisar} color="#dc2626" />
      </div>

      {/* Filtros + vista */}
      {!showForm && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: 2 }}>
            <button onClick={() => setViewMode('matrix')} style={modeBtn(viewMode === 'matrix')}><Grid3x3 size={14} /> Matriz P-I</button>
            <button onClick={() => setViewMode('list')} style={modeBtn(viewMode === 'list')}><ListChecks size={14} /> Lista</button>
          </div>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#9ca3af' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
              style={{ width: '100%', padding: '8px 8px 8px 30px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
          </div>
          <Filter size={14} color="#6b7280" />
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
            <option value="">Categoría: Todas</option>
            {CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
            <option value="">Estado: Todos</option>
            {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      )}

      {/* FORM */}
      {showForm && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 14px 0', color: '#1f2937' }}>{editingId ? 'Editar' : 'Nueva'} parte interesada</h3>
          <form onSubmit={handleSubmit}>
            <FormSection title="Identificación">
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 2 }}>
                  <Field label="Nombre / Grupo *" required value={form.name} onChange={v => setForm({ ...form, name: v })} placeholder="Ej: Clientes industriales del sector minero" />
                </div>
                <div style={{ flex: 1 }}>
                  <SelectField label="Categoría" value={form.category} options={CATEGORY_OPTIONS} onChange={v => setForm({ ...form, category: v })} />
                </div>
                <button type="button" onClick={completarConIA} disabled={loadingIA}
                  style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, height: 36 }}>
                  {loadingIA ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Completar con IA
                </button>
              </div>
              {iaSuggestion && (
                <div style={{ marginTop: 10, padding: 10, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, marginBottom: 4 }}><strong>Expectativas:</strong> {iaSuggestion.expectations}</div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}><strong>Planning:</strong> {iaSuggestion.planning_in_sgc}</div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}><strong>Evaluación:</strong> {iaSuggestion.evaluation_method}</div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}><strong>Comunicación:</strong> {iaSuggestion.communication_strategy}</div>
                  <div style={{ fontSize: 12 }}><strong>P:</strong> {iaSuggestion.power_level} · <strong>I:</strong> {iaSuggestion.interest_level}</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    <button type="button" onClick={aplicarSugerencia} style={{ padding: '4px 10px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Aplicar todo</button>
                    <button type="button" onClick={() => setIaSuggestion(null)} style={{ padding: '4px 10px', background: '#e5e7eb', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Descartar</button>
                  </div>
                </div>
              )}
            </FormSection>

            <FormSection title="Expectativas y planificación (ISO 4.2)">
              <TextArea label="Expectativas / requisitos pertinentes al SGC" rows={3} value={form.expectations} onChange={v => setForm({ ...form, expectations: v })} />
              <div style={{ marginTop: 10 }}>
                <TextArea label="Cómo lo vamos a cumplir (planificación en el SGC)" rows={2} value={form.planning_in_sgc} onChange={v => setForm({ ...form, planning_in_sgc: v })} />
              </div>
              <div style={{ marginTop: 10 }}>
                <TextArea label="Método de evaluación / verificación" rows={2} value={form.evaluation_method} onChange={v => setForm({ ...form, evaluation_method: v })} />
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.is_sgc_requirement} onChange={e => setForm({ ...form, is_sgc_requirement: e.target.checked })} />
                  <strong>Este requisito aplica al SGC (ISO 4.2.c)</strong>
                </label>
              </div>
            </FormSection>

            <FormSection title="Matriz Poder-Interés (Mendelow)">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <SelectField label="Poder" value={form.power_level} options={LEVEL_OPTIONS} onChange={v => setForm({ ...form, power_level: v })} />
                <SelectField label="Interés" value={form.interest_level} options={LEVEL_OPTIONS} onChange={v => setForm({ ...form, interest_level: v })} />
                <SelectField label="Influencia general" value={form.influence_level} options={LEVEL_OPTIONS} onChange={v => setForm({ ...form, influence_level: v })} />
              </div>
              <div style={{ marginTop: 10, padding: 10, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 13, color: '#0c4a6e' }}>
                🎯 Estrategia sugerida: <strong>{deriveStrategy(form.power_level, form.interest_level)}</strong>
              </div>
              <div style={{ marginTop: 10 }}>
                <TextArea label="Estrategia de engagement (cómo gestionamos)" rows={2} value={form.engagement_strategy} onChange={v => setForm({ ...form, engagement_strategy: v })}
                  placeholder={`Default: ${deriveStrategy(form.power_level, form.interest_level)}`} />
              </div>
              <div style={{ marginTop: 10 }}>
                <TextArea label="Estrategia de comunicación" rows={2} value={form.communication_strategy} onChange={v => setForm({ ...form, communication_strategy: v })}
                  placeholder="Ej: Newsletter mensual + reuniones trimestrales" />
              </div>
            </FormSection>

            <FormSection title="Responsable y seguimiento">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <Field label="Responsable" value={form.responsible} onChange={v => setForm({ ...form, responsible: v })} />
                <SelectField label="Frecuencia seguimiento" value={form.follow_up_frequency} options={FREQ_OPTIONS} onChange={v => setForm({ ...form, follow_up_frequency: v })} />
                <SelectField label="Estado" value={form.status} options={STATUS_OPTIONS} onChange={v => setForm({ ...form, status: v })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
                <Field label="Próxima revisión" type="date" value={form.next_review_date} onChange={v => setForm({ ...form, next_review_date: v })} />
                <Field label="Fecha cumplimiento" type="date" value={form.compliance_date} onChange={v => setForm({ ...form, compliance_date: v })} />
              </div>
              <div style={{ marginTop: 10 }}>
                <Field label="Evidencia (link)" value={form.evidence_url} onChange={v => setForm({ ...form, evidence_url: v })} placeholder="https://..." />
              </div>
            </FormSection>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={handleCancel}
                style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button type="submit"
                style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                {editingId ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* VISTA MATRIZ Poder-Interés (3x3 con colores Mendelow) */}
      {!showForm && viewMode === 'matrix' && (loading ? <p>Cargando...</p> : (
        <div>
          <div style={{ marginBottom: 10, fontSize: 12, color: '#6b7280', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
            {Object.entries(STRATEGY_COLORS).map(([k, v]) => (
              <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <span style={{ width: 10, height: 10, background: v.bg, border: `1px solid ${v.color}`, borderRadius: 3 }}></span> {k}
              </span>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '60px repeat(3, 1fr)', gap: 6 }}>
            <div></div>
            <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Interés Bajo</div>
            <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Interés Medio</div>
            <div style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Interés Alto</div>

            {['Alto', 'Medio', 'Bajo'].map(p => (
              <>
                <div key={'lbl-' + p} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                  Poder {p}
                </div>
                {['Bajo', 'Medio', 'Alto'].map(i => {
                  const cellStrat = deriveStrategy(p, i)
                  const stColor = STRATEGY_COLORS[cellStrat]
                  const list = filtered.filter(it => (it.power_level || 'Medio') === p && (it.interest_level || 'Medio') === i)
                  return (
                    <div key={p + '-' + i} style={{ background: stColor.bg, border: `1px solid ${stColor.color}40`, borderRadius: 8, padding: 8, minHeight: 110 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: stColor.color, marginBottom: 6, textTransform: 'uppercase' }}>{cellStrat}</div>
                      {list.length === 0 && <div style={{ fontSize: 11, color: stColor.color + '99' }}>—</div>}
                      {list.map(item => {
                        const meta = CATEGORY_META[item.category] || CATEGORY_META.Otro
                        const Icon = meta.icon
                        return (
                          <div key={item.id} onClick={() => setDetailItem(item)}
                            style={{ background: 'white', padding: '4px 6px', marginBottom: 4, borderRadius: 5, cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, borderLeft: `3px solid ${meta.color}` }}>
                            <Icon size={10} color={meta.color} />
                            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                            {item.is_sgc_requirement && <span style={{ background: '#16a34a', color: 'white', fontSize: 8, padding: '0 4px', borderRadius: 3 }}>SGC</span>}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </>
            ))}
          </div>
        </div>
      ))}

      {/* VISTA LISTA */}
      {!showForm && viewMode === 'list' && (loading ? <p>Cargando...</p> : (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left', fontSize: 12, color: '#374151', textTransform: 'uppercase' }}>
                <th style={{ padding: 12 }}>Parte interesada</th>
                <th style={{ padding: 12 }}>Categoría</th>
                <th style={{ padding: 12 }}>Poder/Interés</th>
                <th style={{ padding: 12 }}>Estrategia</th>
                <th style={{ padding: 12 }}>SGC</th>
                <th style={{ padding: 12 }}>Estado</th>
                <th style={{ padding: 12, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>Sin partes interesadas.</td></tr>
              )}
              {filtered.map(item => {
                const meta = CATEGORY_META[item.category] || CATEGORY_META.Otro
                const Icon = meta.icon
                const strat = deriveStrategy(item.power_level, item.interest_level)
                const stColor = STRATEGY_COLORS[strat]
                const statusC = STATUS_COLORS[item.status] || STATUS_COLORS['Pendiente']
                return (
                  <tr key={item.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 12 }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{item.name}</div>
                      {item.expectations && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{item.expectations?.slice(0, 80)}</div>}
                    </td>
                    <td style={{ padding: 12 }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: meta.color + '20', color: meta.color, borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
                        <Icon size={11} /> {item.category}
                      </span>
                    </td>
                    <td style={{ padding: 12, fontSize: 12 }}>
                      P:{item.power_level || '—'} · I:{item.interest_level || '—'}
                    </td>
                    <td style={{ padding: 12 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, background: stColor.bg, color: stColor.color, fontSize: 11, fontWeight: 700 }}>
                        {strat}
                      </span>
                    </td>
                    <td style={{ padding: 12, textAlign: 'center' }}>
                      <input type="checkbox" checked={!!item.is_sgc_requirement} onChange={e => handleQuickUpdate(item.id, 'is_sgc_requirement', e.target.checked)} />
                    </td>
                    <td style={{ padding: 12 }}>
                      <select value={item.status || 'Pendiente'} onChange={e => handleQuickUpdate(item.id, 'status', e.target.value)}
                        style={{ padding: 4, fontSize: 11, border: '1px solid ' + statusC.color, borderRadius: 4, background: statusC.bg, color: statusC.color, fontWeight: 700 }}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
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

      {/* MODAL DETALLE */}
      {detailItem && createPortal(
        <ModalShell onClose={() => setDetailItem(null)} title={detailItem.name} wide>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: 12, background: '#f8fafc', borderRadius: 6, fontSize: 12 }}>
            <Meta label="Categoría" value={detailItem.category} />
            <Meta label="Estado" value={detailItem.status} />
            <Meta label="Aplica SGC" value={detailItem.is_sgc_requirement ? 'Sí' : 'No'} />
            <Meta label="Frecuencia" value={detailItem.follow_up_frequency} />
            <Meta label="Poder" value={detailItem.power_level} />
            <Meta label="Interés" value={detailItem.interest_level} />
            <Meta label="Estrategia derivada" value={deriveStrategy(detailItem.power_level, detailItem.interest_level)} />
            <Meta label="Responsable" value={detailItem.responsible} />
          </div>

          {detailItem.expectations && <DetailSection title="Expectativas">{detailItem.expectations}</DetailSection>}
          {detailItem.planning_in_sgc && <DetailSection title="Planificación en el SGC">{detailItem.planning_in_sgc}</DetailSection>}
          {detailItem.evaluation_method && <DetailSection title="Método de evaluación">{detailItem.evaluation_method}</DetailSection>}
          {detailItem.engagement_strategy && <DetailSection title="Estrategia de engagement">{detailItem.engagement_strategy}</DetailSection>}
          {detailItem.communication_strategy && <DetailSection title="Comunicación">{detailItem.communication_strategy}</DetailSection>}

          {(detailItem.compliance_date || detailItem.next_review_date) && (
            <DetailSection title="Fechas">
              {detailItem.compliance_date && <div style={{ fontSize: 13, padding: 4 }}>📅 Cumplimiento: {detailItem.compliance_date}</div>}
              {detailItem.next_review_date && <div style={{ fontSize: 13, padding: 4 }}>🔁 Próxima revisión: {detailItem.next_review_date}</div>}
            </DetailSection>
          )}

          {detailItem.evidence_url && (
            <DetailSection title="Evidencia">
              <a href={detailItem.evidence_url} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Abrir <ExternalLink size={12} />
              </a>
            </DetailSection>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={() => handleEdit(detailItem)} style={{ padding: '8px 14px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Editar</button>
            <button onClick={() => handleDelete(detailItem.id)} style={{ padding: '8px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Eliminar</button>
          </div>
        </ModalShell>,
        document.body
      )}

      {/* MODAL IA sector */}
      {iaSectorList && createPortal(
        <ModalShell onClose={() => setIaSectorList(null)} title="Partes interesadas típicas del sector (IA)" wide>
          <p style={{ color: '#6b7280', fontSize: 13 }}>Marcá las partes a cargar.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: 6, width: 30 }}></th>
                <th style={{ padding: 6 }}>Nombre</th>
                <th style={{ padding: 6 }}>Cat.</th>
                <th style={{ padding: 6 }}>Expectativas</th>
                <th style={{ padding: 6 }}>P/I</th>
                <th style={{ padding: 6 }}>SGC</th>
              </tr>
            </thead>
            <tbody>
              {iaSectorList.map((s, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 6 }}>
                    <input type="checkbox" checked={iaSelected.has(i)} onChange={e => {
                      const next = new Set(iaSelected)
                      if (e.target.checked) next.add(i); else next.delete(i)
                      setIaSelected(next)
                    }} />
                  </td>
                  <td style={{ padding: 6, fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: 6 }}>{s.category}</td>
                  <td style={{ padding: 6, color: '#6b7280' }}>{s.expectations}</td>
                  <td style={{ padding: 6 }}>{s.power_level}/{s.interest_level}</td>
                  <td style={{ padding: 6 }}>{s.is_sgc_requirement ? '✓' : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={saveIaSectorSelected} style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Cargar {iaSelected.size} partes
            </button>
            <button onClick={() => setIaSectorList(null)} style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Cancelar
            </button>
          </div>
        </ModalShell>,
        document.body
      )}
    </div>
  )
}

// ─────── Helpers UI ───────
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
