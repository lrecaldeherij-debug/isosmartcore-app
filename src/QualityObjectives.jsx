import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  Target, Sparkles, Loader2, Plus, Search, Filter, Eye, Pencil, Trash2, X,
  Save, RefreshCw, TrendingUp, ExternalLink, CheckCircle2, AlertTriangle,
  Calendar, List, Grid3x3, LayoutGrid, ArrowRight, Award, Lightbulb,
  ShieldCheck, Activity
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import ModuleSeedBanner from './ModuleSeedBanner'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'
import { ChangeLogTimeline } from './components/ui'

const OBJ_FIELD_LABELS = {
  name: 'Nombre', objective: 'Descripción', category: 'Categoría', status: 'Estado',
  indicator: 'Indicador', unit: 'Unidad', year: 'Año', frequency: 'Frecuencia',
  baseline_value: 'Baseline', current: 'Valor actual', target: 'Meta',
  start_date: 'Inicio', target_date: 'Fecha límite', responsible: 'Responsable',
  is_specific: 'Específico', is_measurable: 'Medible', is_achievable: 'Alcanzable',
  is_relevant: 'Relevante', is_time_bound: 'Temporal',
  policy_id: 'Política', risk_id: 'Riesgo', strategic_action_id: 'Acción estratégica',
  process_ids: 'Procesos', evidence_url: 'Evidencia',
  approved_by: 'Aprobado por', approved_at: 'Fecha aprobación', comm_method: 'Comunicación',
}

// ───────────────────── Constantes ──────────────────────
const CATEGORY_OPTIONS = ['Calidad', 'Satisfacción', 'Eficiencia', 'Costo', 'Tiempo', 'Seguridad', 'Otra']
const STATUS_OPTIONS = ['Borrador', 'Aprobado', 'En curso', 'Cumplido', 'No cumplido', 'Reformulado']
const FREQ_OPTIONS = ['Mensual', 'Trimestral', 'Semestral', 'Anual']
const UNIT_OPTIONS = ['%', 'puntos', 'NC/mes', '#', '$', 'horas', 'días', 'ppm']

