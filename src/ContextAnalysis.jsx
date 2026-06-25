import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  Sparkles, Loader2, FileText, X, Pencil, Trash2, Eye, Target, BarChart3,
  Search, Filter, Plus, AlertTriangle, CheckCircle2, Calendar, Grid3x3,
  ListChecks, BrainCircuit, ExternalLink, Shuffle
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import ModuleSeedBanner from './ModuleSeedBanner'
import DocumentImporter from './DocumentImporter'
import ArrayPreviewTable from './ArrayPreviewTable'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

// ─────── Constantes ───────
const TYPE_OPTIONS = ['Interno', 'Externo']
const CATEGORY_OPTIONS = ['Fortaleza', 'Debilidad', 'Oportunidad', 'Amenaza']
const STATUS_OPTIONS = ['Activo', 'Mitigado', 'Obsoleto']
const LEVEL_OPTIONS = ['Alto', 'Medio', 'Bajo']

const CATEGORY_META = {
  'Fortaleza':    { icon: '💪', color: '#16a34a', bg: '#dcfce7', type: 'Interno' },
  'Debilidad':    { icon: '⚠️', color: '#dc2626', bg: '#fee2e2', type: 'Interno' },
  'Oportunidad':  { icon: '🚀', color: '#0891b2', bg: '#cffafe', type: 'Externo' },
  'Amenaza':      { icon: '🛡️', color: '#f59e0b', bg: '#fef3c7', type: 'Externo' },
}

const STATUS_COLORS = {
  'Activo':   { bg: '#dbeafe', color: '#1e40af' },
  'Mitigado': { bg: '#dcfce7', color: '#166534' },
  'Obsoleto': { bg: '#f3f4f6', color: '#6b7280' },
}

const LEVEL_SCORE = { 'Alto': 3, 'Medio': 2, 'Bajo': 1 }

const EMPTY_FORM = {
  type: 'Interno', category: 'Fortaleza',
  factor: '', description: '', strategy: '',
  impact_level: 'Medio', probability: 'Medio',
  status: 'Activo', next_review_date: '',
  linked_risk_id: '', linked_stakeholder_id: '',
  crossover_strategy: ''
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
  if (parsed && Array.isArray(parsed.factors)) return parsed.factors
  if (parsed && Array.isArray(parsed.items)) return parsed.items
  if (parsed && typeof parsed === 'object' && parsed.factor) return [parsed]
  return []
}

// ─────── Subcomponentes ───────
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

