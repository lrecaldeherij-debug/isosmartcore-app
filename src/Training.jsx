import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  GraduationCap, Plus, Search, Filter, Eye, Pencil, Trash2, X,
  Sparkles, Loader2, CheckCircle2, AlertTriangle, Clock, Award,
  Users, Target, BookOpen, DollarSign, Calendar, FileText, Save
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import ExcelImporter from './ExcelImporter'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

// ───────────────────── Constantes ──────────────────────
const TYPE_OPTIONS = ['Interna', 'Externa', 'Inducción', 'On-the-job']
const MODALITY_OPTIONS = ['Presencial', 'Virtual', 'Mixto']
const STATUS_OPTIONS = ['Planificado', 'En Curso', 'Realizado', 'Evaluado', 'Cancelado']
const EFFICACY_OPTIONS = ['Pendiente', 'Eficaz', 'Eficaz Parcial', 'No Eficaz']

const STATUS_COLORS = {
  'Planificado': { bg: '#e0e7ff', color: '#3730a3', border: '#c7d2fe' },
  'En Curso':    { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  'Realizado':   { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
  'Evaluado':    { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  'Cancelado':   { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
}
const EFFICACY_COLORS = {
  'Pendiente':      { bg: '#fef3c7', color: '#92400e' },
  'Eficaz':         { bg: '#dcfce7', color: '#166534' },
  'Eficaz Parcial': { bg: '#fed7aa', color: '#9a3412' },
  'No Eficaz':      { bg: '#fee2e2', color: '#991b1b' },
}
const TYPE_COLORS = {
  'Interna':     '#0891b2',
  'Externa':     '#7c3aed',
  'Inducción':   '#16a34a',
  'On-the-job':  '#f59e0b',
}

const EMPTY_FORM = {
  course_name: '',
  type: 'Externa',
  modality: 'Presencial',
  training_date: new Date().toISOString().substring(0, 10),
  trainer: '',
  duration_hours: '',
  cost: '',
  currency: 'PYG',
  learning_objective: '',
  target_job_ids: [],
  target_process_ids: [],
  competency_gap_origin: '',
  certificate_url: '',
  material_url: '',
  attendance_url: '',
  status: 'Planificado',
  efficacy_evaluation_date: '',
  efficacy_criteria: '',
  efficacy_result: 'Pendiente',
  efficacy_evaluator: '',
  efficacy_evaluation: '',
  planned_year: new Date().getFullYear(),
  planned_quarter: Math.ceil((new Date().getMonth() + 1) / 3),
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
  if (parsed && Array.isArray(parsed.courses)) return parsed.courses
  if (parsed && Array.isArray(parsed.items)) return parsed.items
  if (parsed && Array.isArray(parsed.plan)) return parsed.plan
  if (parsed && typeof parsed === 'object' && (parsed.course_name || parsed.title)) return [parsed]
  return []
}

function parseAiObject(raw) {
  if (!raw) return null
  const parsed = extractFirstJson(raw)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed
  return null
}

// ─────────────────────────────────────────────────────
export default function Training({ alCambiarVista }) {
  const [items, setItems] = useState([])
  const [personnel, setPersonnel] = useState([])
  const [jobs, setJobs] = useState([])
  const [processes, setProcesses] = useState([])
  const [objectives, setObjectives] = useState([])
  const [attendeesByTraining, setAttendeesByTraining] = useState({})
  const [selectedAttendees, setSelectedAttendees] = useState(new Set())
  const [loading, setLoading] = useState(true)
  const [orgProfile, setOrgProfile] = useState(null)

  const [mostrandoForm, setMostrandoForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [originalForm, setOriginalForm] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  // Filtros
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('Todos')
  const [filterEfficacy, setFilterEfficacy] = useState('Todos')
  const [filterYear, setFilterYear] = useState('Todos')

  // Modales
  const [detailItem, setDetailItem] = useState(null)
  const [efficacyItem, setEfficacyItem] = useState(null)

  // IA
  const [loadingIA, setLoadingIA] = useState(false)
  const [iaContext, setIaContext] = useState(null) // 'plan' | 'efficacy'
  const [iaSuggestions, setIaSuggestions] = useState(null)
  const [iaSelected, setIaSelected] = useState(new Set())
  const [iaEfficacyResult, setIaEfficacyResult] = useState(null)

  // ───── Fetch ─────
  useEffect(() => {
    fetchAll()
  }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [tr, per, jb, pr, ob, cp] = await Promise.all([
      supabase.from('training_records').select('*').order('training_date', { ascending: false }),
      supabase.from('personnel').select('id, full_name, job_title, job_id, process_id, competency_gap, status').order('full_name'),
      supabase.from('job_descriptions').select('id, title, code, competencies_json').order('title'),
      supabase.from('processes').select('id, name, type').order('name'),
      supabase.from('quality_objectives').select('id, name, status').order('created_at', { ascending: false }),
      supabase.from('company_profile').select('*').maybeSingle(),
    ])
    setItems(tr.data || [])
    setPersonnel(per.data || [])
    setJobs(jb.data || [])
    setProcesses(pr.data || [])
    setObjectives(ob.data || [])
    setOrgProfile(cp.data || null)
    if (tr.data?.length) fetchAttendees(tr.data.map(d => d.id))
    setLoading(false)
  }

  const fetchAttendees = async (trainingIds) => {
    if (!trainingIds?.length) return
    const { data } = await supabase
      .from('training_attendees')
      .select('training_id, person_id, personnel:person_id (full_name, job_title)')
      .in('training_id', trainingIds)
    const grouped = {}
    for (const a of data || []) {
      if (!grouped[a.training_id]) grouped[a.training_id] = []
      grouped[a.training_id].push({
        person_id: a.person_id,
        full_name: a.personnel?.full_name || '—',
        job_title: a.personnel?.job_title || ''
      })
    }
    setAttendeesByTraining(grouped)
  }

  // ───── Computed ─────
  const stats = useMemo(() => {
    const total = items.length
    const planificados = items.filter(i => i.status === 'Planificado').length
    const enCurso = items.filter(i => i.status === 'En Curso').length
    const realizados = items.filter(i => i.status === 'Realizado').length
    const evaluados = items.filter(i => i.status === 'Evaluado').length
    const eficaces = items.filter(i => i.efficacy_result === 'Eficaz').length
    const pendienteEf = items.filter(i => i.status === 'Realizado' && i.efficacy_result === 'Pendiente').length
    const totalCost = items.reduce((sum, i) => sum + (Number(i.cost) || 0), 0)
    return { total, planificados, enCurso, realizados, evaluados, eficaces, pendienteEf, totalCost }
  }, [items])

  const yearsAvailable = useMemo(() => {
    const ys = new Set()
    items.forEach(i => {
      if (i.planned_year) ys.add(i.planned_year)
      if (i.training_date) ys.add(new Date(i.training_date).getFullYear())
    })
    return [...ys].sort((a, b) => b - a)
  }, [items])

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (filterStatus !== 'Todos' && i.status !== filterStatus) return false
      if (filterEfficacy !== 'Todos' && i.efficacy_result !== filterEfficacy) return false
      if (filterYear !== 'Todos') {
        const y = i.planned_year || (i.training_date ? new Date(i.training_date).getFullYear() : null)
        if (y !== Number(filterYear)) return false
      }
      if (search) {
        const s = search.toLowerCase()
        const hay = `${i.course_name || ''} ${i.trainer || ''} ${i.learning_objective || ''} ${i.competency_gap_origin || ''}`.toLowerCase()
        if (!hay.includes(s)) return false
      }
      return true
    })
  }, [items, filterStatus, filterEfficacy, filterYear, search])

  // ───── Helpers ─────
  const jobMap = useMemo(() => Object.fromEntries(jobs.map(j => [j.id, j])), [jobs])
  const processMap = useMemo(() => Object.fromEntries(processes.map(p => [p.id, p])), [processes])

  const formatCurrency = (n, c = 'PYG') => {
    if (!n) return '—'
    return new Intl.NumberFormat('es-PY').format(n) + ' ' + (c || 'PYG')
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
    setForm({ ...EMPTY_FORM, training_date: new Date().toISOString().substring(0, 10) })
    setSelectedAttendees(new Set())
    setEditingId(null)
    setOriginalForm(null)
    setMostrandoForm(true)
  }

  const openEdit = (item) => {
    const f = {
      ...EMPTY_FORM,
      ...item,
      training_date: item.training_date || '',
      efficacy_evaluation_date: item.efficacy_evaluation_date || '',
      target_job_ids: item.target_job_ids || [],
      target_process_ids: item.target_process_ids || [],
      duration_hours: item.duration_hours ?? '',
      cost: item.cost ?? '',
    }
    setForm(f)
    setOriginalForm(f)
    setEditingId(item.id)
    const ats = attendeesByTraining[item.id] || []
    setSelectedAttendees(new Set(ats.map(a => a.person_id)))
    setMostrandoForm(true)
  }

  const toggleAttendee = (personId) => {
    setSelectedAttendees(prev => {
      const next = new Set(prev)
      if (next.has(personId)) next.delete(personId)
      else next.add(personId)
      return next
    })
  }

  const toggleArrayItem = (arrKey, id) => {
    setForm(prev => {
      const cur = new Set(prev[arrKey] || [])
      if (cur.has(id)) cur.delete(id)
      else cur.add(id)
      return { ...prev, [arrKey]: [...cur] }
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      ...form,
      duration_hours: form.duration_hours === '' ? null : Number(form.duration_hours),
      cost: form.cost === '' ? null : Number(form.cost),
      planned_year: form.planned_year ? Number(form.planned_year) : null,
      planned_quarter: form.planned_quarter ? Number(form.planned_quarter) : null,
      training_date: form.training_date || null,
      efficacy_evaluation_date: form.efficacy_evaluation_date || null,
    }

    if (editingId) {
      const changes = diffChanges(originalForm, form)
      if (changes.length) {
        const entry = { at: new Date().toISOString(), changes }
        payload.change_log = [...(originalForm?.change_log || []), entry]
      }
      const { error } = await supabase.from('training_records').update(payload).eq('id', editingId)
      if (error) { toast.error(error.message); return }

      await supabase.from('training_attendees').delete().eq('training_id', editingId)
      if (selectedAttendees.size > 0) {
        const rows = [...selectedAttendees].map(person_id => ({ training_id: editingId, person_id, attended: true }))
        await supabase.from('training_attendees').insert(rows)
      }
      toast.success('Capacitación actualizada')
    } else {
      payload.change_log = [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: form.course_name }] }]
      const { data, error } = await supabase.from('training_records').insert([payload]).select('id').single()
      if (error) { toast.error(error.message); return }
      if (selectedAttendees.size > 0 && data?.id) {
        const rows = [...selectedAttendees].map(person_id => ({ training_id: data.id, person_id, attended: true }))
        const { error: aErr } = await supabase.from('training_attendees').insert(rows)
        if (aErr) toast.warning('Curso guardado, error vinculando asistentes: ' + aErr.message)
      }
      toast.success('Capacitación registrada')
    }

    setMostrandoForm(false)
    setForm(EMPTY_FORM)
    setSelectedAttendees(new Set())
    setEditingId(null)
    setOriginalForm(null)
    fetchAll()
  }

  const handleDelete = async (id) => {
    if (!await confirm('¿Eliminar este registro de capacitación? Se borrarán también los asistentes vinculados.', { tone: 'danger', confirmText: 'Eliminar' })) return
    await supabase.from('training_attendees').delete().eq('training_id', id)
    const { error } = await supabase.from('training_records').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Capacitación eliminada')
    fetchAll()
  }

  // ───── Evaluar Eficacia ─────
  const openEfficacy = (item) => {
    setEfficacyItem({
      ...item,
      efficacy_evaluation_date: item.efficacy_evaluation_date || new Date().toISOString().substring(0, 10),
      efficacy_result: item.efficacy_result || 'Pendiente',
      efficacy_criteria: item.efficacy_criteria || '',
      efficacy_evaluator: item.efficacy_evaluator || '',
      efficacy_evaluation: item.efficacy_evaluation || '',
    })
    setIaEfficacyResult(null)
  }

  const saveEfficacy = async () => {
    if (!efficacyItem) return
    const payload = {
      efficacy_evaluation_date: efficacyItem.efficacy_evaluation_date || null,
      efficacy_criteria: efficacyItem.efficacy_criteria,
      efficacy_result: efficacyItem.efficacy_result,
      efficacy_evaluator: efficacyItem.efficacy_evaluator,
      efficacy_evaluation: efficacyItem.efficacy_evaluation,
      status: efficacyItem.efficacy_result !== 'Pendiente' ? 'Evaluado' : efficacyItem.status,
    }
    const entry = {
      at: new Date().toISOString(),
      changes: [{ field: 'efficacy_evaluated', from: null, to: efficacyItem.efficacy_result }]
    }
    payload.change_log = [...(efficacyItem.change_log || []), entry]
    const { error } = await supabase.from('training_records').update(payload).eq('id', efficacyItem.id)
    if (error) { toast.error(error.message); return }
    toast.success('Eficacia registrada')
    setEfficacyItem(null)
    setIaEfficacyResult(null)
    fetchAll()
  }

  // ───── IA: Plan Anual de Capacitación (DNC) ─────
  const generarPlanAnual = async () => {
    setLoadingIA(true); setIaSuggestions(null); setIaContext('plan')
    try {
      const brechas = personnel.filter(p => p.competency_gap || p.status === 'Brecha Detectada' || p.status === 'En Formación')
      const jobsConComp = jobs.filter(j => j.competencies_json && Object.keys(j.competencies_json).length)
      const ctxPersonnel = brechas.slice(0, 20).map(p => ({
        nombre: p.full_name,
        cargo: p.job_title || (p.job_id ? jobMap[p.job_id]?.title : ''),
        status: p.status,
        brecha: (p.competency_gap || '').slice(0, 200),
      }))
      const ctxJobs = jobsConComp.slice(0, 10).map(j => ({
        cargo: j.title,
        competencias: j.competencies_json
      }))
      const ctxProcesses = processes.slice(0, 15).map(p => ({ id: p.id, nombre: p.name, tipo: p.type }))
      const ctxObjectives = objectives.filter(o => o.status !== 'Cumplido').slice(0, 10).map(o => ({ nombre: o.name, status: o.status }))

      const empresa = orgProfile?.company_name || 'la empresa'
      const sector = orgProfile?.sector || ''
      const year = new Date().getFullYear() + 1

      const prompt = `Sos consultor ISO 9001 experto en gestión de talento humano. Generá un PLAN ANUAL DE CAPACITACIÓN para ${empresa}${sector ? ' (sector: ' + sector + ')'  : ''} para el año ${year}, basado en la Detección de Necesidades de Capacitación (DNC) según ISO 9001 cláusula 7.2.

PERSONAL CON BRECHAS DE COMPETENCIA:
${JSON.stringify(ctxPersonnel, null, 2)}

CARGOS Y COMPETENCIAS REQUERIDAS:
${JSON.stringify(ctxJobs, null, 2)}

PROCESOS DE LA ORGANIZACIÓN:
${JSON.stringify(ctxProcesses, null, 2)}

OBJETIVOS DE CALIDAD ABIERTOS:
${JSON.stringify(ctxObjectives, null, 2)}

Devolvé SOLO un JSON array, sin markdown. Cada curso del plan:
- course_name (string)
- type (Interna | Externa | Inducción | On-the-job)
- modality (Presencial | Virtual | Mixto)
- duration_hours (number)
- trainer (string, sugerido)
- learning_objective (string, qué competencia desarrolla)
- competency_gap_origin (string, qué brecha cubre — referenciar nombres del personal o cargos)
- target_jobs (array de strings con títulos de cargos objetivo)
- target_processes (array de strings con nombres de procesos impactados)
- planned_quarter (1 | 2 | 3 | 4)
- estimated_cost (number, USD aproximado)
- justification (string, por qué este curso ahora)

Generá 6-12 cursos balanceados por trimestre, priorizando brechas críticas.`

      const raw = await consultarIA(prompt, 'Devolvé ÚNICAMENTE JSON array válido.')
      console.log('[IA Plan Anual] raw:', raw)
      const arr = parseAiArray(raw)
      if (!arr.length) throw new Error('La IA no devolvió cursos parseables')
      setIaSuggestions(arr)
      setIaSelected(new Set(arr.map((_, i) => i)))
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    }
    setLoadingIA(false)
  }

  const saveIaPlan = async () => {
    if (!iaSuggestions) return
    const year = new Date().getFullYear() + 1
    const rows = iaSuggestions
      .map((s, i) => ({ s, i }))
      .filter(({ i }) => iaSelected.has(i))
      .map(({ s }) => {
        const jobIds = (s.target_jobs || []).map(t => {
          const j = jobs.find(j => j.title?.toLowerCase().trim() === String(t).toLowerCase().trim())
          return j?.id
        }).filter(Boolean)
        const procIds = (s.target_processes || []).map(t => {
          const p = processes.find(p => p.name?.toLowerCase().trim() === String(t).toLowerCase().trim())
          return p?.id
        }).filter(Boolean)
        return {
          course_name: s.course_name || 'Curso sin título',
          type: TYPE_OPTIONS.includes(s.type) ? s.type : 'Externa',
          modality: MODALITY_OPTIONS.includes(s.modality) ? s.modality : 'Presencial',
          duration_hours: s.duration_hours ? Number(s.duration_hours) : null,
          trainer: s.trainer || '',
          learning_objective: s.learning_objective || '',
          competency_gap_origin: s.competency_gap_origin || s.justification || '',
          target_job_ids: jobIds,
          target_process_ids: procIds,
          planned_year: year,
          planned_quarter: s.planned_quarter ? Number(s.planned_quarter) : null,
          cost: s.estimated_cost ? Number(s.estimated_cost) : null,
          currency: 'USD',
          status: 'Planificado',
          efficacy_result: 'Pendiente',
          change_log: [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: 'IA Plan Anual' }] }]
        }
      })
    if (!rows.length) return toast.warning('No hay cursos seleccionados')
    const { error } = await supabase.from('training_records').insert(rows)
    if (error) { toast.error(error.message); return }
    toast.success(`Plan Anual ${year}: ${rows.length} cursos cargados`)
    setIaSuggestions(null); setIaSelected(new Set()); setIaContext(null)
    fetchAll()
  }

  // ───── IA: Evaluar Eficacia de un curso ─────
  const evaluarEficaciaIA = async () => {
    if (!efficacyItem) return
    setLoadingIA(true); setIaEfficacyResult(null); setIaContext('efficacy')
    try {
      const ats = attendeesByTraining[efficacyItem.id] || []
      const ctxAtendees = ats.slice(0, 30).map(a => {
        const p = personnel.find(pp => pp.id === a.person_id)
        return {
          nombre: a.full_name,
          cargo: a.job_title || (p?.job_id ? jobMap[p.job_id]?.title : ''),
          status_actual: p?.status,
          brecha_actual: (p?.competency_gap || '').slice(0, 150),
        }
      })
      const jobsTarget = (efficacyItem.target_job_ids || []).map(id => jobMap[id]?.title).filter(Boolean)
      const procTarget = (efficacyItem.target_process_ids || []).map(id => processMap[id]?.name).filter(Boolean)

      const prompt = `Sos auditor interno ISO 9001. Evaluá la EFICACIA de esta capacitación según cláusula 7.2.

CURSO:
- Nombre: ${efficacyItem.course_name}
- Tipo: ${efficacyItem.type || '—'} (${efficacyItem.modality || '—'})
- Fecha: ${efficacyItem.training_date || '—'}
- Duración: ${efficacyItem.duration_hours || '—'} h
- Objetivo de aprendizaje: ${efficacyItem.learning_objective || '—'}
- Brecha de competencia origen: ${efficacyItem.competency_gap_origin || '—'}
- Cargos objetivo: ${jobsTarget.join(', ') || '—'}
- Procesos objetivo: ${procTarget.join(', ') || '—'}

ASISTENTES (estado actual de competencia):
${JSON.stringify(ctxAtendees, null, 2)}

Devolvé SOLO un JSON objeto, sin markdown:
- efficacy_criteria (string, qué criterio aplicarías para medir eficacia — ej: "Evaluación post-curso con nota mínima 80%, observación en puesto 3 meses después, sin reincidencia de NCs por error de proceso")
- recommended_result (Eficaz | Eficaz Parcial | No Eficaz)
- justification (string, razonamiento del resultado en función de las brechas resueltas o no en los asistentes)
- followup_actions (array de strings, qué acciones complementarias proponés — ej: "Refuerzo on-the-job", "Nueva evaluación a 6 meses", "Repetir curso para X persona")
- next_evaluation_date (string YYYY-MM-DD, fecha sugerida para próxima revisión)`

      const raw = await consultarIA(prompt, 'Devolvé ÚNICAMENTE JSON objeto válido.')
      console.log('[IA Eficacia] raw:', raw)
      const obj = parseAiObject(raw)
      if (!obj) throw new Error('La IA no devolvió un análisis parseable')
      setIaEfficacyResult(obj)
      setEfficacyItem(prev => ({
        ...prev,
        efficacy_criteria: obj.efficacy_criteria || prev.efficacy_criteria,
        efficacy_result: EFFICACY_OPTIONS.includes(obj.recommended_result) ? obj.recommended_result : prev.efficacy_result,
        efficacy_evaluation: obj.justification || prev.efficacy_evaluation,
        efficacy_evaluation_date: obj.next_evaluation_date || prev.efficacy_evaluation_date,
      }))
    } catch (err) {
      toast.error('Error IA: ' + err.message)
    }
    setLoadingIA(false)
  }

  // ───────────────────── UI ──────────────────────
  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h2 style={{ color: '#1e293b', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <GraduationCap size={28} /> Control de Capacitación
          </h2>
          <p style={{ color: '#64748b', margin: '5px 0 0 0', fontSize: '14px' }}>
            ISO 9001 — 7.2 Competencia / formación. Plan anual, ejecución y evaluación de eficacia.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            onClick={() => alCambiarVista && alCambiarVista('personal')}
            style={btn('#6c757d')}
          >
            <Users size={16} /> Matriz Competencias
          </button>
          <button onClick={generarPlanAnual} disabled={loadingIA} style={btn('#7c3aed')}>
            {loadingIA && iaContext === 'plan' ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />}
            IA Plan Anual {new Date().getFullYear() + 1}
          </button>
          <ExcelImporter templateKey="training_records" onImported={fetchAll} />
          <button onClick={openNew} style={btn('#0ea5e9')}>
            <Plus size={16} /> Nuevo
          </button>
        </div>
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['7.2']} />

      {/* Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        <Kpi label="Total cursos" value={stats.total} icon={<BookOpen size={18} />} color="#0ea5e9" />
        <Kpi label="Planificados" value={stats.planificados} icon={<Calendar size={18} />} color="#3730a3" />
        <Kpi label="En curso" value={stats.enCurso} icon={<Clock size={18} />} color="#92400e" />
        <Kpi label="Realizados" value={stats.realizados} icon={<CheckCircle2 size={18} />} color="#1e40af" />
        <Kpi label="Eficaces" value={stats.eficaces} icon={<Award size={18} />} color="#166534" />
        <Kpi label="Pend. eficacia" value={stats.pendienteEf} icon={<AlertTriangle size={18} />} color="#b45309" />
        <Kpi label="Costo total" value={formatCurrency(stats.totalCost, 'PYG')} icon={<DollarSign size={18} />} color="#16a34a" small />
      </div>

      {/* Sugerencias IA: Plan anual */}
      {iaSuggestions && iaContext === 'plan' && (
        <IaPlanPanel
          suggestions={iaSuggestions}
          selected={iaSelected}
          onToggle={i => setIaSelected(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })}
          onSave={saveIaPlan}
          onClose={() => { setIaSuggestions(null); setIaSelected(new Set()); setIaContext(null) }}
        />
      )}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            placeholder="Buscar curso, trainer, objetivo…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 8px 8px 32px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
          />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={selectStyle}>
          <option value="Todos">Todos los estados</option>
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filterEfficacy} onChange={e => setFilterEfficacy(e.target.value)} style={selectStyle}>
          <option value="Todos">Toda eficacia</option>
          {EFFICACY_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={selectStyle}>
          <option value="Todos">Todos los años</option>
          {yearsAvailable.map(y => <option key={y}>{y}</option>)}
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
          jobs={jobs}
          processes={processes}
          personnel={personnel}
          selectedAttendees={selectedAttendees}
          toggleAttendee={toggleAttendee}
          toggleArrayItem={toggleArrayItem}
          onSubmit={handleSubmit}
          onCancel={() => { setMostrandoForm(false); setEditingId(null); setForm(EMPTY_FORM); setSelectedAttendees(new Set()) }}
        />
      )}

      {/* Lista */}
      {loading ? (
        <p style={{ color: '#64748b' }}>Cargando registros…</p>
      ) : filtered.length === 0 ? (
        <div style={emptyState}>
          <GraduationCap size={40} color="#cbd5e1" />
          <p style={{ color: '#64748b', marginTop: '8px' }}>No hay capacitaciones que coincidan con los filtros.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '14px' }}>
          {filtered.map(item => (
            <TrainingCard
              key={item.id}
              item={item}
              attendees={attendeesByTraining[item.id] || []}
              jobMap={jobMap}
              processMap={processMap}
              onDetail={() => setDetailItem(item)}
              onEdit={() => openEdit(item)}
              onEfficacy={() => openEfficacy(item)}
              onDelete={() => handleDelete(item.id)}
            />
          ))}
        </div>
      )}

      {/* Modales */}
      {detailItem && (
        <DetailModal
          item={detailItem}
          attendees={attendeesByTraining[detailItem.id] || []}
          jobMap={jobMap}
          processMap={processMap}
          onClose={() => setDetailItem(null)}
          onEdit={() => { setDetailItem(null); openEdit(detailItem) }}
          onEfficacy={() => { setDetailItem(null); openEfficacy(detailItem) }}
        />
      )}
      {efficacyItem && (
        <EfficacyModal
          item={efficacyItem}
          setItem={setEfficacyItem}
          onClose={() => { setEfficacyItem(null); setIaEfficacyResult(null) }}
          onSave={saveEfficacy}
          onIA={evaluarEficaciaIA}
          loadingIA={loadingIA && iaContext === 'efficacy'}
          iaResult={iaEfficacyResult}
        />
      )}
    </div>
  )
}

