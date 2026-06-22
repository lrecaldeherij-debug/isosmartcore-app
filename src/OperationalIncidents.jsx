import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  Package, RefreshCcw, Plus, Trash2, AlertTriangle, X, Eye, Pencil,
  Search, Filter, BarChart3, Sparkles, Loader2, ExternalLink, Calendar,
  ShoppingCart, Factory, History, CheckCircle, Bell
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

const TYPE_OPTIONS = ['Propiedad Cliente', 'Control de Cambios', 'Otro']
const SEVERITY_OPTIONS = ['Baja', 'Media', 'Alta', 'Crítica']
const STATUS_OPTIONS = ['Abierto', 'En Análisis', 'Cerrado']

const STATUS_COLORS = {
  'Abierto':     { bg: '#fee2e2', fg: '#991b1b', stripe: '#ef4444' },
  'En Análisis': { bg: '#fef3c7', fg: '#92400e', stripe: '#f59e0b' },
  'Cerrado':     { bg: '#dcfce7', fg: '#166534', stripe: '#16a34a' },
}
const TYPE_COLORS = {
  'Propiedad Cliente':  { stripe: '#f59e0b', icon: Package, color: '#d97706' },
  'Control de Cambios': { stripe: '#3b82f6', icon: RefreshCcw, color: '#2563eb' },
  'Otro':               { stripe: '#6b7280', icon: AlertTriangle, color: '#6b7280' },
}

const EMPTY_FORM = {
  type: 'Propiedad Cliente',
  date: new Date().toISOString().substring(0, 10),
  description: '',
  authorized_by: '',
  impact_analysis: '',
  customer_order_id: '',
  production_order_id: '',
  // Propiedad cliente
  client_name: '',
  asset_description: '',
  asset_location: '',
  asset_condition: '',
  client_notified: false,
  client_notified_at: '',
  // Cambios
  change_what: '',
  change_why: '',
  change_planned: true,
  // Comunes
  severity: 'Media',
  status: 'Abierto',
  actions_taken: '',
  evidence_url: '',
}