const CATEGORY_COLORS = {
  'Calidad':       '#0891b2',
  'Satisfacción':  '#ec4899',
  'Eficiencia':    '#7c3aed',
  'Costo':         '#16a34a',
  'Tiempo':        '#f59e0b',
  'Seguridad':     '#dc2626',
  'Otra':          '#64748b',
}
const STATUS_COLORS = {
  'Borrador':     { bg: '#f3f4f6', color: '#374151', border: '#d1d5db' },
  'Aprobado':     { bg: '#e0e7ff', color: '#3730a3', border: '#c7d2fe' },
  'En curso':     { bg: '#cffafe', color: '#155e75', border: '#a5f3fc' },
  'Cumplido':     { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  'No cumplido':  { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  'Reformulado':  { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
}

const EMPTY_FORM = {
  name: '',
  objective: '',
  category: 'Calidad',
  indicator: '',
  baseline_value: '',
  target: '',
  current: '',
  unit: '%',
  frequency: 'Mensual',
  responsible: '',
  evidence_url: '',
  is_specific: false,
  is_measurable: false,
  is_achievable: false,
  is_relevant: false,
  is_time_bound: false,
  process_ids: [],
  policy_id: '',
  risk_id: '',
  strategic_action_id: '',
  improvement_opportunity_id: '',
  year: new Date().getFullYear(),
  start_date: '',
  target_date: '',
  status: 'Borrador',
  approved_by: '',
  approved_at: '',
  comm_method: '',
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
  if (p && Array.isArray(p.objectives)) return p.objectives
  if (p && Array.isArray(p.items)) return p.items
  return []
}

// ─────────────────────────────────────────────────────
export default function QualityObjectives({ alCambiarVista }) {
  const [items, setItems] = useState([])
  const [historyByObj, setHistoryByObj] = useState({})
  const [processes, setProcesses] = useState([])
  const [policies, setPolicies] = useState([])
  const [risks, setRisks] = useState([])
  const [strategicActions, setStrategicActions] = useState([])
  const [opps, setOpps] = useState([])
  const [orgProfile, setOrgProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const [view, setView] = useState('cards') // 'cards' | 'gauges' | 'table'

  const [mostrandoForm, setMostrandoForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [originalForm, setOriginalForm] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  // Filtros
  const [search, setSearch] = useState('')
  const [filterCategory, setFilterCategory] = useState('Todas')
  const [filterStatus, setFilterStatus] = useState('Todos')
  const [filterYear, setFilterYear] = useState('Todos')

  // Modal medición
  const [measureFor, setMeasureFor] = useState(null)
  const [measureValue, setMeasureValue] = useState('')
  const [measureDate, setMeasureDate] = useState(new Date().toISOString().substring(0, 10))
  const [measureNotes, setMeasureNotes] = useState('')
  const [savingMeasure, setSavingMeasure] = useState(false)

  // Modal detalle
  const [detailItem, setDetailItem] = useState(null)

  // IA
  const [loadingIA, setLoadingIA] = useState(false)
  const [iaContext, setIaContext] = useState(null) // 'smart' | 'policy' | 'compliance'
  const [iaBulk, setIaBulk] = useState(null)
  const [iaSelected, setIaSelected] = useState(new Set())
  const [iaCompliance, setIaCompliance] = useState(null)

  // ───── Fetch ─────
  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [obj, pr, pol, rk, sa, op, cp] = await Promise.all([
      supabase.from('quality_objectives').select('*').order('created_at', { ascending: false }),
      supabase.from('processes').select('id, name, type').order('name'),
      supabase.from('quality_policy').select('id, policy_text, status').order('created_at', { ascending: false }),
      supabase.from('risk_matrix').select('id, risk_description').order('score_initial', { ascending: false }).limit(50),
      supabase.from('strategic_actions').select('id, title').order('created_at', { ascending: false }).limit(50),
      supabase.from('improvement_opportunities').select('id, title').order('created_at', { ascending: false }).limit(50),
      supabase.from('company_profile').select('*').maybeSingle(),
    ])
    setItems(obj.data || [])
    setProcesses(pr.data || [])
    setPolicies(pol.data || [])
    setRisks(rk.data || [])
    setStrategicActions(sa.data || [])
    setOpps(op.data || [])
    setOrgProfile(cp.data || null)
    if (obj.data?.length) fetchHistory(obj.data.map(o => o.id))
    setLoading(false)
  }

  const fetchHistory = async (ids) => {
    if (!ids?.length) return
    const { data } = await supabase
      .from('objective_measurements')
      .select('objective_id, value, measured_at, notes')
      .in('objective_id', ids)
      .order('measured_at', { ascending: true })
    const grouped = {}
    for (const m of data || []) {
      (grouped[m.objective_id] ||= []).push({ value: Number(m.value), measured_at: m.measured_at, notes: m.notes })
    }
    setHistoryByObj(grouped)
  }

  // ───── Computed ─────
  const processMap = useMemo(() => Object.fromEntries(processes.map(p => [p.id, p])), [processes])

  const stats = useMemo(() => {
    const total = items.length
    const borradores = items.filter(i => i.status === 'Borrador').length
    const aprobados = items.filter(i => i.status === 'Aprobado').length
    const enCurso = items.filter(i => i.status === 'En curso').length
    const cumplidos = items.filter(i => i.status === 'Cumplido').length
    const noCumplidos = items.filter(i => i.status === 'No cumplido').length
    // Cálculo de avance ponderado real con baseline/target/current
    let sumaAvance = 0, conMedicion = 0
    for (const o of items) {
      const baseline = Number(o.baseline_value) || 0
      const target = Number(o.target) || 0
      const current = Number(o.current) || 0
      if (target > 0 && target !== baseline) {
        const progress = ((current - baseline) / (target - baseline)) * 100
        sumaAvance += Math.max(0, Math.min(progress, 100))
        conMedicion++
      } else if (target > 0) {
        sumaAvance += Math.min((current / target) * 100, 100)
        conMedicion++
      }
    }
    const avanceGlobal = conMedicion ? Math.round(sumaAvance / conMedicion) : 0
    const today = new Date().toISOString().slice(0, 10)
    const vencidos = items.filter(i => i.target_date && i.target_date < today && i.status !== 'Cumplido').length
    return { total, borradores, aprobados, enCurso, cumplidos, noCumplidos, avanceGlobal, vencidos }
  }, [items])

  const yearsAvailable = useMemo(() => {
    const ys = new Set()
    items.forEach(i => { if (i.year) ys.add(i.year) })
    return [...ys].sort((a, b) => b - a)
  }, [items])

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filterCategory !== 'Todas' && i.category !== filterCategory) return false
      if (filterStatus !== 'Todos' && i.status !== filterStatus) return false
      if (filterYear !== 'Todos' && i.year !== Number(filterYear)) return false
      if (search) {
        const s = search.toLowerCase()
        const hay = `${i.name || ''} ${i.objective || ''} ${i.indicator || ''} ${i.responsible || ''}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [items, filterCategory, filterStatus, filterYear, search])

  // ───── Helpers ─────
  const calcProgress = (item) => {
    const baseline = Number(item.baseline_value) || 0
    const target = Number(item.target) || 0
    const current = Number(item.current) || 0
    if (target > 0 && target !== baseline) {
      const p = ((current - baseline) / (target - baseline)) * 100
      return Math.max(0, Math.min(Math.round(p), 100))
    } else if (target > 0) {
      return Math.min(Math.round((current / target) * 100), 100)
    }
    return 0
  }

  const progressColor = (pct) => pct >= 100 ? '#16a34a' : pct >= 70 ? '#f59e0b' : '#dc2626'

  const smartScore = (item) => {
    const flags = ['is_specific', 'is_measurable', 'is_achievable', 'is_relevant', 'is_time_bound']
    return flags.reduce((a, f) => a + (item[f] ? 1 : 0), 0)
  }

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
  const openNew = () => {
    setForm({ ...EMPTY_FORM, year: new Date().getFullYear() })
    setEditingId(null)
    setOriginalForm(null)
    setMostrandoForm(true)
  }

  const openEdit = (item) => {
    const f = {
      ...EMPTY_FORM,
      ...item,
      process_ids: item.process_ids || [],
      policy_id: item.policy_id || '',
      risk_id: item.risk_id || '',
      strategic_action_id: item.strategic_action_id || '',
      improvement_opportunity_id: item.improvement_opportunity_id || '',
      start_date: item.start_date || '',
      target_date: item.target_date || '',
      approved_at: item.approved_at || '',
      baseline_value: item.baseline_value ?? '',
      target: item.target ?? '',
      current: item.current ?? '',
      is_specific: !!item.is_specific,
      is_measurable: !!item.is_measurable,
      is_achievable: !!item.is_achievable,
      is_relevant: !!item.is_relevant,
      is_time_bound: !!item.is_time_bound,
    }
    setForm(f)
    setOriginalForm(f)
    setEditingId(item.id)
    setMostrandoForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      ...form,
      target: form.target === '' ? null : Number(form.target),
      current: form.current === '' ? null : Number(form.current),
      baseline_value: form.baseline_value === '' ? null : Number(form.baseline_value),
      year: form.year ? Number(form.year) : null,
      start_date: form.start_date || null,
      target_date: form.target_date || null,
      approved_at: form.approved_at || null,
      policy_id: form.policy_id || null,
      risk_id: form.risk_id || null,
      strategic_action_id: form.strategic_action_id || null,
      improvement_opportunity_id: form.improvement_opportunity_id || null,
    }
    if (editingId) {
      const changes = diffChanges(originalForm, form)
      if (changes.length) {
        payload.change_log = [...(originalForm?.change_log || []), { at: new Date().toISOString(), changes }]
      }
      const { error } = await supabase.from('quality_objectives').update(payload).eq('id', editingId)
      if (error) { toast.error(error.message); return }
      toast.success('Objetivo actualizado')
    } else {
      payload.change_log = [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: form.name || form.objective?.slice(0, 80) }] }]
      const { error } = await supabase.from('quality_objectives').insert([payload])
      if (error) { toast.error(error.message); return }
      toast.success('Objetivo creado')
    }
    setMostrandoForm(false); setEditingId(null); setForm(EMPTY_FORM); setOriginalForm(null)
    fetchAll()
  }

  const handleDelete = async (id) => {
    if (!await confirm('¿Eliminar este objetivo? También se borrarán sus mediciones históricas.', { tone: 'danger', confirmText: 'Eliminar' })) return
    const { error } = await supabase.from('quality_objectives').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Objetivo eliminado')
    fetchAll()
  }

  const toggleProcess = (id) => {
    setForm(prev => {
      const cur = new Set(prev.process_ids || [])
      if (cur.has(id)) cur.delete(id); else cur.add(id)
      return { ...prev, process_ids: [...cur] }
    })
  }

  // ───── Medición ─────
  const openMeasure = (item) => {
    setMeasureFor(item)
    setMeasureValue(item.current ?? '')
    setMeasureDate(new Date().toISOString().substring(0, 10))
    setMeasureNotes('')
  }

  const handleSaveMeasure = async () => {
    if (!measureFor) return
    const val = parseFloat(measureValue)
    if (!Number.isFinite(val)) { toast.warning('Ingresá un valor numérico válido'); return }
    setSavingMeasure(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: mErr } = await supabase.from('objective_measurements').insert([{
        objective_id: measureFor.id,
        value: val,
        measured_at: measureDate,
        notes: measureNotes || null,
        recorded_by: user?.id,
      }])
      if (mErr) throw new Error(mErr.message)
      const { error: uErr } = await supabase
        .from('quality_objectives')
        .update({ current: val })
        .eq('id', measureFor.id)
      if (uErr) throw new Error(uErr.message)
      toast.success('Medición registrada')
      setMeasureFor(null)
      fetchAll()
    } catch (e) { toast.error('No se pudo guardar la medición: ' + e.message) }
    setSavingMeasure(false)
  }

  // ───── IA: Mejorar SMART ─────
  const mejorarSmartIA = async () => {
    if (!form.objective && !form.name) { toast.warning('Escribe primero una idea general del objetivo'); return }
    setLoadingIA(true); setIaContext('smart')
    try {
      const ctxProc = processes.slice(0, 10).map(p => p.name).join(', ')
      const prompt = `Eres consultor ISO 9001 experto en objetivos SMART. Mejora esta idea de objetivo:

IDEA: "${form.objective || form.name}"
${form.category ? 'CATEGORÍA: ' + form.category : ''}
${form.indicator ? 'INDICADOR ACTUAL: ' + form.indicator : ''}
PROCESOS DE LA EMPRESA: ${ctxProc}

Devuelve SOLO un JSON objeto sin markdown:
- name (string corto, máx 80 chars, título del objetivo)
- objective_smart (string, redacción SMART completa)
- indicator (string, KPI claro)
- baseline_value (number, valor inicial estimado)
- target (number, meta realista)
- unit (% | puntos | NC/mes | # | $ | horas | días | ppm)
- frequency (Mensual | Trimestral | Semestral | Anual)
- responsible_role (string, rol/cargo responsable)
- relevant_processes (array de strings, nombres de procesos del listado de arriba)
- is_specific (boolean), is_measurable (boolean), is_achievable (boolean), is_relevant (boolean), is_time_bound (boolean)
- comm_method (string, cómo se comunicará al personal)`

      const raw = await consultarIA(prompt, 'Devuelve ÚNICAMENTE JSON objeto válido.')
      const obj = parseAiObject(raw)
      if (!obj) throw new Error('La IA no devolvió análisis parseable')
      const procIds = (obj.relevant_processes || []).map(name => {
        const p = processes.find(p => p.name?.toLowerCase().trim() === String(name).toLowerCase().trim())
        return p?.id
      }).filter(Boolean)
      setForm(prev => ({
        ...prev,
        name: obj.name || prev.name,
        objective: obj.objective_smart || prev.objective,
        indicator: obj.indicator || prev.indicator,
        baseline_value: obj.baseline_value ?? prev.baseline_value,
        target: obj.target ?? prev.target,
        unit: UNIT_OPTIONS.includes(obj.unit) ? obj.unit : prev.unit,
        frequency: FREQ_OPTIONS.includes(obj.frequency) ? obj.frequency : prev.frequency,
        responsible: prev.responsible || obj.responsible_role || '',
        process_ids: procIds.length ? procIds : prev.process_ids,
        is_specific: !!obj.is_specific,
        is_measurable: !!obj.is_measurable,
        is_achievable: !!obj.is_achievable,
        is_relevant: !!obj.is_relevant,
        is_time_bound: !!obj.is_time_bound,
        comm_method: prev.comm_method || obj.comm_method || '',
      }))
    } catch (err) { toast.error('Error IA: ' + err.message) }
    setLoadingIA(false)
  }

  // ───── IA: Generar objetivos desde política ─────
  const generarDesdeIA = async () => {
    setLoadingIA(true); setIaContext('policy'); setIaBulk(null)
    try {
      const policy = policies.find(p => p.status === 'Aprobada' || p.status === 'Comunicada') || policies[0]
      if (!policy?.policy_text) throw new Error('No hay una política de calidad cargada. Definila primero.')
      const ctxProc = processes.slice(0, 15).map(p => ({ nombre: p.name, tipo: p.type }))
      const existentes = items.slice(0, 15).map(o => o.name || o.objective?.slice(0, 80)).filter(Boolean)
      const empresa = orgProfile?.company_name || 'la empresa'
      const year = new Date().getFullYear()

      const prompt = `Eres consultor ISO 9001 experto en planificación. Genera 5-8 objetivos SMART para ${empresa} para el año ${year}, derivados de la política de calidad y los procesos según ISO 6.2.

POLÍTICA DE CALIDAD VIGENTE:
${policy.policy_text}

PROCESOS DE LA EMPRESA:
${JSON.stringify(ctxProc, null, 2)}

OBJETIVOS YA EXISTENTES (no los repitas):
${JSON.stringify(existentes, null, 2)}

Devuelve SOLO un JSON array, sin markdown. Cada objetivo:
- name (string corto, máx 80 chars)
- objective_smart (string completo SMART)
- category (Calidad|Satisfacción|Eficiencia|Costo|Tiempo|Seguridad|Otra)
- indicator (string, KPI)
- baseline_value (number)
- target (number)
- unit (% | puntos | NC/mes | # | $ | horas | días | ppm)
- frequency (Mensual | Trimestral | Semestral | Anual)
- responsible_role (string)
- relevant_processes (array de nombres de procesos del listado)
- comm_method (string corto)
- justification (string, por qué este objetivo es relevante)

Cubrí distintas categorías. Sé realista con baseline y target.`

      const raw = await consultarIA(prompt, 'Devuelve ÚNICAMENTE JSON array válido.')
      const arr = parseAiArray(raw)
      if (!arr.length) throw new Error('La IA no devolvió objetivos parseables')
      setIaBulk(arr)
      setIaSelected(new Set(arr.map((_, i) => i)))
    } catch (err) { toast.error('Error IA: ' + err.message) }
    setLoadingIA(false)
  }

  const saveIaBulk = async () => {
    if (!iaBulk) return
    const year = new Date().getFullYear()
    const policy = policies.find(p => p.status === 'Aprobada' || p.status === 'Comunicada') || policies[0]
    const rows = iaBulk
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => iaSelected.has(i))
      .map(({ s }) => {
        const procIds = (s.relevant_processes || []).map(n => {
          const p = processes.find(p => p.name?.toLowerCase().trim() === String(n).toLowerCase().trim())
          return p?.id
        }).filter(Boolean)
        return {
          name: s.name || 'Objetivo sin título',
          objective: s.objective_smart || '',
          category: CATEGORY_OPTIONS.includes(s.category) ? s.category : 'Otra',
          indicator: s.indicator || '',
          baseline_value: s.baseline_value ?? null,
          target: s.target ?? null,
          unit: UNIT_OPTIONS.includes(s.unit) ? s.unit : '%',
          frequency: FREQ_OPTIONS.includes(s.frequency) ? s.frequency : 'Mensual',
          responsible: s.responsible_role || '',
          process_ids: procIds,
          policy_id: policy?.id || null,
          year,
          status: 'Borrador',
          is_specific: true, is_measurable: true, is_achievable: true, is_relevant: true, is_time_bound: true,
          comm_method: s.comm_method || '',
          change_log: [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: 'IA desde política' }] }]
        }
      })
    if (!rows.length) return toast.warning('No hay objetivos seleccionados')
    const { error } = await supabase.from('quality_objectives').insert(rows)
    if (error) { toast.error(error.message); return }
    toast.success(`${rows.length} objetivos creados para ${year}`)
    setIaBulk(null); setIaSelected(new Set()); setIaContext(null)
    fetchAll()
  }

  // ───── IA: Análisis de cumplimiento ─────
  const analizarCumplimientoIA = async () => {
    if (items.length === 0) return toast.warning('Carga al menos un objetivo antes de analizar cumplimiento')
    setLoadingIA(true); setIaContext('compliance'); setIaCompliance(null)
    try {
      const ctxObjs = items.filter(o => o.status === 'En curso' || o.status === 'Aprobado').slice(0, 15).map(o => ({
        nombre: o.name || (o.objective || '').slice(0, 80),
        categoria: o.category,
        indicador: o.indicator,
        baseline: o.baseline_value,
        target: o.target,
        actual: o.current,
        unit: o.unit,
        frecuencia: o.frequency,
        target_date: o.target_date,
        mediciones_n: (historyByObj[o.id] || []).length,
        ultima_medicion: (historyByObj[o.id] || []).slice(-1)[0]?.measured_at,
      }))
      if (!ctxObjs.length) throw new Error('No hay objetivos en curso/aprobados para analizar.')

      const prompt = `Eres auditor ISO 9001. Analiza el cumplimiento esperado de estos objetivos de calidad y predecí cuáles van a cumplirse o no según ISO 9.1.

OBJETIVOS:
${JSON.stringify(ctxObjs, null, 2)}

Devuelve SOLO un JSON objeto, sin markdown:
- overall_assessment (string, conclusión global)
- on_track (array de strings con nombres de objetivos en buen camino)
- at_risk (array de strings con nombres en riesgo)
- failing (array de strings con nombres que NO se van a cumplir)
- recommendations (array de strings, acciones concretas por objetivo en riesgo)
- prediction_compliance_pct (number 0-100, % de cumplimiento global predicho a fin de año)`

      const raw = await consultarIA(prompt, 'Devuelve ÚNICAMENTE JSON objeto válido.')
      const obj = parseAiObject(raw)
      if (!obj) throw new Error('La IA no devolvió análisis parseable')
      setIaCompliance(obj)
    } catch (err) { toast.error('Error IA: ' + err.message) }
    setLoadingIA(false)
  }

  // ───── Convertir a acción estratégica ─────
  const convertirAAccionEstrategica = async (item) => {
    if (!await confirm('¿Crear acción estratégica desde este objetivo?', { title: 'Convertir a Plan Estratégico' })) return
    const row = {
      title: `Alcanzar: ${item.name || (item.objective || '').slice(0, 80)}`,
      description: item.objective || '',
      source: 'Objetivo de Calidad',
      status: 'Planificada',
      due_date: item.target_date || null,
      responsible: item.responsible || '',
      objective_id: item.id,
      change_log: [{ at: new Date().toISOString(), changes: [{ field: 'created', from: 'Objetivo', to: item.id }] }]
    }
    const { data, error } = await supabase.from('strategic_actions').insert([row]).select('id').single()
    if (error) { toast.error(error.message); return }
    await supabase.from('quality_objectives').update({ strategic_action_id: data.id }).eq('id', item.id)
    toast.success('Acción estratégica creada y vinculada')
    fetchAll()
  }

  // ───────────────────── UI ──────────────────────
  return (
    <div className="fade-in" style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Target size={28} color="#0891b2" /> Objetivos de Calidad
          </h2>
          <p style={{ color: '#64748b', margin: '5px 0 0 0', fontSize: '14px' }}>
            ISO 9001 — 6.2 Planificación, indicadores SMART, seguimiento y aprobación por dirección.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={generarDesdeIA} disabled={loadingIA} style={btn('#7c3aed')}>
            {loadingIA && iaContext === 'policy' ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
            IA: desde Política
          </button>
          <button onClick={analizarCumplimientoIA} disabled={loadingIA} style={btn('#ec4899')}>
            {loadingIA && iaContext === 'compliance' ? <Loader2 size={16} className="spin" /> : <Activity size={16} />}
            IA: cumplimiento
          </button>
          <button onClick={openNew} style={btn('#0891b2')}><Plus size={16} /> Objetivo</button>
        </div>
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['6.2']} />

      <ModuleSeedBanner moduleKey="objectives" label="objetivos de calidad" visible={!loading && items.length === 0} onSeeded={fetchAll} />

      {/* Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <Kpi label="Total" value={stats.total} color="#475569" icon={<Target size={16} />} />
        <Kpi label="Borrador" value={stats.borradores} color="#6b7280" icon={<Pencil size={16} />} />
        <Kpi label="Aprobados" value={stats.aprobados} color="#3730a3" icon={<CheckCircle2 size={16} />} />
        <Kpi label="En curso" value={stats.enCurso} icon={<Activity size={16} />} color="#0891b2" />
        <Kpi label="Cumplidos" value={stats.cumplidos} color="#16a34a" icon={<Award size={16} />} />
        <Kpi label="No cumplidos" value={stats.noCumplidos} color="#dc2626" icon={<AlertTriangle size={16} />} />
        <Kpi label="Avance global" value={`${stats.avanceGlobal}%`} color={progressColor(stats.avanceGlobal)} icon={<TrendingUp size={16} />} />
        <Kpi label="Vencidos" value={stats.vencidos} color="#92400e" icon={<Calendar size={16} />} />
      </div>

      {/* IA Análisis Cumplimiento */}
      {iaCompliance && <ComplianceAnalysis data={iaCompliance} onClose={() => { setIaCompliance(null); setIaContext(null) }} />}

      {/* IA Bulk */}
      {iaBulk && (
        <BulkIaPanel
          items={iaBulk}
          selected={iaSelected}
          onToggle={i => setIaSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })}
          onSave={saveIaBulk}
          onClose={() => { setIaBulk(null); setIaSelected(new Set()); setIaContext(null) }}
        />
      )}

      {/* Filtros + Vista */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 200px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            placeholder="Buscar nombre, indicador, responsable…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 8px 8px 32px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
          />
        </div>
        <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={selectStyle}>
          <option value="Todas">Toda categoría</option>
          {CATEGORY_OPTIONS.map(c => <option key={c}>{c}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="Todos">Todos los estados</option>
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={selectStyle}>
          <option value="Todos">Todos los años</option>
          {yearsAvailable.map(y => <option key={y}>{y}</option>)}
        </select>
        <div style={{ display: 'flex', gap: '4px', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '2px', background: 'white' }}>
          <button onClick={() => setView('cards')} style={vbtn(view === 'cards')}><LayoutGrid size={14} /> Cards</button>
          <button onClick={() => setView('gauges')} style={vbtn(view === 'gauges')}><Grid3x3 size={14} /> Gauges</button>
          <button onClick={() => setView('table')} style={vbtn(view === 'table')}><List size={14} /> Tabla</button>
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
          policies={policies}
          risks={risks}
          strategicActions={strategicActions}
          opps={opps}
          toggleProcess={toggleProcess}
          loadingIA={loadingIA && iaContext === 'smart'}
          onIA={mejorarSmartIA}
          onSubmit={handleSubmit}
          onCancel={() => { setMostrandoForm(false); setEditingId(null); setForm(EMPTY_FORM) }}
        />
      )}

      {/* Visualización */}
      {loading ? (
        <p style={{ color: '#64748b' }}>Cargando…</p>
      ) : filtered.length === 0 ? (
        <div style={emptyState}>
          <Target size={40} color="#cbd5e1" />
          <p style={{ color: '#64748b', marginTop: '8px' }}>Sin objetivos que coincidan con los filtros.</p>
        </div>
      ) : view === 'cards' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '14px' }}>
          {filtered.map(item => (
            <ObjectiveCard
              key={item.id}
              item={item}
              history={historyByObj[item.id] || []}
              progress={calcProgress(item)}
              smartScore={smartScore(item)}
              onMeasure={() => openMeasure(item)}
              onDetail={() => setDetailItem(item)}
              onEdit={() => openEdit(item)}
              onDelete={() => handleDelete(item.id)}
              onConvert={() => convertirAAccionEstrategica(item)}
            />
          ))}
        </div>
      ) : view === 'gauges' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '14px' }}>
          {filtered.map(item => (
            <GaugeCard key={item.id} item={item} progress={calcProgress(item)} onClick={() => setDetailItem(item)} />
          ))}
        </div>
      ) : (
        <TableView items={filtered} calcProgress={calcProgress} onDetail={setDetailItem} onEdit={openEdit} onMeasure={openMeasure} onDelete={handleDelete} />
      )}

      {/* Modal medición */}
      {measureFor && createPortal((
        <Backdrop onClose={() => setMeasureFor(null)}>
          <Modal>
            <ModalHeader title={<><TrendingUp size={18} style={{ verticalAlign: 'middle' }} /> Registrar medición</>} onClose={() => setMeasureFor(null)} />
            <div style={{ padding: '16px', display: 'grid', gap: '12px' }}>
              <div style={{ background: '#f8fafc', padding: '10px', borderRadius: '6px', fontSize: '13px' }}>
                <strong>{measureFor.indicator}</strong>
                <p style={{ margin: '4px 0 0 0', color: '#64748b' }}>{measureFor.name || measureFor.objective}</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                  Baseline: {measureFor.baseline_value ?? '—'} · Meta: {measureFor.target} {measureFor.unit} · Frecuencia: {measureFor.frequency}
                </p>
              </div>
              <Field label={`Valor medido (${measureFor.unit})`}>
                <input type="number" step="any" value={measureValue} onChange={e => setMeasureValue(e.target.value)} style={inputStyle} autoFocus />
              </Field>
              <Field label="Fecha de la medición">
                <input type="date" value={measureDate} onChange={e => setMeasureDate(e.target.value)} style={inputStyle} />
              </Field>
              <Field label="Notas (opcional)">
                <textarea rows={2} value={measureNotes} onChange={e => setMeasureNotes(e.target.value)} style={inputStyle} placeholder="Contexto, fuente de datos…" />
              </Field>
              <p style={{ fontSize: '11px', color: '#94a3b8', margin: 0 }}>
                Se registra en histórico (ISO 9.1 seguimiento y medición).
              </p>
            </div>
            <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', justifyContent: 'flex-end' }}>
              <button onClick={() => setMeasureFor(null)} style={btn('#6b7280')}>Cancelar</button>
              <button onClick={handleSaveMeasure} style={btn('#16a34a')} disabled={savingMeasure}>
                {savingMeasure ? <><Loader2 size={14} className="spin" /> Guardando…</> : <><Save size={14} /> Guardar</>}
              </button>
            </div>
          </Modal>
        </Backdrop>
      ), document.body)}

      {/* Modal detalle */}
      {detailItem && (
        <DetailModal
          item={detailItem}
          history={historyByObj[detailItem.id] || []}
          processMap={processMap}
          policies={policies}
          progress={calcProgress(detailItem)}
          smartScore={smartScore(detailItem)}
          onClose={() => setDetailItem(null)}
          onEdit={() => { setDetailItem(null); openEdit(detailItem) }}
          onMeasure={() => { setDetailItem(null); openMeasure(detailItem) }}
          onConvert={() => { setDetailItem(null); convertirAAccionEstrategica(detailItem) }}
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

function ObjectiveCard({ item, history, progress, smartScore, onMeasure, onDetail, onEdit, onDelete, onConvert }) {
  const catColor = CATEGORY_COLORS[item.category] || '#64748b'
  const stC = STATUS_COLORS[item.status] || STATUS_COLORS['Borrador']
  const pColor = progress >= 100 ? '#16a34a' : progress >= 70 ? '#f59e0b' : '#dc2626'
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderTop: `4px solid ${catColor}`, borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '6px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '4px' }}>
            <span style={badge({ bg: catColor + '22', color: catColor })}>{item.category}</span>
            <span style={badge(stC)}>{item.status}</span>
            <span style={badge({ bg: '#f1f5f9', color: '#475569' })}>{item.year || '—'}</span>
            <span style={badge({ bg: smartScore === 5 ? '#dcfce7' : '#fef3c7', color: smartScore === 5 ? '#166534' : '#92400e' })}>SMART {smartScore}/5</span>
          </div>
          <h3 style={{ margin: 0, fontSize: '14px', color: '#1e293b', lineHeight: 1.3 }}>{item.name || (item.objective || '').slice(0, 80)}</h3>
        </div>
      </div>
      <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>{item.indicator}</p>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>
          {item.current ?? '—'} <span style={{ fontSize: '12px', color: '#94a3b8' }}>{item.unit}</span>
        </span>
        <span style={{ fontSize: '12px', color: '#64748b' }}>
          {item.baseline_value !== null && item.baseline_value !== undefined ? `Base ${item.baseline_value} → ` : ''}Meta {item.target} {item.unit}
        </span>
      </div>

      <div style={{ background: '#f1f5f9', borderRadius: '999px', height: '8px', overflow: 'hidden' }}>
        <div style={{ width: `${progress}%`, height: '100%', background: pColor, transition: 'width 0.5s' }} />
      </div>
      <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'right' }}>{progress}% del avance</div>

      <Sparkline points={history} target={Number(item.target) || 0} baseline={Number(item.baseline_value) || 0} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '8px' }}>
        <div style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Target size={12} /> {item.responsible || '—'}
          {item.evidence_url && <a href={item.evidence_url} target="_blank" rel="noreferrer"><ExternalLink size={12} /></a>}
        </div>
      </div>
      <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
        <button onClick={onMeasure} style={miniBtn('#16a34a')}><RefreshCw size={11} /> Medir</button>
        <button onClick={onDetail} style={miniBtn('#0ea5e9')}><Eye size={11} /></button>
        <button onClick={onEdit} style={miniBtn('#6366f1')}><Pencil size={11} /></button>
        {!item.strategic_action_id && <button onClick={onConvert} style={miniBtn('#7c3aed')} title="Convertir a acción estratégica"><ArrowRight size={11} /></button>}
        <button onClick={onDelete} style={miniBtn('#dc2626')}><Trash2 size={11} /></button>
      </div>
    </div>
  )
}

function GaugeCard({ item, progress, onClick }) {
  const catColor = CATEGORY_COLORS[item.category] || '#64748b'
  const pColor = progress >= 100 ? '#16a34a' : progress >= 70 ? '#f59e0b' : '#dc2626'
  return (
    <div onClick={onClick} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
      <span style={{ ...badge({ bg: catColor + '22', color: catColor }), alignSelf: 'flex-start' }}>{item.category}</span>
      <DonutGauge value={progress} color={pColor} size={120} />
      <h4 style={{ margin: '4px 0', fontSize: '13px', textAlign: 'center', color: '#1e293b', lineHeight: 1.3 }}>{item.name || (item.objective || '').slice(0, 60)}</h4>
      <div style={{ fontSize: '11px', color: '#64748b', textAlign: 'center' }}>
        {item.current ?? '—'} / {item.target ?? '—'} {item.unit}
      </div>
    </div>
  )
}

function DonutGauge({ value, color, size = 120 }) {
  const stroke = 10
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.min(value, 100) / 100)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
      <text x="50%" y="50%" textAnchor="middle" dy="0.35em" fontSize="22" fontWeight="700" fill="#1e293b">{value}%</text>
    </svg>
  )
}

function TableView({ items, calcProgress, onDetail, onEdit, onMeasure, onDelete }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
        <thead>
          <tr style={{ background: '#f8fafc', textAlign: 'left' }}>
            <th style={th}>Nombre</th>
            <th style={th}>Categoría</th>
            <th style={th}>Año</th>
            <th style={th}>Indicador</th>
            <th style={th}>Base → Meta</th>
            <th style={th}>Actual</th>
            <th style={th}>Avance</th>
            <th style={th}>Status</th>
            <th style={th}>Responsable</th>
            <th style={th}></th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const p = calcProgress(item)
            return (
              <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                <td style={{ ...td, fontWeight: 600 }}>{item.name || (item.objective || '').slice(0, 60)}</td>
                <td style={td}>{item.category || '—'}</td>
                <td style={td}>{item.year || '—'}</td>
                <td style={td}>{item.indicator || '—'}</td>
                <td style={td}>{item.baseline_value ?? '—'} → {item.target ?? '—'} {item.unit}</td>
                <td style={{ ...td, fontWeight: 600 }}>{item.current ?? '—'}</td>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <div style={{ background: '#f1f5f9', borderRadius: '999px', height: '6px', width: '60px', overflow: 'hidden' }}>
                      <div style={{ width: `${p}%`, height: '100%', background: p >= 100 ? '#16a34a' : p >= 70 ? '#f59e0b' : '#dc2626' }} />
                    </div>
                    <span style={{ fontSize: '11px' }}>{p}%</span>
                  </div>
                </td>
                <td style={td}>
                  <span style={badge(STATUS_COLORS[item.status] || STATUS_COLORS['Borrador'])}>{item.status}</span>
                </td>
                <td style={td}>{item.responsible || '—'}</td>
                <td style={{ ...td, textAlign: 'right' }}>
                  <button onClick={() => onMeasure(item)} style={miniBtn('#16a34a')}><RefreshCw size={11} /></button>
                  <button onClick={() => onDetail(item)} style={miniBtn('#0ea5e9')}><Eye size={11} /></button>
                  <button onClick={() => onEdit(item)} style={miniBtn('#6366f1')}><Pencil size={11} /></button>
                  <button onClick={() => onDelete(item.id)} style={miniBtn('#dc2626')}><Trash2 size={11} /></button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function FormCard({ form, setForm, editing, processes, policies, risks, strategicActions, opps, toggleProcess, loadingIA, onIA, onSubmit, onCancel }) {
  const set = (patch) => setForm(prev => ({ ...prev, ...patch }))
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
      <h3 style={{ marginTop: 0, color: '#0891b2' }}>{editing ? '✏️ Editar objetivo' : '+ Crear objetivo'}</h3>
      <form onSubmit={onSubmit}>
        {/* 1. Identificación */}
        <Section title="1. Identificación">
          <Row>
            <Field label="Nombre corto *" flex={2}>
              <input required value={form.name} onChange={e => set({ name: e.target.value })} style={inputStyle} placeholder="Ej: Reducir reclamos cliente" />
            </Field>
            <Field label="Categoría">
              <select value={form.category} onChange={e => set({ category: e.target.value })} style={inputStyle}>
                {CATEGORY_OPTIONS.map(c => <option key={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Año">
              <input type="number" value={form.year} onChange={e => set({ year: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Estado">
              <select value={form.status} onChange={e => set({ status: e.target.value })} style={inputStyle}>
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
          </Row>
          <Field label="Descripción SMART">
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <textarea rows={3} value={form.objective} onChange={e => set({ objective: e.target.value })} style={{ ...inputStyle, flex: 1 }} placeholder="Redacción completa SMART (específico, medible, alcanzable, relevante, temporal)" />
              <button type="button" onClick={onIA} disabled={loadingIA} style={{ ...btn('#7c3aed'), whiteSpace: 'nowrap' }}>
                {loadingIA ? <Loader2 size={14} className="spin" /> : <Sparkles size={14} />} IA SMART
              </button>
            </div>
          </Field>
          <Row>
            <Field label="Fecha inicio">
              <input type="date" value={form.start_date || ''} onChange={e => set({ start_date: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Fecha límite">
              <input type="date" value={form.target_date || ''} onChange={e => set({ target_date: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Responsable">
              <input value={form.responsible} onChange={e => set({ responsible: e.target.value })} style={inputStyle} placeholder="Cargo o nombre" />
            </Field>
          </Row>
        </Section>

        {/* 2. SMART check */}
        <Section title="2. ¿Cumple criterios SMART?">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <SmartChip label="S — Específico" desc="Concreto, sin ambigüedad" checked={form.is_specific} onChange={v => set({ is_specific: v })} />
            <SmartChip label="M — Medible" desc="Tiene KPI cuantitativo" checked={form.is_measurable} onChange={v => set({ is_measurable: v })} />
            <SmartChip label="A — Alcanzable" desc="Realista con recursos actuales" checked={form.is_achievable} onChange={v => set({ is_achievable: v })} />
            <SmartChip label="R — Relevante" desc="Conecta con política y procesos" checked={form.is_relevant} onChange={v => set({ is_relevant: v })} />
            <SmartChip label="T — Temporal" desc="Tiene fecha límite" checked={form.is_time_bound} onChange={v => set({ is_time_bound: v })} />
          </div>
        </Section>

        {/* 3. Medición */}
        <Section title="3. Medición">
          <Row>
            <Field label="Indicador (KPI) *" flex={2}>
              <input required value={form.indicator} onChange={e => set({ indicator: e.target.value })} style={inputStyle} placeholder="Ej: % de reclamos resueltos en <48h" />
            </Field>
            <Field label="Unidad">
              <select value={form.unit} onChange={e => set({ unit: e.target.value })} style={inputStyle}>
                {UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Frecuencia">
              <select value={form.frequency} onChange={e => set({ frequency: e.target.value })} style={inputStyle}>
                {FREQ_OPTIONS.map(f => <option key={f}>{f}</option>)}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="Línea base (baseline)">
              <input type="number" step="any" value={form.baseline_value} onChange={e => set({ baseline_value: e.target.value })} style={inputStyle} placeholder="Punto de partida" />
            </Field>
            <Field label="Valor actual">
              <input type="number" step="any" value={form.current} onChange={e => set({ current: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Meta (target)">
              <input type="number" step="any" required value={form.target} onChange={e => set({ target: e.target.value })} style={inputStyle} />
            </Field>
          </Row>
          <Field label="URL evidencia">
            <input value={form.evidence_url} onChange={e => set({ evidence_url: e.target.value })} style={inputStyle} placeholder="https://drive.google.com/…" />
          </Field>
        </Section>

        {/* 4. Vínculos */}
        <Section title="4. Vínculos (opcional)">
          <Field label="Procesos que contribuyen">
            {processes.length === 0 ? <span style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>Sin procesos cargados</span> : (
              <div style={{ maxHeight: '120px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px', background: 'white' }}>
                {processes.map(p => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px', cursor: 'pointer', borderRadius: '3px', background: form.process_ids?.includes(p.id) ? '#eff6ff' : 'transparent', fontSize: '12px' }}>
                    <input type="checkbox" checked={form.process_ids?.includes(p.id) || false} onChange={() => toggleProcess(p.id)} />
                    <span>{p.name}</span>
                  </label>
                ))}
              </div>
            )}
          </Field>
          <Row>
            <Field label="Política origen">
              <select value={form.policy_id} onChange={e => set({ policy_id: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {policies.map(p => <option key={p.id} value={p.id}>{(p.policy_text || '').slice(0, 60)}... ({p.status})</option>)}
              </select>
            </Field>
            <Field label="Riesgo origen">
              <select value={form.risk_id} onChange={e => set({ risk_id: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {risks.map(r => <option key={r.id} value={r.id}>{(r.risk_description || '').slice(0, 60)}</option>)}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="Acción estratégica vinculada">
              <select value={form.strategic_action_id} onChange={e => set({ strategic_action_id: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {strategicActions.map(s => <option key={s.id} value={s.id}>{(s.title || '').slice(0, 60)}</option>)}
              </select>
            </Field>
            <Field label="Oportunidad de mejora vinculada">
              <select value={form.improvement_opportunity_id} onChange={e => set({ improvement_opportunity_id: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {opps.map(o => <option key={o.id} value={o.id}>{(o.title || '').slice(0, 60)}</option>)}
              </select>
            </Field>
          </Row>
        </Section>

        {/* 5. Aprobación + Comunicación */}
        <Section title="5. Aprobación y comunicación">
          <Row>
            <Field label="Aprobado por">
              <input value={form.approved_by} onChange={e => set({ approved_by: e.target.value })} style={inputStyle} placeholder="Dirección / Gerencia" />
            </Field>
            <Field label="Fecha aprobación">
              <input type="date" value={form.approved_at || ''} onChange={e => set({ approved_at: e.target.value })} style={inputStyle} />
            </Field>
          </Row>
          <Field label="Método de comunicación al personal">
            <input value={form.comm_method} onChange={e => set({ comm_method: e.target.value })} style={inputStyle} placeholder="Ej: Reunión mensual + intranet + cartelera (conecta con 7.4)" />
          </Field>
        </Section>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button type="submit" style={btn('#16a34a')}><Save size={16} /> {editing ? 'Guardar' : 'Crear'}</button>
          <button type="button" onClick={onCancel} style={btn('#6b7280')}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}

function SmartChip({ label, desc, checked, onChange }) {
  return (
    <label title={desc} style={{
      display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px',
      borderRadius: '999px', cursor: 'pointer',
      background: checked ? '#dcfce7' : '#f1f5f9',
      border: '1px solid ' + (checked ? '#86efac' : '#cbd5e1'),
      color: checked ? '#166534' : '#475569',
      fontSize: '12px', fontWeight: 600
    }}>
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      {label}
    </label>
  )
}

function DetailModal({ item, history, processMap, policies, progress, smartScore, onClose, onEdit, onMeasure, onConvert }) {
  const procs = (item.process_ids || []).map(id => processMap[id]?.name).filter(Boolean)
  const policy = item.policy_id ? policies.find(p => p.id === item.policy_id) : null
  return createPortal(
    <Backdrop onClose={onClose}>
      <Modal>
        <ModalHeader title={item.name || (item.objective || '').slice(0, 80)} onClose={onClose}>
          <span style={badge({ bg: (CATEGORY_COLORS[item.category] || '#64748b') + '22', color: CATEGORY_COLORS[item.category] || '#64748b' })}>{item.category}</span>
          <span style={badge(STATUS_COLORS[item.status] || STATUS_COLORS['Borrador'])}>{item.status}</span>
        </ModalHeader>

        <ModalSection title="📋 Datos del objetivo">
          <D label="Descripción" block>{item.objective || '—'}</D>
          <DetailGrid>
            <D label="Indicador">{item.indicator || '—'}</D>
            <D label="Año">{item.year || '—'}</D>
            <D label="Frecuencia">{item.frequency || '—'}</D>
            <D label="Responsable">{item.responsible || '—'}</D>
            <D label="Inicio">{item.start_date ? new Date(item.start_date).toLocaleDateString() : '—'}</D>
            <D label="Fecha límite">{item.target_date ? new Date(item.target_date).toLocaleDateString() : '—'}</D>
          </DetailGrid>
        </ModalSection>

        <ModalSection title="📊 Medición">
          <DetailGrid>
            <D label="Baseline">{item.baseline_value ?? '—'} {item.unit}</D>
            <D label="Actual">{item.current ?? '—'} {item.unit}</D>
            <D label="Meta">{item.target ?? '—'} {item.unit}</D>
            <D label="Avance">{progress}%</D>
          </DetailGrid>
          <div style={{ background: '#f1f5f9', borderRadius: '999px', height: '10px', overflow: 'hidden', marginTop: '6px' }}>
            <div style={{ width: `${progress}%`, height: '100%', background: progress >= 100 ? '#16a34a' : progress >= 70 ? '#f59e0b' : '#dc2626' }} />
          </div>
          {item.evidence_url && (
            <a href={item.evidence_url} target="_blank" rel="noreferrer" style={linkBtn}>
              <ExternalLink size={12} /> Evidencia
            </a>
          )}
        </ModalSection>

        <ModalSection title={`✅ SMART (${smartScore}/5)`}>
          <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
            {['is_specific', 'is_measurable', 'is_achievable', 'is_relevant', 'is_time_bound'].map((k, i) => {
              const lbl = ['Específico', 'Medible', 'Alcanzable', 'Relevante', 'Temporal'][i]
              return (
                <span key={k} style={badge(item[k] ? { bg: '#dcfce7', color: '#166534' } : { bg: '#fee2e2', color: '#991b1b' })}>
                  {item[k] ? '✓' : '✗'} {lbl}
                </span>
              )
            })}
          </div>
        </ModalSection>

        <ModalSection title="🔗 Vínculos">
          <DetailGrid>
            {policy && <D label="Política origen">{(policy.policy_text || '').slice(0, 80)}</D>}
            {item.risk_id && <D label="Riesgo">✅ vinculado</D>}
            {item.strategic_action_id && <D label="Acción estratégica">✅ vinculada</D>}
            {item.improvement_opportunity_id && <D label="Mejora">✅ vinculada</D>}
          </DetailGrid>
          {procs.length > 0 && (
            <D label="Procesos que contribuyen" block>
              <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                {procs.map((p, i) => <span key={i} style={badge({ bg: '#e0e7ff', color: '#3730a3' })}>{p}</span>)}
              </div>
            </D>
          )}
        </ModalSection>

        <ModalSection title="🏛 Aprobación y comunicación">
          <DetailGrid>
            <D label="Aprobado por">{item.approved_by || '—'}</D>
            <D label="Fecha aprobación">{item.approved_at ? new Date(item.approved_at).toLocaleDateString() : '—'}</D>
          </DetailGrid>
          <D label="Cómo se comunica" block>{item.comm_method || '—'}</D>
        </ModalSection>

        <ModalSection title={`📈 Historial de mediciones (${history.length})`}>
          <Sparkline points={history} target={Number(item.target) || 0} baseline={Number(item.baseline_value) || 0} />
          {history.length > 0 && (
            <ul style={{ margin: '8px 0 0 0', padding: '0 0 0 16px', fontSize: '12px', color: '#334155', maxHeight: '140px', overflowY: 'auto' }}>
              {[...history].reverse().slice(0, 12).map((m, i) => (
                <li key={i}>
                  <strong>{m.value} {item.unit}</strong> · {new Date(m.measured_at).toLocaleDateString()}
                  {m.notes && <span style={{ color: '#94a3b8' }}> — {m.notes}</span>}
                </li>
              ))}
            </ul>
          )}
        </ModalSection>

        <ModalSection title="🕓 Historial de cambios">
          <ChangeLogTimeline entries={item.change_log || []} fieldLabels={OBJ_FIELD_LABELS} max={5} />
        </ModalSection>

        <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onMeasure} style={btn('#16a34a')}><RefreshCw size={16} /> Medir</button>
          {!item.strategic_action_id && <button onClick={onConvert} style={btn('#7c3aed')}><ArrowRight size={16} /> A Plan Estratégico</button>}
          <button onClick={onEdit} style={btn('#6366f1')}><Pencil size={16} /> Editar</button>
          <button onClick={onClose} style={btn('#6b7280')}>Cerrar</button>
        </div>
      </Modal>
    </Backdrop>,
    document.body
  )
}

function BulkIaPanel({ items, selected, onToggle, onSave, onClose }) {
  return (
    <div style={{ background: '#f3e8ff', border: '2px solid #c084fc', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0, color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={20} /> IA: {items.length} objetivos sugeridos desde política
        </h3>
        <button onClick={onClose} style={btn('#6b7280')}><X size={14} /> Descartar</button>
      </div>
      <div style={{ maxHeight: '420px', overflowY: 'auto', display: 'grid', gap: '6px', marginBottom: '10px' }}>
        {items.map((s, i) => (
          <label key={i} style={{
            display: 'flex', gap: '8px', padding: '8px 10px', background: 'white', borderRadius: '6px',
            cursor: 'pointer', border: '1px solid ' + (selected.has(i) ? '#a855f7' : '#e2e8f0')
          }}>
            <input type="checkbox" checked={selected.has(i)} onChange={() => onToggle(i)} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '13px' }}>
                {s.name}
                <span style={{ marginLeft: '6px', fontSize: '11px', color: '#475569', fontWeight: 'normal' }}>· {s.category}</span>
              </div>
              {s.indicator && <div style={{ fontSize: '12px', color: '#334155', marginTop: '2px' }}>📊 {s.indicator}</div>}
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                Base {s.baseline_value} → Meta {s.target} {s.unit} · {s.frequency} · 👤 {s.responsible_role}
              </div>
              {s.objective_smart && <div style={{ fontSize: '12px', color: '#475569', marginTop: '4px', fontStyle: 'italic' }}>{s.objective_smart}</div>}
              {s.relevant_processes?.length > 0 && (
                <div style={{ fontSize: '11px', color: '#475569', marginTop: '2px' }}>⚙ {s.relevant_processes.join(', ')}</div>
              )}
            </div>
          </label>
        ))}
      </div>
      <button onClick={onSave} style={btn('#7c3aed')}><Save size={16} /> Crear {selected.size} objetivos</button>
    </div>
  )
}

function ComplianceAnalysis({ data, onClose }) {
  return (
    <div style={{ background: '#fdf2f8', border: '2px solid #f9a8d4', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0, color: '#9f1239', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Activity size={20} /> IA: Análisis de cumplimiento {data.prediction_compliance_pct !== undefined && <>· {data.prediction_compliance_pct}% predicho</>}
        </h3>
        <button onClick={onClose} style={btn('#6b7280')}><X size={14} /> Cerrar</button>
      </div>
      <p style={{ margin: '0 0 10px 0', fontSize: '13px', color: '#334155' }}>{data.overall_assessment}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px', marginBottom: '10px' }}>
        {data.on_track?.length > 0 && (
          <div style={{ background: 'white', padding: '8px 10px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
            <div style={{ fontWeight: 600, color: '#166534', fontSize: '12px', marginBottom: '4px' }}>✅ En buen camino ({data.on_track.length})</div>
            <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '12px', color: '#334155' }}>{data.on_track.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </div>
        )}
        {data.at_risk?.length > 0 && (
          <div style={{ background: 'white', padding: '8px 10px', borderRadius: '6px', border: '1px solid #fde68a' }}>
            <div style={{ fontWeight: 600, color: '#92400e', fontSize: '12px', marginBottom: '4px' }}>⚠ En riesgo ({data.at_risk.length})</div>
            <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '12px', color: '#334155' }}>{data.at_risk.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </div>
        )}
        {data.failing?.length > 0 && (
          <div style={{ background: 'white', padding: '8px 10px', borderRadius: '6px', border: '1px solid #fca5a5' }}>
            <div style={{ fontWeight: 600, color: '#991b1b', fontSize: '12px', marginBottom: '4px' }}>❌ No cumpliendo ({data.failing.length})</div>
            <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '12px', color: '#334155' }}>{data.failing.map((n, i) => <li key={i}>{n}</li>)}</ul>
          </div>
        )}
      </div>
      {data.recommendations?.length > 0 && (
        <div style={{ background: 'white', padding: '10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
          <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '12px', marginBottom: '4px' }}>💡 Recomendaciones</div>
          <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '12px', color: '#334155' }}>
            {data.recommendations.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}

// Mini sparkline
function Sparkline({ points, target, baseline }) {
  if (!points || points.length === 0) {
    return <p style={{ margin: 0, fontSize: '11px', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>Sin mediciones todavía</p>
  }
  const W = 280, H = 40, padX = 4, padY = 4
  const values = points.map(p => p.value)
  const maxRaw = Math.max(...values, target || 0, baseline || 0)
  const minRaw = Math.min(...values, 0, baseline || 0)
  const range = maxRaw - minRaw || 1
  const xs = points.map((_, i) => padX + (i * (W - 2 * padX)) / Math.max(points.length - 1, 1))
  const ys = points.map(p => H - padY - ((p.value - minRaw) / range) * (H - 2 * padY))
  const path = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ')
  const targetY = target > 0 ? H - padY - ((target - minRaw) / range) * (H - 2 * padY) : null
  const baselineY = (baseline > 0 || baseline === 0) ? H - padY - ((baseline - minRaw) / range) * (H - 2 * padY) : null
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block' }}>
        {baselineY !== null && <line x1={0} y1={baselineY} x2={W} y2={baselineY} stroke="#94a3b8" strokeDasharray="1 2" strokeWidth="1" />}
        {targetY !== null && <line x1={0} y1={targetY} x2={W} y2={targetY} stroke="#16a34a" strokeDasharray="2 2" strokeWidth="1" />}
        <path d={path} fill="none" stroke="#0891b2" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
        {xs.map((x, i) => <circle key={i} cx={x} cy={ys[i]} r={i === xs.length - 1 ? 2.5 : 1.5} fill="#0891b2" />)}
      </svg>
    </div>
  )
}

// ─────────────────── Primitivas ───────────────────
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
const linkBtn = { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: '#e0f2fe', color: '#075985', borderRadius: '999px', fontSize: '12px', textDecoration: 'none', fontWeight: 600 }
const th = { padding: '10px 8px', borderBottom: '1px solid #e2e8f0', fontSize: '11px', textTransform: 'uppercase', color: '#475569', fontWeight: 600 }
const td = { padding: '8px', verticalAlign: 'middle' }
const btn = (color) => ({
  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px',
  background: color, color: 'white', border: 'none', borderRadius: '6px', cursor: 'pointer',
  fontWeight: 600, fontSize: '13px'
})
const miniBtn = (color) => ({
  display: 'inline-flex', alignItems: 'center', gap: '3px', padding: '4px 7px', marginLeft: '4px',
  background: color, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
  fontSize: '11px', fontWeight: 600
})
const vbtn = (active) => ({
  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px',
  background: active ? '#0891b2' : 'transparent', color: active ? 'white' : '#475569',
  border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600
})
const badge = ({ bg, color }) => ({
  background: bg, color, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', gap: '3px'
})
