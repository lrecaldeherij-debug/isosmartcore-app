import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Search, Filter, Plus, Eye, Pencil, Trash2, X, AlertTriangle, ClipboardCheck,
  CalendarDays, ListChecks, Sparkles, Loader2, MessageSquare, FileText, ExternalLink,
  ShieldCheck, Calendar
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'
import { ChangeLogTimeline } from './components/ui'
import { useOrg } from './OrgContext'
import { exportInternalAudit } from './exports/exportInternalAudit'

const AUDIT_FIELD_LABELS = {
  audit_type: 'Tipo', status: 'Estado', year: 'Año',
  planned_date: 'Fecha planificada', actual_date: 'Fecha real',
  audit_process: 'Proceso auditado', audit_scope: 'Alcance', audit_criteria: 'Criterios',
  lead_auditor: 'Auditor líder', audit_team: 'Equipo',
  findings_count: 'Hallazgos', conclusions: 'Conclusiones',
  recommendations: 'Recomendaciones', audit_results: 'Observaciones', report_url: 'Informe',
}

// ───────────────────── Constantes ──────────────────────
const TYPE_OPTIONS = ['Programada', 'Extraordinaria', 'Seguimiento', 'Certificación']
const STATUS_OPTIONS = ['Planificada', 'En Ejecución', 'Cerrada', 'Cancelada']

const STATUS_COLORS = {
  'Planificada':   { bg: '#dbeafe', color: '#1e40af', border: '#bfdbfe' },
  'En Ejecución':  { bg: '#fef3c7', color: '#92400e', border: '#fde68a' },
  'Cerrada':       { bg: '#dcfce7', color: '#166534', border: '#bbf7d0' },
  'Cancelada':     { bg: '#f3f4f6', color: '#6b7280', border: '#e5e7eb' },
}

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const EMPTY_FORM = {
  audit_type: 'Programada',
  audit_process: '',
  process_id: '',
  planned_date: '',
  actual_date: '',
  status: 'Planificada',
  year: new Date().getFullYear(),
  audit_scope: '',
  audit_criteria: 'ISO 9001:2015',
  lead_auditor: '',
  auditor_name: '',
  audit_team: '',
  audit_results: '',
  findings_count: 0,
  conclusions: '',
  recommendations: '',
  report_url: '',
  audit_date: '',
  is_finished: false
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
  if (parsed && Array.isArray(parsed.audits)) return parsed.audits
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

function FormSection({ title, children }) {
  return (
    <div style={{ marginBottom: 18, paddingBottom: 14, borderBottom: '1px dashed #e5e7eb' }}>
      <h4 style={{ margin: '0 0 10px 0', color: '#1f2937', fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</h4>
      {children}
    </div>
  )
}

function DetailRow({ label, value }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 10, padding: '6px 0', borderBottom: '1px solid #f3f4f6' }}>
      <div style={{ color: '#6b7280', fontSize: 13 }}>{label}</div>
      <div style={{ color: '#111827', fontSize: 13 }}>{value}</div>
    </div>
  )
}

