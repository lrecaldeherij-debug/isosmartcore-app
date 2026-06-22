import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  Sparkles, Loader2, Map as MapIcon, Trash2, X, ExternalLink, FileText, Pencil,
  Search, Filter, Plus, Eye, AlertTriangle, ListChecks, Workflow, Users, Calendar,
  ArrowUp, ArrowDown
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import ModuleSeedBanner from './ModuleSeedBanner'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

// ──────────────── Constantes ────────────────
const TYPE_OPTIONS = ['Estratégico', 'Operativo', 'Soporte']
const STATUS_OPTIONS = ['Activo', 'En revisión', 'Borrador', 'Obsoleto']
const TYPE_PREFIX = { 'Estratégico': 'PE', 'Operativo': 'PO', 'Soporte': 'PS' }

const TYPE_COLORS = {
  'Estratégico': '#10b981',
  'Operativo':   '#3b82f6',
  'Soporte':     '#8b5cf6',
}

const STATUS_COLORS = {
  'Activo':       { bg: '#dcfce7', color: '#166534' },
  'En revisión':  { bg: '#fef3c7', color: '#92400e' },
  'Borrador':     { bg: '#e0e7ff', color: '#3730a3' },
  'Obsoleto':     { bg: '#f3f4f6', color: '#6b7280' },
}

const EMPTY_FORM = {
  name: '', code: '', process_type: 'Operativo',
  objective: '', scope: '', responsible_role: '',
  process_owner: '', procedure_url: '',
  revision: 'v1.0', last_reviewed_at: '', next_review_date: '',
  status: 'Borrador',
  entries_json: [{ proveedor: '', entrada: '' }],
  activities_json: [{ actividad: '', responsable: '' }],
  outputs_json: [{ salida: '', cliente: '' }],
  resources_json: { personal: '', infraestructura: '', equipos: '', programas: '' },
  risks_json: [{ riesgo: '', control: '', responsable: '' }],
  indicators_json: [{ nombre: '', calculo: '', meta: '', frecuencia: '' }],
  approvals_json: { elaborado: '', revisado: '', aprobado: '' },
  interactions_upstream: [],
  interactions_downstream: []
}

// ──────────────── Helpers IA ────────────────
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
  if (parsed && Array.isArray(parsed.interactions)) return parsed.interactions
  if (parsed && Array.isArray(parsed.items)) return parsed.items
  if (parsed && Array.isArray(parsed.connections)) return parsed.connections
  if (parsed && Array.isArray(parsed.edges)) return parsed.edges
  if (parsed && typeof parsed === 'object' && parsed.from_id && parsed.to_id) return [parsed]
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
        try {
          const obj = JSON.parse(raw.slice(start, i + 1))
          if (obj && (obj.from_id || obj.to_id || obj.from_name)) out.push(obj)
        } catch {}
        start = -1
      }
    }
  }
  return out
}

// ──────────────── Subcomponentes ────────────────
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