// ─────── Componente ───────
export default function ContextAnalysis() {
  const [items, setItems] = useState([])
  const [risks, setRisks] = useState([])
  const [stakeholders, setStakeholders] = useState([])
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

  // IA
  const [loadingIA, setLoadingIA] = useState(false)
  const [loadingIAFull, setLoadingIAFull] = useState(false)
  const [loadingIACross, setLoadingIACross] = useState(false)
  const [iaSuggestion, setIaSuggestion] = useState(null)
  const [iaFullSuggestions, setIaFullSuggestions] = useState(null)
  const [iaSelected, setIaSelected] = useState(new Set())
  const [iaCrossResult, setIaCrossResult] = useState(null)
  const [showCrossModal, setShowCrossModal] = useState(false)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [main, rk, sh, prof] = await Promise.all([
      supabase.from('context_analysis').select('*').order('created_at', { ascending: false }),
      supabase.from('risk_matrix').select('id, risk_description, process_area').limit(100),
      supabase.from('stakeholders').select('id, name').limit(50),
      supabase.from('company_profile').select('*').limit(1).maybeSingle()
    ])
    setItems(main.data || [])
    setRisks(rk.data || [])
    setStakeholders(sh.data || [])
    setCompanyProfile(prof.data || null)
    setLoading(false)
  }

  // ─────── Form helpers ───────
  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null); setIaSuggestion(null) }
  const handleNew = (preset = {}) => { setForm({ ...EMPTY_FORM, ...preset }); setShowForm(true) }
  const handleCancel = () => { resetForm(); setShowForm(false) }

  const handleEdit = (item) => {
    // Solo copiar campos definidos en EMPTY_FORM — evita arrastrar id/org_id/created_at/etc al payload
    const formData = { ...EMPTY_FORM }
    Object.keys(EMPTY_FORM).forEach(k => {
      formData[k] = item[k] ?? EMPTY_FORM[k]
    })
    setForm(formData)
    setEditingId(item.id); setShowForm(true); setDetailItem(null)
  }

  // Auto-categoría según tipo + categoría
  const handleTypeChange = (type) => {
    const allowed = CATEGORY_OPTIONS.filter(c => CATEGORY_META[c].type === type)
    const newCat = allowed.includes(form.category) ? form.category : allowed[0]
    setForm({ ...form, type, category: newCat })
  }

  const handleDelete = async (id) => {
    if (!await confirm('¿Eliminar este factor?', { tone: 'danger', confirmText: 'Eliminar' })) return
    const { error } = await supabase.from('context_analysis').delete().eq('id', id)
    if (error) toast.error(error.message); else { toast.success('Factor eliminado'); setDetailItem(null); fetchAll() }
  }

  const handleReview = async (id) => {
    const today = new Date().toISOString().slice(0, 10)
    const prev = items.find(i => i.id === id)
    const updates = {
      last_reviewed_date: today,
      change_log: [...(prev?.change_log || []), { at: new Date().toISOString(), changes: [{ field: 'reviewed', from: prev?.last_reviewed_date, to: today }] }]
    }
    await supabase.from('context_analysis').update(updates).eq('id', id)
    fetchAll()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = { ...form }
    ;['next_review_date'].forEach(k => { if (!payload[k]) payload[k] = null })
    // Sweep universal: cualquier campo *_id con string vacío → null (Postgres no acepta '' como UUID)
    Object.keys(payload).forEach(k => {
      if (k.endsWith('_id') && payload[k] === '') payload[k] = null
    })
    payload.priority_score = LEVEL_SCORE[payload.impact_level] * LEVEL_SCORE[payload.probability]
    if (!editingId) payload.last_reviewed_date = new Date().toISOString().slice(0, 10)

    if (editingId) {
      const prev = items.find(i => i.id === editingId)
      const changes = []
      Object.keys(payload).forEach(k => {
        if (prev && JSON.stringify(prev[k] ?? '') !== JSON.stringify(payload[k] ?? '')) {
          changes.push({ field: k, from: prev[k] ?? null, to: payload[k] ?? null })
        }
      })
      payload.change_log = [...(prev?.change_log || []), { at: new Date().toISOString(), changes }]
      const { error } = await supabase.from('context_analysis').update(payload).eq('id', editingId)
      if (error) return toast.error(error.message)
    } else {
      payload.change_log = [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: payload.factor }] }]
      const { error } = await supabase.from('context_analysis').insert([payload])
      if (error) return toast.error(error.message)
    }
    setShowForm(false); resetForm(); fetchAll()
  }

  // ─────── IA por factor (mantenido del original) ───────
  const pedirAyudaIA = async () => {
    if (!form.factor) return toast.warning('Escribe un factor primero')
    setLoadingIA(true); setIaSuggestion(null)
    try {
      const prompt = `Eres consultor ISO 9001 ayudando con análisis FODA.

Factor: "${form.factor}"
Tipo: ${form.type}
Categoría: ${form.category}

Devuelve SOLO JSON sin markdown:
{
  "descripcion": "máx 300 caracteres, técnica",
  "estrategia": "máx 300 caracteres, cómo potenciar (si F/O) o mitigar (si D/A)"
}`
      const raw = await consultarIA(prompt, 'Devuelve únicamente JSON válido.')
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
    setForm({ ...form, description: iaSuggestion.descripcion || '', strategy: iaSuggestion.estrategia || '' })
    setIaSuggestion(null)
  }

  // ─────── IA FODA completo (lee company_profile) ───────
  const generarFodaCompletoIA = async () => {
    setLoadingIAFull(true); setIaFullSuggestions(null)
    try {
      const ctx = companyProfile
        ? `Empresa: ${companyProfile.company_name || 'N/D'} | Sector: ${companyProfile.industry || 'N/D'} | Tamaño: ${companyProfile.size || 'N/D'} | Productos: ${companyProfile.main_products || 'N/D'} | Propósito: ${companyProfile.purpose || 'N/D'}`
        : 'Sin perfil de empresa cargado.'
      const procesos = (await supabase.from('processes').select('name, process_type').limit(20)).data || []

      const prompt = `Eres consultor ISO 9001. Genera un análisis FODA inicial completo (8-12 factores) para esta organización.

CONTEXTO:
${ctx}

PROCESOS CARGADOS:
${procesos.map(p => `- ${p.name} (${p.process_type})`).join('\n') || '- (sin procesos cargados)'}

REQUISITOS:
- Mezcla factores Internos (Fortalezas/Debilidades) y Externos (Oportunidades/Amenazas)
- Mínimo 2 por cada categoría
- Específicos al sector, no genéricos

Devuelve SOLO JSON array, sin markdown:
[
  {
    "type": "Interno" | "Externo",
    "category": "Fortaleza" | "Debilidad" | "Oportunidad" | "Amenaza",
    "factor": "título corto",
    "description": "explicación breve",
    "strategy": "cómo potenciar o mitigar",
    "impact_level": "Alto" | "Medio" | "Bajo",
    "probability": "Alto" | "Medio" | "Bajo"
  }
]`
      const raw = await consultarIA(prompt, 'Devuelve únicamente JSON array válido.')
      console.log('[IA FODA completo] raw:', raw)
      const arr = parseAiArray(raw)
      if (!arr.length) throw new Error('La IA no devolvió FODA parseable')
      setIaFullSuggestions(arr)
      setIaSelected(new Set(arr.map((_, i) => i)))
    } catch (e) {
      toast.error('Error IA: ' + e.message)
    }
    setLoadingIAFull(false)
  }

  const saveIaFullSelected = async () => {
    if (!iaFullSuggestions) return
    const today = new Date().toISOString().slice(0, 10)
    const rows = iaFullSuggestions
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => iaSelected.has(i))
      .map(({ s }) => ({
        type: TYPE_OPTIONS.includes(s.type) ? s.type : 'Interno',
        category: CATEGORY_OPTIONS.includes(s.category) ? s.category : 'Fortaleza',
        factor: s.factor || 'Factor sin título',
        description: s.description || '',
        strategy: s.strategy || '',
        impact_level: LEVEL_OPTIONS.includes(s.impact_level) ? s.impact_level : 'Medio',
        probability: LEVEL_OPTIONS.includes(s.probability) ? s.probability : 'Medio',
        priority_score: LEVEL_SCORE[s.impact_level || 'Medio'] * LEVEL_SCORE[s.probability || 'Medio'],
        status: 'Activo',
        last_reviewed_date: today,
        change_log: [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: 'IA FODA completo' }] }]
      }))
    if (!rows.length) return setIaFullSuggestions(null)
    const { error } = await supabase.from('context_analysis').insert(rows)
    if (error) return toast.error(error.message)
    setIaFullSuggestions(null); fetchAll()
  }

  // ─────── IA Cruzar estrategias FO/FA/DO/DA ───────
  const cruzarEstrategiasIA = async () => {
    if (items.length < 4) return toast.warning('Necesitas al menos 4 factores cargados para cruzar estrategias')
    setLoadingIACross(true); setIaCrossResult(null); setShowCrossModal(true)
    try {
      const fortalezas = items.filter(i => i.category === 'Fortaleza').map(i => i.factor)
      const debilidades = items.filter(i => i.category === 'Debilidad').map(i => i.factor)
      const oportunidades = items.filter(i => i.category === 'Oportunidad').map(i => i.factor)
      const amenazas = items.filter(i => i.category === 'Amenaza').map(i => i.factor)

      const prompt = `Eres consultor estratégico ISO 9001. Genera las 4 estrategias del análisis FODA cruzado.

FORTALEZAS: ${fortalezas.join('; ') || '(ninguna)'}
DEBILIDADES: ${debilidades.join('; ') || '(ninguna)'}
OPORTUNIDADES: ${oportunidades.join('; ') || '(ninguna)'}
AMENAZAS: ${amenazas.join('; ') || '(ninguna)'}

Devuelve SOLO JSON, sin markdown:
{
  "FO": "Estrategia ofensiva: usar Fortalezas para aprovechar Oportunidades",
  "FA": "Estrategia defensiva: usar Fortalezas para neutralizar Amenazas",
  "DO": "Estrategia adaptativa: superar Debilidades aprovechando Oportunidades",
  "DA": "Estrategia de supervivencia: minimizar Debilidades evitando Amenazas"
}`
      const raw = await consultarIA(prompt, 'Devuelve únicamente JSON válido.')
      const data = extractFirstJson(raw)
      if (!data) throw new Error('IA no devolvió estrategias')
      setIaCrossResult(data)
    } catch (e) {
      toast.error('Error IA: ' + e.message)
      setShowCrossModal(false)
    }
    setLoadingIACross(false)
  }

  // ─────── Filtros + stats ───────
  const filtered = useMemo(() => items.filter(it => {
    if (filterCategory && it.category !== filterCategory) return false
    if (filterStatus && it.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [it.factor, it.description, it.strategy].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [items, filterCategory, filterStatus, search])

  const today = new Date().toISOString().slice(0, 10)
  const stats = useMemo(() => ({
    total: items.length,
    f: items.filter(i => i.category === 'Fortaleza').length,
    d: items.filter(i => i.category === 'Debilidad').length,
    o: items.filter(i => i.category === 'Oportunidad').length,
    a: items.filter(i => i.category === 'Amenaza').length,
    criticos: items.filter(i => (i.priority_score || 0) >= 6 && i.status === 'Activo').length,
    porRevisar: items.filter(i => i.next_review_date && i.next_review_date < today).length
  }), [items, today])

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1f2937', margin: 0 }}>
            <Target size={22} /> Contexto de la Organización
          </h2>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: 13 }}>ISO 4.1 — Análisis FODA</p>
        </div>
        {!showForm && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={generarFodaCompletoIA} disabled={loadingIAFull}
              style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              {loadingIAFull ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
              Generar FODA completo
            </button>
            <button onClick={cruzarEstrategiasIA} disabled={loadingIACross || items.length < 4}
              style={{ padding: '8px 14px', background: '#0891b2', color: 'white', border: 'none', borderRadius: 8, cursor: items.length < 4 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, opacity: items.length < 4 ? 0.5 : 1 }}>
              {loadingIACross ? <Loader2 size={14} className="animate-spin" /> : <Shuffle size={14} />}
              Cruzar estrategias FO/FA/DO/DA
            </button>
            <DocumentImporter
              targetModule="context" label="análisis FODA"
              onImported={async (data) => {
                const factors = Array.isArray(data.context) ? data.context : []
                if (factors.length === 0) throw new Error('La IA no extrajo factores válidos')
                const today2 = new Date().toISOString().slice(0, 10)
                const payload = factors.map(f => ({
                  type: f.type || 'Interno', category: f.category || 'Fortaleza',
                  factor: f.factor || '', description: f.description || '', strategy: f.strategy || '',
                  impact_level: 'Medio', probability: 'Medio', priority_score: 4,
                  status: 'Activo', last_reviewed_date: today2
                }))
                const { error } = await supabase.from('context_analysis').insert(payload)
                if (error) throw new Error(error.message)
                fetchAll()
              }}
              renderPreview={(data, setData) => (
                <ArrayPreviewTable
                  items={data.context}
                  setItems={next => setData({ ...data, context: next })}
                  emptyTemplate={{ type: 'Interno', category: 'Fortaleza', factor: '', description: '', strategy: '' }}
                  columns={[
                    { key: 'type', label: 'Tipo', type: 'select', options: TYPE_OPTIONS, width: '110px' },
                    { key: 'category', label: 'Categoría', type: 'select', options: CATEGORY_OPTIONS, width: '130px' },
                    { key: 'factor', label: 'Factor', type: 'text' },
                    { key: 'description', label: 'Descripción', type: 'textarea' },
                    { key: 'strategy', label: 'Estrategia', type: 'textarea' },
                  ]}
                />
              )}
            />
            <button onClick={() => handleNew()}
              style={{ padding: '8px 14px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <Plus size={16} /> Nuevo factor
            </button>
          </div>
        )}
      </div>

      <IsoInfoCard
        clause="4.1"
        title="Comprensión de la organización y de su contexto"
        tips={[
          "Identifica factores internos (recursos, cultura) y externos (mercado, regulación).",
          "Clasifica cada factor en positivo (F/O) o negativo (D/A).",
          "Para cada factor, define una estrategia + nivel de impacto y probabilidad.",
          "Esta información alimenta riesgos (6.1) y partes interesadas (4.2)."
        ]}
      />
      <ModuleSeedBanner moduleKey="context" label="análisis FODA" visible={!loading && items.length === 0} onSeeded={fetchAll} />

      {/* Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, margin: '16px 0' }}>
        <KPI icon={Target} label="Total" value={stats.total} color="#0ea5e9" />
        <KPI icon={CheckCircle2} label="Fortalezas" value={stats.f} color={CATEGORY_META.Fortaleza.color} />
        <KPI icon={AlertTriangle} label="Debilidades" value={stats.d} color={CATEGORY_META.Debilidad.color} />
        <KPI icon={CheckCircle2} label="Oportunidades" value={stats.o} color={CATEGORY_META.Oportunidad.color} />
        <KPI icon={AlertTriangle} label="Amenazas" value={stats.a} color={CATEGORY_META.Amenaza.color} />
        <KPI icon={BarChart3} label="Críticos" value={stats.criticos} color="#dc2626" sub="Imp×Prob ≥ 6" />
      </div>

      {/* Filtros + vista */}
      {!showForm && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: 2 }}>
            <button onClick={() => setViewMode('matrix')} style={modeBtn(viewMode === 'matrix')}><Grid3x3 size={14} /> Matriz</button>
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
          <h3 style={{ margin: '0 0 14px 0', color: '#1f2937' }}>{editingId ? 'Editar' : 'Nuevo'} Factor de Contexto</h3>
          <form onSubmit={handleSubmit}>
            <FormSection title="Clasificación">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <SelectField label="Tipo" value={form.type} options={TYPE_OPTIONS} onChange={handleTypeChange} />
                <SelectField label="Categoría"
                  value={form.category}
                  options={CATEGORY_OPTIONS.filter(c => CATEGORY_META[c].type === form.type)}
                  onChange={v => setForm({ ...form, category: v })} />
              </div>
            </FormSection>

            <FormSection title="Factor">
              <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <Field label="Factor (título) *" required value={form.factor} onChange={v => setForm({ ...form, factor: v })}
                    placeholder="Ej: Alta rotación de personal técnico" />
                </div>
                <button type="button" onClick={pedirAyudaIA} disabled={loadingIA}
                  style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, height: 36 }}>
                  {loadingIA ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  IA por factor
                </button>
              </div>
              {iaSuggestion && (
                <div style={{ marginTop: 10, padding: 10, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, marginBottom: 4 }}><strong>Sugerencia IA — Descripción:</strong> {iaSuggestion.descripcion}</div>
                  <div style={{ fontSize: 12 }}><strong>Estrategia:</strong> {iaSuggestion.estrategia}</div>
                  <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                    <button type="button" onClick={aplicarSugerencia} style={{ padding: '4px 10px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Aplicar</button>
                    <button type="button" onClick={() => setIaSuggestion(null)} style={{ padding: '4px 10px', background: '#e5e7eb', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>Descartar</button>
                  </div>
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                <TextArea label="Descripción" rows={3} value={form.description} onChange={v => setForm({ ...form, description: v })} />
              </div>
              <div style={{ marginTop: 10 }}>
                <TextArea label="Estrategia" rows={3} value={form.strategy} onChange={v => setForm({ ...form, strategy: v })} />
              </div>
            </FormSection>

            <FormSection title="Priorización">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <SelectField label="Impacto" value={form.impact_level} options={LEVEL_OPTIONS} onChange={v => setForm({ ...form, impact_level: v })} />
                <SelectField label="Probabilidad" value={form.probability} options={LEVEL_OPTIONS} onChange={v => setForm({ ...form, probability: v })} />
                <SelectField label="Estado" value={form.status} options={STATUS_OPTIONS} onChange={v => setForm({ ...form, status: v })} />
              </div>
              <div style={{ marginTop: 8, fontSize: 12, color: '#7c3aed' }}>
                Score prioridad calculado: <strong>{LEVEL_SCORE[form.impact_level] * LEVEL_SCORE[form.probability]}</strong> (impacto × probabilidad)
              </div>
            </FormSection>

            <FormSection title="Revisión y vínculos cross-module">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                <Field label="Próxima revisión" type="date" value={form.next_review_date} onChange={v => setForm({ ...form, next_review_date: v })} />
                <LinkSelect label="Riesgo asociado" value={form.linked_risk_id} onChange={v => setForm({ ...form, linked_risk_id: v })}
                  options={[{ id: '', label: '— ninguno —' }, ...risks.map(r => ({ id: r.id, label: (r.risk_description || '').slice(0, 60) }))]} />
                <LinkSelect label="Stakeholder asociado" value={form.linked_stakeholder_id} onChange={v => setForm({ ...form, linked_stakeholder_id: v })}
                  options={[{ id: '', label: '— ninguno —' }, ...stakeholders.map(s => ({ id: s.id, label: s.name }))]} />
              </div>
              <div style={{ marginTop: 10 }}>
                <TextArea label="Estrategia cruzada (FO/FA/DO/DA)" rows={2} value={form.crossover_strategy} onChange={v => setForm({ ...form, crossover_strategy: v })}
                  placeholder="Cómo se cruza con otros factores del FODA" />
              </div>
            </FormSection>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={handleCancel}
                style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button type="submit"
                style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                {editingId ? 'Guardar' : 'Crear factor'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* VISTA MATRIZ 2x2 */}
      {!showForm && viewMode === 'matrix' && (loading ? <p>Cargando...</p> : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {CATEGORY_OPTIONS.map(cat => {
            const meta = CATEGORY_META[cat]
            const list = filtered.filter(i => i.category === cat)
            return (
              <div key={cat} style={{ background: meta.bg, border: `2px solid ${meta.color}`, borderRadius: 12, padding: 14, minHeight: 200 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${meta.color}40` }}>
                  <span style={{ fontSize: 22 }}>{meta.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 11, color: meta.color, textTransform: 'uppercase', fontWeight: 700, letterSpacing: 1 }}>{meta.type}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: meta.color }}>{cat}s</div>
                  </div>
                  <span style={{ fontSize: 18, fontWeight: 800, color: meta.color }}>{list.length}</span>
                </div>
                {list.length === 0 && <div style={{ fontSize: 12, color: meta.color + 'aa', textAlign: 'center', padding: 16 }}>— sin factores —</div>}
                {list.map(item => {
                  const score = item.priority_score || 0
                  return (
                    <div key={item.id} onClick={() => setDetailItem(item)}
                      style={{ background: 'white', padding: 10, marginBottom: 6, borderRadius: 8, cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', borderLeft: `4px solid ${meta.color}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: '#111827', flex: 1 }}>{item.factor}</div>
                        {score >= 6 && <span style={{ background: '#dc2626', color: 'white', fontSize: 9, padding: '2px 5px', borderRadius: 3, fontWeight: 700 }}>CRÍT</span>}
                      </div>
                      {item.description && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 4, maxHeight: 28, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{item.description}</div>}
                      <div style={{ display: 'flex', gap: 4, marginTop: 4 }}>
                        <span style={{ fontSize: 9, color: meta.color }}>I:{item.impact_level} · P:{item.probability}</span>
                        {item.status !== 'Activo' && <span style={{ fontSize: 9, color: '#6b7280' }}>· {item.status}</span>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      ))}

      {/* VISTA LISTA */}
      {!showForm && viewMode === 'list' && (loading ? <p>Cargando...</p> : (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left', fontSize: 12, color: '#374151', textTransform: 'uppercase' }}>
                <th style={{ padding: 12 }}>Factor</th>
                <th style={{ padding: 12 }}>Categoría</th>
                <th style={{ padding: 12 }}>Imp×Prob</th>
                <th style={{ padding: 12 }}>Estado</th>
                <th style={{ padding: 12 }}>Próx. rev.</th>
                <th style={{ padding: 12, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                  Sin factores. Genera con IA o carga manualmente.
                </td></tr>
              )}
              {filtered.map(item => {
                const meta = CATEGORY_META[item.category]
                const st = STATUS_COLORS[item.status] || STATUS_COLORS['Activo']
                const vencida = item.next_review_date && item.next_review_date < today
                return (
                  <tr key={item.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                    <td style={{ padding: 12 }}>
                      <div style={{ fontWeight: 600, color: '#111827' }}>{item.factor}</div>
                      {item.description && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{item.description?.slice(0, 80)}</div>}
                    </td>
                    <td style={{ padding: 12 }}>
                      <span style={{ padding: '3px 10px', borderRadius: 12, background: meta.bg, color: meta.color, fontSize: 11, fontWeight: 700 }}>
                        {meta.icon} {item.category}
                      </span>
                    </td>
                    <td style={{ padding: 12, fontSize: 13, fontWeight: 700, color: (item.priority_score || 0) >= 6 ? '#dc2626' : '#374151' }}>
                      {item.priority_score || '—'}
                      <div style={{ fontSize: 10, color: '#9ca3af', fontWeight: 400 }}>{item.impact_level} × {item.probability}</div>
                    </td>
                    <td style={{ padding: 12 }}>
                      <span style={{ padding: '2px 8px', borderRadius: 10, background: st.bg, color: st.color, fontSize: 11, fontWeight: 700 }}>{item.status}</span>
                    </td>
                    <td style={{ padding: 12, fontSize: 12, color: vencida ? '#dc2626' : '#374151', fontWeight: vencida ? 700 : 400 }}>
                      {item.next_review_date || '—'}{vencida && ' ⚠️'}
                    </td>
                    <td style={{ padding: 12, textAlign: 'right' }}>
                      <button onClick={() => setDetailItem(item)} title="Detalle" style={iconBtn('#0ea5e9')}><Eye size={16} /></button>
                      <button onClick={() => handleReview(item.id)} title="Marcar revisado" style={iconBtn('#16a34a')}><Calendar size={16} /></button>
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
        <ModalShell onClose={() => setDetailItem(null)} title={detailItem.factor} wide>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: 12, background: '#f8fafc', borderRadius: 6, fontSize: 12 }}>
            <Meta label="Tipo" value={detailItem.type} />
            <Meta label="Categoría" value={`${CATEGORY_META[detailItem.category]?.icon || ''} ${detailItem.category}`} />
            <Meta label="Estado" value={detailItem.status} />
            <Meta label="Score" value={detailItem.priority_score} />
            <Meta label="Impacto" value={detailItem.impact_level} />
            <Meta label="Probabilidad" value={detailItem.probability} />
            <Meta label="Última rev." value={detailItem.last_reviewed_date} />
            <Meta label="Próxima rev." value={detailItem.next_review_date} />
          </div>

          {detailItem.description && <DetailSection title="Descripción">{detailItem.description}</DetailSection>}
          {detailItem.strategy && <DetailSection title="Estrategia">{detailItem.strategy}</DetailSection>}
          {detailItem.crossover_strategy && <DetailSection title="Estrategia cruzada">{detailItem.crossover_strategy}</DetailSection>}

          {(detailItem.linked_risk_id || detailItem.linked_stakeholder_id) && (
            <DetailSection title="Vínculos cross-module">
              {detailItem.linked_risk_id && (
                <div style={{ fontSize: 13, padding: 6 }}>🛡️ Riesgo asociado: {risks.find(r => r.id === detailItem.linked_risk_id)?.risk_description || '(eliminado)'}</div>
              )}
              {detailItem.linked_stakeholder_id && (
                <div style={{ fontSize: 13, padding: 6 }}>👥 Stakeholder asociado: {stakeholders.find(s => s.id === detailItem.linked_stakeholder_id)?.name || '(eliminado)'}</div>
              )}
            </DetailSection>
          )}

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={() => handleReview(detailItem.id)} style={{ padding: '8px 14px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={14} /> Marcar revisado hoy
            </button>
            <button onClick={() => handleEdit(detailItem)} style={{ padding: '8px 14px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Editar</button>
            <button onClick={() => handleDelete(detailItem.id)} style={{ padding: '8px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Eliminar</button>
          </div>
        </ModalShell>,
        document.body
      )}

      {/* MODAL IA FODA COMPLETO */}
      {iaFullSuggestions && createPortal(
        <ModalShell onClose={() => setIaFullSuggestions(null)} title="FODA inicial sugerido por IA" wide>
          <p style={{ color: '#6b7280', fontSize: 13 }}>Marcá los factores a cargar.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: 6, width: 30 }}></th>
                <th style={{ padding: 6 }}>Cat.</th>
                <th style={{ padding: 6 }}>Factor</th>
                <th style={{ padding: 6 }}>Estrategia</th>
                <th style={{ padding: 6 }}>I/P</th>
              </tr>
            </thead>
            <tbody>
              {iaFullSuggestions.map((s, i) => (
                <tr key={i} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 6 }}>
                    <input type="checkbox" checked={iaSelected.has(i)} onChange={e => {
                      const next = new Set(iaSelected)
                      if (e.target.checked) next.add(i); else next.delete(i)
                      setIaSelected(next)
                    }} />
                  </td>
                  <td style={{ padding: 6 }}>
                    <span style={{ padding: '1px 6px', borderRadius: 4, background: CATEGORY_META[s.category]?.bg || '#f3f4f6', color: CATEGORY_META[s.category]?.color || '#6b7280', fontWeight: 700 }}>
                      {CATEGORY_META[s.category]?.icon} {s.category}
                    </span>
                  </td>
                  <td style={{ padding: 6 }}>
                    <strong>{s.factor}</strong>
                    {s.description && <div style={{ fontSize: 11, color: '#6b7280' }}>{s.description}</div>}
                  </td>
                  <td style={{ padding: 6, color: '#6b7280' }}>{s.strategy}</td>
                  <td style={{ padding: 6 }}>{s.impact_level}/{s.probability}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={saveIaFullSelected} style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Cargar {iaSelected.size} factores
            </button>
            <button onClick={() => setIaFullSuggestions(null)} style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Cancelar
            </button>
          </div>
        </ModalShell>,
        document.body
      )}

      {/* MODAL CRUZAR ESTRATEGIAS */}
      {showCrossModal && createPortal(
        <ModalShell onClose={() => setShowCrossModal(false)} title="Estrategias cruzadas FO/FA/DO/DA" wide>
          {loadingIACross && <div style={{ textAlign: 'center', padding: 30 }}><Loader2 size={32} className="animate-spin" /> Generando estrategias...</div>}
          {iaCrossResult && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <CrossCard label="FO — Ofensiva" desc="Usar Fortalezas para aprovechar Oportunidades" text={iaCrossResult.FO} color="#16a34a" />
              <CrossCard label="FA — Defensiva" desc="Usar Fortalezas para neutralizar Amenazas" text={iaCrossResult.FA} color="#0891b2" />
              <CrossCard label="DO — Adaptativa" desc="Superar Debilidades aprovechando Oportunidades" text={iaCrossResult.DO} color="#f59e0b" />
              <CrossCard label="DA — Supervivencia" desc="Minimizar Debilidades evitando Amenazas" text={iaCrossResult.DA} color="#dc2626" />
            </div>
          )}
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

function DetailSection({ title, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <h4 style={{ margin: '0 0 6px 0', fontSize: 13, color: '#1f2937', borderBottom: '2px solid #e2e8f0', paddingBottom: 4 }}>{title}</h4>
      {typeof children === 'string' ? <p style={{ margin: 4, fontSize: 13 }}>{children}</p> : children}
    </div>
  )
}

function CrossCard({ label, desc, text, color }) {
  return (
    <div style={{ padding: 14, background: color + '10', border: `2px solid ${color}`, borderRadius: 10 }}>
      <div style={{ fontSize: 11, color, textTransform: 'uppercase', fontWeight: 800, letterSpacing: 1, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 11, color: color + 'cc', marginBottom: 8 }}>{desc}</div>
      <div style={{ fontSize: 13, color: '#111827' }}>{text}</div>
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