// ─────────────────── Subcomponentes ───────────────────

function Kpi({ label, value, icon, color, small }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color, marginBottom: '4px' }}>
        {icon}
        <span style={{ fontSize: '12px', fontWeight: 600, textTransform: 'uppercase' }}>{label}</span>
      </div>
      <div style={{ fontSize: small ? '15px' : '22px', fontWeight: 700, color: '#1e293b' }}>{value}</div>
    </div>
  )
}

function TrainingCard({ item, attendees, jobMap, processMap, onDetail, onEdit, onEfficacy, onDelete }) {
  const st = STATUS_COLORS[item.status] || STATUS_COLORS['Planificado']
  const ef = EFFICACY_COLORS[item.efficacy_result] || EFFICACY_COLORS['Pendiente']
  const typeColor = TYPE_COLORS[item.type] || '#6b7280'
  const pendingEff = item.status === 'Realizado' && item.efficacy_result === 'Pendiente'
  const targetJobs = (item.target_job_ids || []).map(id => jobMap[id]?.title).filter(Boolean)
  const targetProc = (item.target_process_ids || []).map(id => processMap[id]?.name).filter(Boolean)

  return (
    <div style={{
      background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px',
      display: 'flex', flexDirection: 'column', gap: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: '15px', color: '#1e293b' }}>{item.course_name}</h3>
          <div style={{ fontSize: '12px', color: '#64748b', marginTop: '2px' }}>
            {item.trainer || 'Sin trainer'} · {item.training_date ? new Date(item.training_date).toLocaleDateString() : 'Sin fecha'}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
          <span style={{ ...badge(st), border: `1px solid ${st.border}` }}>{item.status}</span>
          <span style={badge(ef)}>{item.efficacy_result}</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', fontSize: '11px' }}>
        {item.type && <span style={{ background: typeColor + '22', color: typeColor, padding: '2px 8px', borderRadius: '999px', fontWeight: 600 }}>{item.type}</span>}
        {item.modality && <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '999px' }}>{item.modality}</span>}
        {item.duration_hours && <span style={{ background: '#f1f5f9', color: '#475569', padding: '2px 8px', borderRadius: '999px' }}>{item.duration_hours} h</span>}
        {item.planned_year && <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: '999px' }}>{item.planned_year} Q{item.planned_quarter || '-'}</span>}
      </div>

      {item.learning_objective && (
        <div style={{ fontSize: '12px', color: '#334155', lineHeight: 1.4 }}>
          <Target size={12} style={{ verticalAlign: 'middle', marginRight: '4px', color: '#0ea5e9' }} />
          {item.learning_objective.slice(0, 120)}{item.learning_objective.length > 120 ? '…' : ''}
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', fontSize: '12px', color: '#64748b' }}>
        <span><Users size={12} style={{ verticalAlign: 'middle' }} /> {attendees.length} asistente{attendees.length !== 1 ? 's' : ''}</span>
        {targetJobs.length > 0 && <span>🧑‍💼 {targetJobs.length} cargo{targetJobs.length !== 1 ? 's' : ''}</span>}
        {targetProc.length > 0 && <span>⚙ {targetProc.length} proceso{targetProc.length !== 1 ? 's' : ''}</span>}
      </div>

      {pendingEff && (
        <div style={{ background: '#fef3c7', color: '#92400e', padding: '6px 8px', borderRadius: '6px', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <AlertTriangle size={14} /> Evaluación de eficacia pendiente
        </div>
      )}

      <div style={{ display: 'flex', gap: '6px', marginTop: 'auto', flexWrap: 'wrap' }}>
        <button onClick={onDetail} style={miniBtn('#0ea5e9')}><Eye size={12} /> Detalle</button>
        <button onClick={onEfficacy} style={miniBtn('#16a34a')}><Award size={12} /> Eficacia</button>
        <button onClick={onEdit} style={miniBtn('#6366f1')}><Pencil size={12} /> Editar</button>
        <button onClick={onDelete} style={miniBtn('#dc2626')}><Trash2 size={12} /></button>
      </div>
    </div>
  )
}

function FormCard({ form, setForm, editing, jobs, processes, personnel, selectedAttendees, toggleAttendee, toggleArrayItem, onSubmit, onCancel }) {
  const set = (patch) => setForm(prev => ({ ...prev, ...patch }))
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '10px', padding: '16px', marginBottom: '20px' }}>
      <h3 style={{ marginTop: 0, color: '#1e293b' }}>{editing ? '✏️ Editar capacitación' : '+ Registrar capacitación'}</h3>
      <form onSubmit={onSubmit}>
        {/* Sección 1: Datos curso */}
        <Section title="1. Datos del curso">
          <Row>
            <Field label="Nombre del curso *" flex={2}>
              <input required value={form.course_name} onChange={e => set({ course_name: e.target.value })} style={inputStyle} placeholder="Ej: Auditor Interno ISO 9001" />
            </Field>
            <Field label="Fecha" flex={1}>
              <input type="date" value={form.training_date} onChange={e => set({ training_date: e.target.value })} style={inputStyle} />
            </Field>
          </Row>
          <Row>
            <Field label="Tipo">
              <select value={form.type} onChange={e => set({ type: e.target.value })} style={inputStyle}>
                {TYPE_OPTIONS.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Modalidad">
              <select value={form.modality} onChange={e => set({ modality: e.target.value })} style={inputStyle}>
                {MODALITY_OPTIONS.map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Duración (h)">
              <input type="number" min="0" step="0.5" value={form.duration_hours} onChange={e => set({ duration_hours: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Costo">
              <input type="number" min="0" value={form.cost} onChange={e => set({ cost: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Moneda">
              <select value={form.currency} onChange={e => set({ currency: e.target.value })} style={inputStyle}>
                <option>PYG</option><option>USD</option><option>EUR</option><option>BRL</option>
              </select>
            </Field>
          </Row>
          <Row>
            <Field label="Impartido por" flex={2}>
              <input value={form.trainer} onChange={e => set({ trainer: e.target.value })} style={inputStyle} placeholder="Nombre o consultora" />
            </Field>
            <Field label="Estado">
              <select value={form.status} onChange={e => set({ status: e.target.value })} style={inputStyle}>
                {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Año">
              <input type="number" value={form.planned_year} onChange={e => set({ planned_year: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Trimestre">
              <select value={form.planned_quarter} onChange={e => set({ planned_quarter: e.target.value })} style={inputStyle}>
                <option value="">—</option>
                <option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option>
              </select>
            </Field>
          </Row>
        </Section>

        {/* Sección 2: DNC */}
        <Section title="2. Detección de Necesidad de Capacitación (DNC)">
          <Field label="Objetivo de aprendizaje / competencia a desarrollar">
            <textarea rows={2} value={form.learning_objective} onChange={e => set({ learning_objective: e.target.value })} style={inputStyle} placeholder="¿Qué competencia desarrolla? ¿Qué deben saber/hacer después?" />
          </Field>
          <Field label="Brecha de competencia origen (¿qué brecha cubre?)">
            <textarea rows={2} value={form.competency_gap_origin} onChange={e => set({ competency_gap_origin: e.target.value })} style={inputStyle} placeholder="Ej: 3 inspectores sin certificación NDT detectada en última auditoría" />
          </Field>
          <Row>
            <Field label="Cargos objetivo">
              <MultiSelectBox
                items={jobs.map(j => ({ id: j.id, label: j.title }))}
                selected={new Set(form.target_job_ids || [])}
                onToggle={id => toggleArrayItem('target_job_ids', id)}
                emptyMsg="No hay cargos cargados"
              />
            </Field>
            <Field label="Procesos impactados">
              <MultiSelectBox
                items={processes.map(p => ({ id: p.id, label: p.name }))}
                selected={new Set(form.target_process_ids || [])}
                onToggle={id => toggleArrayItem('target_process_ids', id)}
                emptyMsg="No hay procesos cargados"
              />
            </Field>
          </Row>
        </Section>

        {/* Sección 3: Asistentes */}
        <Section title="3. Asistentes registrados">
          <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>
            {selectedAttendees.size} seleccionado{selectedAttendees.size !== 1 ? 's' : ''}
          </div>
          {personnel.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>
              No hay empleados cargados. Cargá personal en "Talento Humano" antes de vincular asistentes.
            </p>
          ) : (
            <div style={{ maxHeight: '180px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px', background: 'white' }}>
              {personnel.map(p => (
                <label key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: '8px', padding: '5px 8px', cursor: 'pointer',
                  borderRadius: '4px', background: selectedAttendees.has(p.id) ? '#eff6ff' : 'transparent'
                }}>
                  <input type="checkbox" checked={selectedAttendees.has(p.id)} onChange={() => toggleAttendee(p.id)} />
                  <span style={{ flex: 1, fontSize: '13px' }}>
                    {p.full_name}
                    {p.job_title && <span style={{ color: '#94a3b8', marginLeft: '6px' }}>· {p.job_title}</span>}
                  </span>
                </label>
              ))}
            </div>
          )}
        </Section>

        {/* Sección 4: Evidencias */}
        <Section title="4. Evidencias">
          <Row>
            <Field label="URL Certificado">
              <input value={form.certificate_url} onChange={e => set({ certificate_url: e.target.value })} style={inputStyle} placeholder="https://…" />
            </Field>
            <Field label="URL Material">
              <input value={form.material_url} onChange={e => set({ material_url: e.target.value })} style={inputStyle} placeholder="https://…" />
            </Field>
            <Field label="URL Lista asistencia">
              <input value={form.attendance_url} onChange={e => set({ attendance_url: e.target.value })} style={inputStyle} placeholder="https://…" />
            </Field>
          </Row>
        </Section>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
          <button type="submit" style={btn('#16a34a')}><Save size={16} /> {editing ? 'Guardar cambios' : 'Crear capacitación'}</button>
          <button type="button" onClick={onCancel} style={btn('#6b7280')}>Cancelar</button>
        </div>
      </form>
    </div>
  )
}

function MultiSelectBox({ items, selected, onToggle, emptyMsg }) {
  if (!items.length) return <div style={{ fontSize: '12px', color: '#94a3b8', fontStyle: 'italic' }}>{emptyMsg}</div>
  return (
    <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '4px', background: 'white' }}>
      {items.map(it => (
        <label key={it.id} style={{
          display: 'flex', alignItems: 'center', gap: '6px', padding: '4px 6px', cursor: 'pointer',
          borderRadius: '3px', background: selected.has(it.id) ? '#eff6ff' : 'transparent', fontSize: '12px'
        }}>
          <input type="checkbox" checked={selected.has(it.id)} onChange={() => onToggle(it.id)} />
          <span>{it.label}</span>
        </label>
      ))}
    </div>
  )
}

function DetailModal({ item, attendees, jobMap, processMap, onClose, onEdit, onEfficacy }) {
  const targetJobs = (item.target_job_ids || []).map(id => jobMap[id]?.title).filter(Boolean)
  const targetProc = (item.target_process_ids || []).map(id => processMap[id]?.name).filter(Boolean)
  return createPortal(
    <Backdrop onClose={onClose}>
      <Modal>
        <ModalHeader title={item.course_name} onClose={onClose}>
          <span style={badge(STATUS_COLORS[item.status] || STATUS_COLORS['Planificado'])}>{item.status}</span>
          <span style={badge(EFFICACY_COLORS[item.efficacy_result] || EFFICACY_COLORS['Pendiente'])}>{item.efficacy_result}</span>
        </ModalHeader>

        <ModalSection title="📋 Datos del curso">
          <DetailGrid>
            <D label="Tipo">{item.type || '—'}</D>
            <D label="Modalidad">{item.modality || '—'}</D>
            <D label="Fecha">{item.training_date ? new Date(item.training_date).toLocaleDateString() : '—'}</D>
            <D label="Duración">{item.duration_hours ? item.duration_hours + ' h' : '—'}</D>
            <D label="Trainer">{item.trainer || '—'}</D>
            <D label="Costo">{item.cost ? new Intl.NumberFormat('es-PY').format(item.cost) + ' ' + (item.currency || '') : '—'}</D>
            <D label="Año / Trim.">{item.planned_year || '—'} {item.planned_quarter ? '· Q' + item.planned_quarter : ''}</D>
          </DetailGrid>
        </ModalSection>

        <ModalSection title="🎯 Detección de Necesidad (DNC)">
          <D label="Objetivo de aprendizaje" block>{item.learning_objective || '—'}</D>
          <D label="Brecha origen" block>{item.competency_gap_origin || '—'}</D>
          {targetJobs.length > 0 && (
            <D label="Cargos objetivo" block>
              <ChipList items={targetJobs} color="#3730a3" />
            </D>
          )}
          {targetProc.length > 0 && (
            <D label="Procesos impactados" block>
              <ChipList items={targetProc} color="#0e7490" />
            </D>
          )}
        </ModalSection>

        <ModalSection title={`👥 Asistentes (${attendees.length})`}>
          {attendees.length === 0 ? (
            <p style={{ fontSize: '13px', color: '#94a3b8', fontStyle: 'italic' }}>Sin asistentes registrados.</p>
          ) : (
            <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: '13px', color: '#334155' }}>
              {attendees.map(a => (
                <li key={a.person_id}>{a.full_name}{a.job_title && <span style={{ color: '#94a3b8' }}> · {a.job_title}</span>}</li>
              ))}
            </ul>
          )}
        </ModalSection>

        <ModalSection title="🏆 Evaluación de eficacia">
          <DetailGrid>
            <D label="Resultado">{item.efficacy_result || 'Pendiente'}</D>
            <D label="Fecha evaluación">{item.efficacy_evaluation_date ? new Date(item.efficacy_evaluation_date).toLocaleDateString() : '—'}</D>
            <D label="Evaluador">{item.efficacy_evaluator || '—'}</D>
          </DetailGrid>
          <D label="Criterio" block>{item.efficacy_criteria || '—'}</D>
          <D label="Observación / análisis" block>{item.efficacy_evaluation || '—'}</D>
        </ModalSection>

        <ModalSection title="📎 Evidencias">
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            {item.certificate_url && <a href={item.certificate_url} target="_blank" rel="noreferrer" style={linkBtn}><FileText size={12} /> Certificado</a>}
            {item.material_url && <a href={item.material_url} target="_blank" rel="noreferrer" style={linkBtn}><FileText size={12} /> Material</a>}
            {item.attendance_url && <a href={item.attendance_url} target="_blank" rel="noreferrer" style={linkBtn}><FileText size={12} /> Asistencia</a>}
            {!item.certificate_url && !item.material_url && !item.attendance_url && (
              <span style={{ color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>Sin evidencias cargadas.</span>
            )}
          </div>
        </ModalSection>

        <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', justifyContent: 'flex-end' }}>
          <button onClick={onEfficacy} style={btn('#16a34a')}><Award size={16} /> Evaluar eficacia</button>
          <button onClick={onEdit} style={btn('#6366f1')}><Pencil size={16} /> Editar</button>
          <button onClick={onClose} style={btn('#6b7280')}>Cerrar</button>
        </div>
      </Modal>
    </Backdrop>,
    document.body
  )
}

function EfficacyModal({ item, setItem, onClose, onSave, onIA, loadingIA, iaResult }) {
  const set = (patch) => setItem(prev => ({ ...prev, ...patch }))
  return createPortal(
    <Backdrop onClose={onClose}>
      <Modal>
        <ModalHeader title={`🏆 Eficacia · ${item.course_name}`} onClose={onClose} />

        <div style={{ padding: '14px 16px' }}>
          <button onClick={onIA} disabled={loadingIA} style={{ ...btn('#7c3aed'), marginBottom: '12px' }}>
            {loadingIA ? <Loader2 size={16} className="spin" /> : <Sparkles size={16} />} IA: sugerir criterio y resultado
          </button>

          {iaResult && (
            <div style={{ background: '#f3e8ff', border: '1px solid #d8b4fe', borderRadius: '8px', padding: '10px', marginBottom: '12px' }}>
              <div style={{ fontSize: '12px', color: '#6b21a8', fontWeight: 600, marginBottom: '4px' }}>Sugerencia IA aplicada al formulario:</div>
              {iaResult.followup_actions?.length > 0 && (
                <div style={{ fontSize: '12px', color: '#334155' }}>
                  <strong>Acciones de seguimiento sugeridas:</strong>
                  <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                    {iaResult.followup_actions.map((a, i) => <li key={i}>{a}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          <Row>
            <Field label="Resultado de eficacia">
              <select value={item.efficacy_result} onChange={e => set({ efficacy_result: e.target.value })} style={inputStyle}>
                {EFFICACY_OPTIONS.map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
            <Field label="Fecha evaluación">
              <input type="date" value={item.efficacy_evaluation_date || ''} onChange={e => set({ efficacy_evaluation_date: e.target.value })} style={inputStyle} />
            </Field>
            <Field label="Evaluador">
              <input value={item.efficacy_evaluator || ''} onChange={e => set({ efficacy_evaluator: e.target.value })} style={inputStyle} />
            </Field>
          </Row>
          <Field label="Criterio de evaluación">
            <textarea rows={2} value={item.efficacy_criteria || ''} onChange={e => set({ efficacy_criteria: e.target.value })} style={inputStyle} placeholder="Ej: Nota >= 80% en examen + observación on-the-job 3 meses" />
          </Field>
          <Field label="Análisis / justificación">
            <textarea rows={3} value={item.efficacy_evaluation || ''} onChange={e => set({ efficacy_evaluation: e.target.value })} style={inputStyle} placeholder="Detalle del resultado y conclusiones" />
          </Field>
        </div>

        <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc', justifyContent: 'flex-end' }}>
          <button onClick={onSave} style={btn('#16a34a')}><Save size={16} /> Guardar evaluación</button>
          <button onClick={onClose} style={btn('#6b7280')}>Cerrar</button>
        </div>
      </Modal>
    </Backdrop>,
    document.body
  )
}

function IaPlanPanel({ suggestions, selected, onToggle, onSave, onClose }) {
  return (
    <div style={{ background: '#f3e8ff', border: '2px solid #c084fc', borderRadius: '10px', padding: '14px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <h3 style={{ margin: 0, color: '#6b21a8', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Sparkles size={20} /> Plan Anual sugerido por IA · {suggestions.length} cursos
        </h3>
        <button onClick={onClose} style={btn('#6b7280')}><X size={14} /> Descartar</button>
      </div>
      <div style={{ maxHeight: '360px', overflowY: 'auto', display: 'grid', gap: '8px', marginBottom: '10px' }}>
        {suggestions.map((s, i) => (
          <label key={i} style={{
            display: 'flex', gap: '8px', padding: '8px 10px', background: 'white', borderRadius: '6px',
            cursor: 'pointer', border: '1px solid ' + (selected.has(i) ? '#a855f7' : '#e2e8f0')
          }}>
            <input type="checkbox" checked={selected.has(i)} onChange={() => onToggle(i)} />
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '13px' }}>{s.course_name}</div>
              <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                {s.type} · {s.modality} · {s.duration_hours || '?'} h · Q{s.planned_quarter || '?'}
                {s.estimated_cost ? ` · ~${s.estimated_cost} USD` : ''}
              </div>
              {s.learning_objective && <div style={{ fontSize: '12px', color: '#334155', marginTop: '4px' }}>🎯 {s.learning_objective}</div>}
              {s.competency_gap_origin && <div style={{ fontSize: '12px', color: '#7c2d12', marginTop: '2px' }}>⚠ Brecha: {s.competency_gap_origin}</div>}
              {(s.target_jobs?.length > 0 || s.target_processes?.length > 0) && (
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '4px' }}>
                  {s.target_jobs?.length > 0 && <span>👤 {s.target_jobs.join(', ')} </span>}
                  {s.target_processes?.length > 0 && <span>⚙ {s.target_processes.join(', ')}</span>}
                </div>
              )}
            </div>
          </label>
        ))}
      </div>
      <button onClick={onSave} style={btn('#7c3aed')}><Save size={16} /> Guardar {selected.size} cursos en el plan</button>
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
function Row({ children }) { return <div style={{ display: 'flex', gap: '10px', marginBottom: '8px', flexWrap: 'wrap' }}>{children}</div> }
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
      <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto' }}>
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
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>{children}</div>
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
    <div style={{ marginBottom: block ? '8px' : 0, ...(block ? {} : {}) }}>
      <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '13px', color: '#1e293b', whiteSpace: 'pre-wrap' }}>{children}</div>
    </div>
  )
}
function ChipList({ items, color = '#475569' }) {
  return (
    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '2px' }}>
      {items.map((it, i) => (
        <span key={i} style={{ background: color + '22', color, padding: '2px 8px', borderRadius: '999px', fontSize: '11px' }}>{it}</span>
      ))}
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
  display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 8px',
  background: color, color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer',
  fontSize: '11px', fontWeight: 600
})
const badge = ({ bg, color }) => ({
  background: bg, color, padding: '2px 8px', borderRadius: '999px', fontSize: '11px', fontWeight: 600
})
