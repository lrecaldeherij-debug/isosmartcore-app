import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  AlertOctagon, Plus, Search, Filter, Eye, Pencil, Trash2, X,
  Sparkles, Loader2, CheckCircle2, AlertTriangle, Clock, Award,
  Target, FileText, Save, RefreshCw, TrendingUp, Link as LinkIcon,
  ExternalLink, DollarSign
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'
import { ChangeLogTimeline } from './components/ui'
import { useOrg } from './OrgContext'
import { exportNonConformity } from './exports/exportNonConformity'

const NC_FIELD_LABELS = {
  description: 'Descripción',
  source: 'Origen',
  nc_type: 'Tipo',
  severity: 'Severidad',
  status: 'Estado',
  process_id: 'Proceso',
  audit_id: 'Auditoría',
  risk_id: 'Riesgo',
  supplier_id: 'Proveedor',
  detection_date: 'Fecha detección',
  closure_date: 'Fecha cierre',
  immediate_correction: 'Corrección inmediata',
  root_cause: 'Causa raíz',
  corrective_action: 'Acción correctiva',
  responsible: 'Responsable',
  due_date: 'Fecha límite',
  effectiveness_result: 'Resultado eficacia',
  effectiveness_notes: 'Notas eficacia',
  cost_impact: 'Costo impacto',
  currency: 'Moneda',
  is_recurrent: 'Recurrente',
}

// ───────────────────── Constantes ──────────────────────
const SOURCE_OPTIONS = ['Auditoría Interna', 'Queja de Cliente', 'Fallo de Proceso', 'Proveedor', 'Riesgo Materializado', 'Revisión Dirección', 'Indicador KPI', 'Inspección QC']
const TYPE_OPTIONS = ['NC Mayor', 'NC Menor', 'Observación', 'Potencial']
const SEVERITY_OPTIONS = ['Crítica', 'Alta', 'Media', 'Baja']
const STATUS_OPTIONS = ['Identificada', 'En Análisis', 'Acción Definida', 'En Implementación', 'En Verificación', 'Cerrada', 'Reabierta']
const EFFECTIVENESS_OPTIONS = ['Pendiente', 'Eficaz', 'Eficaz Parcial', 'No Eficaz', 'N/A']

