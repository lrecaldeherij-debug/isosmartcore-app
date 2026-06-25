import { useEffect, useMemo, useState, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  ShieldAlert, Sparkles, Loader2, Plus, Search, Filter, Eye, Pencil, Trash2,
  X, Save, Target, TrendingUp, AlertTriangle, CheckCircle2, Layers, Grid3x3,
  List, Calendar, DollarSign, Lightbulb, ArrowRight, Award, Link as LinkIcon,
  Activity
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import ModuleSeedBanner from './ModuleSeedBanner'
import DocumentImporter from './DocumentImporter'
import ArrayPreviewTable from './ArrayPreviewTable'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'
import { ChangeLogTimeline } from './components/ui'

const RISK_FIELD_LABELS = {
  risk_description: 'Descripción', type: 'Tipo', category: 'Categoría', status: 'Estado',
  probability_initial: 'Probabilidad inicial', impact_initial: 'Impacto inicial', score_initial: 'Score inicial',
  probability_residual: 'Probabilidad residual', impact_residual: 'Impacto residual', score_residual: 'Score residual',
  treatment_strategy: 'Estrategia', treatment_cost: 'Costo', currency: 'Moneda',
  control_measure: 'Control', responsible: 'Responsable', owner: 'Owner',
  due_date: 'Fecha límite', execution_date: 'Ejecución', review_date: 'Próx. revisión',
  approved_by: 'Aprobado por', approved_at: 'Fecha aprobación',
  process_id: 'Proceso', stakeholder_id: 'Stakeholder', context_id: 'Origen FODA',
  potential_cause: 'Causa potencial', potential_consequence: 'Consecuencia',
  kri_indicator: 'KRI', kri_target: 'KRI meta', kri_current: 'KRI actual',
  strategic_action_id: 'Acción estratégica', improvement_opportunity_id: 'Mejora',
}

// ───────────────────── Constantes ──────────────────────
const TYPE_OPTIONS = ['Riesgo', 'Oportunidad']
const CATEGORY_OPTIONS = ['Estratégico', 'Operacional', 'Financiero', 'Cumplimiento', 'Reputacional', 'Tecnológico', 'Personal', 'Cliente', 'Proveedor', 'Mercado']
const STATUS_OPTIONS = ['Identificado', 'Evaluado', 'En Tratamiento', 'Tratado', 'Aceptado', 'Cerrado', 'Materializado']
const TREATMENT_RISK = ['Evitar', 'Mitigar', 'Transferir', 'Aceptar']
const TREATMENT_OPP = ['Aprovechar', 'Mejorar', 'Compartir', 'Aceptar']

const TYPE_COLORS = {
  'Riesgo':      { bg: '#fee2e2', color: '#991b1b' },
  'Oportunidad': { bg: '#dcfce7', color: '#166534' },
}
const STATUS_COLORS = {
  'Identificado':   { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  'Evaluado':       { bg: '#e0e7ff', color: '#3730a3', border: '#c7d2fe' },
  'En Tratamiento': { bg: '#cffafe', color: '#155e75', border: '#a5f3fc' },
  'Tratado':        { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  'Aceptado':       { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' },
  'Cerrado':        { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
  'Materializado':  { bg: '#7f1d1d', color: 'white', border: '#7f1d1d' },
}
const CATEGORY_COLORS = {
  'Estratégico':  '#7c3aed', 'Operacional': '#0891b2', 'Financiero': '#16a34a',
  'Cumplimiento': '#dc2626', 'Reputacional': '#db2777', 'Tecnológico': '#0ea5e9',
  'Personal':     '#f59e0b', 'Cliente':     '#ec4899', 'Proveedor':  '#8b5cf6',
  'Mercado':      '#10b981',
}

const EMPTY_FORM = {
  type: 'Riesgo',
  category: 'Operacional',
  risk_description: '',
  potential_cause: '',
  potential_consequence: '',
  process_id: '', process_area: '',
  stakeholder_id: '', context_id: '',
  probability_initial: 5, impact_initial: 5,
  probability_residual: 0, impact_residual: 0,
  treatment_strategy: 'Mitigar',
  control_measure: '',
  kri_indicator: '', kri_target: '', kri_current: '',
  responsible: '', owner: '',
  approved_by: '', approved_at: '',
  due_date: '', review_date: '', execution_date: '',
  treatment_cost: '', currency: 'PYG',
  status: 'Identificado',
  identification_date: new Date().toISOString().slice(0, 10),
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
function parseAiObject(raw) {
  const p = extractFirstJson(raw)
  if (p && typeof p === 'object' && !Array.isArray(p)) return p
  return null
}
function parseAiArray(raw) {
  const p = extractFirstJson(raw)
  if (Array.isArray(p)) return p
  if (p && Array.isArray(p.items)) return p.items
  if (p && Array.isArray(p.risks)) return p.risks
  if (p && Array.isArray(p.opportunities)) return p.opportunities
  return []
}

// ─────────────────────────────────────────────────────
export default function RisksOpportunities() {
  const [items, setItems] = useState([])
  const [processes, setProcesses] = useState([])
  const [jobs, setJobs] = useState([])
  const [stakeholders, setStakeholders] = useState([])
  const [contextFactors, setContextFactors] = useState([])
  const [objectives, setObjectives] = useState([])
  const [ncs, setNcs] = useState([])
  const [orgProfile, setOrgProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const [mostrandoForm, setMostrandoForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [originalForm, setOriginalForm] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  // Vista
  const [viewMode, setViewMode] = useState('cards') // 'cards' | 'heatmap'

  // Filtros
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('Todos')
  const [filterCategory, setFilterCategory] = useState('Todas')
  const [filterStatus, setFilterStatus] = useState('Todos')
  const [filterProcess, setFilterProcess] = useState('Todos')

  // Modales
  const [detailItem, setDetailItem] = useState(null)

  // IA
  const [loadingIA, setLoadingIA] = useState(false)
  const [iaContext, setIaContext] = useState(null) // 'rca' | 'foda_risks' | 'foda_opps' | 'plan'
  const [iaSingleSuggestion, setIaSingleSuggestion] = useState(null)
  const [iaBulkSuggestions, setIaBulkSuggestions] = useState(null)
  const [iaSelected, setIaSelected] = useState(new Set())

  // ───── Fetch ─────
  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [rm, pr, jb, st, ct, ob, nc, cp] = await Promise.all([
      supabase.from('risk_matrix').select('*').order('score_initial', { ascending: false }),
      supabase.from('processes').select('id, name, type').order('name'),
      supabase.from('job_descriptions').select('id, title').order('title'),
      supabase.from('stakeholders').select('id, name, type').order('name'),
      supabase.from('context_analysis').select('id, type, factor, impact_level').order('type'),
      supabase.from('quality_objectives').select('id, name').order('created_at', { ascending: false }),
      supabase.from('non_conformities').select('id, description, risk_id, created_at').order('created_at', { ascending: false }),
      supabase.from('company_profile').select('*').maybeSingle(),
    ])
    setItems(rm.data || [])
    setProcesses(pr.data || [])
    setJobs(jb.data || [])
    setStakeholders(st.data || [])
    setContextFactors(ct.data || [])
    setObjectives(ob.data || [])
    setNcs(nc.data || [])
    setOrgProfile(cp.data || null)
    setLoading(false)
  }

  // ───── Computed ─────
  const processMap = useMemo(() => Object.fromEntries(processes.map(p => [p.id, p])), [processes])
  const stakeholderMap = useMemo(() => Object.fromEntries(stakeholders.map(s => [s.id, s])), [stakeholders])
  const contextMap = useMemo(() => Object.fromEntries(contextFactors.map(c => [c.id, c])), [contextFactors])
  const ncsByRiskId = useMemo(() => {
    const m = {}
    for (const n of ncs) { if (n.risk_id) { (m[n.risk_id] ||= []).push(n) } }
    return m
  }, [ncs])

  const stats = useMemo(() => {
    const total = items.length
    const riesgos = items.filter(x => x.type === 'Riesgo').length
    const oportunidades = items.filter(x => x.type === 'Oportunidad').length
    const altos = items.filter(x => (x.score_initial || 0) >= 15).length
    const tratados = items.filter(x => x.status === 'Tratado' || x.status === 'Cerrado').length
    const materializados = items.filter(x => x.status === 'Materializado').length
    const today = new Date().toISOString().slice(0, 10)
    const vencidos = items.filter(x => x.review_date && x.review_date < today).length
    const sinTratamiento = items.filter(x => x.type === 'Riesgo' && !x.control_measure && (x.score_initial || 0) >= 8).length
    const costoTotal = items.reduce((a, b) => a + (Number(b.treatment_cost) || 0), 0)
    return { total, riesgos, oportunidades, altos, tratados, materializados, vencidos, sinTratamiento, costoTotal }
  }, [items])

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filterType !== 'Todos' && i.type !== filterType) return false
      if (filterCategory !== 'Todas' && i.category !== filterCategory) return false
      if (filterStatus !== 'Todos' && i.status !== filterStatus) return false
      if (filterProcess !== 'Todos' && i.process_id !== filterProcess) return false
      if (search) {
        const s = search.toLowerCase()
        const hay = `${i.risk_description || ''} ${i.control_measure || ''} ${i.responsible || ''} ${i.process_area || ''}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [items, filterType, filterCategory, filterStatus, filterProcess, search])

  // ───── Helpers ─────
  const calcScore = (p, i) => (Number(p) || 0) * (Number(i) || 0)
  const getRiskColor = (score) => {
    if (!score) return '#f1f5f9'
    if (score >= 20) return '#991b1b'
    if (score >= 15) return '#dc2626'
    if (score >= 10) return '#f59e0b'
    if (score >= 5) return '#fbbf24'
    return '#86efac'
  }
  const getRiskLabel = (score) => {
    if (!score) return '—'
    if (score >= 15) return 'Alto'
    if (score >= 8) return 'Medio'
    return 'Bajo'
  }
  const formatCurrency = (n, c = 'PYG') => n ? new Intl.NumberFormat('es-PY').format(n) + ' ' + (c || 'PYG') : '—'

  const diffChanges = (orig, curr) => {
    const changes = []
    const keys = new Set([...Object.keys(orig || {}), ...Object.keys(curr || {})])
    keys.forEach(k => {
      const a = JSON.stringify(orig?.[k] ?? null)
      const b = JSON.stringify(curr?.[k] ?? null)
      if (a !== b) changes.push({ field: k, from: orig?.[k] ?? null, to: curr?.[k] ?? null })
    })
    return changes
  }

  // ───── CRUD ─────
  const openNew = (preset = {}) => {
    setForm({ ...EMPTY_FORM, identification_date: new Date().toISOString().slice(0, 10), ...preset })
    setEditingId(null)
    setOriginalForm(null)
    setIaSingleSuggestion(null)
    setMostrandoForm(true)
  }

  const openEdit = (item) => {
    const f = {
      ...EMPTY_FORM,
      ...item,
      probability_initial: item.probability_initial ?? 5,
      impact_initial: item.impact_initial ?? 5,
      probability_residual: item.probability_residual ?? 0,
      impact_residual: item.impact_residual ?? 0,
      process_id: item.process_id || '',
      stakeholder_id: item.stakeholder_id || '',
      context_id: item.context_id || '',
      due_date: item.due_date || '',
      review_date: item.review_date || '',
      execution_date: item.execution_date || '',
      approved_at: item.approved_at || '',
      identification_date: item.identification_date || '',
      treatment_cost: item.treatment_cost ?? '',
    }
    setForm(f)
    setOriginalForm(f)
    setEditingId(item.id)
    setIaSingleSuggestion(null)
    setMostrandoForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      ...form,
      process_id: form.process_id || null,
      stakeholder_id: form.stakeholder_id || null,
      context_id: form.context_id || null,
      probability_initial: Number(form.probability_initial) || null,
      impact_initial: Number(form.impact_initial) || null,
      probability_residual: Number(form.probability_residual) || null,
      impact_residual: Number(form.impact_residual) || null,
      treatment_cost: form.treatment_cost === '' ? null : Number(form.treatment_cost),
      due_date: form.due_date || null,
      review_date: form.review_date || null,
      execution_date: form.execution_date || null,
      approved_at: form.approved_at || null,
      identification_date: form.identification_date || null,
      process_area: form.process_id ? (processMap[form.process_id]?.name || form.process_area) : form.process_area,
    }
    // No mandes score_* — son generated columns
    delete payload.score_initial
    delete payload.score_residual

    if (editingId) {
      const changes = diffChanges(originalForm, form)
      if (changes.length) {
        const entry = { at: new Date().toISOString(), changes }
        payload.change_log = [...(originalForm?.change_log || []), entry]
      }
      const { error } = await supabase.from('risk_matrix').update(payload).eq('id', editingId)
      if (error) { toast.error(error.message); return }
      toast.success(`${form.type} actualizado`)
    } else {
      payload.change_log = [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: (form.risk_description || '').slice(0, 80) }] }]
      const { error } = await supabase.from('risk_matrix').insert([payload])
      if (error) { toast.error(error.message); return }
      toast.success(`${form.type} registrado`)
    }

    setMostrandoForm(false)
    setForm(EMPTY_FORM)
    setEditingId(null)
    setOriginalForm(null)
    fetchAll()
  }

  const handleDelete = async (id) => {
    if (!await confirm('¿Eliminar este riesgo/oportunidad?', { tone: 'danger', confirmText: 'Eliminar' })) return
    const { error } = await supabase.from('risk_matrix').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Eliminado')
    fetchAll()
  }

  // ───── IA: Plan de tratamiento individual ─────
  const analizarRiesgoIA = async () => {
    if (!form.risk_description) return toast.warning('Describe el riesgo/oportunidad antes de pedir análisis')
    setLoadingIA(true); setIaContext('plan'); setIaSingleSuggestion(null)
    try {
      const procName = form.process_id ? processMap[form.process_id]?.name : form.process_area
      const isOpp = form.type === 'Oportunidad'
      const prompt = `Eres consultor ISO 9001 experto en gestión de riesgos. Analiza ${isOpp ? 'esta OPORTUNIDAD' : 'este RIESGO'} y propón tratamiento integral según cláusula 6.1.

DESCRIPCIÓN: "${form.risk_description}"
TIPO: ${form.type}
CATEGORÍA: ${form.category}
PROCESO: ${procName || 'no especificado'}
${form.potential_cause ? 'CAUSA POTENCIAL: ' + form.potential_cause : ''}
${form.potential_consequence ? 'CONSECUENCIA POTENCIAL: ' + form.potential_consequence : ''}

Devuelve SOLO un JSON objeto, sin markdown:
- probability (1-10, ${isOpp ? 'probabilidad de que la oportunidad se concrete' : 'probabilidad de ocurrencia'})
- impact (1-10, ${isOpp ? 'impacto positivo' : 'impacto negativo'})
- potential_cause (string, qué la origina si no se completó arriba)
- potential_consequence (string, qué pasa si se materializa)
- treatment_strategy (${isOpp ? '"Aprovechar" | "Mejorar" | "Compartir" | "Aceptar"' : '"Evitar" | "Mitigar" | "Transferir" | "Aceptar"'})
- control_measure (string, control o acción específica recomendada)
- kri_indicator (string, indicador clave para monitorear — ej: "Cantidad de fallas/mes")
- kri_target (string, meta del indicador)
- residual_probability (1-10, prob esperada después del control)
- residual_impact (1-10, impacto esperado después del control)
- estimated_cost (number en PYG, costo estimado del tratamiento)`

      const raw = await consultarIA(prompt, 'Devuelve ÚNICAMENTE JSON objeto válido.')
      console.log('[IA Plan tratamiento] raw:', raw)
      const obj = parseAiObject(raw)
      if (!obj) throw new Error('La IA no devolvió análisis parseable')
      setIaSingleSuggestion(obj)
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    }
    setLoadingIA(false)
  }

  const aplicarSugerenciaIA = () => {
    if (!iaSingleSuggestion) return
    const s = iaSingleSuggestion
    setForm(prev => ({
      ...prev,
      probability_initial: s.probability ?? prev.probability_initial,
      impact_initial: s.impact ?? prev.impact_initial,
      potential_cause: prev.potential_cause || s.potential_cause || '',
      potential_consequence: prev.potential_consequence || s.potential_consequence || '',
      treatment_strategy: s.treatment_strategy || prev.treatment_strategy,
      control_measure: s.control_measure || prev.control_measure,
      kri_indicator: s.kri_indicator || prev.kri_indicator,
      kri_target: s.kri_target || prev.kri_target,
      probability_residual: s.residual_probability ?? prev.probability_residual,
      impact_residual: s.residual_impact ?? prev.impact_residual,
      treatment_cost: s.estimated_cost ?? prev.treatment_cost,
    }))
    setIaSingleSuggestion(null)
  }

  // ───── IA: Identificar riesgos desde FODA ─────
  const identificarDesdeFODA = async (mode) => {
    // mode = 'risks' | 'opps'
    setLoadingIA(true); setIaBulkSuggestions(null); setIaContext(mode === 'risks' ? 'foda_risks' : 'foda_opps')
    try {
      const factores = mode === 'risks'
        ? contextFactors.filter(c => c.type === 'Amenaza' || c.type === 'Debilidad')
        : contextFactors.filter(c => c.type === 'Fortaleza' || c.type === 'Oportunidad')
      if (factores.length === 0) {
        throw new Error(`No hay factores ${mode === 'risks' ? 'A/D (Amenazas/Debilidades)' : 'F/O (Fortalezas/Oportunidades)'} cargados en Contexto`)
      }
      const ctxProc = processes.slice(0, 15).map(p => ({ nombre: p.name, tipo: p.type }))
      const ctxFOda = factores.map(f => ({ id: f.id, tipo: f.type, factor: f.factor, impacto: f.impact_level }))
      const ctxObj = objectives.slice(0, 8).map(o => ({ nombre: o.name }))
      const empresa = orgProfile?.company_name || 'la empresa'
      const sector = orgProfile?.sector || ''

      const prompt = mode === 'risks'
        ? `Eres consultor ISO 9001. Identifica RIESGOS para ${empresa}${sector ? ' (' + sector + ')' : ''} a partir del análisis FODA y procesos según cláusula 6.1.

FACTORES NEGATIVOS (Amenazas y Debilidades):
${JSON.stringify(ctxFOda, null, 2)}

PROCESOS:
${JSON.stringify(ctxProc, null, 2)}

Devuelve SOLO un JSON array (6-10 items), sin markdown. Cada riesgo:
- risk_description (string, qué puede salir mal)
- category (Estratégico|Operacional|Financiero|Cumplimiento|Reputacional|Tecnológico|Personal|Cliente|Proveedor|Mercado)
- process_name (string, proceso del listado o "Transversal")
- context_factor_id (string, id del factor FODA del que se origina, si aplica)
- potential_cause (string, qué lo origina)
- potential_consequence (string, qué pasa si se materializa)
- probability (1-10)
- impact (1-10)
- treatment_strategy (Evitar|Mitigar|Transferir|Aceptar)
- control_measure (string, control recomendado)
- kri_indicator (string)`
        : `Eres consultor ISO 9001. Identifica OPORTUNIDADES para ${empresa}${sector ? ' (' + sector + ')' : ''} a partir del análisis FODA y objetivos de calidad según cláusula 6.1.

FACTORES POSITIVOS (Fortalezas y Oportunidades):
${JSON.stringify(ctxFOda, null, 2)}

OBJETIVOS DE CALIDAD ABIERTOS:
${JSON.stringify(ctxObj, null, 2)}

PROCESOS:
${JSON.stringify(ctxProc, null, 2)}

Devuelve SOLO un JSON array (4-8 items), sin markdown. Cada oportunidad:
- risk_description (string, descripción de la oportunidad)
- category (Estratégico|Operacional|Financiero|Cumplimiento|Reputacional|Tecnológico|Personal|Cliente|Proveedor|Mercado)
- process_name (string, proceso del listado o "Transversal")
- context_factor_id (string, id del factor FODA del que se origina)
- potential_cause (string, qué la habilita)
- potential_consequence (string, beneficio esperado al aprovecharla)
- probability (1-10, probabilidad de concretarla)
- impact (1-10, magnitud del beneficio)
- treatment_strategy (Aprovechar|Mejorar|Compartir|Aceptar)
- control_measure (string, plan de acción para concretarla)
- kri_indicator (string, KPI para medir el aprovechamiento)`

      const raw = await consultarIA(prompt, 'Devuelve ÚNICAMENTE JSON array válido.')
      console.log('[IA FODA]', mode, raw)
      const arr = parseAiArray(raw)
      if (!arr.length) throw new Error('La IA no devolvió items parseables')
      setIaBulkSuggestions({ mode, items: arr })
      setIaSelected(new Set(arr.map((_, i) => i)))
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    }
    setLoadingIA(false)
  }

  const saveIaBulk = async () => {
    if (!iaBulkSuggestions) return
    const isRisks = iaBulkSuggestions.mode === 'risks'
    const today = new Date().toISOString().slice(0, 10)
    const rows = iaBulkSuggestions.items
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => iaSelected.has(i))
      .map(({ s }) => {
        const proc = processes.find(p => p.name?.toLowerCase().trim() === String(s.process_name || '').toLowerCase().trim())
        const ctx = contextFactors.find(c => String(c.id) === String(s.context_factor_id))
        return {
          type: isRisks ? 'Riesgo' : 'Oportunidad',
          category: CATEGORY_OPTIONS.includes(s.category) ? s.category : 'Operacional',
          risk_description: s.risk_description || '',
          potential_cause: s.potential_cause || '',
          potential_consequence: s.potential_consequence || '',
          process_id: proc?.id || null,
          process_area: proc?.name || s.process_name || '',
          context_id: ctx?.id || null,
          probability_initial: Number(s.probability) || 5,
          impact_initial: Number(s.impact) || 5,
          treatment_strategy: (isRisks ? TREATMENT_RISK : TREATMENT_OPP).includes(s.treatment_strategy) ? s.treatment_strategy : (isRisks ? 'Mitigar' : 'Aprovechar'),
          control_measure: s.control_measure || '',
          kri_indicator: s.kri_indicator || '',
          status: 'Identificado',
          identification_date: today,
          change_log: [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: isRisks ? 'IA FODA Riesgos' : 'IA FODA Oportunidades' }] }]
        }
      })
    if (!rows.length) return toast.warning('No hay items seleccionados')
    const { error } = await supabase.from('risk_matrix').insert(rows)
    if (error) { toast.error(error.message); return }
    toast.success(`${rows.length} ${isRisks ? 'riesgos' : 'oportunidades'} agregados`)
    setIaBulkSuggestions(null); setIaSelected(new Set()); setIaContext(null)
    fetchAll()
  }

  // ───── Conversiones cross-module ─────
  const convertirAAccionEstrategica = async (item) => {
    if (!await confirm('¿Crear acción estratégica desde este riesgo/oportunidad?', { title: 'Convertir a Plan Estratégico' })) return
    const row = {
      title: `Tratar ${item.type.toLowerCase()}: ${(item.risk_description || '').slice(0, 80)}`,
      description: item.control_measure || item.risk_description,
      source: item.type === 'Riesgo' ? 'Riesgo' : 'Oportunidad',
      status: 'Planificada',
      due_date: item.due_date || null,
      responsible: item.responsible || item.owner || '',
      risk_id: item.id,
      process_id: item.process_id || null,
      estimated_cost: item.treatment_cost || null,
      change_log: [{ at: new Date().toISOString(), changes: [{ field: 'created', from: 'Riesgo/Oportunidad', to: item.id }] }]
    }
    const { data, error } = await supabase.from('strategic_actions').insert([row]).select('id').single()
    if (error) { toast.error(error.message); return }
    await supabase.from('risk_matrix').update({ strategic_action_id: data.id }).eq('id', item.id)
    toast.success('Acción estratégica creada y vinculada')
    fetchAll()
  }

  const convertirAMejora = async (item) => {
    if (item.type !== 'Oportunidad') return toast.warning('Solo las oportunidades se convierten en mejora')
    if (!await confirm('¿Crear oportunidad de mejora?', { title: 'Convertir a mejora' })) return
    const row = {
      title: (item.risk_description || '').slice(0, 80),
      description: item.control_measure || item.risk_description,
      source: 'Espontánea',
      area: item.process_area || '',
      expected_benefit: item.potential_consequence || '',
      priority: (item.score_initial || 0) >= 15 ? 'Alta' : 'Media',
      status: 'Identificada',
      process_id: item.process_id || null,
      estimated_cost: item.treatment_cost || null,
      proposed_by: 'Conversión Riesgo',
      proposed_at: new Date().toISOString().slice(0, 10),
      change_log: [{ at: new Date().toISOString(), changes: [{ field: 'created', from: 'Oportunidad', to: item.id }] }]
    }
    const { data, error } = await supabase.from('improvement_opportunities').insert([row]).select('id').single()
    if (error) { toast.error(error.message); return }
    await supabase.from('risk_matrix').update({ improvement_opportunity_id: data.id }).eq('id', item.id)
    toast.success('Oportunidad de mejora creada y vinculada')
    fetchAll()
  }

  // ───────────────────── UI ──────────────────────
  return (
    <div className="fade-in" style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <ShieldAlert size={28} color="#7c3aed" /> Riesgos y Oportunidades
          </h2>
          <p style={{ color: '#64748b', margin: '5px 0 0 0', fontSize: '14px' }}>
            ISO 9001 — 6.1 Acciones para abordar riesgos y oportunidades · Pensamiento basado en riesgos.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={() => identificarDesdeFODA('risks')} disabled={loadingIA} style={btn('#dc2626')}>
            {loadingIA && iaContext === 'foda_risks' ? <Loader2 size={16} className="spin" /> : <ShieldAlert size={16} />}
            IA: Riesgos desde FODA
          </button>
          <button onClick={() => identificarDesdeFODA('opps')} disabled={loadingIA} style={btn('#16a34a')}>
            {loadingIA && iaContext === 'foda_opps' ? <Loader2 size={16} className="spin" /> : <Lightbulb size={16} />}
            IA: Oportunidades desde FODA
          </button>
          <DocumentImporter
            targetModule="risks"
            label="matriz de riesgos"
            onImported={async (data) => {
              const risks = Array.isArray(data.risks) ? data.risks : []
              if (risks.length === 0) throw new Error('La IA no extrajo riesgos válidos')
              const payload = risks.map(r => ({
                type: 'Riesgo',
                category: CATEGORY_OPTIONS.includes(r.category) ? r.category : 'Operacional',
                process_area: r.process_area || '',
                risk_description: r.risk_description || '',
                probability_initial: Number(r.probability_initial) || 5,
                impact_initial: Number(r.impact_initial) || 5,
                control_measure: r.control_measure || '',
                responsible: r.responsible || '',
                status: 'Identificado',
              }))
              const { error } = await supabase.from('risk_matrix').insert(payload)
              if (error) throw new Error(error.message)
              fetchAll()
            }}
            renderPreview={(data, setData) => (
              <ArrayPreviewTable
                items={data.risks}
                setItems={next => setData({ ...data, risks: next })}
                emptyTemplate={{ process_area: '', risk_description: '', probability_initial: 5, impact_initial: 5, control_measure: '', responsible: '' }}
                columns={[
                  { key: 'process_area', label: 'Proceso', type: 'text' },
                  { key: 'risk_description', label: 'Descripción', type: 'textarea' },
                  { key: 'probability_initial', label: 'Prob', type: 'number', min: 1, max: 10, width: '70px' },
                  { key: 'impact_initial', label: 'Imp', type: 'number', min: 1, max: 10, width: '70px' },
                  { key: 'control_measure', label: 'Control', type: 'textarea' },
                ]}
              />
            )}
          />
          <button onClick={() => openNew()} style={btn('#7c3aed')}><Plus size={16} /> Nuevo</button>
        </div>
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['6.1']} />

      <ModuleSeedBanner moduleKey="risks" label="matriz de riesgos" visible={items.length === 0} onSeeded={fetchAll} />

      {/* Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <Kpi label="Total" value={stats.total} color="#475569" icon={<Layers size={16} />} />
        <Kpi label="Riesgos" value={stats.riesgos} color="#dc2626" icon={<ShieldAlert size={16} />} />
        <Kpi label="Oportunidades" value={stats.oportunidades} color="#16a34a" icon={<Lightbulb size={16} />} />
        <Kpi label="Críticos (≥15)" value={stats.altos} color="#7f1d1d" icon={<AlertTriangle size={16} />} />
        <Kpi label="Tratados" value={stats.tratados} color="#16a34a" icon={<CheckCircle2 size={16} />} />
        <Kpi label="Sin tratamiento" value={stats.sinTratamiento} color="#b91c1c" icon={<AlertTriangle size={16} />} />
        <Kpi label="Materializados" value={stats.materializados} color="#7f1d1d" icon={<Activity size={16} />} />
        <Kpi label="Revisión vencida" value={stats.vencidos} color="#92400e" icon={<Calendar size={16} />} />
      </div>

      {/* Sugerencias IA bulk */}
      {iaBulkSuggestions && (
        <BulkIaPanel
          data={iaBulkSuggestions}
          selected={iaSelected}
          contextFactors={contextFactors}
          onToggle={i => setIaSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })}
          onSave={saveIaBulk}
          onClose={() => { setIaBulkSuggestions(null); setIaSelected(new Set()); setIaContext(null) }}
        />
      )}

      {/* Filtros + Vista */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            placeholder="Buscar descripción, control, responsable…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 8px 8px 32px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
          />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
          <option value="Todos">Todos los tipos</option>
          {TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={selectStyle}>
          <option value="Todas">Toda categoría</option>
          {CATEGORY_OPTIONS.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="Todos">Todos los estados</option>
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filterProcess} onChange={e => setFilterProcess(e.target.value)} style={selectStyle}>
          <option value="Todos">Todo proceso</option>
          {processes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '4px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '2px', background: 'white' }}>
          <button onClick={() => setViewMode('cards')} style={vbtn(viewMode === 'cards')}><List size={14} /> Lista</button>
          <button onClick={() => setViewMode('heatmap')} style={vbtn(viewMode === 'heatmap')}><Grid3x3 size={14} /> Matriz</button>
        </div>
        <span style={{ color: '#64748b', fontSize: '13px' }}>
          <Filter size={14} style={{ verticalAlign: 'middle' }} /> {filtered.length} / {items.length}
        </span>
      </div>

      {/* Form */}
      {mostrandoForm && (
        <FormCard
          form={form}
          setForm={setForm}
          editing={!!editingId}
          processes={processes}
          jobs={jobs}
          stakeholders={stakeholders}
          contextFactors={contextFactors}
          loadingIA={loadingIA && iaContext === 'plan'}
          iaSuggestion={iaSingleSuggestion}
          onIA={analizarRiesgoIA}
          aplicarSugerencia={aplicarSugerenciaIA}
          calcScore={calcScore}
          getRiskColor={getRiskColor}
          getRiskLabel={getRiskLabel}
          onSubmit={handleSubmit}
          onCancel={() => { setMostrandoForm(false); setEditingId(null); setForm(EMPTY_FORM); setIaSingleSuggestion(null) }}
        />
      )}

      {/* Lista o heatmap */}
      {loading ? (
        <p style={{ color: '#64748b' }}>Cargando…</p>
      ) : viewMode === 'heatmap' ? (
        <Heatmap items={filtered} onClick={item => setDetailItem(item)} getRiskColor={getRiskColor} />
      ) : filtered.length === 0 ? (
        <div style={emptyState}>
          <ShieldAlert size={40} color="#cbd5e1" />
          <p style={{ color: '#64748b', marginTop: '8px' }}>Sin riesgos/oportunidades que coincidan.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '14px' }}>
          {filtered.map(item => (
            <RiskCard
              key={item.id}
              item={item}
              processMap={processMap}
              getRiskColor={getRiskColor}
              getRiskLabel={getRiskLabel}
              ncCount={(ncsByRiskId[item.id] || []).length}
              onDetail={() => setDetailItem(item)}
              onEdit={() => openEdit(item)}
              onDelete={() => handleDelete(item.id)}
              onConvertStrategic={() => convertirAAccionEstrategica(item)}
              onConvertImprovement={() => convertirAMejora(item)}
            />
          ))}
        </div>
      )}

      {/* Modal Detalle */}
      {detailItem && (
        <DetailModal
          item={detailItem}
          processMap={processMap}
          stakeholderMap={stakeholderMap}
          contextMap={contextMap}
          ncs={ncsByRiskId[detailItem.id] || []}
          getRiskColor={getRiskColor}
          getRiskLabel={getRiskLabel}
          onClose={() => setDetailItem(null)}
          onEdit={() => { setDetailItem(null); openEdit(detailItem) }}
          onConvertStrategic={() => { setDetailItem(null); convertirAAccionEstrategica(detailItem) }}
          onConvertImprovement={() => { setDetailItem(null); convertirAMejora(detailItem) }}
        />
      )}
    </div>
  )
}

// ─────────────────── Subcomponentes ───────────────────
function Kpi({ label, value, color, icon }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderLeft: `4px solid ${color}`, borderRadius: '8px', padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color, marginBottom: '2px' }}>
        {icon}
        <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', color: '#64748b' }}>{label}</span>
      </div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b' }}>{value}</div>
    </div>
  )
}

function RiskCard({ item, processMap, getRiskColor, getRiskLabel, ncCount, onDetail, onEdit, onDelete, onConvertStrategic, onConvertImprovement }) {
  const isOpp = item.type === 'Oportunidad'
  const typeC = TYPE_COLORS[item.type] || TYPE_COLORS['Riesgo']
  const stC = STATUS_COLORS[item.status] || STATUS_COLORS['Identificado']
  const catColor = CATEGORY_COLORS[item.category] || '#6b7280'
  const score = item.score_initial || 0
  const scoreResidual = item.score_residual || 0
  const today = new Date().toISOString().slice(0, 10)
  const reviewOverdue = item.review_date && item.review_date < today
  const procName = item.process_id ? processMap[item.process_id]?.name : item.process_area

  return (
    <div style={{
      background: 'white', border: '1px solid #e2e8f0', borderLeft: '4px solid ' + getRiskColor(score),
      borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
    }}>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <span style={badge(typeC)}>{isOpp ? '💡' : '🛡'} {item.type}</span>
        <span style={badge({ bg: catColor + '22', color: catColor })}>{item.category}</span>
        <span style={{ ...badge(stC), border: '1px solid ' + stC.border }}>{item.status}</span>
        {reviewOverdue && <span style={badge({ bg: '#fef3c7', color: '#92400e' })}>⏰ Revisión vencida</span>}
      </div>

      <h3 style={{ margin: '4px 0', fontSize: '14px', color: '#1e293b', lineHeight: 1.4 }}>{item.risk_description}</h3>

      <div style={{ fontSize: '12px', color: '#64748b' }}>
        {procName && <>⚙ {procName} · </>}
        {item.responsible && <>👤 {item.responsible}</>}
      </div>

      {/* Score visual */}
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '12px' }}>
        <span style={{
          background: getRiskColor(score), color: 'white',
          padding: '4px 10px', borderRadius: '6px', fontWeight: 700, minWidth: '60px', textAlign: 'center'
        }}>
          {score} · {getRiskLabel(score)}
        </span>
        {scoreResidual > 0 && (
          <>
            <ArrowRight size={14} color="#94a3b8" />
            <span style={{
              background: getRiskColor(scoreResidual), color: 'white',
              padding: '4px 10px', borderRadius: '6px', fontWeight: 700, minWidth: '60px', textAlign: 'center'
            }}>
              {scoreResidual} · {getRiskLabel(scoreResidual)}
            </span>
          </>
        )}
        {item.treatment_strategy && (
          <span style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic' }}>· {item.treatment_strategy}</span>
        )}
      </div>

      {item.control_measure && (
        <div style={{ fontSize: '12px', color: '#334155', background: '#f8fafc', padding: '6px 8px', borderRadius: '6px', borderLeft: '3px solid #0891b2' }}>
          <strong>Control:</strong> {item.control_measure.slice(0, 120)}{item.control_measure.length > 120 ? '…' : ''}
        </div>
      )}

      {ncCount > 0 && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '4px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600 }}>
          ⚠ {ncCount} NC materializada{ncCount !== 1 ? 's' : ''}
        </div>
      )}

      <div style={{ display: 'flex', gap: '5px', marginTop: 'auto', flexWrap: 'wrap' }}>
        <button onClick={onDetail} style={miniBtn('#0ea5e9')}><Eye size={11} /> Detalle</button>
        <button onClick={onEdit} style={miniBtn('#6366f1')}><Pencil size={11} /></button>
        {!item.strategic_action_id && (score >= 8 || isOpp) && (
          <button onClick={onConvertStrategic} style={miniBtn('#7c3aed')} title="Convertir a acción estratégica"><Target size={11} /></button>
        )}
        {isOpp && !item.improvement_opportunity_id && (
          <button onClick={onConvertImprovement} style={miniBtn('#16a34a')} title="Convertir a oportunidad de mejora"><TrendingUp size={11} /></button>
        )}
        <button onClick={onDelete} style={miniBtn('#dc2626')}><Trash2 size={11} /></button>
      </div>
    </div>
  )
}

function Heatmap({ items, onClick, getRiskColor }) {
  // 5x5 grid donde columnas = probabilidad (1-2, 3-4, 5-6, 7-8, 9-10) y filas = impacto (5..1)
  const bucket = (v) => {
    if (v <= 2) return 0; if (v <= 4) return 1; if (v <= 6) return 2; if (v <= 8) return 3; return 4
  }
  const grid = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => []))
  for (const i of items) {
    const pRaw = Number(i.probability_initial)
    const impRaw = Number(i.impact_initial)
    const p = Number.isFinite(pRaw) ? pRaw : 5
    const imp = Number.isFinite(impRaw) ? impRaw : 5
    const col = bucket(p)
    const row = 4 - bucket(imp)
    grid[row][col].push(i)
  }
  const labelsX = ['1-2 (raro)', '3-4 (improbable)', '5-6 (posible)', '7-8 (probable)', '9-10 (frecuente)']
  const labelsY = ['9-10 (catastrófico)', '7-8 (alto)', '5-6 (medio)', '3-4 (bajo)', '1-2 (insignificante)']
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '120px repeat(5, 1fr)', gap: '4px' }}>
        <div></div>
        {labelsX.map((l, i) => <div key={i} style={{ fontSize: '10px', color: '#64748b', textAlign: 'center', fontWeight: 600, padding: '4px 0' }}>{l}</div>)}
        {grid.map((row, ri) => (
          <Fragment key={'r' + ri}>
            <div style={{ fontSize: '10px', color: '#64748b', fontWeight: 600, alignSelf: 'center' }}>{labelsY[ri]}</div>
            {row.map((cell, ci) => {
              const p = ci * 2 + 1
              const imp = (4 - ri) * 2 + 1
              const score = p * imp
              return (
                <div key={ri + '-' + ci} style={{
                  background: getRiskColor(score) + '33', border: '1px solid ' + getRiskColor(score),
                  borderRadius: '6px', padding: '6px', minHeight: '70px', display: 'flex',
                  flexDirection: 'column', gap: '3px'
                }}>
                  {cell.length === 0 ? (
                    <span style={{ fontSize: '10px', color: '#94a3b8', textAlign: 'center', alignSelf: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>—</span>
                  ) : (
                    cell.slice(0, 4).map((it, k) => (
                      <button key={k} onClick={() => onClick(it)} style={{
                        background: 'white', border: '1px solid ' + getRiskColor(it.score_initial),
                        borderRadius: '4px', padding: '3px 6px', fontSize: '10px', cursor: 'pointer',
                        color: '#1e293b', textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                      }} title={it.risk_description}>
                        {it.type === 'Oportunidad' ? '💡' : '🛡'} {(it.risk_description || '').slice(0, 30)}
                      </button>
                    ))
                  )}
                  {cell.length > 4 && <span style={{ fontSize: '10px', color: '#64748b', textAlign: 'center' }}>+{cell.length - 4} más</span>}
                </div>
              )
            })}
          </Fragment>
        ))}
      </div>
      <div style={{ marginTop: '12px', display: 'flex', gap: '12px', fontSize: '11px', color: '#64748b', justifyContent: 'center', flexWrap: 'wrap' }}>
        <span><span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#86efac', borderRadius: '2px', verticalAlign: 'middle' }} /> Bajo (1-7)</span>
        <span><span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#fbbf24', borderRadius: '2px', verticalAlign: 'middle' }} /> Medio (8-14)</span>
        <span><span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#dc2626', borderRadius: '2px', verticalAlign: 'middle' }} /> Alto (15-19)</span>
        <span><span style={{ display: 'inline-block', width: '12px', height: '12px', background: '#991b1b', borderRadius: '2px', verticalAlign: 'middle' }} /> Crítico (≥20)</span>
      </div>
    </div>
  )
}

function FormCard({ form, setForm, editing, processes, jobs, stakeholders, contextFactors, loadingIA, iaSuggestion, onIA, aplicarSugerencia, calcScore, getRiskColor, getRiskLabel, onSubmit, onCancel }) {
  const set = (patch) => setForm(prev => ({ ...prev, ...patch }))
  const isOpp = form.type === 'Oportunidad'
  const treatments = isOpp ? TREATMENT_OPP : TREATMENT_RISK
  const scoreI = calcScore(form.probability_initial, form.impact_initial)
  const scoreR = calcScore(form.probability_residual, form.impact_residual)

  return (
    <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
      <h3 style={{ marginTop: 0, color: '#7c3aed' }}>
        {editing ? '✏️ Editar' : '+ Registrar'} {form.type}
      </h3>
      <form onSubmit={onSubmit}>
        {/* 1. Identificación */}
        <Section title="1. Identificación">
          <Row>
            <Field label="Tipo">
              <select value={form.type} onChange={e => set({ type: e.target.value, treatment_strategy: e.target.value === 'Oportunidad' ? 'Aprovechar' : 'Mitigar' })} style={inputStyle}>
                {TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Categoría">
              <select value={form.category} onChange={e => set({ category: e.target.value })} style={inputStyle}>
                {CATEGORY_OPTIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select value={form.status} onChange={e => set({ status: e.target.value })} style={inputStyle}>
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Fecha identificación">
              <input type="date" value={form.identification_date || ''} onChange={e => set({ identification_date: e.target.value })} style={inputStyle} />
            </Field>
          </Row>
          <Field label={`Descripción ${isOpp ? 'de la oportunidad' : 'del riesgo'} *`}>
            <textarea required rows={2} value={form.risk_description} onChange={e => set({ risk_description: e.target.value })} style={inputStyle} placeholder={isOpp ? 'Ej: Apertura de nuevo mercado en Brasil' : 'Ej: Falla en suministro eléctrico de planta'} />
          </Field>
          <Row>
            <Field label="Causa potencial">
              <textarea rows={2} value={form.potential_cause} onChange={e => set({ potential_cause: e.target.value })} style={inputStyle} placeholder={isOpp ? '¿Qué la habilita?' : '¿Qué la origina?'} />
            </Field>
            <Field label="Consecuencia potencial">
              <textarea rows={2} value={form.potential_consequence} onChange={e => set({ potential_consequence: e.target.value })} style={inputStyle} placeholder={isOpp ? 'Beneficio esperado' : '¿Qué pasa si se materializa?'} />
            </Field>
          </Row>
        </Section>

        {/* 2. Vínculos */}
        <Section title="2. Vínculos (opcional)">
          <Row>
            <Field label="Proceso afectado">
              <select value={form.process_id} onChange={e => set({ process_id: e.target.value, process_area: e.target.options[e.target.selectedIndex]?.text || '' })} style={inputStyle}>
                <option value="">—</option>
                {processes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Stakeholder">
              <select value={form.stakeholder_id} onChange={e => set({ stakeholder_id: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {stakeholders.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Factor FODA origen">
              <select value={form.context_id} onChange={e => set({ context_id: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {contextFactors.map(c => <option key={c.id} value={c.id}>{c.type}: {(c.factor || '').slice(0, 50)}</option>)}
              </select>
            </Field>
          </Row>
        </Section>

        {/* IA Suggestion banner */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
          <button type="button" onClick={onIA} disabled={loadingIA} style={btn('#7c3aed')}>
            {loadingIA ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
            IA: plan de tratamiento integral
          </button>
        </div>
        {iaSuggestion && (
          <div style={{ background: '#f3e8ff', border: '1px solid #d8b4fe', borderRadius: '8px', padding: '12px', marginBottom: '12px' }}>
            <div style={{ fontSize: '12px', color: '#6b21a8', fontWeight: 600, marginBottom: '8px' }}>💡 Sugerencia IA:</div>
            <div style={{ fontSize: '12px', color: '#334155', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px' }}>
              <div><strong>Prob/Imp:</strong> {iaSuggestion.probability}/{iaSuggestion.impact} → Score {(iaSuggestion.probability || 0) * (iaSuggestion.impact || 0)}</div>
              <div><strong>Residual:</strong> {iaSuggestion.residual_probability}/{iaSuggestion.residual_impact} → Score {(iaSuggestion.residual_probability || 0) * (iaSuggestion.residual_impact || 0)}</div>
              <div><strong>Estrategia:</strong> {iaSuggestion.treatment_strategy}</div>
              <div><strong>Costo:</strong> {iaSuggestion.estimated_cost ? new Intl.NumberFormat('es-PY').format(iaSuggestion.estimated_cost) : '—'}</div>
            </div>
            {iaSuggestion.control_measure && <div style={{ fontSize: '12px', color: '#334155', marginTop: '6px' }}><strong>Control:</strong> {iaSuggestion.control_measure}</div>}
            {iaSuggestion.kri_indicator && <div style={{ fontSize: '12px', color: '#334155', marginTop: '4px' }}><strong>KRI:</strong> {iaSuggestion.kri_indicator} → {iaSuggestion.kri_target}</div>}
            <div style={{ marginTop: '8px' }}>
              <button type="button" onClick={aplicarSugerencia} style={btn('#7c3aed')}>Aplicar al formulario</button>
            </div>
          </div>
        )}

        {/* 3. Evaluación inicial */}
        <Section title="3. Evaluación inicial">
          <Row>
            <Field label="Probabilidad (1-10)">
              <input type="number" min="1" max="10" value={form.probability_initial} onChange={e => set({ probability_initial: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Impacto (1-10)">
              <input type="number" min="1" max="10" value={form.impact_initial} onChange={e => set({ impact_initial: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Nivel">
              <div style={{ display: 'flex', alignItems: 'center', height: '32px' }}>
                <span style={{ background: getRiskColor(scoreI), color: 'white', padding: '4px 10px', borderRadius: '6px', fontWeight: 700 }}>
                  {scoreI} · {getRiskLabel(scoreI)}
                </span>
              </div>
            </Field>
          </Row>
        </Section>

        {/* 4. Tratamiento */}
        <Section title="4. Plan de tratamiento">
          <Row>
            <Field label="Estrategia">
              <select value={form.treatment_strategy} onChange={e => set({ treatment_strategy: e.target.value })} style={inputStyle}>
                {treatments.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Responsable">
              <select value={form.responsible} onChange={e => set({ responsible: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {jobs.map(j => <option key={j.id} value={j.title}>{j.title}</option>)}
              </select>
            </Field>
            <Field label="Owner senior">
              <input value={form.owner} onChange={e => set({ owner: e.target.value })} style={inputStyle} placeholder="Dueño del riesgo" />
            </Field>
          </Row>
          <Field label="Control / acción">
            <textarea rows={2} value={form.control_measure} onChange={e => set({ control_measure: e.target.value })} style={inputStyle} placeholder="Acción específica para tratar" />
          </Field>
          <Row>
            <Field label="KRI indicador">
              <input value={form.kri_indicator} onChange={e => set({ kri_indicator: e.target.value })} style={inputStyle} placeholder="Ej: cantidad de cortes/mes" />
            </Field>
            <Field label="KRI meta">
              <input value={form.kri_target} onChange={e => set({ kri_target: e.target.value })} style={inputStyle} placeholder="Ej: ≤2 al mes" />
            </Field>
            <Field label="KRI actual">
              <input value={form.kri_current} onChange={e => set({ kri_current: e.target.value })} style={inputStyle} />
            </Field>
          </Row>
          <Row>
            <Field label="Fecha límite implementación">
              <input type="date" value={form.due_date || ''} onChange={e => set({ due_date: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Fecha ejecución control">
              <input type="date" value={form.execution_date || ''} onChange={e => set({ execution_date: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Próxima revisión">
              <input type="date" value={form.review_date || ''} onChange={e => set({ review_date: e.target.value })} style={inputStyle} />
            </Field>
          </Row>
          <Row>
            <Field label="Costo tratamiento">
              <input type="number" min="0" value={form.treatment_cost} onChange={e => set({ treatment_cost: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Moneda">
              <select value={form.currency} onChange={e => set({ currency: e.target.value })} style={inputStyle}>
                <option>PYG</option><option>USD</option><option>EUR</option><option>BRL</option>
              </select>
            </Field>
            <Field label="Aprobado por">
              <input value={form.approved_by} onChange={e => set({ approved_by: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Fecha aprobación">
              <input type="date" value={form.approved_at || ''} onChange={e => set({ approved_at: e.target.value })} style={inputStyle} />
            </Field>
          </Row>
        </Section>

        {/* 5. Evaluación residual */}
        <Section title="5. Evaluación residual (post-control)">
          <Row>
            <Field label="Probabilidad residual (1-10)">
              <input type="number" min="0" max="10" value={form.probability_residual} onChange={e => set({ probability_residual: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Impacto residual (1-10)">
              <input type="number" min="0" max="10" value={form.impact_residual} onChange={e => set({ impact_residual: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Nivel residual">
              <div style={{ display: 'flex', alignItems: 'center', height: '32px' }}>
                <span style={{ background: getRiskColor(scoreR), color: 'white', padding: '4px 10px', borderRadius: '6px', fontWeight: 700 }}>
                  {scoreR} · {getRiskLabel(scoreR)}
                </span>
              </div>
            </Field>
            <Field label="Reducción">
              <div style={{ display: 'flex', alignItems: 'center', height: '32px', fontSize: '13px', color: scoreR < scoreI ? '#16a34a' : '#dc2626', fontWeight: 600 }}>
                {scoreI > 0 ? `${Math.round((1 - scoreR / scoreI) * 100)}%` : '—'}
              </div>
            </Field>
          </Row>
        </Section>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button type="submit" style={btn('#16a34a')}><Save size={16} /> {editing ? 'Guardar cambios' : 'Crear'}</button>
          <button type="button" onClick={onCancel} style={btn('#6b7280')}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}

function BulkIaPanel({ data, selected, contextFactors, onToggle, onSave, onClose }) {
  const isRisks = data.mode === 'risks'
  return (
    <div style={{
      background: isRisks ? '#fee2e2' : '#dcfce7',
      border: '2px solid ' + (isRisks ? '#fca5a5' : '#86efac'),
      borderRadius: '10px', padding: '14px', marginBottom: '16px'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0, color: isRisks ? '#991b1b' : '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={20} /> IA: {data.items.length} {isRisks ? 'riesgos' : 'oportunidades'} desde FODA
        </h3>
        <button onClick={onClose} style={btn('#6b7280')}><X size={14} /> Descartar</button>
      </div>
      <div style={{ maxHeight: '420px', overflowY: 'auto', display: 'grid', gap: '8px', marginBottom: '10px' }}>
        {data.items.map((s, i) => {
          const ctx = contextFactors.find(c => String(c.id) === String(s.context_factor_id))
          return (
            <label key={i} style={{
              display: 'flex', gap: '8px', padding: '8px 10px', background: 'white', borderRadius: '6px',
              cursor: 'pointer', border: '1px solid ' + (selected.has(i) ? (isRisks ? '#dc2626' : '#16a34a') : '#e2e8f0')
            }}>
              <input type="checkbox" checked={selected.has(i)} onChange={() => onToggle(i)} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '13px' }}>
                  {s.risk_description}
                  <span style={{ marginLeft: '6px', fontSize: '11px', color: '#475569' }}>· {s.category}</span>
                </div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                  ⚙ {s.process_name || 'Transversal'} · P{s.probability}×I{s.impact} = {(s.probability || 0) * (s.impact || 0)} · {s.treatment_strategy}
                </div>
                {ctx && <div style={{ fontSize: '11px', color: '#7c2d12', marginTop: '2px' }}>📌 Origen FODA: {ctx.type} – {(ctx.factor || '').slice(0, 60)}</div>}
                {s.potential_cause && <div style={{ fontSize: '12px', color: '#334155', marginTop: '4px' }}><strong>Causa:</strong> {s.potential_cause}</div>}
                {s.potential_consequence && <div style={{ fontSize: '12px', color: '#334155' }}><strong>Consecuencia:</strong> {s.potential_consequence}</div>}
                {s.control_measure && <div style={{ fontSize: '12px', color: '#0e7490', marginTop: '4px' }}>🛡 {s.control_measure}</div>}
                {s.kri_indicator && <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>📊 KRI: {s.kri_indicator}</div>}
              </div>
            </label>
          )
        })}
      </div>
      <button onClick={onSave} style={btn(isRisks ? '#dc2626' : '#16a34a')}>
        <Save size={16} /> Guardar {selected.size} {isRisks ? 'riesgos' : 'oportunidades'}
      </button>
    </div>
  )
}

function DetailModal({ item, processMap, stakeholderMap, contextMap, ncs, getRiskColor, getRiskLabel, onClose, onEdit, onConvertStrategic, onConvertImprovement }) {
  const isOpp = item.type === 'Oportunidad'
  const proc = item.process_id ? processMap[item.process_id] : null
  const sh = item.stakeholder_id ? stakeholderMap[item.stakeholder_id] : null
  const ctx = item.context_id ? contextMap[item.context_id] : null
  const scoreI = item.score_initial || 0
  const scoreR = item.score_residual || 0
  const reduction = scoreI > 0 ? Math.round((1 - scoreR / scoreI) * 100) : 0
  return createPortal(
    <Backdrop onClose={onClose}>
      <Modal>
        <ModalHeader title={item.risk_description?.slice(0, 80)} onClose={onClose}>
          <span style={badge(TYPE_COLORS[item.type] || TYPE_COLORS['Riesgo'])}>{item.type}</span>
          <span style={badge(STATUS_COLORS[item.status] || STATUS_COLORS['Identificado'])}>{item.status}</span>
        </ModalHeader>

        <ModalSection title="📋 Identificación">
          <D label="Descripción" block>{item.risk_description}</D>
          <DetailGrid>
            <D label="Categoría">{item.category || '—'}</D>
            <D label="Identificado">{item.identification_date ? new Date(item.identification_date).toLocaleDateString() : '—'}</D>
            <D label="Estrategia">{item.treatment_strategy || '—'}</D>
            <D label="Costo">{item.treatment_cost ? new Intl.NumberFormat('es-PY').format(item.treatment_cost) + ' ' + (item.currency || '') : '—'}</D>
          </DetailGrid>
          <D label="Causa potencial" block>{item.potential_cause || '—'}</D>
          <D label="Consecuencia potencial" block>{item.potential_consequence || '—'}</D>
        </ModalSection>

        <ModalSection title="🔗 Vínculos">
          <DetailGrid>
            {proc && <D label="Proceso">{proc.name}</D>}
            {sh && <D label="Stakeholder">{sh.name}</D>}
            {ctx && <D label="Origen FODA">{ctx.type}: {(ctx.factor || '').slice(0, 60)}</D>}
            {item.strategic_action_id && <D label="Acción estratégica">✅ Vinculada</D>}
            {item.improvement_opportunity_id && <D label="Oportunidad mejora">✅ Vinculada</D>}
          </DetailGrid>
        </ModalSection>

        <ModalSection title="📊 Evaluación">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>INICIAL</div>
              <div style={{ background: getRiskColor(scoreI), color: 'white', padding: '8px 14px', borderRadius: '8px', fontWeight: 700, fontSize: '18px' }}>
                {scoreI} · {getRiskLabel(scoreI)}
              </div>
              <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                P{item.probability_initial} × I{item.impact_initial}
              </div>
            </div>
            <ArrowRight size={24} color="#94a3b8" />
            <div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>RESIDUAL</div>
              <div style={{ background: getRiskColor(scoreR), color: 'white', padding: '8px 14px', borderRadius: '8px', fontWeight: 700, fontSize: '18px' }}>
                {scoreR} · {getRiskLabel(scoreR)}
              </div>
              <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>
                P{item.probability_residual || 0} × I{item.impact_residual || 0}
              </div>
            </div>
            {scoreR > 0 && (
              <div style={{ background: reduction > 0 ? '#dcfce7' : '#fee2e2', color: reduction > 0 ? '#166534' : '#991b1b', padding: '8px 12px', borderRadius: '8px', fontWeight: 600 }}>
                {reduction > 0 ? '↓' : '↑'} {Math.abs(reduction)}% reducción
              </div>
            )}
          </div>
        </ModalSection>

        <ModalSection title="🛡 Plan de tratamiento">
          <D label="Control / acción" block>{item.control_measure || '—'}</D>
          <DetailGrid>
            <D label="Responsable">{item.responsible || '—'}</D>
            <D label="Owner">{item.owner || '—'}</D>
            <D label="Aprobado por">{item.approved_by || '—'}</D>
            <D label="Aprobación">{item.approved_at ? new Date(item.approved_at).toLocaleDateString() : '—'}</D>
            <D label="Fecha límite">{item.due_date ? new Date(item.due_date).toLocaleDateString() : '—'}</D>
            <D label="Ejecución">{item.execution_date ? new Date(item.execution_date).toLocaleDateString() : '—'}</D>
            <D label="Próx. revisión">{item.review_date ? new Date(item.review_date).toLocaleDateString() : '—'}</D>
          </DetailGrid>
          {item.kri_indicator && (
            <D label="KRI" block>{item.kri_indicator} · Meta: {item.kri_target || '—'} · Actual: {item.kri_current || '—'}</D>
          )}
        </ModalSection>

        <ModalSection title={`⚠️ NCs materializadas (${ncs.length})`}>
          {ncs.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>Sin NCs vinculadas. {isOpp ? '' : 'Si este riesgo se materializa, se podrá registrar la NC desde el módulo correspondiente.'}</p>
          ) : (
            <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '13px', color: '#334155' }}>
              {ncs.slice(0, 5).map(n => (
                <li key={n.id}>{(n.description || '').slice(0, 80)} <span style={{ color: '#94a3b8' }}>· {new Date(n.created_at).toLocaleDateString()}</span></li>
              ))}
              {ncs.length > 5 && <li style={{ color: '#94a3b8' }}>... y {ncs.length - 5} más</li>}
            </ul>
          )}
        </ModalSection>

        <ModalSection title="🕓 Historial de cambios">
          <ChangeLogTimeline entries={item.change_log || []} fieldLabels={RISK_FIELD_LABELS} max={5} />
        </ModalSection>

        <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          {!item.strategic_action_id && (scoreI >= 8 || isOpp) && (
            <button onClick={onConvertStrategic} style={btn('#7c3aed')}><Target size={16} /> A Plan Estratégico</button>
          )}
          {isOpp && !item.improvement_opportunity_id && (
            <button onClick={onConvertImprovement} style={btn('#16a34a')}><TrendingUp size={16} /> A Mejora</button>
          )}
          <button onClick={onEdit} style={btn('#6366f1')}><Pencil size={16} /> Editar</button>
          <button onClick={onClose} style={btn('#6b7280')}>Cerrar</button>
        </div>
      </Modal>
    </Backdrop>,
    document.body
  )
}

// ─────────────────── Primitivas UI ───────────────────
function Section({ title, children }) {
  return (
    <fieldset style={{ border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 12px', marginBottom: '10px', background: 'white' }}>
      <legend style={{ padding: '0 6px', fontWeight: 600, color: '#475569', fontSize: '13px' }}>{title}</legend>
      {children}
    </fieldset>
  )
}
function Row({ children }) { return <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>{children}</div> }
function Field({ label, children, flex = 1 }) {
  return (
    <div style={{ flex: `${flex} 1 160px`, display: 'flex', flexDirection: 'column', gap: '3px', marginBottom: '8px' }}>
      <label style={{ fontSize: '12px', fontWeight: 600, color: '#475569' }}>{label}</label>
      {children}
    </div>
  )
}
function Backdrop({ children, onClose }) {
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)',
      zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '820px', maxHeight: '92vh', overflowY: 'auto' }}>
        {children}
      </div>
    </div>
  )
}
function Modal({ children }) {
  return <div style={{ background: 'white', borderRadius: '12px', boxShadow: '0 20px 50px rgba(0,0,0,0.25)', overflow: 'hidden' }}>{children}</div>
}
function ModalHeader({ title, onClose, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', gap: '10px' }}>
      <h2 style={{ margin: 0, fontSize: '16px', color: '#1e293b', flex: 1 }}>{title}</h2>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>{children}</div>
      <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: '4px' }}><X size={20} /></button>
    </div>
  )
}
function ModalSection({ title, children }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
      <h4 style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{title}</h4>
      {children}
    </div>
  )
}
function DetailGrid({ children }) {
  return <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', marginBottom: '8px' }}>{children}</div>
}
function D({ label, children, block }) {
  return (
    <div style={{ marginBottom: block ? '8px' : 0 }}>
      <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '13px', color: '#1e293b', whiteSpace: 'pre-wrap' }}>{children}</div>
    </div>
  )
}

// ─────────────────── Estilos ───────────────────
const inputStyle = { width: '100%', padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', boxSizing: 'border-box' }
const selectStyle = { padding: '7px 9px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px', background: 'white' }
const emptyState = { textAlign: 'center', padding: '40px 20px', background: 'white', border: '1px dashed #cbd5e1', borderRadius: '10px' }
const btn = (color) => ({
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px',
  background: color, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer',
  fontWeight: 600, fontSize: '13px'
})
const miniBtn = (color) => ({
  display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '4px 7px',
  background: color, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
  fontSize: '11px', fontWeight: 600
})
const vbtn = (active) => ({
  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
  background: active ? '#7c3aed' : 'transparent', color: active ? 'white' : '#475569',
  border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600
})
const badge = ({ bg, color }) => ({
  background: bg, color, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', gap: '3px'
})