export default function OperationalIncidents() {
  const [items, setItems] = useState([])
  const [customerOrders, setCustomerOrders] = useState([])
  const [productionOrders, setProductionOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [detailItem, setDetailItem] = useState(null)

  // Filtros
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterSeverity, setFilterSeverity] = useState('')

  // IA
  const [loadingIA, setLoadingIA] = useState(false)
  const [iaResult, setIaResult] = useState(null)

  const [form, setForm] = useState({ ...EMPTY_FORM })

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data, error }, { data: co }, { data: po }] = await Promise.all([
      supabase.from('operational_incidents').select('*').order('date', { ascending: false }),
      supabase.from('customer_orders').select('id, client_name, order_reference, status'),
      supabase.from('production_orders').select('id, product_name, batch_number, status'),
    ])
    if (error) {
      setTableError(error.message)
      console.warn('Error cargando operational_incidents:', error)
    } else {
      setTableError(null)
      setItems(data || [])
    }
    setCustomerOrders(co || [])
    setProductionOrders(po || [])
    setLoading(false)
  }

  const resetForm = () => { setForm({ ...EMPTY_FORM }); setEditingId(null) }
  const handleNew = () => { resetForm(); setShowForm(true) }
  const handleCancel = () => { setShowForm(false); resetForm() }

  const handleEdit = (item) => {
    setForm({
      type: item.type || 'Propiedad Cliente',
      date: item.date || new Date().toISOString().substring(0, 10),
      description: item.description || '',
      authorized_by: item.authorized_by || '',
      impact_analysis: item.impact_analysis || '',
      customer_order_id: item.customer_order_id || '',
      production_order_id: item.production_order_id || '',
      client_name: item.client_name || '',
      asset_description: item.asset_description || '',
      asset_location: item.asset_location || '',
      asset_condition: item.asset_condition || '',
      client_notified: !!item.client_notified,
      client_notified_at: item.client_notified_at || '',
      change_what: item.change_what || '',
      change_why: item.change_why || '',
      change_planned: item.change_planned !== false,
      severity: item.severity || 'Media',
      status: item.status || 'Abierto',
      actions_taken: item.actions_taken || '',
      evidence_url: item.evidence_url || '',
    })
    setEditingId(item.id)
    setShowForm(true)
    setDetailItem(null)
  }

  const handleDelete = async (item) => {
    if (!await confirm(`¿Eliminar el registro "${(item.description || '').substring(0, 40) || item.type}"?`)) return
    const { error } = await supabase.from('operational_incidents').delete().eq('id', item.id)
    if (error) return toast.error(error.message)
    setDetailItem(null)
    fetchAll()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      type: form.type,
      date: form.date,
      description: form.description || null,
      authorized_by: form.authorized_by || null,
      impact_analysis: form.impact_analysis || null,
      customer_order_id: form.customer_order_id || null,
      production_order_id: form.production_order_id || null,
      // Propiedad cliente
      client_name: form.type === 'Propiedad Cliente' ? (form.client_name || null) : null,
      asset_description: form.type === 'Propiedad Cliente' ? (form.asset_description || null) : null,
      asset_location: form.type === 'Propiedad Cliente' ? (form.asset_location || null) : null,
      asset_condition: form.type === 'Propiedad Cliente' ? (form.asset_condition || null) : null,
      client_notified: form.type === 'Propiedad Cliente' ? form.client_notified : null,
      client_notified_at: form.type === 'Propiedad Cliente' && form.client_notified ? (form.client_notified_at || null) : null,
      // Cambios
      change_what: form.type === 'Control de Cambios' ? (form.change_what || null) : null,
      change_why: form.type === 'Control de Cambios' ? (form.change_why || null) : null,
      change_planned: form.type === 'Control de Cambios' ? form.change_planned : null,
      // Comunes
      severity: form.severity || null,
      status: form.status,
      actions_taken: form.actions_taken || null,
      evidence_url: form.evidence_url || null,
    }
    let error
    if (editingId) {
      const prev = items.find(i => i.id === editingId)
      const critical = ['status', 'severity', 'actions_taken', 'client_notified']
      const changes = []
      for (const k of critical) {
        if (prev && String(prev[k] ?? '') !== String(payload[k] ?? '')) {
          changes.push({ field: k, from: prev[k] ?? null, to: payload[k] ?? null })
        }
      }
      const newLog = [...(prev?.change_log || []), ...(changes.length ? [{ at: new Date().toISOString(), changes }] : [])]
      ;({ error } = await supabase.from('operational_incidents').update({ ...payload, change_log: newLog }).eq('id', editingId))
    } else {
      ({ error } = await supabase.from('operational_incidents').insert([payload]))
    }
    if (error) return toast.error(error.message)
    setShowForm(false)
    resetForm()
    fetchAll()
  }

  // ---- IA: sugerir análisis de impacto + acciones ----
  const handleSugerirIA = async () => {
    if (!form.description?.trim()) {
      return toast.warning('Cargá primero la descripción del suceso para que la IA tenga contexto')
    }
    setLoadingIA(true)
    setIaResult(null)
    try {
      const { data: profile } = await supabase.from('company_profile').select('*').maybeSingle()
      const resumen = profile ? {
        empresa: profile.name, sector: profile.industry, productos: profile.main_products,
      } : null
      const prompt = `
Sos un consultor experto en ISO 9001 cláusulas 8.5.3 (propiedad del cliente) y 8.5.6 (control de cambios).
Empresa: ${JSON.stringify(resumen)}
Tipo: ${form.type}
Descripción del suceso: ${form.description}
${form.type === 'Propiedad Cliente' ? `Cliente: ${form.client_name || 'No especificado'}\nActivo: ${form.asset_description || 'No especificado'}` : ''}
${form.type === 'Control de Cambios' ? `Qué cambió: ${form.change_what || 'No especificado'}\nPor qué: ${form.change_why || 'No especificado'}` : ''}

Devolvé EXCLUSIVAMENTE este JSON (sin markdown):
{
  "impact_analysis": "Análisis de impacto sobre la calidad, el producto, el cliente, el cumplimiento normativo. Texto en bullets con saltos de línea \\n.",
  "actions_taken": "Acciones recomendadas inmediatas + preventivas. Bullets con \\n.",
  "severity_suggested": "Baja" | "Media" | "Alta" | "Crítica"
}
`
      const respuesta = await consultarIA(
        prompt,
        'Sos un consultor ISO 9001 8.5.3/8.5.6. Respondé solo con JSON. Sin markdown.'
      )
      console.log('[IA Incidente]', respuesta)
      const objStr = extractFirstJson(respuesta, '{', '}')
      if (!objStr) throw new Error('IA no devolvió JSON válido.')
      const obj = JSON.parse(objStr)
      setIaResult({
        impact_analysis: obj.impact_analysis || '',
        actions_taken: obj.actions_taken || '',
        severity_suggested: SEVERITY_OPTIONS.includes(obj.severity_suggested) ? obj.severity_suggested : null,
      })
    } catch (err) {
      toast.error('No pudimos procesarla. ' + (err?.message || ''))
    } finally {
      setLoadingIA(false)
    }
  }

  const applyIaToForm = () => {
    setForm(f => ({
      ...f,
      impact_analysis: f.impact_analysis ? `${f.impact_analysis}\n${iaResult.impact_analysis}` : iaResult.impact_analysis,
      actions_taken: f.actions_taken ? `${f.actions_taken}\n${iaResult.actions_taken}` : iaResult.actions_taken,
      severity: iaResult.severity_suggested || f.severity,
    }))
    setIaResult(null)
  }

  // ---- Filtros + dashboard ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter(i =>
      (!filterType || i.type === filterType) &&
      (!filterStatus || i.status === filterStatus) &&
      (!filterSeverity || i.severity === filterSeverity) &&
      (!q || (i.description || '').toLowerCase().includes(q) || (i.client_name || '').toLowerCase().includes(q))
    )
  }, [items, filterType, filterStatus, filterSeverity, search])

  const stats = useMemo(() => {
    const total = items.length
    const abiertos = items.filter(i => i.status === 'Abierto').length
    const enAnalisis = items.filter(i => i.status === 'En Análisis').length
    const cerrados = items.filter(i => i.status === 'Cerrado').length
    const altaCritica = items.filter(i => i.severity === 'Alta' || i.severity === 'Crítica').length
    const propiedad = items.filter(i => i.type === 'Propiedad Cliente').length
    const cambios = items.filter(i => i.type === 'Control de Cambios').length
    return { total, abiertos, enAnalisis, cerrados, altaCritica, propiedad, cambios }
  }, [items])

  const coById = useMemo(() => Object.fromEntries(customerOrders.map(c => [c.id, c])), [customerOrders])
  const poById = useMemo(() => Object.fromEntries(productionOrders.map(p => [p.id, p])), [productionOrders])

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>🛡️ Incidentes y Cambios Operacionales</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>Propiedad del cliente y cambios en procesos (ISO 9001 - 8.5.3 / 8.5.6)</p>
        </div>
        {!showForm && (
          <button onClick={handleNew} className="btn btn-primary">
            <Plus size={18} /> Registrar Suceso
          </button>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['8.5.3']} />

      {tableError && (
        <div style={{ marginTop: '1rem', padding: '0.9rem 1.1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '0.88rem' }}>
          <strong>⚠ No pudimos cargar la tabla.</strong>
          <p style={{ margin: '0.4rem 0 0 0' }}>{tableError}</p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.82rem' }}>
            Si dice <em>"Could not find the table"</em>, faltaría correr <strong>v38</strong> en Supabase.
          </p>
        </div>
      )}

      {/* Dashboard */}
      {!showForm && stats.total > 0 && (
        <div className="card" style={{ marginTop: '1rem', marginBottom: '1.5rem', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart3 size={18} /> Resumen
            </h4>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input className="form-input" style={{ padding: '0.35rem 0.5rem 0.35rem 1.8rem', fontSize: '0.85rem', minWidth: '180px' }}
                  placeholder="Buscar descripción o cliente..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Filter size={14} style={{ color: 'var(--text-tertiary)' }} />
              <select className="form-select" style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                value={filterType} onChange={e => setFilterType(e.target.value)}>
                <option value="">Todos los tipos</option>
                {TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="form-select" style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">Todos los estados</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="form-select" style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                value={filterSeverity} onChange={e => setFilterSeverity(e.target.value)}>
                <option value="">Todas las severidades</option>
                {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
            <KPI label="Total" value={stats.total} highlight />
            <KPI label="Abiertos" value={stats.abiertos} danger={stats.abiertos > 0} />
            <KPI label="En análisis" value={stats.enAnalisis} warn={stats.enAnalisis > 0} />
            <KPI label="Cerrados" value={stats.cerrados} color="#166534" />
            <KPI label="Alta + Crítica" value={stats.altaCritica} danger={stats.altaCritica > 0} />
          </div>
        </div>
      )}

      {/* Formulario */}
      {showForm && (
        <div className="card fade-in" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ borderBottom: '1px solid #eee', marginBottom: '1.5rem', paddingBottom: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>{editingId ? 'Editar registro' : 'Nuevo Registro Operacional'}</h3>
            <button onClick={handleCancel} className="btn-ghost">Cancelar</button>
          </div>
          <form onSubmit={handleSubmit}>

            <FormSection title="📋 Tipo y datos generales">
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Tipo de registro *</label>
                  <select className="form-select" value={form.type}
                    onChange={e => setForm({ ...form, type: e.target.value })}>
                    <option value="Propiedad Cliente">📦 Propiedad del Cliente (8.5.3)</option>
                    <option value="Control de Cambios">🔄 Control de Cambios (8.5.6)</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha del suceso *</label>
                  <input type="date" required className="form-input" value={form.date}
                    onChange={e => setForm({ ...form, date: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Descripción detallada *</label>
                <textarea required className="form-textarea" rows={3} value={form.description}
                  onChange={e => setForm({ ...form, description: e.target.value })}
                  placeholder={form.type === 'Propiedad Cliente'
                    ? 'Ej: Se detectó daño en motor enviado por el cliente para mantenimiento.'
                    : form.type === 'Control de Cambios'
                      ? 'Ej: Cambio de proveedor de materia prima por desabastecimiento.'
                      : 'Describí lo que sucedió...'} />
              </div>
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Reportado / autorizado por *</label>
                  <input required className="form-input" value={form.authorized_by}
                    onChange={e => setForm({ ...form, authorized_by: e.target.value })}
                    placeholder="Nombre del responsable" />
                </div>
                <div className="form-group">
                  <label className="form-label">Severidad</label>
                  <select className="form-select" value={form.severity}
                    onChange={e => setForm({ ...form, severity: e.target.value })}>
                    {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
            </FormSection>

            {/* Vínculos opcionales */}
            <FormSection title="🔗 Vínculos (trazabilidad)">
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Pedido del cliente afectado</label>
                  <select className="form-select" value={form.customer_order_id}
                    onChange={e => setForm({ ...form, customer_order_id: e.target.value })}>
                    <option value="">— Ninguno —</option>
                    {customerOrders.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.order_reference || 'Sin ref'} · {c.client_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Orden de producción afectada</label>
                  <select className="form-select" value={form.production_order_id}
                    onChange={e => setForm({ ...form, production_order_id: e.target.value })}>
                    <option value="">— Ninguna —</option>
                    {productionOrders.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.batch_number || 'Sin lote'} · {p.product_name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </FormSection>

            {/* Sección dinámica según tipo */}
            {form.type === 'Propiedad Cliente' && (
              <FormSection title="📦 Propiedad del cliente (ISO 8.5.3)">
                <div className="grid-2-col">
                  <div className="form-group">
                    <label className="form-label">Cliente propietario</label>
                    <input className="form-input" value={form.client_name}
                      onChange={e => setForm({ ...form, client_name: e.target.value })}
                      placeholder="Nombre del cliente" />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Ubicación del activo</label>
                    <input className="form-input" value={form.asset_location}
                      onChange={e => setForm({ ...form, asset_location: e.target.value })}
                      placeholder="Ej: Depósito 2 · Estante B" />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Descripción del activo</label>
                  <textarea className="form-textarea" rows={2} value={form.asset_description}
                    onChange={e => setForm({ ...form, asset_description: e.target.value })}
                    placeholder="Qué es: equipo, material, datos, planos, software... + identificación única" />
                </div>
                <div className="form-group">
                  <label className="form-label">Condición actual del activo</label>
                  <input className="form-input" value={form.asset_condition}
                    onChange={e => setForm({ ...form, asset_condition: e.target.value })}
                    placeholder="Ej: Operativo, Dañado, Vencido, Perdido..." />
                </div>
                <div style={{ background: '#fef3c7', padding: '0.85rem', borderRadius: '8px', border: '1px solid #fde68a' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, color: '#92400e' }}>
                    <input type="checkbox" checked={form.client_notified}
                      onChange={e => setForm({ ...form, client_notified: e.target.checked })} />
                    <Bell size={14} /> ¿Se notificó al cliente?
                  </label>
                  {form.client_notified && (
                    <div className="form-group" style={{ marginTop: '0.5rem', marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem' }}>Fecha de notificación</label>
                      <input type="date" className="form-input" value={form.client_notified_at}
                        onChange={e => setForm({ ...form, client_notified_at: e.target.value })} />
                    </div>
                  )}
                  <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.78rem', color: '#92400e' }}>
                    ISO 8.5.3 exige notificar al cliente cuando algo se pierde, deteriora o se vuelve inadecuado.
                  </p>
                </div>
              </FormSection>
            )}

            {form.type === 'Control de Cambios' && (
              <FormSection title="🔄 Control de cambios (ISO 8.5.6)">
                <div className="form-group">
                  <label className="form-label">¿Qué cambió? *</label>
                  <textarea className="form-textarea" rows={2} value={form.change_what}
                    onChange={e => setForm({ ...form, change_what: e.target.value })}
                    placeholder="Ej: Reemplazo de proveedor X por Y para el componente Z" />
                </div>
                <div className="form-group">
                  <label className="form-label">¿Por qué se hizo el cambio?</label>
                  <textarea className="form-textarea" rows={2} value={form.change_why}
                    onChange={e => setForm({ ...form, change_why: e.target.value })}
                    placeholder="Motivo, justificación, alternativas evaluadas..." />
                </div>
                <div style={{ background: '#eef2ff', padding: '0.85rem', borderRadius: '8px', border: '1px solid #c7d2fe' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontWeight: 600, color: '#3730a3' }}>
                    <input type="checkbox" checked={form.change_planned}
                      onChange={e => setForm({ ...form, change_planned: e.target.checked })} />
                    Cambio planificado (no reactivo)
                  </label>
                  <p style={{ margin: '0.3rem 0 0 0', fontSize: '0.78rem', color: '#3730a3' }}>
                    ISO 8.5.6: los cambios deben planificarse y controlarse, no improvisarse.
                  </p>
                </div>
              </FormSection>
            )}

            {/* IA */}
            <FormSection title="🤖 Análisis con IA (opcional)">
              <div style={{ background: '#faf5ff', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #d8b4fe' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.85rem', color: '#6b21a8' }}>
                    💡 Que la IA te arme el análisis de impacto + acciones
                  </strong>
                  <button type="button" onClick={handleSugerirIA} className="btn btn-ghost"
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem', color: '#7c3aed' }} disabled={loadingIA}>
                    {loadingIA ? <Loader2 className="animate-spin" size={13} /> : <Sparkles size={13} />}
                    Sugerir análisis
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#6b21a8' }}>
                  Lee el ADN + tipo + descripción → propone impacto, acciones y severidad sugerida.
                </p>

                {iaResult && (
                  <div style={{ marginTop: '0.75rem', background: 'white', padding: '0.85rem', borderRadius: '6px', border: '1px solid #d8b4fe' }}>
                    {iaResult.severity_suggested && (
                      <div style={{ marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.78rem', color: '#6b21a8' }}>Severidad sugerida: </span>
                        <strong>{iaResult.severity_suggested}</strong>
                      </div>
                    )}
                    <div style={{ display: 'grid', gap: '0.5rem' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>Impacto</div>
                        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: '0.82rem' }}>{iaResult.impact_analysis}</pre>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>Acciones</div>
                        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: '0.82rem' }}>{iaResult.actions_taken}</pre>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
                      <button type="button" onClick={applyIaToForm} className="btn btn-primary" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}>
                        Pegar en los campos
                      </button>
                      <button type="button" onClick={() => setIaResult(null)} className="btn btn-ghost" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }}>
                        Descartar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </FormSection>

            <FormSection title="🎯 Análisis y acciones">
              <div className="form-group">
                <label className="form-label">Análisis de impacto</label>
                <textarea className="form-textarea" rows={3} value={form.impact_analysis}
                  onChange={e => setForm({ ...form, impact_analysis: e.target.value })}
                  placeholder="¿Cómo afecta esto a la calidad / producto / cliente / normativa?" />
              </div>
              <div className="form-group">
                <label className="form-label">Acciones tomadas</label>
                <textarea className="form-textarea" rows={3} value={form.actions_taken}
                  onChange={e => setForm({ ...form, actions_taken: e.target.value })}
                  placeholder="Qué hicimos: contención, corrección, prevención..." />
              </div>
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Estado</label>
                  <select className="form-select" value={form.status}
                    onChange={e => setForm({ ...form, status: e.target.value })}>
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Link a evidencia</label>
                  <input type="url" className="form-input" value={form.evidence_url}
                    onChange={e => setForm({ ...form, evidence_url: e.target.value })}
                    placeholder="https://drive.google.com/..." />
                </div>
              </div>
            </FormSection>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" onClick={handleCancel} className="btn btn-ghost">Cancelar</button>
              <button type="submit" className="btn btn-primary">{editingId ? 'Guardar cambios' : 'Guardar registro'}</button>
            </div>
          </form>
        </div>
      )}

      {/* Lista */}
      {!showForm && (
        <>
          {loading && <p>Cargando...</p>}
          {!loading && items.length === 0 && !tableError && (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#cbd5e1' }}>
              <AlertTriangle size={64} style={{ marginBottom: '1rem', opacity: 0.3 }} />
              <p>Sin incidentes u observaciones registradas. Tocá <strong>+ Registrar Suceso</strong> para arrancar.</p>
            </div>
          )}

          <div style={{ display: 'grid', gap: '0.85rem' }}>
            {filtered.map(item => {
              const tc = TYPE_COLORS[item.type] || TYPE_COLORS['Otro']
              const sc = STATUS_COLORS[item.status] || STATUS_COLORS['Abierto']
              const Icon = tc.icon
              return (
                <div key={item.id} className="card" style={{ borderLeft: `5px solid ${tc.stripe}`, padding: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', flex: 1 }}>
                      <div style={{ background: 'var(--bg-color)', padding: '0.5rem', borderRadius: '8px' }}>
                        <Icon size={20} color={tc.color} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', alignItems: 'center', marginBottom: '0.3rem' }}>
                          <span style={{ background: sc.bg, color: sc.fg, padding: '0.15rem 0.55rem', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600 }}>
                            {item.status}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>{item.type}</span>
                          <span style={{ fontSize: '0.72rem', color: '#64748b' }}>· {item.date}</span>
                          {item.severity && (
                            <span style={{
                              fontSize: '0.7rem', padding: '0.05rem 0.4rem', borderRadius: '999px',
                              background: item.severity === 'Crítica' ? '#fee2e2' : item.severity === 'Alta' ? '#fef3c7' : '#f1f5f9',
                              color: item.severity === 'Crítica' ? '#991b1b' : item.severity === 'Alta' ? '#92400e' : '#64748b',
                            }}>
                              {item.severity}
                            </span>
                          )}
                        </div>
                        <p style={{ margin: '0 0 0.3rem 0', fontSize: '0.92rem', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {item.description}
                        </p>
                        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.78rem', color: '#64748b' }}>
                          {item.authorized_by && <span><strong>Por:</strong> {item.authorized_by}</span>}
                          {item.type === 'Propiedad Cliente' && item.client_name && (
                            <span style={{ color: '#d97706' }}>📦 {item.client_name}</span>
                          )}
                          {item.type === 'Propiedad Cliente' && item.client_notified && (
                            <span style={{ color: '#16a34a' }}><CheckCircle size={10} style={{ verticalAlign: 'middle' }} /> Cliente notificado</span>
                          )}
                          {item.type === 'Propiedad Cliente' && !item.client_notified && (
                            <span style={{ color: '#ef4444' }}>⚠ Falta notificar al cliente</span>
                          )}
                          {coById[item.customer_order_id] && (
                            <span style={{ color: '#3730a3' }}><ShoppingCart size={10} style={{ verticalAlign: 'middle' }} /> {coById[item.customer_order_id].client_name}</span>
                          )}
                          {poById[item.production_order_id] && (
                            <span style={{ color: '#3730a3' }}><Factory size={10} style={{ verticalAlign: 'middle' }} /> {poById[item.production_order_id].batch_number}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {item.evidence_url && (
                        <a href={item.evidence_url} target="_blank" rel="noreferrer" className="btn-ghost" title="Evidencia" style={{ padding: '0.3rem' }}>
                          <ExternalLink size={12} />
                        </a>
                      )}
                      <button onClick={() => setDetailItem(item)} className="btn-ghost" title="Ver detalle" style={{ padding: '0.3rem' }}><Eye size={12} /></button>
                      <button onClick={() => handleEdit(item)} className="btn-ghost" title="Editar" style={{ padding: '0.3rem' }}><Pencil size={12} /></button>
                      <button onClick={() => handleDelete(item)} className="btn-ghost" title="Eliminar" style={{ padding: '0.3rem', color: '#ef4444' }}><Trash2 size={12} /></button>
                    </div>
                  </div>
                </div>
              )
            })}
            {filtered.length === 0 && items.length > 0 && (
              <p style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>No hay registros con esos filtros.</p>
            )}
          </div>
        </>
      )}

      {/* Modal detalle */}
      {detailItem && createPortal((
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{
            background: 'white', maxWidth: '720px', width: '100%', padding: 0,
            maxHeight: '92vh', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {(() => { const I = (TYPE_COLORS[detailItem.type] || TYPE_COLORS['Otro']).icon; return <I size={18} /> })()}
                  {detailItem.type}
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  {detailItem.date} · {detailItem.status} · Severidad: {detailItem.severity || '—'}
                </span>
              </div>
              <button onClick={() => setDetailItem(null)} className="btn-ghost"><X size={18} /></button>
            </div>
            <div style={{ overflow: 'auto', padding: '1.25rem', display: 'grid', gap: '0.85rem' }}>
              <div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>DESCRIPCIÓN</div>
                <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{detailItem.description}</p>
              </div>

              {detailItem.type === 'Propiedad Cliente' && (
                <div style={{ background: '#fef3c7', padding: '0.75rem 0.9rem', borderRadius: '8px' }}>
                  <strong style={{ fontSize: '0.75rem', color: '#92400e' }}>PROPIEDAD DEL CLIENTE</strong>
                  <div style={{ marginTop: '0.4rem', display: 'grid', gap: '0.3rem', fontSize: '0.85rem' }}>
                    {detailItem.client_name && <div><strong>Cliente:</strong> {detailItem.client_name}</div>}
                    {detailItem.asset_description && <div><strong>Activo:</strong> {detailItem.asset_description}</div>}
                    {detailItem.asset_location && <div><strong>Ubicación:</strong> {detailItem.asset_location}</div>}
                    {detailItem.asset_condition && <div><strong>Condición:</strong> {detailItem.asset_condition}</div>}
                    <div>
                      <strong>Cliente notificado:</strong> {detailItem.client_notified
                        ? <span style={{ color: '#16a34a' }}>✓ Sí{detailItem.client_notified_at ? ` (${detailItem.client_notified_at})` : ''}</span>
                        : <span style={{ color: '#991b1b' }}>✗ No</span>}
                    </div>
                  </div>
                </div>
              )}

              {detailItem.type === 'Control de Cambios' && (
                <div style={{ background: '#eef2ff', padding: '0.75rem 0.9rem', borderRadius: '8px' }}>
                  <strong style={{ fontSize: '0.75rem', color: '#3730a3' }}>CONTROL DE CAMBIOS</strong>
                  <div style={{ marginTop: '0.4rem', display: 'grid', gap: '0.3rem', fontSize: '0.85rem' }}>
                    {detailItem.change_what && <div><strong>Qué cambió:</strong> {detailItem.change_what}</div>}
                    {detailItem.change_why && <div><strong>Por qué:</strong> {detailItem.change_why}</div>}
                    <div><strong>Tipo:</strong> {detailItem.change_planned ? '✓ Planificado' : '⚠ Reactivo'}</div>
                  </div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <DetailRow label="Reportado por" value={detailItem.authorized_by} />
                {coById[detailItem.customer_order_id] && (
                  <DetailRow label="Pedido vinculado" value={`${coById[detailItem.customer_order_id].order_reference || ''} · ${coById[detailItem.customer_order_id].client_name}`} />
                )}
                {poById[detailItem.production_order_id] && (
                  <DetailRow label="Orden producción" value={`${poById[detailItem.production_order_id].batch_number} · ${poById[detailItem.production_order_id].product_name}`} />
                )}
              </div>

              {detailItem.impact_analysis && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>ANÁLISIS DE IMPACTO</div>
                  <pre style={{ margin: '0.2rem 0 0 0', fontSize: '0.88rem', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{detailItem.impact_analysis}</pre>
                </div>
              )}
              {detailItem.actions_taken && (
                <div style={{ background: '#f0fdf4', padding: '0.7rem 0.85rem', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                  <strong style={{ fontSize: '0.75rem', color: '#14532d' }}>ACCIONES TOMADAS</strong>
                  <pre style={{ margin: '0.2rem 0 0 0', fontSize: '0.88rem', color: '#14532d', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{detailItem.actions_taken}</pre>
                </div>
              )}

              {detailItem.evidence_url && (
                <a href={detailItem.evidence_url} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}>
                  <ExternalLink size={13} /> Ver evidencia
                </a>
              )}

              {(detailItem.change_log?.length || 0) > 0 && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <History size={11} /> HISTÓRICO DE CAMBIOS
                  </div>
                  <div style={{ marginTop: '0.4rem', display: 'grid', gap: '0.4rem' }}>
                    {detailItem.change_log.slice().reverse().map((entry, i) => (
                      <div key={i} style={{ background: '#f8fafc', padding: '0.5rem 0.7rem', borderRadius: '6px', fontSize: '0.82rem' }}>
                        <div style={{ color: '#64748b', fontSize: '0.72rem' }}>{new Date(entry.at).toLocaleString()}</div>
                        {entry.changes?.map((c, j) => (
                          <div key={j}>
                            <strong>{c.field}:</strong> <span style={{ color: '#94a3b8', textDecoration: 'line-through' }}>{String(c.from ?? '—')}</span> → <span style={{ color: '#166534' }}>{String(c.to ?? '—')}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => handleDelete(detailItem)} className="btn btn-ghost" style={{ color: '#ef4444' }}>
                <Trash2 size={14} /> Eliminar
              </button>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button onClick={() => setDetailItem(null)} className="btn btn-ghost">Cerrar</button>
                <button onClick={() => handleEdit(detailItem)} className="btn btn-primary">
                  <Pencil size={14} /> Editar
                </button>
              </div>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  )
}

// ----- Subcomponentes -----
function FormSection({ title, children }) {
  return (
    <div style={{ marginBottom: '1.25rem', paddingBottom: '0.75rem', borderBottom: '1px dashed #e2e8f0' }}>
      <h4 style={{ margin: '0 0 0.75rem 0', fontSize: '0.88rem', color: '#3730a3' }}>{title}</h4>
      {children}
    </div>
  )
}

function KPI({ label, value, highlight, warn, danger, color }) {
  return (
    <div style={{
      background: highlight ? '#eef2ff' : danger ? '#fee2e2' : warn ? '#fef3c7' : '#f8fafc',
      borderRadius: '8px', padding: '0.6rem 0.75rem', textAlign: 'center',
      border: highlight ? '1px solid #c7d2fe' : danger ? '1px solid #fca5a5' : warn ? '1px solid #fde68a' : '1px solid #e2e8f0'
    }}>
      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: danger ? '#991b1b' : warn ? '#92400e' : (color || 'var(--primary-color)') }}>{value}</div>
    </div>
  )
}

function DetailRow({ label, value }) {
  if (!value) return null
  return (
    <div>
      <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
      <div style={{ fontSize: '0.9rem', color: '#1e293b' }}>{value}</div>
    </div>
  )
}

function extractFirstJson(text, openChar, closeChar) {
  if (!text) return null
  const stripped = String(text).replace(/```json/gi, '').replace(/```/g, '')
  const start = stripped.indexOf(openChar)
  if (start === -1) return null
  let depth = 0, inString = false, escape = false
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i]
    if (escape) { escape = false; continue }
    if (ch === '\\') { escape = true; continue }
    if (ch === '"') { inString = !inString; continue }
    if (inString) continue
    if (ch === openChar) depth++
    else if (ch === closeChar) {
      depth--
      if (depth === 0) return stripped.substring(start, i + 1)
    }
  }
  return null
}