const TYPE_COLORS = {
  'NC Mayor':    { bg: '#fee2e2', color: '#991b1b' },
  'NC Menor':    { bg: '#fed7aa', color: '#9a3412' },
  'Observación': { bg: '#fef3c7', color: '#92400e' },
  'Potencial':   { bg: '#e0e7ff', color: '#3730a3' },
}
const SEVERITY_COLORS = {
  'Crítica': { bg: '#7f1d1d', color: 'white' },
  'Alta':    { bg: '#dc2626', color: 'white' },
  'Media':   { bg: '#f59e0b', color: 'white' },
  'Baja':    { bg: '#10b981', color: 'white' },
}
const STATUS_COLORS = {
  'Identificada':     { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  'En Análisis':      { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  'Acción Definida':  { bg: '#e0e7ff', color: '#3730a3', border: '#c7d2fe' },
  'En Implementación': { bg: '#cffafe', color: '#155e75', border: '#a5f3fc' },
  'En Verificación':  { bg: '#fce7f3', color: '#9f1239', border: '#fbcfe8' },
  'Cerrada':          { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  'Reabierta':        { bg: '#ffedd5', color: '#9a3412', border: '#fed7aa' },
}
const EFFECTIVENESS_COLORS = {
  'Pendiente':      { bg: '#fef3c7', color: '#92400e' },
  'Eficaz':         { bg: '#dcfce7', color: '#166534' },
  'Eficaz Parcial': { bg: '#fed7aa', color: '#9a3412' },
  'No Eficaz':      { bg: '#fee2e2', color: '#991b1b' },
  'N/A':            { bg: '#f3f4f6', color: '#6b7280' },
}

const EMPTY_5WHYS = [{ why: '', answer: '' }]

const EMPTY_FORM = {
  description: '',
  source: 'Auditoría Interna',
  type: 'NC Menor',
  severity: 'Media',
  status: 'Identificada',
  detection_date: new Date().toISOString().slice(0, 10),
  detected_by: '',
  due_date: '',
  closure_date: '',
  closed_by: '',
  process_id: '',
  audit_id: '',
  risk_id: '',
  supplier_id: '',
  customer_name: '',
  recurrent_of_id: '',
  is_recurrent: false,
  improvement_opportunity_id: '',
  five_whys: EMPTY_5WHYS,
  root_cause: '',
  correction: '',
  action_plan: '',
  responsible: '',
  cost_impact: '',
  currency: 'PYG',
  evidence_url: '',
  effectiveness_check_date: '',
  effectiveness_result: 'Pendiente',
  effectiveness_evaluator: '',
  effectiveness_notes: '',
}

// ───────────────────── Helpers IA ──────────────────────
function extractJsonAt(text, start) {
  if (start < 0 || start >= text.length) return null
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
function firstIndex(text, ch, from = 0) {
  const i = text.indexOf(ch, from)
  return i === -1 ? Infinity : i
}
function extractFirstJson(text, prefer) {
  if (!text) return null
  // Limpia fences markdown si vienen
  const cleaned = text.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '')
  let pos = 0
  while (pos < cleaned.length) {
    const iObj = firstIndex(cleaned, '{', pos)
    const iArr = firstIndex(cleaned, '[', pos)
    if (iObj === Infinity && iArr === Infinity) return null
    let start
    if (prefer === 'object') start = iObj === Infinity ? iArr : iObj
    else if (prefer === 'array') start = iArr === Infinity ? iObj : iArr
    else start = Math.min(iObj, iArr)
    const parsed = extractJsonAt(cleaned, start)
    if (parsed !== null) return parsed
    pos = start + 1
  }
  return null
}
function parseAiObject(raw) {
  const p = extractFirstJson(raw, 'object')
  if (p && typeof p === 'object' && !Array.isArray(p)) return p
  return null
}
function parseAiArray(raw) {
  const p = extractFirstJson(raw, 'array')
  if (Array.isArray(p)) return p
  if (p && Array.isArray(p.items)) return p.items
  if (p && Array.isArray(p.patterns)) return p.patterns
  return []
}

// ─────────────────────────────────────────────────────
export default function NonConformities({ datosPrellenados, alCambiarVista }) {
  const { org } = useOrg()
  const [items, setItems] = useState([])
  const [processes, setProcesses] = useState([])
  const [audits, setAudits] = useState([])
  const [risks, setRisks] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [opportunities, setOpportunities] = useState([])
  const [orgProfile, setOrgProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const [mostrandoForm, setMostrandoForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [originalForm, setOriginalForm] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  // Filtros
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('Todos')
  const [filterSeverity, setFilterSeverity] = useState('Todas')
  const [filterStatus, setFilterStatus] = useState('Todos')

  // Modales
  const [detailItem, setDetailItem] = useState(null)
  const [verifyItem, setVerifyItem] = useState(null)

  // IA
  const [loadingIA, setLoadingIA] = useState(false)
  const [iaContext, setIaContext] = useState(null) // 'rca' | 'pareto' | 'verify'
  const [iaPareto, setIaPareto] = useState(null)
  const [iaVerifyResult, setIaVerifyResult] = useState(null)

  // ───── Fetch ─────
  useEffect(() => { fetchAll() }, [])

  useEffect(() => {
    if (datosPrellenados) {
      setForm(prev => ({ ...EMPTY_FORM, ...datosPrellenados, status: 'Identificada' }))
      setMostrandoForm(true)
      setEditingId(null)
      setOriginalForm(null)
    }
  }, [datosPrellenados])

  const fetchAll = async () => {
    setLoading(true)
    const [nc, pr, au, rk, sp, op, cp] = await Promise.all([
      supabase.from('non_conformities').select('*').order('created_at', { ascending: false }),
      supabase.from('processes').select('id, name').order('name'),
      supabase.from('internal_audits').select('id, audit_date, audit_process, audit_scope').order('audit_date', { ascending: false }),
      supabase.from('risk_matrix').select('id, risk_description, process_area').order('created_at', { ascending: false }),
      supabase.from('suppliers').select('id, name').order('name'),
      supabase.from('improvement_opportunities').select('id, title').order('created_at', { ascending: false }),
      supabase.from('company_profile').select('*').maybeSingle(),
    ])
    setItems(nc.data || [])
    setProcesses(pr.data || [])
    setAudits(au.data || [])
    setRisks(rk.data || [])
    setSuppliers(sp.data || [])
    setOpportunities(op.data || [])
    setOrgProfile(cp.data || null)
    setLoading(false)
  }

  // ───── Computed ─────
  const processMap = useMemo(() => Object.fromEntries(processes.map(p => [p.id, p])), [processes])
  const auditMap = useMemo(() => Object.fromEntries(audits.map(a => [a.id, a])), [audits])
  const riskMap = useMemo(() => Object.fromEntries(risks.map(r => [r.id, r])), [risks])
  const supplierMap = useMemo(() => Object.fromEntries(suppliers.map(s => [s.id, s])), [suppliers])
  const ncMap = useMemo(() => Object.fromEntries(items.map(i => [i.id, i])), [items])
  const oppMap = useMemo(() => Object.fromEntries(opportunities.map(o => [o.id, o])), [opportunities])

  const stats = useMemo(() => {
    const total = items.length
    const abiertas = items.filter(i => !['Cerrada'].includes(i.status)).length
    const ncMayor = items.filter(i => i.type === 'NC Mayor').length
    const criticas = items.filter(i => i.severity === 'Crítica').length
    const today = new Date().toISOString().slice(0, 10)
    const vencidas = items.filter(i => i.due_date && i.due_date < today && i.status !== 'Cerrada').length
    const pendVerif = items.filter(i => i.effectiveness_result === 'Pendiente' && ['En Verificación', 'Cerrada'].includes(i.status)).length
    const recurrentes = items.filter(i => i.is_recurrent).length
    const thisMonth = today.slice(0, 7)
    const cerradasMes = items.filter(i => i.status === 'Cerrada' && i.closure_date?.startsWith(thisMonth)).length
    return { total, abiertas, ncMayor, criticas, vencidas, pendVerif, recurrentes, cerradasMes }
  }, [items])

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filterType !== 'Todos' && i.type !== filterType) return false
      if (filterSeverity !== 'Todas' && i.severity !== filterSeverity) return false
      if (filterStatus !== 'Todos' && i.status !== filterStatus) return false
      if (search) {
        const s = search.toLowerCase()
        const hay = `${i.description || ''} ${i.root_cause || ''} ${i.source || ''} ${i.responsible || ''}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [items, filterType, filterSeverity, filterStatus, search])

  // ───── Helpers ─────
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

  const isOverdue = (item) => item.due_date && item.due_date < new Date().toISOString().slice(0, 10) && item.status !== 'Cerrada'

  // ───── CRUD ─────
  const openNew = () => {
    setForm({ ...EMPTY_FORM, detection_date: new Date().toISOString().slice(0, 10) })
    setEditingId(null)
    setOriginalForm(null)
    setMostrandoForm(true)
  }

  const openEdit = (item) => {
    const f = {
      ...EMPTY_FORM,
      ...item,
      five_whys: Array.isArray(item.five_whys) && item.five_whys.length ? item.five_whys : EMPTY_5WHYS,
      process_id: item.process_id || '',
      audit_id: item.audit_id || '',
      risk_id: item.risk_id || '',
      supplier_id: item.supplier_id || '',
      recurrent_of_id: item.recurrent_of_id || '',
      improvement_opportunity_id: item.improvement_opportunity_id || '',
      cost_impact: item.cost_impact ?? '',
      detection_date: item.detection_date || '',
      due_date: item.due_date || '',
      closure_date: item.closure_date || '',
      effectiveness_check_date: item.effectiveness_check_date || '',
      is_recurrent: !!item.is_recurrent,
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
      process_id: form.process_id || null,
      audit_id: form.audit_id || null,
      risk_id: form.risk_id || null,
      supplier_id: form.supplier_id || null,
      recurrent_of_id: form.recurrent_of_id || null,
      improvement_opportunity_id: form.improvement_opportunity_id || null,
      cost_impact: form.cost_impact === '' ? null : Number(form.cost_impact),
      detection_date: form.detection_date || null,
      due_date: form.due_date || null,
      closure_date: form.closure_date || null,
      effectiveness_check_date: form.effectiveness_check_date || null,
      five_whys: form.five_whys.filter(w => w.why || w.answer),
      is_recurrent: !!form.is_recurrent || !!form.recurrent_of_id,
    }

    if (editingId) {
      const changes = diffChanges(originalForm, form)
      if (changes.length) {
        const entry = { at: new Date().toISOString(), changes }
        payload.change_log = [...(originalForm?.change_log || []), entry]
      }
      const { error } = await supabase.from('non_conformities').update(payload).eq('id', editingId)
      if (error) { toast.error(error.message); return }
      toast.success('NC actualizada')
    } else {
      payload.change_log = [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: form.description?.slice(0, 80) }] }]
      const { error } = await supabase.from('non_conformities').insert([payload])
      if (error) { toast.error(error.message); return }
      toast.success('NC registrada')
    }

    setMostrandoForm(false)
    setForm(EMPTY_FORM)
    setEditingId(null)
    setOriginalForm(null)
    fetchAll()
  }

  const handleDelete = async (id) => {
    if (!await confirm('¿Eliminar esta no conformidad?', { tone: 'danger', confirmText: 'Eliminar' })) return
    const { error } = await supabase.from('non_conformities').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('NC eliminada')
    fetchAll()
  }

  const exportarNCPdf = async (item) => {
    const t = toast.loading('Generando PDF…')
    try {
      const doc = await exportNonConformity(org, item.id)
      doc.save(`NC-${(item.id || '').slice(0, 8).toUpperCase()}.pdf`)
      toast.done(t, 'PDF descargado')
    } catch (err) {
      toast.fail(t, 'Error generando PDF: ' + err.message)
    }
  }

  const handleQuickStatus = async (item, newStatus) => {
    const patch = { status: newStatus }
    if (newStatus === 'Cerrada' && !item.closure_date) patch.closure_date = new Date().toISOString().slice(0, 10)
    const entry = { at: new Date().toISOString(), changes: [{ field: 'status', from: item.status, to: newStatus }] }
    patch.change_log = [...(item.change_log || []), entry]
    await supabase.from('non_conformities').update(patch).eq('id', item.id)
    fetchAll()
  }

  // ───── 5 Porqués ─────
  const addWhy = () => setForm(prev => ({ ...prev, five_whys: [...prev.five_whys, { why: '', answer: '' }] }))
  const removeWhy = (i) => setForm(prev => ({ ...prev, five_whys: prev.five_whys.filter((_, idx) => idx !== i) }))
  const setWhy = (i, key, val) => setForm(prev => ({
    ...prev,
    five_whys: prev.five_whys.map((w, idx) => idx === i ? { ...w, [key]: val } : w)
  }))

  // ───── IA: Causa raíz + 5 Porqués ─────
  const analizarCausaRaizIA = async () => {
    if (!form.description) return toast.warning('Describe el problema antes de pedir análisis')
    setLoadingIA(true); setIaContext('rca')
    try {
      const procName = form.process_id ? processMap[form.process_id]?.name : ''
      const prompt = `Eres auditor líder ISO 9001 experto en análisis de causa raíz. Aplica la técnica de los 5 Porqués al siguiente hallazgo y propón corrección + acción correctiva.

HALLAZGO: "${form.description}"
ORIGEN: ${form.source}
PROCESO IMPLICADO: ${procName || 'no especificado'}
TIPO: ${form.type} (${form.severity})

Devuelve SOLO un JSON objeto, sin markdown:
- five_whys (array de exactamente 5 objetos {why: "¿Por qué...?", answer: "respuesta"} encadenados — cada answer alimenta el siguiente why)
- root_cause (string, causa raíz final consolidada)
- correction (string, corrección INMEDIATA — qué hacer YA para contener el problema, no la solución de fondo)
- action_plan (string, acción CORRECTIVA — qué hacer para que NUNCA MÁS ocurra eliminando la causa raíz)
- responsible_role (string, qué rol/cargo debería liderar la acción)`

      const raw = await consultarIA(prompt, 'Devuelve ÚNICAMENTE JSON objeto válido.')
      console.log('[IA RCA] raw:', raw)
      const obj = parseAiObject(raw)
      if (!obj) throw new Error('La IA no devolvió un análisis parseable')

      setForm(prev => ({
        ...prev,
        five_whys: Array.isArray(obj.five_whys) && obj.five_whys.length ? obj.five_whys : prev.five_whys,
        root_cause: obj.root_cause || prev.root_cause,
        correction: obj.correction || prev.correction,
        action_plan: obj.action_plan || prev.action_plan,
        responsible: prev.responsible || obj.responsible_role || '',
      }))
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    }
    setLoadingIA(false)
  }

  // ───── IA: Análisis Pareto global ─────
  const analizarParetoIA = async () => {
    if (items.length < 5) return toast.warning('Necesitas al menos 5 NCs registradas para detectar patrones')
    setLoadingIA(true); setIaPareto(null); setIaContext('pareto')
    try {
      const ctx = items.slice(0, 50).map(n => ({
        descripcion: (n.description || '').slice(0, 150),
        causa_raiz: (n.root_cause || '').slice(0, 120),
        origen: n.source,
        tipo: n.type,
        severidad: n.severity,
        proceso: n.process_id ? processMap[n.process_id]?.name : null,
        recurrente: !!n.is_recurrent,
      }))
      const prompt = `Eres consultor ISO 9001. Analiza estas no conformidades, haz análisis de PARETO (regla 80/20) e identifica las 3-5 CAUSAS RECURRENTES que generan el mayor volumen de problemas según ISO 10.2.

NC REGISTRADAS:
${JSON.stringify(ctx, null, 2)}

Devuelve SOLO un JSON array (3 a 5 items), sin markdown. Cada patrón:
- pattern (string, nombre corto del patrón / causa recurrente)
- count_estimated (number, NCs aproximadas que caen en este patrón)
- processes_affected (array de strings, procesos involucrados)
- root_cause_systemic (string, causa raíz sistémica común)
- proposed_improvement (string, oportunidad de mejora SISTÉMICA, no parche)
- priority (Alta | Media | Baja)
- expected_benefit (string, qué se logra eliminando esta causa)`

      const raw = await consultarIA(prompt, 'Devuelve ÚNICAMENTE JSON array válido.')
      console.log('[IA Pareto] raw:', raw)
      const arr = parseAiArray(raw)
      if (!arr.length) throw new Error('La IA no devolvió patrones parseables')
      setIaPareto(arr)
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    }
    setLoadingIA(false)
  }

  const convertPatternToOpportunity = async (p) => {
    const row = {
      title: p.pattern || 'Mejora sistémica desde Pareto',
      description: p.root_cause_systemic || '',
      source: 'Análisis NCs',
      area: (p.processes_affected || []).join(', '),
      expected_benefit: p.expected_benefit || '',
      priority: ['Alta', 'Media', 'Baja'].includes(p.priority) ? p.priority : 'Media',
      status: 'Identificada',
      proposed_by: 'IA Pareto NCs',
      proposed_at: new Date().toISOString().slice(0, 10),
      change_log: [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: 'IA Pareto NCs' }] }]
    }
    const { error } = await supabase.from('improvement_opportunities').insert([row])
    if (error) { toast.error(error.message); return }
    toast.success('Oportunidad creada en módulo Mejora Continua')
    fetchAll()
  }

  // ───── Convertir una NC a oportunidad de mejora ─────
  const convertirNCaMejora = async (item) => {
    if (!await confirm('¿Crear oportunidad de mejora desde esta NC?', { title: 'Convertir a mejora' })) return
    const row = {
      title: `Mejora sistémica: ${(item.description || '').slice(0, 80)}`,
      description: item.root_cause || item.description,
      source: 'Análisis NCs',
      area: item.process_id ? processMap[item.process_id]?.name : '',
      expected_benefit: 'Eliminar la causa raíz para prevenir recurrencia',
      priority: item.type === 'NC Mayor' || item.severity === 'Crítica' ? 'Alta' : 'Media',
      status: 'Identificada',
      proposed_by: 'Conversión NC',
      proposed_at: new Date().toISOString().slice(0, 10),
      nc_id: item.id,
      process_id: item.process_id || null,
      change_log: [{ at: new Date().toISOString(), changes: [{ field: 'created', from: 'NC', to: item.id }] }]
    }
    const { data, error } = await supabase.from('improvement_opportunities').insert([row]).select('id').single()
    if (error) { toast.error(error.message); return }
    await supabase.from('non_conformities').update({ improvement_opportunity_id: data.id }).eq('id', item.id)
    toast.success('Oportunidad de mejora creada y vinculada')
    fetchAll()
  }

  // ───── Verificación de eficacia ─────
  const openVerify = (item) => {
    setVerifyItem({
      ...item,
      effectiveness_check_date: item.effectiveness_check_date || new Date().toISOString().slice(0, 10),
      effectiveness_result: item.effectiveness_result || 'Pendiente',
      effectiveness_evaluator: item.effectiveness_evaluator || '',
      effectiveness_notes: item.effectiveness_notes || '',
    })
    setIaVerifyResult(null)
  }

  const saveVerify = async () => {
    if (!verifyItem) return
    const patch = {
      effectiveness_check_date: verifyItem.effectiveness_check_date || null,
      effectiveness_result: verifyItem.effectiveness_result,
      effectiveness_evaluator: verifyItem.effectiveness_evaluator,
      effectiveness_notes: verifyItem.effectiveness_notes,
    }
    if (verifyItem.effectiveness_result === 'Eficaz' && verifyItem.status !== 'Cerrada') {
      patch.status = 'Cerrada'
      if (!verifyItem.closure_date) patch.closure_date = new Date().toISOString().slice(0, 10)
    }
    if (verifyItem.effectiveness_result === 'No Eficaz' && verifyItem.status === 'Cerrada') {
      patch.status = 'Reabierta'
    }
    const entry = { at: new Date().toISOString(), changes: [{ field: 'effectiveness_verified', from: null, to: verifyItem.effectiveness_result }] }
    patch.change_log = [...(verifyItem.change_log || []), entry]
    const { error } = await supabase.from('non_conformities').update(patch).eq('id', verifyItem.id)
    if (error) { toast.error(error.message); return }
    toast.success('Verificación de eficacia registrada')
    setVerifyItem(null)
    setIaVerifyResult(null)
    fetchAll()
  }

  const verificarEficaciaIA = async () => {
    if (!verifyItem) return
    setLoadingIA(true); setIaContext('verify'); setIaVerifyResult(null)
    try {
      const otrasNCs = items.filter(n => n.id !== verifyItem.id && n.process_id === verifyItem.process_id).slice(0, 20).map(n => ({
        descripcion: (n.description || '').slice(0, 120),
        fecha: n.created_at,
        causa_raiz: (n.root_cause || '').slice(0, 100),
      }))
      const prompt = `Eres auditor interno ISO 9001. Evalúa la EFICACIA de la acción correctiva tomada en esta NC según cláusula 10.2.1 f).

NC EN VERIFICACIÓN:
- Descripción: ${verifyItem.description}
- Causa raíz: ${verifyItem.root_cause || '—'}
- Corrección inmediata: ${verifyItem.correction || '—'}
- Acción correctiva: ${verifyItem.action_plan || '—'}
- Fecha cierre: ${verifyItem.closure_date || '—'}
- Proceso: ${verifyItem.process_id ? processMap[verifyItem.process_id]?.name : '—'}

OTRAS NC DEL MISMO PROCESO (para detectar reincidencia):
${JSON.stringify(otrasNCs, null, 2)}

Devuelve SOLO un JSON objeto, sin markdown:
- recommended_result (Eficaz | Eficaz Parcial | No Eficaz)
- justification (string, razonamiento basado en reincidencia / ausencia de NCs similares)
- followup_actions (array de strings, qué seguir monitoreando)
- next_check_date (string YYYY-MM-DD, fecha sugerida próxima verificación)`

      const raw = await consultarIA(prompt, 'Devuelve ÚNICAMENTE JSON objeto válido.')
      const obj = parseAiObject(raw)
      if (!obj) throw new Error('La IA no devolvió análisis parseable')
      setIaVerifyResult(obj)
      setVerifyItem(prev => ({
        ...prev,
        effectiveness_result: EFFECTIVENESS_OPTIONS.includes(obj.recommended_result) ? obj.recommended_result : prev.effectiveness_result,
        effectiveness_notes: obj.justification || prev.effectiveness_notes,
        effectiveness_check_date: obj.next_check_date || prev.effectiveness_check_date,
      }))
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    }
    setLoadingIA(false)
  }

  // ───────────────────── UI ──────────────────────
  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }} className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <AlertOctagon size={28} color="#dc2626" /> Gestión de No Conformidades
          </h2>
          <p style={{ color: '#64748b', margin: '5px 0 0 0', fontSize: '14px' }}>
            ISO 9001 — 10.2 Tratamiento de hallazgos, causa raíz, acción correctiva y verificación de eficacia.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button onClick={analizarParetoIA} disabled={loadingIA} style={btn('#7c3aed')}>
            {loadingIA && iaContext === 'pareto' ? <Loader2 size={16} className="spin" /> : <TrendingUp size={16} />}
            IA Pareto (patrones)
          </button>
          <button onClick={openNew} style={btn('#dc2626')}><Plus size={16} /> Reportar NC</button>
        </div>
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['10.2']} />

      {/* Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <Kpi label="Total" value={stats.total} icon={<AlertOctagon size={16} />} color="#dc2626" />
        <Kpi label="Abiertas" value={stats.abiertas} icon={<Clock size={16} />} color="#b45309" />
        <Kpi label="NC Mayor" value={stats.ncMayor} icon={<AlertTriangle size={16} />} color="#991b1b" />
        <Kpi label="Críticas" value={stats.criticas} icon={<AlertTriangle size={16} />} color="#7f1d1d" />
        <Kpi label="Vencidas" value={stats.vencidas} icon={<Clock size={16} />} color="#dc2626" />
        <Kpi label="Pend. verif." value={stats.pendVerif} icon={<Award size={16} />} color="#92400e" />
        <Kpi label="Recurrentes" value={stats.recurrentes} icon={<RefreshCw size={16} />} color="#9a3412" />
        <Kpi label="Cerradas mes" value={stats.cerradasMes} icon={<CheckCircle2 size={16} />} color="#166534" />
      </div>

      {/* Panel IA Pareto */}
      {iaPareto && (
        <ParetoPanel
          patterns={iaPareto}
          onConvert={convertPatternToOpportunity}
          onClose={() => { setIaPareto(null); setIaContext(null) }}
        />
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            placeholder="Buscar descripción, causa, responsable…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 8px 8px 32px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
          />
        </div>
        <select value={filterType} onChange={e => setFilterType(e.target.value)} style={selectStyle}>
          <option value="Todos">Todos los tipos</option>
          {TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
        </select>
        <select value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)} style={selectStyle}>
          <option value="Todas">Toda severidad</option>
          {SEVERITY_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="Todos">Todos los estados</option>
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
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
          audits={audits}
          risks={risks}
          suppliers={suppliers}
          opportunities={opportunities}
          ncList={items.filter(n => n.id !== editingId)}
          loadingIA={loadingIA && iaContext === 'rca'}
          onIA={analizarCausaRaizIA}
          addWhy={addWhy}
          removeWhy={removeWhy}
          setWhy={setWhy}
          onSubmit={handleSubmit}
          onCancel={() => { setMostrandoForm(false); setEditingId(null); setForm(EMPTY_FORM) }}
        />
      )}

      {/* Lista */}
      {loading ? (
        <p style={{ color: '#64748b' }}>Cargando…</p>
      ) : filtered.length === 0 ? (
        <div style={emptyState}>
          <AlertOctagon size={40} color="#cbd5e1" />
          <p style={{ color: '#64748b', marginTop: '8px' }}>Sin no conformidades que coincidan con los filtros.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: '14px' }}>
          {filtered.map(item => (
            <NCCard
              key={item.id}
              item={item}
              processMap={processMap}
              overdue={isOverdue(item)}
              onDetail={() => setDetailItem(item)}
              onEdit={() => openEdit(item)}
              onVerify={() => openVerify(item)}
              onConvert={() => convertirNCaMejora(item)}
              onDelete={() => handleDelete(item.id)}
              onQuickStatus={(st) => handleQuickStatus(item, st)}
            />
          ))}
        </div>
      )}

      {/* Modal Detalle */}
      {detailItem && (
        <DetailModal
          item={detailItem}
          processMap={processMap}
          auditMap={auditMap}
          riskMap={riskMap}
          supplierMap={supplierMap}
          ncMap={ncMap}
          oppMap={oppMap}
          onClose={() => setDetailItem(null)}
          onEdit={() => { setDetailItem(null); openEdit(detailItem) }}
          onVerify={() => { setDetailItem(null); openVerify(detailItem) }}
          onConvert={() => { setDetailItem(null); convertirNCaMejora(detailItem) }}
          onExportPdf={() => exportarNCPdf(detailItem)}
        />
      )}

      {/* Modal Verificación */}
      {verifyItem && (
        <VerifyModal
          item={verifyItem}
          setItem={setVerifyItem}
          onClose={() => { setVerifyItem(null); setIaVerifyResult(null) }}
          onSave={saveVerify}
          onIA={verificarEficaciaIA}
          loadingIA={loadingIA && iaContext === 'verify'}
          iaResult={iaVerifyResult}
        />
      )}
    </div>
  )
}

// ─────────────────── Subcomponentes ───────────────────

function Kpi({ label, value, icon, color }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color, marginBottom: '4px' }}>
        {icon}
        <span style={{ fontSize: '11px', fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: '#1e293b' }}>{value}</div>
    </div>
  )
}

function NCCard({ item, processMap, overdue, onDetail, onEdit, onVerify, onConvert, onDelete, onQuickStatus }) {
  const typeC = TYPE_COLORS[item.type] || TYPE_COLORS['NC Menor']
  const sevC = SEVERITY_COLORS[item.severity] || SEVERITY_COLORS['Media']
  const stC = STATUS_COLORS[item.status] || STATUS_COLORS['Identificada']
  const pendVerif = item.effectiveness_result === 'Pendiente' && ['En Verificación', 'Cerrada'].includes(item.status)

  return (
    <div style={{
      background: 'white', border: '1px solid ' + (overdue ? '#fca5a5' : '#e2e8f0'),
      borderRadius: '10px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px',
      borderLeft: '4px solid ' + (item.status === 'Cerrada' ? '#22c55e' : (overdue ? '#dc2626' : '#f59e0b')),
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
    }}>
      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        <span style={badge(typeC)}>{item.type}</span>
        <span style={badge(sevC)}>{item.severity}</span>
        <span style={{ ...badge(stC), border: '1px solid ' + stC.border }}>{item.status}</span>
        {item.is_recurrent && <span style={badge({ bg: '#fbcfe8', color: '#9f1239' })}><RefreshCw size={10} /> Recurrente</span>}
        {overdue && <span style={badge({ bg: '#7f1d1d', color: 'white' })}>⚠ Vencida</span>}
      </div>

      <h3 style={{ margin: '4px 0', fontSize: '14px', color: '#1e293b', lineHeight: 1.4 }}>{item.description}</h3>

      <div style={{ fontSize: '12px', color: '#64748b' }}>
        <strong>{item.source}</strong>
        {item.process_id && <> · ⚙ {processMap[item.process_id]?.name}</>}
        {item.detection_date && <> · 📅 {new Date(item.detection_date).toLocaleDateString()}</>}
      </div>

      {item.due_date && (
        <div style={{ fontSize: '12px', color: overdue ? '#dc2626' : '#64748b' }}>
          🎯 Vence: {new Date(item.due_date).toLocaleDateString()}
        </div>
      )}

      {pendVerif && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '5px 8px', borderRadius: '6px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
          <Award size={12} /> Verificación de eficacia pendiente
        </div>
      )}

      <div style={{ display: 'flex', gap: '5px', marginTop: 'auto', flexWrap: 'wrap' }}>
        <button onClick={onDetail} style={miniBtn('#0ea5e9')}><Eye size={11} /> Detalle</button>
        {item.status !== 'Cerrada' && <button onClick={() => onQuickStatus('Cerrada')} style={miniBtn('#16a34a')}><CheckCircle2 size={11} /> Cerrar</button>}
        {item.status === 'Cerrada' && <button onClick={onVerify} style={miniBtn('#9f1239')}><Award size={11} /> Verificar</button>}
        <button onClick={onEdit} style={miniBtn('#6366f1')}><Pencil size={11} /></button>
        {!item.improvement_opportunity_id && <button onClick={onConvert} style={miniBtn('#7c3aed')} title="Convertir a oportunidad de mejora"><TrendingUp size={11} /></button>}
        <button onClick={onDelete} style={miniBtn('#dc2626')}><Trash2 size={11} /></button>
      </div>
    </div>
  )
}

function FormCard({ form, setForm, editing, processes, audits, risks, suppliers, opportunities, ncList, loadingIA, onIA, addWhy, removeWhy, setWhy, onSubmit, onCancel }) {
  const set = (patch) => setForm(prev => ({ ...prev, ...patch }))
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
      <h3 style={{ marginTop: 0, color: '#991b1b' }}>{editing ? '✏️ Editar No Conformidad' : '+ Reportar No Conformidad'}</h3>
      <form onSubmit={onSubmit}>
        {/* 1. Identificación */}
        <Section title="1. Identificación">
          <Field label="Descripción del hallazgo *">
            <textarea required rows={3} value={form.description} onChange={e => set({ description: e.target.value })} style={inputStyle} placeholder="¿Qué ocurrió? Sé específico, factual, sin opiniones." />
          </Field>
          <Row>
            <Field label="Tipo">
              <select value={form.type} onChange={e => set({ type: e.target.value })} style={inputStyle}>
                {TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Severidad">
              <select value={form.severity} onChange={e => set({ severity: e.target.value })} style={inputStyle}>
                {SEVERITY_OPTIONS.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Origen">
              <select value={form.source} onChange={e => set({ source: e.target.value })} style={inputStyle}>
                {SOURCE_OPTIONS.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Estado">
              <select value={form.status} onChange={e => set({ status: e.target.value })} style={inputStyle}>
                {STATUS_OPTIONS.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="Fecha detección">
              <input type="date" value={form.detection_date || ''} onChange={e => set({ detection_date: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Detectado por">
              <input value={form.detected_by} onChange={e => set({ detected_by: e.target.value })} style={inputStyle} placeholder="Nombre / rol" />
            </Field>
            <Field label="Fecha límite cierre">
              <input type="date" value={form.due_date || ''} onChange={e => set({ due_date: e.target.value })} style={inputStyle} />
            </Field>
          </Row>
        </Section>

        {/* 2. Vínculos */}
        <Section title="2. Vínculos cruzados (opcional)">
          <Row>
            <Field label="Proceso">
              <select value={form.process_id} onChange={e => set({ process_id: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {processes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Auditoría origen">
              <select value={form.audit_id} onChange={e => set({ audit_id: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {audits.map(a => <option key={a.id} value={a.id}>{a.audit_date ? new Date(a.audit_date).toLocaleDateString() : ''} · {a.audit_process || a.audit_scope || a.id.slice(0, 6)}</option>)}
              </select>
            </Field>
            <Field label="Riesgo materializado">
              <select value={form.risk_id} onChange={e => set({ risk_id: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {risks.map(r => <option key={r.id} value={r.id}>{(r.risk_description || '').slice(0, 60)}</option>)}
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="Proveedor">
              <select value={form.supplier_id} onChange={e => set({ supplier_id: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
            <Field label="Cliente (nombre)">
              <input value={form.customer_name} onChange={e => set({ customer_name: e.target.value })} style={inputStyle} placeholder="Nombre del cliente afectado" />
            </Field>
            <Field label="NC anterior (si es recurrente)">
              <select value={form.recurrent_of_id} onChange={e => set({ recurrent_of_id: e.target.value, is_recurrent: !!e.target.value })} style={inputStyle}>
                <option value="">—</option>
                {ncList.slice(0, 50).map(n => <option key={n.id} value={n.id}>{(n.description || '').slice(0, 60)}</option>)}
              </select>
            </Field>
          </Row>
        </Section>

        {/* 3. Análisis Causa Raíz */}
        <Section title="3. Análisis de Causa Raíz (5 Porqués)">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px' }}>
            <button type="button" onClick={onIA} disabled={loadingIA} style={btn('#7c3aed')}>
              {loadingIA ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
              IA: causa raíz + 5 porqués + acción
            </button>
          </div>
          {form.five_whys.map((w, i) => (
            <Row key={i}>
              <Field label={`¿Por qué? #${i + 1}`}>
                <input value={w.why} onChange={e => setWhy(i, 'why', e.target.value)} style={inputStyle} placeholder="Pregunta" />
              </Field>
              <Field label="Respuesta" flex={2}>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input value={w.answer} onChange={e => setWhy(i, 'answer', e.target.value)} style={inputStyle} placeholder="…" />
                  {form.five_whys.length > 1 && (
                    <button type="button" onClick={() => removeWhy(i)} style={{ ...miniBtn('#dc2626'), padding: '6px 8px' }}><X size={12} /></button>
                  )}
                </div>
              </Field>
            </Row>
          ))}
          <button type="button" onClick={addWhy} style={{ ...miniBtn('#6366f1'), marginTop: '4px' }}><Plus size={11} /> Agregar porqué</button>
          <Field label="Causa raíz consolidada">
            <textarea rows={2} value={form.root_cause} onChange={e => set({ root_cause: e.target.value })} style={inputStyle} placeholder="Conclusión del análisis" />
          </Field>
        </Section>

        {/* 4. Tratamiento */}
        <Section title="4. Tratamiento (corrección + acción correctiva)">
          <Row>
            <Field label="🚨 Corrección inmediata (contener YA)">
              <textarea rows={3} value={form.correction} onChange={e => set({ correction: e.target.value })} style={inputStyle} placeholder="Qué hacer ahora para contener el problema (separar producto, parar línea, notificar cliente…)" />
            </Field>
            <Field label="🛡️ Acción correctiva (eliminar causa raíz)">
              <textarea rows={3} value={form.action_plan} onChange={e => set({ action_plan: e.target.value })} style={inputStyle} placeholder="Qué hacer para que NUNCA MÁS ocurra (cambio de procedimiento, capacitación, control nuevo…)" />
            </Field>
          </Row>
          <Row>
            <Field label="Responsable">
              <input value={form.responsible} onChange={e => set({ responsible: e.target.value })} style={inputStyle} placeholder="Quién implementa la acción" />
            </Field>
            <Field label="Costo de impacto estimado">
              <input type="number" min="0" value={form.cost_impact} onChange={e => set({ cost_impact: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Moneda">
              <select value={form.currency} onChange={e => set({ currency: e.target.value })} style={inputStyle}>
                <option>PYG</option><option>USD</option><option>EUR</option><option>BRL</option>
              </select>
            </Field>
            <Field label="URL evidencia">
              <input value={form.evidence_url} onChange={e => set({ evidence_url: e.target.value })} style={inputStyle} placeholder="https://…" />
            </Field>
          </Row>
        </Section>

        {/* 5. Verificación eficacia */}
        <Section title="5. Verificación de eficacia (post-cierre)">
          <Row>
            <Field label="Fecha verificación">
              <input type="date" value={form.effectiveness_check_date || ''} onChange={e => set({ effectiveness_check_date: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Resultado">
              <select value={form.effectiveness_result} onChange={e => set({ effectiveness_result: e.target.value })} style={inputStyle}>
                {EFFECTIVENESS_OPTIONS.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Evaluador">
              <input value={form.effectiveness_evaluator} onChange={e => set({ effectiveness_evaluator: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Fecha cierre">
              <input type="date" value={form.closure_date || ''} onChange={e => set({ closure_date: e.target.value })} style={inputStyle} />
            </Field>
          </Row>
          <Field label="Notas de verificación">
            <textarea rows={2} value={form.effectiveness_notes} onChange={e => set({ effectiveness_notes: e.target.value })} style={inputStyle} />
          </Field>
        </Section>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button type="submit" style={btn('#16a34a')}><Save size={16} /> {editing ? 'Guardar cambios' : 'Crear NC'}</button>
          <button type="button" onClick={onCancel} style={btn('#6b7280')}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}

function DetailModal({ item, processMap, auditMap, riskMap, supplierMap, ncMap, oppMap, onClose, onEdit, onVerify, onConvert, onExportPdf }) {
  const audit = item.audit_id ? auditMap[item.audit_id] : null
  const risk = item.risk_id ? riskMap[item.risk_id] : null
  const supplier = item.supplier_id ? supplierMap[item.supplier_id] : null
  const prevNc = item.recurrent_of_id ? ncMap[item.recurrent_of_id] : null
  const opp = item.improvement_opportunity_id ? oppMap[item.improvement_opportunity_id] : null

  return createPortal(
    <Backdrop onClose={onClose}>
      <Modal>
        <ModalHeader title={item.description?.slice(0, 80)} onClose={onClose}>
          <span style={badge(TYPE_COLORS[item.type] || TYPE_COLORS['NC Menor'])}>{item.type}</span>
          <span style={badge(SEVERITY_COLORS[item.severity] || SEVERITY_COLORS['Media'])}>{item.severity}</span>
          <span style={badge(STATUS_COLORS[item.status] || STATUS_COLORS['Identificada'])}>{item.status}</span>
        </ModalHeader>

        <ModalSection title="📋 Identificación">
          <D label="Descripción" block>{item.description}</D>
          <DetailGrid>
            <D label="Origen">{item.source || '—'}</D>
            <D label="Detección">{item.detection_date ? new Date(item.detection_date).toLocaleDateString() : '—'}</D>
            <D label="Detectado por">{item.detected_by || '—'}</D>
            <D label="Fecha límite">{item.due_date ? new Date(item.due_date).toLocaleDateString() : '—'}</D>
            <D label="Costo impacto">{item.cost_impact ? new Intl.NumberFormat('es-PY').format(item.cost_impact) + ' ' + (item.currency || '') : '—'}</D>
          </DetailGrid>
        </ModalSection>

        <ModalSection title="🔗 Vínculos">
          <DetailGrid>
            {item.process_id && <D label="Proceso">{processMap[item.process_id]?.name || '—'}</D>}
            {audit && <D label="Auditoría">{audit.audit_date ? new Date(audit.audit_date).toLocaleDateString() : ''} · {audit.audit_process || '—'}</D>}
            {risk && <D label="Riesgo">{(risk.risk_description || '').slice(0, 80)}</D>}
            {supplier && <D label="Proveedor">{supplier.name}</D>}
            {item.customer_name && <D label="Cliente">{item.customer_name}</D>}
            {prevNc && <D label="Recurrente de">{(prevNc.description || '').slice(0, 80)}</D>}
            {opp && <D label="Oportunidad de mejora">{opp.title}</D>}
          </DetailGrid>
          {!item.process_id && !audit && !risk && !supplier && !item.customer_name && !prevNc && !opp && (
            <p style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>Sin vínculos cruzados.</p>
          )}
        </ModalSection>

        <ModalSection title="🔍 Análisis causa raíz (5 Porqués)">
          {Array.isArray(item.five_whys) && item.five_whys.length > 0 ? (
            <ol style={{ margin: 0, padding: '0 0 0 20px', fontSize: '13px', color: '#334155' }}>
              {item.five_whys.map((w, i) => (
                <li key={i} style={{ marginBottom: '4px' }}>
                  <strong>{w.why}</strong> → {w.answer}
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>Sin 5 porqués estructurado.</p>
          )}
          <D label="Causa raíz consolidada" block>{item.root_cause || '—'}</D>
        </ModalSection>

        <ModalSection title="🛡️ Tratamiento">
          <D label="🚨 Corrección inmediata" block>{item.correction || '—'}</D>
          <D label="🛡️ Acción correctiva" block>{item.action_plan || '—'}</D>
          <DetailGrid>
            <D label="Responsable">{item.responsible || '—'}</D>
            <D label="Cierre">{item.closure_date ? new Date(item.closure_date).toLocaleDateString() : '—'}</D>
            <D label="Cerrado por">{item.closed_by || '—'}</D>
          </DetailGrid>
          {item.evidence_url && (
            <a href={item.evidence_url} target="_blank" rel="noreferrer" style={linkBtn}>
              <FileText size={12} /> Evidencia <ExternalLink size={10} />
            </a>
          )}
        </ModalSection>

        <ModalSection title="🏆 Verificación de eficacia">
          <DetailGrid>
            <D label="Resultado">{item.effectiveness_result || 'Pendiente'}</D>
            <D label="Fecha verif.">{item.effectiveness_check_date ? new Date(item.effectiveness_check_date).toLocaleDateString() : '—'}</D>
            <D label="Evaluador">{item.effectiveness_evaluator || '—'}</D>
          </DetailGrid>
          <D label="Notas" block>{item.effectiveness_notes || '—'}</D>
        </ModalSection>

        <ModalSection title="🕓 Historial de cambios">
          <ChangeLogTimeline
            entries={item.change_log || []}
            fieldLabels={NC_FIELD_LABELS}
            max={5}
          />
        </ModalSection>

        <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button onClick={onExportPdf} style={btn('#0891b2')}><FileText size={16} /> Exportar PDF</button>
          <button onClick={onVerify} style={btn('#9f1239')}><Award size={16} /> Verificar eficacia</button>
          {!opp && <button onClick={onConvert} style={btn('#7c3aed')}><TrendingUp size={16} /> Convertir a mejora</button>}
          <button onClick={onEdit} style={btn('#6366f1')}><Pencil size={16} /> Editar</button>
          <button onClick={onClose} style={btn('#6b7280')}>Cerrar</button>
        </div>
      </Modal>
    </Backdrop>,
    document.body
  )
}

function VerifyModal({ item, setItem, onClose, onSave, onIA, loadingIA, iaResult }) {
  const set = (patch) => setItem(prev => ({ ...prev, ...patch }))
  return createPortal(
    <Backdrop onClose={onClose}>
      <Modal>
        <ModalHeader title={`🏆 Verificación · ${(item.description || '').slice(0, 60)}`} onClose={onClose} />
        <div style={{ padding: '14px 16px' }}>
          <button onClick={onIA} disabled={loadingIA} style={{ ...btn('#7c3aed'), marginBottom: '12px' }}>
            {loadingIA ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />} IA: analizar eficacia (busca reincidencias)
          </button>

          {iaResult && (
            <div style={{ background: '#f3e8ff', border: '1px solid #d8b4fe', borderRadius: '8px', padding: '10px', marginBottom: '12px', fontSize: '12px' }}>
              <div style={{ fontWeight: 600, color: '#6b21a8', marginBottom: '4px' }}>Sugerencia IA aplicada:</div>
              {iaResult.followup_actions?.length > 0 && (
                <div style={{ color: '#334155' }}>
                  <strong>Seguimiento sugerido:</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {iaResult.followup_actions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          <Row>
            <Field label="Resultado de eficacia">
              <select value={item.effectiveness_result} onChange={e => set({ effectiveness_result: e.target.value })} style={inputStyle}>
                {EFFECTIVENESS_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Fecha verificación">
              <input type="date" value={item.effectiveness_check_date || ''} onChange={e => set({ effectiveness_check_date: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Evaluador">
              <input value={item.effectiveness_evaluator || ''} onChange={e => set({ effectiveness_evaluator: e.target.value })} style={inputStyle} />
            </Field>
          </Row>
          <Field label="Notas / justificación">
            <textarea rows={3} value={item.effectiveness_notes || ''} onChange={e => set({ effectiveness_notes: e.target.value })} style={inputStyle} />
          </Field>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
            💡 Si eliges <strong>Eficaz</strong> y la NC no está cerrada, se cierra automáticamente. Si eliges <strong>No Eficaz</strong> sobre una cerrada, se reabre.
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', justifyContent: 'flex-end' }}>
          <button onClick={onSave} style={btn('#16a34a')}><Save size={16} /> Guardar verificación</button>
          <button onClick={onClose} style={btn('#6b7280')}>Cerrar</button>
        </div>
      </Modal>
    </Backdrop>,
    document.body
  )
}

function ParetoPanel({ patterns, onConvert, onClose }) {
  return (
    <div style={{ background: '#f3e8ff', border: '2px solid #c084fc', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0, color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <TrendingUp size={20} /> Análisis Pareto IA · {patterns.length} patrones recurrentes
        </h3>
        <button onClick={onClose} style={btn('#6b7280')}><X size={14} /> Descartar</button>
      </div>
      <div style={{ display: 'grid', gap: '8px' }}>
        {patterns.map((p, i) => (
          <div key={i} style={{ background: 'white', borderRadius: '6px', padding: '10px', border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '14px' }}>
                  {p.pattern}
                  {p.priority && <span style={{ ...badge({ bg: p.priority === 'Alta' ? '#fee2e2' : '#fef3c7', color: p.priority === 'Alta' ? '#991b1b' : '#92400e' }), marginLeft: '6px' }}>{p.priority}</span>}
                </div>
                {p.count_estimated && <div style={{ fontSize: '11px', color: '#64748b' }}>~{p.count_estimated} NCs en este patrón</div>}
                {Array.isArray(p.processes_affected) && p.processes_affected.length > 0 && (
                  <div style={{ fontSize: '12px', color: '#0e7490', marginTop: '4px' }}>⚙ {p.processes_affected.join(', ')}</div>
                )}
                {p.root_cause_systemic && <div style={{ fontSize: '12px', color: '#7c2d12', marginTop: '4px' }}>⚠ {p.root_cause_systemic}</div>}
                {p.proposed_improvement && <div style={{ fontSize: '12px', color: '#166534', marginTop: '4px' }}>💡 {p.proposed_improvement}</div>}
                {p.expected_benefit && <div style={{ fontSize: '11px', color: '#475569', fontStyle: 'italic', marginTop: '2px' }}>{p.expected_benefit}</div>}
              </div>
              <button onClick={() => onConvert(p)} style={miniBtn('#7c3aed')}><LinkIcon size={11} /> Crear mejora</button>
            </div>
          </div>
        ))}
      </div>
    </div>
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
const linkBtn = { display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', background: '#e0f2fe', color: '#075985', borderRadius: '999px', fontSize: '12px', textDecoration: 'none', fontWeight: 600 }
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
const badge = ({ bg, color }) => ({
  background: bg, color, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600,
  display: 'inline-flex', alignItems: 'center', gap: '3px'
})