// ───────────────────── Componente ──────────────────────
export default function InternalAudits({ alReportar }) {
  const { org } = useOrg()
  const [items, setItems] = useState([])
  const [processes, setProcesses] = useState([])
  const [ncs, setNcs] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [detailItem, setDetailItem] = useState(null)
  const [viewMode, setViewMode] = useState('list')  // 'list' | 'program'
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear())

  const [filterStatus, setFilterStatus] = useState('')
  const [filterType, setFilterType] = useState('')
  const [search, setSearch] = useState('')

  // Chat Auditor IA (se mantiene)
  const [chatInput, setChatInput] = useState('')
  const [chatResponse, setChatResponse] = useState(null)
  const [loadingChat, setLoadingChat] = useState(false)
  const [hallazgoDetectado, setHallazgoDetectado] = useState(null)

  // IA Programa anual
  const [loadingIA, setLoadingIA] = useState(false)
  const [iaSuggestions, setIaSuggestions] = useState(null)
  const [iaSelected, setIaSelected] = useState(new Set())

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    setTableError(null)
    const { data, error } = await supabase
      .from('internal_audits')
      .select('*')
      .order('planned_date', { ascending: false, nullsFirst: false })
    if (error) {
      setTableError(error.message)
      setItems([])
    } else setItems(data || [])

    const [{ data: procs }, { data: ncRows }] = await Promise.all([
      supabase.from('processes').select('id, name').order('name'),
      supabase.from('non_conformities').select('id, description, status, source, created_at, audit_id')
    ])
    setProcesses(procs || [])
    setNcs(ncRows || [])
    setLoading(false)
  }

  // ─────────── Form ────────────
  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null) }

  const handleNew = () => { resetForm(); setShowForm(true) }
  const handleCancel = () => { resetForm(); setShowForm(false) }

  const exportarAuditPdf = async (item) => {
    const t = toast.loading('Generando PDF…')
    try {
      const doc = await exportInternalAudit(org, item.id)
      doc.save(`AUD-${(item.id || '').slice(0, 8).toUpperCase()}.pdf`)
      toast.done(t, 'PDF descargado')
    } catch (err) {
      toast.fail(t, 'Error generando PDF: ' + err.message)
    }
  }

  const handleEdit = (item) => {
    setForm({
      ...EMPTY_FORM,
      ...Object.fromEntries(Object.keys(EMPTY_FORM).map(k => [k, item[k] ?? EMPTY_FORM[k]])),
      audit_team: Array.isArray(item.audit_team) ? item.audit_team.join(', ') : (item.audit_team || '')
    })
    setEditingId(item.id)
    setShowForm(true)
    setDetailItem(null)
  }

  const handleDelete = async (id) => {
    if (!await confirm('¿Eliminar esta auditoría?', { tone: 'danger', confirmText: 'Eliminar' })) return
    const { error } = await supabase.from('internal_audits').delete().eq('id', id)
    if (error) toast.error(error.message); else { toast.success('Auditoría eliminada'); fetchAll() }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = { ...form }
    payload.findings_count = Number(payload.findings_count) || 0
    payload.year = Number(payload.year) || new Date().getFullYear()
    payload.is_finished = payload.status === 'Cerrada'
    if (!payload.process_id) payload.process_id = null
    ;['planned_date', 'actual_date', 'audit_date'].forEach(k => { if (!payload[k]) payload[k] = null })
    // audit_team: split por comas
    payload.audit_team = (payload.audit_team || '')
      .toString().split(',').map(s => s.trim()).filter(Boolean)

    if (editingId) {
      const prev = items.find(i => i.id === editingId)
      const changes = []
      Object.keys(payload).forEach(k => {
        if (prev && JSON.stringify(prev[k] ?? '') !== JSON.stringify(payload[k] ?? '')) {
          changes.push({ field: k, from: prev[k] ?? null, to: payload[k] ?? null })
        }
      })
      payload.change_log = [...(prev?.change_log || []), { at: new Date().toISOString(), changes }]
      const { error } = await supabase.from('internal_audits').update(payload).eq('id', editingId)
      if (error) return toast.error(error.message)
    } else {
      payload.change_log = [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: payload.audit_process }] }]
      const { error } = await supabase.from('internal_audits').insert([payload])
      if (error) return toast.error(error.message)
    }
    setShowForm(false); resetForm(); fetchAll()
  }

  // ─────────── IA Programa anual ────────────
  const sugerirProgramaIA = async () => {
    setLoadingIA(true); setIaSuggestions(null)
    try {
      const { data: profileRows } = await supabase.from('company_profile').select('*').limit(1)
      const profile = profileRows?.[0] || {}
      const ctx = `Empresa: ${profile.company_name || 'N/D'} | Sector: ${profile.industry || 'N/D'} | Productos: ${profile.main_products || 'N/D'}`
      const procesosList = processes.length
        ? processes.map(p => `- ${p.name}`).join('\n')
        : '- (no hay procesos cargados, usa procesos genéricos de ISO 9001)'

      const prompt = `Eres auditor líder ISO 9001. Diseña un PROGRAMA ANUAL de auditorías internas para el año ${yearFilter}.

Contexto: ${ctx}

Procesos a auditar:
${procesosList}

Reglas: 1 auditoría por proceso, distribuidas en distintos meses, cobertura total del SGC. Procesos críticos (Producción, Compras, Calidad) priorizados en Q1/Q2.

Devuelve SOLO un JSON array, sin texto antes ni después. Cada item:
- audit_process (string)
- planned_date (string YYYY-MM-${yearFilter} pero usa fecha completa con día 15 del mes elegido)
- audit_scope (string corto)
- audit_criteria (string, ej "ISO 9001:2015 cláusula 8.4")
- lead_auditor (string, "Por asignar" si no hay info)`

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
        audit_type: 'Programada',
        audit_process: s.audit_process || 'Sin proceso',
        planned_date: s.planned_date || null,
        audit_scope: s.audit_scope || '',
        audit_criteria: s.audit_criteria || 'ISO 9001:2015',
        lead_auditor: s.lead_auditor || 'Por asignar',
        status: 'Planificada',
        year: yearFilter,
        change_log: [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: 'IA programa' }] }]
      }))
    if (!rows.length) return setIaSuggestions(null)
    const { error } = await supabase.from('internal_audits').insert(rows)
    if (error) return toast.error(error.message)
    setIaSuggestions(null); fetchAll()
  }

  // ─────────── Asistente Virtual (mantenido) ────────────
  const consultarAuditor = async () => {
    if (!chatInput.trim()) return
    setLoadingChat(true); setChatResponse(null); setHallazgoDetectado(null)
    const systemPrompt = `Eres un auditor líder experto en normas ISO (9001, 14001, 45001).
Analiza la descripción del usuario, detecta desviaciones normativas y estructurá hallazgos.
Al final responde un JSON con: { "detected": true, "finding_type": "No Conformidad|Observación", "clause_iso": "x.x", "description": "...", "recommendation": "..." }`
    try {
      const raw = await consultarIA(chatInput, systemPrompt)
      let textoVisible = raw
      try {
        const m = raw.match(/\{[\s\S]*\}/)
        if (m) {
          const h = JSON.parse(m[0].trim())
          if (h && (h.detected || h.description)) {
            setHallazgoDetectado(h)
            textoVisible = raw.replace(m[0], '').replace(/```json/g, '').replace(/```/g, '').trim()
          }
        }
      } catch {}
      setChatResponse(textoVisible || 'Análisis completado.')
    } catch (err) {
      setChatResponse('Error: ' + err.message)
    }
    setLoadingChat(false)
  }

  const guardarHallazgoAutomatico = async () => {
    if (!hallazgoDetectado) return
    const { error } = await supabase.from('non_conformities').insert([{
      description: hallazgoDetectado.description,
      source: 'Auditoría Interna (IA)',
      root_cause: `Incumplimiento cláusula ${hallazgoDetectado.clause_iso}`,
      action_plan: hallazgoDetectado.recommendation,
      responsible: 'Por asignar',
      status: 'Abierto'
    }])
    if (error) return toast.error('Error: ' + error.message)
    toast.success('Hallazgo registrado')
    setHallazgoDetectado(null); setChatInput(''); setChatResponse(null)
    fetchAll()
  }

  const reportarHallazgo = (auditoria) => {
    alReportar?.('hallazgos', {
      description: `Hallazgo detectado en auditoría de ${auditoria.audit_process}.`,
      source: 'Auditoría Interna',
      responsible: auditoria.lead_auditor || auditoria.auditor_name || 'Por asignar',
      audit_id: auditoria.id
    })
  }

  // ─────────── Filtros + stats ────────────
  const filtered = useMemo(() => items.filter(it => {
    if (filterStatus && it.status !== filterStatus) return false
    if (filterType && it.audit_type !== filterType) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [it.audit_process, it.lead_auditor, it.auditor_name, it.audit_scope, it.audit_criteria]
        .filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [items, filterStatus, filterType, search])

  const stats = useMemo(() => {
    const yr = items.filter(i => i.year === yearFilter || (i.planned_date || '').startsWith(String(yearFilter)))
    const ncOpen = ncs.filter(n => n.status !== 'Cerrado' && n.source?.includes('Auditoría')).length
    return {
      total: yr.length,
      planificadas: yr.filter(i => i.status === 'Planificada').length,
      enEjecucion: yr.filter(i => i.status === 'En Ejecución').length,
      cerradas: yr.filter(i => i.status === 'Cerrada').length,
      ncOpen
    }
  }, [items, ncs, yearFilter])

  // Programa anual — agrupar por mes
  const programByMonth = useMemo(() => {
    const map = Array.from({ length: 12 }, () => [])
    items
      .filter(i => i.year === yearFilter || (i.planned_date || '').startsWith(String(yearFilter)))
      .forEach(i => {
        const d = i.planned_date || i.actual_date
        if (!d) return
        const m = new Date(d).getMonth()
        if (m >= 0 && m < 12) map[m].push(i)
      })
    return map
  }, [items, yearFilter])

  const ncsForAudit = (auditId) => ncs.filter(n => n.audit_id === auditId)

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1f2937', margin: 0 }}>
            <ShieldCheck size={22} /> Auditoría Interna
          </h2>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: 13 }}>ISO 9.2 — Programa, ejecución y seguimiento</p>
        </div>
        {!showForm && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={sugerirProgramaIA} disabled={loadingIA}
              style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              {loadingIA ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
              Sugerir programa {yearFilter}
            </button>
            <button onClick={handleNew}
              style={{ padding: '8px 14px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <Plus size={16} /> Nueva Auditoría
            </button>
          </div>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['9.2']} />

      {tableError && (
        <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13 }}>
          <strong>Tabla no encontrada:</strong> {tableError}. Aplica la migración <code>iso_migration_v40_internal_audits_auditable.sql</code>.
        </div>
      )}

      {/* Asistente Virtual IA */}
      <div style={{ marginTop: 16, padding: 18, background: '#f5f7ff', border: '1px solid #e0e7ff', borderRadius: 12 }}>
        <h3 style={{ margin: '0 0 10px 0', color: '#4338ca', display: 'flex', alignItems: 'center', gap: 8, fontSize: 15 }}>
          <Sparkles size={18} /> Asistente de Auditoría Virtual
        </h3>
        <div style={{ display: 'flex', gap: 10 }}>
          <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
            placeholder='Ej: "No se encontró el manual de funciones en el área de producción..."'
            style={{ flex: 1, minHeight: 70, padding: 10, border: '1px solid #c7d2fe', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', background: 'white' }} />
          <button onClick={consultarAuditor} disabled={loadingChat || !chatInput.trim()}
            style={{ width: 140, padding: 10, background: '#4338ca', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            {loadingChat ? <Loader2 className="animate-spin" /> : <MessageSquare size={20} />}
            {loadingChat ? 'Pensando...' : 'Consultar'}
          </button>
        </div>
        {chatResponse && (
          <div style={{ marginTop: 14, background: 'white', padding: 14, borderRadius: 8, border: '1px solid #e0e7ff' }}>
            <div style={{ whiteSpace: 'pre-wrap', color: '#374151', fontSize: 13 }}>{chatResponse}</div>
            {hallazgoDetectado && (
              <div style={{ marginTop: 12, borderTop: '1px solid #eee', paddingTop: 10 }}>
                <span style={{ padding: '2px 10px', background: '#fef3c7', color: '#92400e', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>
                  {hallazgoDetectado.finding_type}
                </span>
                <p style={{ fontSize: 13, margin: '6px 0' }}><strong>Cláusula:</strong> {hallazgoDetectado.clause_iso}</p>
                <button onClick={guardarHallazgoAutomatico}
                  style={{ padding: '8px 16px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                  Confirmar y registrar hallazgo
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, margin: '16px 0' }}>
        <KPI icon={CalendarDays} label={`Total ${yearFilter}`} value={stats.total} color="#0ea5e9" />
        <KPI icon={Calendar} label="Planificadas" value={stats.planificadas} color="#3b82f6" />
        <KPI icon={Loader2} label="En Ejecución" value={stats.enEjecucion} color="#f59e0b" />
        <KPI icon={ClipboardCheck} label="Cerradas" value={stats.cerradas} color="#16a34a" />
        <KPI icon={AlertTriangle} label="NCs abiertas" value={stats.ncOpen} color="#dc2626" sub="De auditorías" />
      </div>

      {/* Filtros + vista */}
      {!showForm && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: 2 }}>
            <button onClick={() => setViewMode('list')} style={modeBtn(viewMode === 'list')}>
              <ListChecks size={14} /> Lista
            </button>
            <button onClick={() => setViewMode('program')} style={modeBtn(viewMode === 'program')}>
              <CalendarDays size={14} /> Programa anual
            </button>
          </div>
          <input type="number" value={yearFilter} onChange={e => setYearFilter(Number(e.target.value))}
            style={{ width: 90, padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
          {viewMode === 'list' && (
            <>
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
            </>
          )}
        </div>
      )}

      {/* FORM */}
      {showForm && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
          <h3 style={{ margin: '0 0 16px 0', color: '#1f2937' }}>{editingId ? 'Editar' : 'Nueva'} Auditoría</h3>
          <form onSubmit={handleSubmit}>
            <FormSection title="Tipo y planificación">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                <SelectField label="Tipo" value={form.audit_type} options={TYPE_OPTIONS} onChange={v => setForm({ ...form, audit_type: v })} />
                <SelectField label="Estado" value={form.status} options={STATUS_OPTIONS} onChange={v => setForm({ ...form, status: v })} />
                <Field label="Fecha planificada" type="date" value={form.planned_date} onChange={v => setForm({ ...form, planned_date: v })} />
                <Field label="Fecha real" type="date" value={form.actual_date} onChange={v => setForm({ ...form, actual_date: v })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 12, marginTop: 10 }}>
                <Field label="Proceso (texto)" value={form.audit_process} onChange={v => setForm({ ...form, audit_process: v })} required />
                <Field label="Año" type="number" value={form.year} onChange={v => setForm({ ...form, year: v })} />
              </div>
              {processes.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <SelectField label="Vincular a proceso del mapa (opcional)" value={form.process_id}
                    options={[{ id: '', name: '— ninguno —' }, ...processes].map(p => ({ value: p.id, label: p.name }))}
                    raw onChange={v => setForm({ ...form, process_id: v })} />
                </div>
              )}
            </FormSection>

            <FormSection title="Alcance y criterios (ISO 9.2.2)">
              <Field label="Alcance" value={form.audit_scope} onChange={v => setForm({ ...form, audit_scope: v })}
                placeholder="Ej: Proceso completo de compras, desde solicitud hasta liberación" />
              <div style={{ marginTop: 10 }}>
                <Field label="Criterios (normas/cláusulas)" value={form.audit_criteria} onChange={v => setForm({ ...form, audit_criteria: v })} placeholder="ISO 9001:2015 cláusula 8.4" />
              </div>
            </FormSection>

            <FormSection title="Equipo auditor (imparcialidad)">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Auditor líder" value={form.lead_auditor} onChange={v => setForm({ ...form, lead_auditor: v })} />
                <Field label="Equipo (separar por coma)" value={form.audit_team} onChange={v => setForm({ ...form, audit_team: v })} placeholder="Juan Pérez, María Gómez" />
              </div>
              <div style={{ marginTop: 8, padding: 8, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
                💡 Recordatorio: el auditor no debe ser responsable del proceso auditado.
              </div>
            </FormSection>

            <FormSection title="Resultados">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Cantidad de hallazgos" type="number" value={form.findings_count} onChange={v => setForm({ ...form, findings_count: v })} />
                <Field label="Link a informe (Drive)" value={form.report_url} onChange={v => setForm({ ...form, report_url: v })} placeholder="https://drive.google.com/..." />
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Conclusiones</label>
                <textarea value={form.conclusions} onChange={e => setForm({ ...form, conclusions: e.target.value })} rows={3}
                  style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Recomendaciones</label>
                <textarea value={form.recommendations} onChange={e => setForm({ ...form, recommendations: e.target.value })} rows={2}
                  style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
              </div>
              <div style={{ marginTop: 10 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>Observaciones libres</label>
                <textarea value={form.audit_results} onChange={e => setForm({ ...form, audit_results: e.target.value })} rows={2}
                  style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, fontFamily: 'inherit' }} />
              </div>
            </FormSection>

            <div style={{ display: 'flex', gap: 8 }}>
              <button type="submit" style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                {editingId ? 'Guardar cambios' : 'Crear auditoría'}
              </button>
              <button type="button" onClick={handleCancel} style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* VISTA LISTA */}
      {!showForm && viewMode === 'list' && (
        loading ? <p>Cargando...</p> : (
          <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left', fontSize: 12, color: '#374151', textTransform: 'uppercase' }}>
                  <th style={{ padding: 12 }}>Proceso / Tipo</th>
                  <th style={{ padding: 12 }}>Planificada</th>
                  <th style={{ padding: 12 }}>Auditor líder</th>
                  <th style={{ padding: 12 }}>Hallazgos</th>
                  <th style={{ padding: 12 }}>Estado</th>
                  <th style={{ padding: 12, textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                    Sin auditorías. Usa <strong>Sugerir programa</strong> para arrancar el año.
                  </td></tr>
                )}
                {filtered.map(item => {
                  const st = STATUS_COLORS[item.status] || STATUS_COLORS['Planificada']
                  const atrasada = item.status === 'Planificada' && item.planned_date && item.planned_date < today
                  return (
                    <tr key={item.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: 12 }}>
                        <strong style={{ color: '#111827' }}>{item.audit_process || '—'}</strong>
                        <div style={{ fontSize: 11, color: '#6b7280' }}>{item.audit_type}</div>
                      </td>
                      <td style={{ padding: 12, fontSize: 13, color: atrasada ? '#dc2626' : '#374151', fontWeight: atrasada ? 700 : 400 }}>
                        {item.planned_date || '—'}
                        {atrasada && <div style={{ fontSize: 10 }}>ATRASADA</div>}
                      </td>
                      <td style={{ padding: 12, fontSize: 13 }}>{item.lead_auditor || item.auditor_name || '—'}</td>
                      <td style={{ padding: 12, fontSize: 13, fontWeight: 700 }}>{item.findings_count || 0}</td>
                      <td style={{ padding: 12 }}>
                        <span style={{ background: st.bg, color: st.color, padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 700, border: `1px solid ${st.border}` }}>
                          {item.status}
                        </span>
                      </td>
                      <td style={{ padding: 12, textAlign: 'right' }}>
                        {item.report_url && (
                          <a href={item.report_url} target="_blank" rel="noreferrer" title="Ver informe"
                            style={{ ...iconBtn('#0ea5e9'), textDecoration: 'none', display: 'inline-flex' }}><FileText size={16} /></a>
                        )}
                        <button onClick={() => setDetailItem(item)} title="Detalle" style={iconBtn('#0ea5e9')}><Eye size={16} /></button>
                        <button onClick={() => handleEdit(item)} title="Editar" style={iconBtn('#f59e0b')}><Pencil size={16} /></button>
                        <button onClick={() => reportarHallazgo(item)} title="Reportar hallazgo → NC" style={iconBtn('#dc2626')}><AlertTriangle size={16} /></button>
                        <button onClick={() => handleDelete(item.id)} title="Eliminar" style={iconBtn('#6b7280')}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* VISTA PROGRAMA ANUAL */}
      {!showForm && viewMode === 'program' && (
        <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
          <h3 style={{ margin: '0 0 12px 0', color: '#1f2937', fontSize: 15 }}>Programa anual {yearFilter}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            {MONTHS.map((m, idx) => (
              <div key={idx} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 10, minHeight: 100 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>{m}</div>
                {programByMonth[idx].length === 0 && (
                  <div style={{ fontSize: 11, color: '#cbd5e1' }}>— sin auditorías —</div>
                )}
                {programByMonth[idx].map(a => {
                  const st = STATUS_COLORS[a.status] || STATUS_COLORS['Planificada']
                  return (
                    <div key={a.id} onClick={() => setDetailItem(a)}
                      style={{ background: 'white', border: `1px solid ${st.border}`, borderLeft: `4px solid ${st.color}`, borderRadius: 6, padding: 8, marginBottom: 6, cursor: 'pointer' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>{a.audit_process}</div>
                      <div style={{ fontSize: 10, color: '#6b7280' }}>{a.lead_auditor || '—'} · {a.planned_date}</div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL DETALLE */}
      {detailItem && createPortal(
        <ModalShell onClose={() => setDetailItem(null)} title={detailItem.audit_process || 'Auditoría'}>
          <DetailRow label="Tipo" value={detailItem.audit_type} />
          <DetailRow label="Estado" value={detailItem.status} />
          <DetailRow label="Año" value={detailItem.year} />
          <DetailRow label="Fecha planificada" value={detailItem.planned_date} />
          <DetailRow label="Fecha real" value={detailItem.actual_date} />
          <DetailRow label="Alcance" value={detailItem.audit_scope} />
          <DetailRow label="Criterios" value={detailItem.audit_criteria} />
          <DetailRow label="Auditor líder" value={detailItem.lead_auditor} />
          <DetailRow label="Equipo" value={Array.isArray(detailItem.audit_team) ? detailItem.audit_team.join(', ') : detailItem.audit_team} />
          <DetailRow label="Hallazgos" value={detailItem.findings_count} />
          <DetailRow label="Conclusiones" value={detailItem.conclusions} />
          <DetailRow label="Recomendaciones" value={detailItem.recommendations} />
          <DetailRow label="Observaciones" value={detailItem.audit_results} />
          {detailItem.report_url && (
            <DetailRow label="Informe" value={
              <a href={detailItem.report_url} target="_blank" rel="noreferrer" style={{ color: '#0ea5e9', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                Abrir informe <ExternalLink size={12} />
              </a>
            } />
          )}

          {/* NCs vinculadas */}
          <h4 style={{ margin: '20px 0 8px 0', fontSize: 13, fontWeight: 700, color: '#1f2937', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            <AlertTriangle size={14} style={{ verticalAlign: 'middle' }} /> No conformidades vinculadas
          </h4>
          {(() => {
            const list = ncsForAudit(detailItem.id)
            if (!list.length) return <div style={{ fontSize: 13, color: '#9ca3af', padding: 8 }}>Sin NCs vinculadas a esta auditoría.</div>
            return (
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f9fafb', color: '#6b7280', textAlign: 'left' }}>
                    <th style={{ padding: 6 }}>Descripción</th>
                    <th style={{ padding: 6 }}>Estado</th>
                    <th style={{ padding: 6 }}>Fecha</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(n => (
                    <tr key={n.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                      <td style={{ padding: 6 }}>{n.description}</td>
                      <td style={{ padding: 6 }}>{n.status}</td>
                      <td style={{ padding: 6 }}>{n.created_at?.slice(0, 10)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          })()}

          <h4 style={{ margin: '20px 0 8px 0', fontSize: 13, fontWeight: 700, color: '#1f2937', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            🕓 Historial de cambios
          </h4>
          <ChangeLogTimeline entries={detailItem.change_log || []} fieldLabels={AUDIT_FIELD_LABELS} max={5} compact />

          <div style={{ marginTop: 16, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => exportarAuditPdf(detailItem)} style={{ padding: '8px 14px', background: '#0891b2', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FileText size={14} /> Exportar PDF
            </button>
            <button onClick={() => { handleEdit(detailItem) }} style={{ padding: '8px 14px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Editar</button>
            <button onClick={() => { reportarHallazgo(detailItem); setDetailItem(null) }} style={{ padding: '8px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Reportar hallazgo</button>
          </div>
        </ModalShell>,
        document.body
      )}

      {/* MODAL IA Programa */}
      {iaSuggestions && createPortal(
        <ModalShell onClose={() => setIaSuggestions(null)} title={`Programa anual sugerido ${yearFilter}`} wide>
          <p style={{ color: '#6b7280', fontSize: 13 }}>Marcá las auditorías a planificar. Se cargarán en estado <em>Planificada</em>.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: 8, width: 30 }}></th>
                <th style={{ padding: 8 }}>Proceso</th>
                <th style={{ padding: 8 }}>Fecha</th>
                <th style={{ padding: 8 }}>Alcance</th>
                <th style={{ padding: 8 }}>Criterios</th>
                <th style={{ padding: 8 }}>Líder</th>
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
                  <td style={{ padding: 8, fontWeight: 600 }}>{s.audit_process}</td>
                  <td style={{ padding: 8 }}>{s.planned_date}</td>
                  <td style={{ padding: 8, color: '#6b7280' }}>{s.audit_scope}</td>
                  <td style={{ padding: 8 }}>{s.audit_criteria}</td>
                  <td style={{ padding: 8 }}>{s.lead_auditor}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={saveIaSelected} style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Cargar {iaSelected.size} auditorías
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

function SelectField({ label, value, options, onChange, raw = false }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>
      <select value={value ?? ''} onChange={e => onChange(e.target.value)}
        style={{ width: '100%', padding: 8, border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: 'white' }}>
        {options.map(o => raw
          ? <option key={o.value} value={o.value}>{o.label}</option>
          : <option key={o} value={o}>{o}</option>)}
      </select>
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