// ──────────────── Componente ────────────────
export default function Processes() {
  const [items, setItems] = useState([])
  const [audits, setAudits] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(null)

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const [detailItem, setDetailItem] = useState(null)
  const [viewMode, setViewMode] = useState('cards')  // 'cards' | 'flow'
  const [highlightId, setHighlightId] = useState(null)

  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [search, setSearch] = useState('')

  const [loadingIA, setLoadingIA] = useState(false)
  const [loadingIAInter, setLoadingIAInter] = useState(false)
  const [iaInteractions, setIaInteractions] = useState(null)

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true); setTableError(null)
    const { data, error } = await supabase.from('processes').select('*').order('process_type').order('name')
    if (error) { setTableError(error.message); setItems([]) }
    else setItems(data || [])

    const { data: aud } = await supabase.from('internal_audits').select('id, audit_process, process_id, planned_date, status, findings_count')
    setAudits(aud || [])
    setLoading(false)
  }

  // ──────────── Form helpers ────────────
  const resetForm = () => { setForm(EMPTY_FORM); setEditingId(null) }
  const handleNew = () => { resetForm(); setShowForm(true) }
  const handleCancel = () => { resetForm(); setShowForm(false) }

  const sugerirCodigo = () => {
    const prefix = TYPE_PREFIX[form.process_type] || 'PR'
    const existing = items.filter(p => p.code?.startsWith(prefix + '-'))
    const numbers = existing.map(p => parseInt(p.code.split('-')[1])).filter(n => !isNaN(n))
    const next = numbers.length ? Math.max(...numbers) + 1 : 1
    setForm({ ...form, code: `${prefix}-${String(next).padStart(2, '0')}` })
  }

  const handleAddField = (field) => {
    const templates = {
      entries_json: { proveedor: '', entrada: '' },
      activities_json: { actividad: '', responsable: '' },
      outputs_json: { salida: '', cliente: '' },
      risks_json: { riesgo: '', control: '', responsable: '' },
      indicators_json: { nombre: '', calculo: '', meta: '', frecuencia: '' }
    }
    setForm({ ...form, [field]: [...form[field], templates[field]] })
  }

  const handleUpdateArray = (field, index, key, value) => {
    const updated = [...form[field]]
    updated[index] = { ...updated[index], [key]: value }
    setForm({ ...form, [field]: updated })
  }

  const handleRemoveArrayRow = (field, index) => {
    const updated = form[field].filter((_, i) => i !== index)
    setForm({ ...form, [field]: updated })
  }

  // ──────────── IA caracterización ────────────
  const sugerirCaracterizacionIA = async () => {
    if (!form.name) return toast.warning('Escribí el nombre del proceso primero')
    setLoadingIA(true)
    try {
      const prompt = `
Proceso: "${form.name}"
Tipo: "${form.process_type}"

Tarea: Sugerir la caracterización técnica según ISO 9001.
1. Objetivo y Alcance.
2. 3 Entradas principales.
3. 5 Actividades clave del flujo.
4. 3 Salidas principales.
5. 2 Riesgos con sus controles.
6. 1 Indicador clave (KPI).

Responde estrictamente en JSON:
{
  "objetivo": "...",
  "alcance": "...",
  "entradas": [{"proveedor":"...","entrada":"..."}],
  "actividades": [{"actividad":"...","responsable":"..."}],
  "salidas": [{"salida":"...","cliente":"..."}],
  "riesgos": [{"riesgo":"...","control":"...","responsable":"..."}],
  "indicadores": [{"nombre":"...","calculo":"...","meta":"...","frecuencia":"..."}]
}`
      const raw = await consultarIA(prompt, 'Eres ingeniero de procesos ISO 9001. Devolvé solo JSON.')
      const data = extractFirstJson(raw)
      if (!data) throw new Error('La IA no devolvió JSON válido')
      setForm({
        ...form,
        objective: data.objetivo || form.objective,
        scope: data.alcance || form.scope,
        entries_json: Array.isArray(data.entradas) && data.entradas.length ? data.entradas : form.entries_json,
        activities_json: Array.isArray(data.actividades) && data.actividades.length ? data.actividades : form.activities_json,
        outputs_json: Array.isArray(data.salidas) && data.salidas.length ? data.salidas : form.outputs_json,
        risks_json: Array.isArray(data.riesgos) && data.riesgos.length ? data.riesgos : form.risks_json,
        indicators_json: Array.isArray(data.indicadores) && data.indicadores.length ? data.indicadores : form.indicators_json
      })
    } catch (e) {
      toast.error('Error IA: ' + e.message)
    }
    setLoadingIA(false)
  }

  // ──────────── IA interacciones ────────────
  const sugerirInteraccionesIA = async () => {
    if (items.length < 3) return toast.warning('Necesitás al menos 3 procesos cargados para que la IA sugiera interacciones')
    setLoadingIAInter(true); setIaInteractions(null)
    try {
      const procesos = items.map(p => ({
        id: p.id,
        name: p.name,
        type: p.process_type,
        outputs: (p.outputs_json || []).map(o => o.salida).filter(Boolean),
        entries: (p.entries_json || []).map(e => e.entrada).filter(Boolean)
      }))
      const prompt = `Sos consultor ISO 9001. Analizá estos procesos y devolvé las interacciones (qué proceso alimenta a cuál) basándote en lógica de negocio típica entre Estratégicos → Operativos ← Soporte.

PROCESOS:
${JSON.stringify(procesos, null, 2)}

INSTRUCCIONES:
- Devolvé ENTRE 3 y 10 interacciones realistas.
- Usá los IDs EXACTOS que aparecen arriba en "from_id" y "to_id".
- Respondé SOLO con un JSON array. NO uses markdown ni texto explicativo. NO uses bloques de código.

FORMATO EXACTO (ejemplo):
[
  {"from_id":"<id-real-de-arriba>","to_id":"<id-real-de-arriba>","from_name":"Nombre A","to_name":"Nombre B","label":"qué se transfiere"}
]`
      const raw = await consultarIA(prompt, 'Eres un experto ISO 9001. Devolvé ÚNICAMENTE un JSON array válido, sin markdown ni texto antes/después.')
      console.log('[IA interacciones] raw:', raw)
      let arr = parseAiArray(raw)

      // Fallback: si IA devuelve nombres pero los IDs no coinciden, mapear por nombre
      const idSet = new Set(items.map(p => p.id))
      const nameToId = {}
      items.forEach(p => { nameToId[p.name.toLowerCase().trim()] = p.id })

      arr = arr.map(i => {
        const from_id = idSet.has(i.from_id) ? i.from_id : nameToId[(i.from_name || '').toLowerCase().trim()]
        const to_id   = idSet.has(i.to_id)   ? i.to_id   : nameToId[(i.to_name   || '').toLowerCase().trim()]
        const from_name = items.find(p => p.id === from_id)?.name || i.from_name
        const to_name   = items.find(p => p.id === to_id)?.name   || i.to_name
        return { ...i, from_id, to_id, from_name, to_name }
      }).filter(i => i.from_id && i.to_id && i.from_id !== i.to_id)

      if (!arr.length) throw new Error('La IA respondió pero las interacciones no son interpretables. Mirá la consola del navegador (F12) para ver la respuesta cruda.')
      setIaInteractions(arr)
    } catch (e) {
      toast.error('Error IA: ' + e.message)
    }
    setLoadingIAInter(false)
  }

  const aplicarInteraccionesIA = async () => {
    if (!iaInteractions) return
    const upstreamMap = {}, downstreamMap = {}
    iaInteractions.forEach(i => {
      if (!upstreamMap[i.to_id]) upstreamMap[i.to_id] = []
      upstreamMap[i.to_id].push({ process_id: i.from_id, label: i.label || '' })
      if (!downstreamMap[i.from_id]) downstreamMap[i.from_id] = []
      downstreamMap[i.from_id].push({ process_id: i.to_id, label: i.label || '' })
    })
    const updates = items.filter(p => upstreamMap[p.id] || downstreamMap[p.id]).map(p =>
      supabase.from('processes').update({
        interactions_upstream: upstreamMap[p.id] || p.interactions_upstream || [],
        interactions_downstream: downstreamMap[p.id] || p.interactions_downstream || []
      }).eq('id', p.id)
    )
    await Promise.all(updates)
    setIaInteractions(null); fetchAll()
  }

  // ──────────── CRUD ────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = { ...form }
    ;['last_reviewed_at', 'next_review_date'].forEach(k => { if (!payload[k]) payload[k] = null })

    if (editingId) {
      const prev = items.find(i => i.id === editingId)
      const changes = []
      Object.keys(payload).forEach(k => {
        if (prev && JSON.stringify(prev[k] ?? '') !== JSON.stringify(payload[k] ?? '')) {
          changes.push({ field: k, from: prev[k] ?? null, to: payload[k] ?? null })
        }
      })
      payload.change_log = [...(prev?.change_log || []), { at: new Date().toISOString(), changes }]
      const { error } = await supabase.from('processes').update(payload).eq('id', editingId)
      if (error) return toast.error(error.message)
    } else {
      payload.change_log = [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: payload.name }] }]
      const { error } = await supabase.from('processes').insert([payload])
      if (error) return toast.error(error.message)
    }
    setShowForm(false); resetForm(); fetchAll()
  }

  const handleEdit = (proceso) => {
    setForm({
      ...EMPTY_FORM,
      ...Object.fromEntries(Object.entries(proceso).map(([k, v]) => [k, v ?? EMPTY_FORM[k] ?? ''])),
      entries_json: proceso.entries_json?.length ? proceso.entries_json : [{ proveedor: '', entrada: '' }],
      activities_json: proceso.activities_json?.length ? proceso.activities_json : [{ actividad: '', responsable: '' }],
      outputs_json: proceso.outputs_json?.length ? proceso.outputs_json : [{ salida: '', cliente: '' }],
      resources_json: proceso.resources_json || EMPTY_FORM.resources_json,
      risks_json: proceso.risks_json?.length ? proceso.risks_json : [{ riesgo: '', control: '', responsable: '' }],
      indicators_json: proceso.indicators_json?.length ? proceso.indicators_json : [{ nombre: '', calculo: '', meta: '', frecuencia: '' }],
      approvals_json: proceso.approvals_json || EMPTY_FORM.approvals_json,
      interactions_upstream: proceso.interactions_upstream || [],
      interactions_downstream: proceso.interactions_downstream || []
    })
    setEditingId(proceso.id); setDetailItem(null); setShowForm(true)
  }

  const handleDelete = async (id) => {
    if (!await confirm('¿Eliminar esta ficha?', { tone: 'danger', confirmText: 'Eliminar' })) return
    const { error } = await supabase.from('processes').delete().eq('id', id)
    if (error) toast.error(error.message)
    else { toast.success('Proceso eliminado'); setDetailItem(null); fetchAll() }
  }

  // ──────────── Filtros + stats ────────────
  const filtered = useMemo(() => items.filter(it => {
    if (filterType && it.process_type !== filterType) return false
    if (filterStatus && it.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [it.name, it.code, it.objective, it.process_owner, it.responsible_role].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [items, filterType, filterStatus, search])

  const today = new Date().toISOString().slice(0, 10)
  const stats = useMemo(() => ({
    total: items.length,
    estrategicos: items.filter(i => i.process_type === 'Estratégico').length,
    operativos: items.filter(i => i.process_type === 'Operativo').length,
    soporte: items.filter(i => i.process_type === 'Soporte').length,
    sinOwner: items.filter(i => !i.process_owner && !i.responsible_role).length,
    sinInteracciones: items.filter(i =>
      (!i.interactions_upstream || i.interactions_upstream.length === 0) &&
      (!i.interactions_downstream || i.interactions_downstream.length === 0)
    ).length,
    revisionVencida: items.filter(i => i.next_review_date && i.next_review_date < today).length
  }), [items, today])

  const procById = useMemo(() => {
    const map = {}
    items.forEach(p => { map[p.id] = p })
    return map
  }, [items])

  const auditsForProcess = (pid) => audits.filter(a => a.process_id === pid)

  // ──────────── Render ────────────
  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#1f2937', margin: 0 }}>
            <MapIcon size={22} /> Mapa de Procesos
          </h2>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: 13 }}>ISO 4.4 — Caracterización e interacciones</p>
        </div>
        {!showForm && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={sugerirInteraccionesIA} disabled={loadingIAInter || items.length < 3}
              style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: items.length < 3 ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600, opacity: items.length < 3 ? 0.5 : 1 }}>
              {loadingIAInter ? <Loader2 size={16} className="animate-spin" /> : <Workflow size={16} />}
              Sugerir interacciones IA
            </button>
            <button onClick={handleNew}
              style={{ padding: '8px 14px', background: '#0ea5e9', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <Plus size={16} /> Nueva ficha
            </button>
          </div>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['4.4']} />

      <ModuleSeedBanner moduleKey="processes" label="mapa de procesos" visible={!loading && items.length === 0} onSeeded={fetchAll} />

      {tableError && (
        <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, color: '#991b1b', fontSize: 13 }}>
          <strong>Tabla no encontrada:</strong> {tableError}. Aplicá <code>iso_migration_v42_processes_auditable.sql</code>.
        </div>
      )}

      {/* Dashboard */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, margin: '16px 0' }}>
        <KPI icon={MapIcon} label="Total procesos" value={stats.total} color="#0ea5e9" />
        <KPI icon={Workflow} label="Sin interacciones" value={stats.sinInteracciones} color="#f59e0b" sub="Hay que mapear" />
        <KPI icon={Users} label="Sin responsable" value={stats.sinOwner} color="#dc2626" />
        <KPI icon={Calendar} label="Revisión vencida" value={stats.revisionVencida} color="#dc2626" />
        <KPI icon={ListChecks} label="Distribución" value={`${stats.estrategicos}/${stats.operativos}/${stats.soporte}`} color="#7c3aed" sub="E / O / S" />
      </div>

      {/* Filtros + vista */}
      {!showForm && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <div style={{ display: 'flex', background: 'white', border: '1px solid #d1d5db', borderRadius: 8, padding: 2 }}>
            <button onClick={() => setViewMode('cards')} style={modeBtn(viewMode === 'cards')}>
              <ListChecks size={14} /> Tarjetas
            </button>
            <button onClick={() => setViewMode('flow')} style={modeBtn(viewMode === 'flow')}>
              <Workflow size={14} /> Interacciones
            </button>
          </div>
          <div style={{ position: 'relative', flex: '1 1 220px', minWidth: 200 }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#9ca3af' }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..."
              style={{ width: '100%', padding: '8px 8px 8px 30px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
          </div>
          <Filter size={14} color="#6b7280" />
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }}>
            <option value="">Tipo: Todos</option>
            {TYPE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, color: '#1f2937' }}>{editingId ? 'Editar' : 'Nueva'} Ficha de Proceso</h3>
            <button type="button" onClick={sugerirCaracterizacionIA} disabled={loadingIA}
              style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
              {loadingIA ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
              Autocompletar con IA
            </button>
          </div>

          <form onSubmit={handleSubmit}>
            <FormSection title="Identificación">
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr auto 1fr 1fr', gap: 12, alignItems: 'end' }}>
                <Field label="Nombre *" value={form.name} required onChange={v => setForm({ ...form, name: v })} />
                <Field label="Código" value={form.code} onChange={v => setForm({ ...form, code: v })} />
                <button type="button" onClick={sugerirCodigo}
                  style={{ padding: 8, background: '#e0e7ff', color: '#3730a3', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, height: 36 }}>
                  Sugerir
                </button>
                <SelectField label="Tipo" value={form.process_type} options={TYPE_OPTIONS} onChange={v => setForm({ ...form, process_type: v })} />
                <SelectField label="Estado" value={form.status} options={STATUS_OPTIONS} onChange={v => setForm({ ...form, status: v })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 10 }}>
                <Field label="Owner del proceso" value={form.process_owner} onChange={v => setForm({ ...form, process_owner: v })} placeholder="Nombre y cargo del responsable" />
                <Field label="Rol responsable" value={form.responsible_role} onChange={v => setForm({ ...form, responsible_role: v })} />
              </div>
            </FormSection>

            <FormSection title="Propósito">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <TextArea label="Objetivo *" rows={3} value={form.objective} onChange={v => setForm({ ...form, objective: v })} required />
                <TextArea label="Alcance *" rows={3} value={form.scope} onChange={v => setForm({ ...form, scope: v })} required />
              </div>
              <div style={{ marginTop: 10 }}>
                <Field label="📂 Procedimiento detallado (Drive)" value={form.procedure_url} onChange={v => setForm({ ...form, procedure_url: v })} placeholder="https://drive.google.com/..." />
              </div>
            </FormSection>

            <FormSection title="SIPOC">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.3fr 1fr', gap: 12 }}>
                <ArraySection title="Proveedores y entradas" rows={form.entries_json} columns={[
                  { key: 'proveedor', label: 'Proveedor' }, { key: 'entrada', label: 'Entrada' }
                ]} onUpdate={(i, k, v) => handleUpdateArray('entries_json', i, k, v)}
                  onAdd={() => handleAddField('entries_json')}
                  onRemove={i => handleRemoveArrayRow('entries_json', i)} />
                <ArraySection title="Actividades principales" rows={form.activities_json} columns={[
                  { key: 'actividad', label: 'Actividad' }, { key: 'responsable', label: 'Resp.' }
                ]} onUpdate={(i, k, v) => handleUpdateArray('activities_json', i, k, v)}
                  onAdd={() => handleAddField('activities_json')}
                  onRemove={i => handleRemoveArrayRow('activities_json', i)} />
                <ArraySection title="Salidas y clientes" rows={form.outputs_json} columns={[
                  { key: 'salida', label: 'Salida' }, { key: 'cliente', label: 'Cliente' }
                ]} onUpdate={(i, k, v) => handleUpdateArray('outputs_json', i, k, v)}
                  onAdd={() => handleAddField('outputs_json')}
                  onRemove={i => handleRemoveArrayRow('outputs_json', i)} />
              </div>
            </FormSection>

            <FormSection title="Interacciones (ISO 4.4)">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <InteractionsPicker label="Procesos que me alimentan (upstream)" icon={ArrowUp}
                  value={form.interactions_upstream} options={items.filter(p => p.id !== editingId)}
                  onChange={v => setForm({ ...form, interactions_upstream: v })} />
                <InteractionsPicker label="Procesos a los que alimento (downstream)" icon={ArrowDown}
                  value={form.interactions_downstream} options={items.filter(p => p.id !== editingId)}
                  onChange={v => setForm({ ...form, interactions_downstream: v })} />
              </div>
              <div style={{ marginTop: 8, padding: 8, background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, fontSize: 12, color: '#92400e' }}>
                💡 Tip: si no estás seguro, cargá primero todos los procesos y luego usá <strong>"Sugerir interacciones IA"</strong>.
              </div>
            </FormSection>

            <FormSection title="Recursos">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                {['personal', 'infraestructura', 'equipos', 'programas'].map(k => (
                  <Field key={k} label={k.charAt(0).toUpperCase() + k.slice(1)}
                    value={form.resources_json[k]} onChange={v => setForm({ ...form, resources_json: { ...form.resources_json, [k]: v } })} />
                ))}
              </div>
            </FormSection>

            <FormSection title="Riesgos del proceso">
              <ArraySection rows={form.risks_json} columns={[
                { key: 'riesgo', label: 'Riesgo' }, { key: 'control', label: 'Control' }, { key: 'responsable', label: 'Resp.' }
              ]} onUpdate={(i, k, v) => handleUpdateArray('risks_json', i, k, v)}
                onAdd={() => handleAddField('risks_json')}
                onRemove={i => handleRemoveArrayRow('risks_json', i)} />
            </FormSection>

            <FormSection title="Indicadores">
              <ArraySection rows={form.indicators_json} columns={[
                { key: 'nombre', label: 'Indicador' }, { key: 'calculo', label: 'Cálculo' }, { key: 'meta', label: 'Meta' }, { key: 'frecuencia', label: 'Frec.' }
              ]} onUpdate={(i, k, v) => handleUpdateArray('indicators_json', i, k, v)}
                onAdd={() => handleAddField('indicators_json')}
                onRemove={i => handleRemoveArrayRow('indicators_json', i)} />
            </FormSection>

            <FormSection title="Revisión y aprobaciones">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
                <Field label="Revisión" value={form.revision} onChange={v => setForm({ ...form, revision: v })} placeholder="v1.0" />
                <Field label="Última revisión" type="date" value={form.last_reviewed_at} onChange={v => setForm({ ...form, last_reviewed_at: v })} />
                <Field label="Próxima revisión" type="date" value={form.next_review_date} onChange={v => setForm({ ...form, next_review_date: v })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
                {['elaborado', 'revisado', 'aprobado'].map(k => (
                  <Field key={k} label={`${k.charAt(0).toUpperCase() + k.slice(1)} por`}
                    value={form.approvals_json[k]} onChange={v => setForm({ ...form, approvals_json: { ...form.approvals_json, [k]: v } })} />
                ))}
              </div>
            </FormSection>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" onClick={handleCancel}
                style={{ padding: '10px 20px', background: '#e5e7eb', color: '#374151', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Cancelar</button>
              <button type="submit"
                style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
                {editingId ? 'Guardar cambios' : 'Crear ficha'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* VISTA TARJETAS */}
      {!showForm && viewMode === 'cards' && (
        loading ? <p>Cargando...</p> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {TYPE_OPTIONS.map(type => {
              const list = filtered.filter(p => p.process_type === type)
              return (
                <div key={type} style={{ padding: 16, background: 'white', borderRadius: 12, borderLeft: `6px solid ${TYPE_COLORS[type]}`, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                  <h4 style={{ margin: '0 0 12px 0', color: TYPE_COLORS[type], fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 800 }}>{type}s</h4>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {list.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Sin procesos en esta categoría</span>}
                    {list.map(p => {
                      const st = STATUS_COLORS[p.status] || STATUS_COLORS['Activo']
                      const vencida = p.next_review_date && p.next_review_date < today
                      return (
                        <div key={p.id} onClick={() => setDetailItem(p)}
                          style={{ background: TYPE_COLORS[type], color: 'white', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', position: 'relative', minWidth: 180 }}>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{p.name}</div>
                          <div style={{ fontSize: 10, opacity: 0.85, marginTop: 2 }}>
                            {p.code || '—'} · {p.process_owner || p.responsible_role || 'Sin responsable'}
                          </div>
                          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                            <span style={{ fontSize: 9, padding: '1px 6px', background: 'rgba(255,255,255,0.25)', borderRadius: 4 }}>{p.status}</span>
                            {p.procedure_url && <FileText size={12} opacity={0.85} />}
                            {vencida && <AlertTriangle size={12} color="#fef3c7" />}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* VISTA INTERACCIONES */}
      {!showForm && viewMode === 'flow' && (
        <FlowView items={filtered} highlightId={highlightId} setHighlightId={setHighlightId} onSelect={setDetailItem} procById={procById} />
      )}

      {/* MODAL DETALLE */}
      {detailItem && createPortal(
        <ModalShell onClose={() => setDetailItem(null)} title={`Ficha: ${detailItem.name}`} wide>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, padding: 12, background: '#f8fafc', borderRadius: 6, fontSize: 12 }}>
            <Meta label="Código" value={detailItem.code} />
            <Meta label="Tipo" value={detailItem.process_type} />
            <Meta label="Estado" value={detailItem.status} />
            <Meta label="Revisión" value={detailItem.revision} />
            <Meta label="Owner" value={detailItem.process_owner} />
            <Meta label="Rol resp." value={detailItem.responsible_role} />
            <Meta label="Última rev." value={detailItem.last_reviewed_at} />
            <Meta label="Próxima rev." value={detailItem.next_review_date} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 16 }}>
            <Block title="Objetivo">{detailItem.objective || '—'}</Block>
            <Block title="Alcance">{detailItem.scope || '—'}</Block>
          </div>

          {/* Interacciones */}
          <DetailSection title="Interacciones">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <InteractionList icon={ArrowUp} title="Me alimentan" arr={detailItem.interactions_upstream} procById={procById} />
              <InteractionList icon={ArrowDown} title="Yo alimento" arr={detailItem.interactions_downstream} procById={procById} />
            </div>
          </DetailSection>

          {/* SIPOC */}
          <DetailSection title="Entradas (proveedor → entrada)">
            <FichaTable rows={detailItem.entries_json} columns={[{ key: 'proveedor', label: 'Proveedor' }, { key: 'entrada', label: 'Entrada' }]} />
          </DetailSection>
          <DetailSection title="Actividades">
            <FichaTable rows={detailItem.activities_json} columns={[{ key: 'actividad', label: 'Actividad' }, { key: 'responsable', label: 'Responsable' }]} />
          </DetailSection>
          <DetailSection title="Salidas (salida → cliente)">
            <FichaTable rows={detailItem.outputs_json} columns={[{ key: 'salida', label: 'Salida' }, { key: 'cliente', label: 'Cliente' }]} />
          </DetailSection>

          <DetailSection title="Recursos">
            {detailItem.resources_json && Object.values(detailItem.resources_json).some(v => v) ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {Object.entries(detailItem.resources_json).filter(([_, v]) => v).map(([k, v]) => (
                  <div key={k} style={{ padding: 8, background: '#f8fafc', borderRadius: 4, fontSize: 13 }}>
                    <strong style={{ textTransform: 'capitalize' }}>{k}:</strong> {v}
                  </div>
                ))}
              </div>
            ) : <EmptyHint />}
          </DetailSection>

          <DetailSection title="Riesgos">
            <FichaTable rows={detailItem.risks_json} columns={[{ key: 'riesgo', label: 'Riesgo' }, { key: 'control', label: 'Control' }, { key: 'responsable', label: 'Responsable' }]} />
          </DetailSection>

          <DetailSection title="Indicadores">
            <FichaTable rows={detailItem.indicators_json} columns={[{ key: 'nombre', label: 'Indicador' }, { key: 'calculo', label: 'Cálculo' }, { key: 'meta', label: 'Meta' }, { key: 'frecuencia', label: 'Frecuencia' }]} />
          </DetailSection>

          <DetailSection title="Auditorías ejecutadas a este proceso">
            {(() => {
              const list = auditsForProcess(detailItem.id)
              if (!list.length) return <EmptyHint />
              return (
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                  <thead><tr style={{ background: '#f9fafb', color: '#6b7280', textAlign: 'left' }}>
                    <th style={{ padding: 6 }}>Fecha</th><th style={{ padding: 6 }}>Estado</th><th style={{ padding: 6 }}>Hallazgos</th>
                  </tr></thead>
                  <tbody>
                    {list.map(a => (
                      <tr key={a.id} style={{ borderTop: '1px solid #f3f4f6' }}>
                        <td style={{ padding: 6 }}>{a.planned_date || '—'}</td>
                        <td style={{ padding: 6 }}>{a.status || '—'}</td>
                        <td style={{ padding: 6, fontWeight: 700 }}>{a.findings_count || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            })()}
          </DetailSection>

          <DetailSection title="Aprobaciones">
            {detailItem.approvals_json && Object.values(detailItem.approvals_json).some(v => v) ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {['elaborado', 'revisado', 'aprobado'].map(k => (
                  <div key={k} style={{ padding: 8, background: '#f0fdf4', borderRadius: 4, fontSize: 12, border: '1px solid #bbf7d0' }}>
                    <strong style={{ textTransform: 'capitalize', display: 'block', color: '#166534' }}>{k} por:</strong>
                    {detailItem.approvals_json[k] || '—'}
                  </div>
                ))}
              </div>
            ) : <EmptyHint />}
          </DetailSection>

          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            {detailItem.procedure_url && (
              <a href={detailItem.procedure_url} target="_blank" rel="noreferrer"
                style={{ padding: '8px 14px', background: '#0ea5e9', color: 'white', borderRadius: 8, textDecoration: 'none', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <FileText size={16} /> Ver procedimiento
              </a>
            )}
            <button onClick={() => handleEdit(detailItem)} style={{ padding: '8px 14px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Editar</button>
            <button onClick={() => handleDelete(detailItem.id)} style={{ padding: '8px 14px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>Eliminar</button>
          </div>
        </ModalShell>,
        document.body
      )}

      {/* MODAL IA interacciones */}
      {iaInteractions && createPortal(
        <ModalShell onClose={() => setIaInteractions(null)} title="Interacciones sugeridas por IA" wide>
          <p style={{ color: '#6b7280', fontSize: 13 }}>La IA detectó estas conexiones entre tus procesos. Al aplicar, se agregarán al upstream/downstream de cada uno.</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
            <thead>
              <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                <th style={{ padding: 8 }}>Desde</th>
                <th style={{ padding: 8 }}></th>
                <th style={{ padding: 8 }}>Hacia</th>
                <th style={{ padding: 8 }}>Qué se transfiere</th>
              </tr>
            </thead>
            <tbody>
              {iaInteractions.map((i, idx) => (
                <tr key={idx} style={{ borderTop: '1px solid #f3f4f6' }}>
                  <td style={{ padding: 8, fontWeight: 600 }}>{i.from_name}</td>
                  <td style={{ padding: 8 }}>→</td>
                  <td style={{ padding: 8, fontWeight: 600 }}>{i.to_name}</td>
                  <td style={{ padding: 8, color: '#6b7280' }}>{i.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
            <button onClick={aplicarInteraccionesIA}
              style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600 }}>
              Aplicar todas
            </button>
            <button onClick={() => setIaInteractions(null)}
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

// ───────────── Vista interacciones ─────────────
function FlowView({ items, highlightId, setHighlightId, onSelect, procById }) {
  const groups = TYPE_OPTIONS.map(t => ({ type: t, list: items.filter(p => p.process_type === t) }))
  const highlightedItem = highlightId ? procById[highlightId] : null
  const upstreamIds = new Set((highlightedItem?.interactions_upstream || []).map(x => x.process_id))
  const downstreamIds = new Set((highlightedItem?.interactions_downstream || []).map(x => x.process_id))

  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 14, color: '#1f2937' }}>Diagrama de interacciones</h3>
        {highlightId && (
          <button onClick={() => setHighlightId(null)} style={{ background: '#e5e7eb', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}>
            Quitar resaltado
          </button>
        )}
      </div>
      <p style={{ fontSize: 12, color: '#6b7280', margin: '0 0 12px 0' }}>Clic en un proceso para resaltar quién lo alimenta (↑) y a quién alimenta (↓).</p>

      {groups.map(g => (
        <div key={g.type} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: TYPE_COLORS[g.type], textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{g.type}s</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {g.list.length === 0 && <span style={{ fontSize: 12, color: '#94a3b8' }}>Sin procesos</span>}
            {g.list.map(p => {
              const isHighlighted = p.id === highlightId
              const isUp = upstreamIds.has(p.id)
              const isDown = downstreamIds.has(p.id)
              const dim = highlightId && !isHighlighted && !isUp && !isDown
              let border = '2px solid transparent', label = null
              if (isHighlighted) { border = `2px solid ${TYPE_COLORS[g.type]}` }
              else if (isUp) { border = '2px solid #16a34a'; label = '↑' }
              else if (isDown) { border = '2px solid #f59e0b'; label = '↓' }
              return (
                <div key={p.id} onClick={() => setHighlightId(p.id === highlightId ? null : p.id)}
                  style={{ background: TYPE_COLORS[g.type], color: 'white', borderRadius: 8, padding: '8px 12px', cursor: 'pointer', opacity: dim ? 0.3 : 1, border, position: 'relative', minWidth: 140, transition: 'opacity 0.2s' }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{p.name}</div>
                  <div style={{ fontSize: 10, opacity: 0.85 }}>{p.code || ''}</div>
                  {label && <span style={{ position: 'absolute', top: -8, right: -8, background: 'white', color: '#111827', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12, boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }}>{label}</span>}
                  <button onClick={(e) => { e.stopPropagation(); onSelect(p) }}
                    style={{ position: 'absolute', bottom: 4, right: 4, background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 4, color: 'white', cursor: 'pointer', padding: 2 }}>
                    <Eye size={11} />
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}

      {highlightedItem && (
        <div style={{ marginTop: 14, padding: 12, background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 8, fontSize: 12 }}>
          <strong>{highlightedItem.name}</strong>
          <div style={{ marginTop: 6 }}>
            <ArrowUp size={12} color="#16a34a" /> Lo alimentan: {(highlightedItem.interactions_upstream || []).map(x => procById[x.process_id]?.name).filter(Boolean).join(', ') || '— ninguno —'}
          </div>
          <div style={{ marginTop: 4 }}>
            <ArrowDown size={12} color="#f59e0b" /> Alimenta a: {(highlightedItem.interactions_downstream || []).map(x => procById[x.process_id]?.name).filter(Boolean).join(', ') || '— ninguno —'}
          </div>
        </div>
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

function TextArea({ label, value, onChange, rows = 3, required = false }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>{label}</label>
      <textarea value={value ?? ''} rows={rows} required={required} onChange={e => onChange(e.target.value)}
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

function ArraySection({ title, rows, columns, onUpdate, onAdd, onRemove }) {
  return (
    <div style={{ background: '#f8fafc', padding: 10, borderRadius: 8, border: '1px solid #e2e8f0' }}>
      {title && <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 6, textAlign: 'center', letterSpacing: 0.5 }}>{title}</div>}
      {rows.map((row, i) => (
        <div key={i} style={{ display: 'flex', gap: 4, marginBottom: 6, alignItems: 'center' }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
            {columns.map(c => (
              <input key={c.key} placeholder={c.label} value={row[c.key] || ''}
                onChange={e => onUpdate(i, c.key, e.target.value)}
                style={{ width: '100%', padding: 5, border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 11 }} />
            ))}
          </div>
          <button type="button" onClick={() => onRemove(i)}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#dc2626', padding: 2 }}>
            <X size={12} />
          </button>
        </div>
      ))}
      <button type="button" onClick={onAdd}
        style={{ width: '100%', padding: 4, background: 'white', border: '1px dashed #94a3b8', borderRadius: 4, cursor: 'pointer', fontSize: 11, color: '#475569' }}>
        + Agregar
      </button>
    </div>
  )
}

function InteractionsPicker({ label, icon: Icon, value, options, onChange }) {
  const selected = new Set((value || []).map(v => v.process_id))
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
        {Icon && <Icon size={12} />} {label}
      </label>
      <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid #d1d5db', borderRadius: 6, padding: 6, background: 'white' }}>
        {options.length === 0 && <div style={{ fontSize: 11, color: '#9ca3af', padding: 4 }}>Sin otros procesos cargados</div>}
        {options.map(p => (
          <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={selected.has(p.id)}
              onChange={e => {
                if (e.target.checked) {
                  onChange([...(value || []), { process_id: p.id, label: '' }])
                } else {
                  onChange((value || []).filter(v => v.process_id !== p.id))
                }
              }} />
            <span>{p.name} <span style={{ color: '#94a3b8', fontSize: 10 }}>({p.process_type})</span></span>
          </label>
        ))}
      </div>
    </div>
  )
}

function InteractionList({ icon: Icon, title, arr, procById }) {
  return (
    <div style={{ padding: 10, background: '#f8fafc', borderRadius: 8 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
        <Icon size={12} /> {title}
      </div>
      {(arr || []).length === 0 && <span style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>— ninguno —</span>}
      {(arr || []).map((x, i) => (
        <div key={i} style={{ fontSize: 12, padding: '3px 0', color: '#374151' }}>
          • {procById[x.process_id]?.name || '(proceso eliminado)'}
          {x.label && <span style={{ color: '#6b7280' }}> — {x.label}</span>}
        </div>
      ))}
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

function Block({ title, children }) {
  return (
    <div>
      <strong style={{ fontSize: 12, color: '#374151' }}>{title}</strong>
      <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#111827' }}>{children}</p>
    </div>
  )
}

function DetailSection({ title, children }) {
  return (
    <div style={{ marginTop: 14 }}>
      <h4 style={{ margin: '0 0 6px 0', fontSize: 13, color: '#1f2937', borderBottom: '2px solid #e2e8f0', paddingBottom: 4 }}>{title}</h4>
      {children}
    </div>
  )
}

function FichaTable({ rows, columns }) {
  const hasRows = Array.isArray(rows) && rows.some(r => r && Object.values(r).some(v => v))
  if (!hasRows) return <EmptyHint />
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead style={{ background: '#f8fafc' }}>
          <tr>
            <th style={{ padding: '4px 6px', textAlign: 'left', width: 28, color: '#64748b' }}>#</th>
            {columns.map(c => <th key={c.key} style={{ padding: '4px 6px', textAlign: 'left', color: '#475569' }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={idx} style={{ borderTop: '1px solid #f1f5f9' }}>
              <td style={{ padding: '4px 6px', color: '#94a3b8' }}>{idx + 1}</td>
              {columns.map(c => <td key={c.key} style={{ padding: '4px 6px' }}>{r?.[c.key] || <span style={{ color: '#cbd5e1' }}>—</span>}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EmptyHint() {
  return <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', fontStyle: 'italic', padding: '6px 10px', background: '#f8fafc', borderRadius: 4 }}>Sin registros.</p>
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
