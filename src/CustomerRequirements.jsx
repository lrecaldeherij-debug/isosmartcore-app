import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { consultarIA } from './aiClient'
import {
  ShoppingCart, Plus, CheckCircle, AlertCircle, X, Eye, Pencil, Trash2,
  Search, Filter, BarChart3, Sparkles, Loader2, ExternalLink, AlertTriangle,
  Calendar, ChevronRight, Mail, Phone, User, History
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

const STATUS_OPTIONS = ['Borrador', 'En Revisión', 'Aprobado', 'Rechazado', 'En Producción', 'Entregado']
const PRIORITY_OPTIONS = ['Alta', 'Media', 'Baja']
const CURRENCY_OPTIONS = ['USD', 'ARS', 'EUR', 'UYU', 'CLP', 'PEN', 'MXN', 'COP', 'BRL']

const STATUS_COLORS = {
  'Borrador':     { bg: '#f1f5f9', fg: '#64748b' },
  'En Revisión':  { bg: '#fef3c7', fg: '#92400e' },
  'Revision':     { bg: '#fef3c7', fg: '#92400e' },
  'Aprobado':     { bg: '#dcfce7', fg: '#166534' },
  'Rechazado':    { bg: '#fee2e2', fg: '#991b1b' },
  'En Producción':{ bg: '#dbeafe', fg: '#1e40af' },
  'Entregado':    { bg: '#e0e7ff', fg: '#3730a3' },
}

const EMPTY_FORM = {
  client_name: '', order_reference: '',
  customer_contact_person: '', customer_email: '', customer_phone: '',
  requirements_desc: '',
  requirements_legal: '',
  requirements_implicit: '',
  capacity_review: '',
  reviewed_by: '', reviewed_at: '',
  delivery_date: '', acceptance_date: '',
  review_evidence: '', evidence_url: '',
  quoted_amount: '', currency: 'USD', priority: 'Media',
  status: 'Borrador', notes: ''
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export default function CustomerRequirements() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [detailItem, setDetailItem] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  // Filtros
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')

  // IA preview
  const [loadingIA, setLoadingIA] = useState(false)
  const [iaResult, setIaResult] = useState(null)

  useEffect(() => { fetchOrders() }, [])

  const fetchOrders = async () => {
    setLoading(true)
    const { data, error } = await supabase.from('customer_orders').select('*').order('created_at', { ascending: false })
    if (error) {
      setTableError(error.message)
      console.warn('Error cargando customer_orders:', error)
    } else {
      setTableError(null)
      setOrders(data || [])
    }
    setLoading(false)
  }

  const resetForm = () => { setForm({ ...EMPTY_FORM }); setEditingId(null) }
  const handleNew = () => { resetForm(); setShowForm(true) }
  const handleCancel = () => { setShowForm(false); resetForm() }

  const handleEdit = (item) => {
    setForm({
      client_name: item.client_name || '',
      order_reference: item.order_reference || '',
      customer_contact_person: item.customer_contact_person || '',
      customer_email: item.customer_email || '',
      customer_phone: item.customer_phone || '',
      requirements_desc: item.requirements_desc || '',
      requirements_legal: item.requirements_legal || '',
      requirements_implicit: item.requirements_implicit || '',
      capacity_review: item.capacity_review || '',
      reviewed_by: item.reviewed_by || '',
      reviewed_at: item.reviewed_at || '',
      delivery_date: item.delivery_date || '',
      acceptance_date: item.acceptance_date || '',
      review_evidence: item.review_evidence || '',
      evidence_url: item.evidence_url || '',
      quoted_amount: item.quoted_amount ?? '',
      currency: item.currency || 'USD',
      priority: item.priority || 'Media',
      status: item.status || 'Borrador',
      notes: item.notes || '',
    })
    setEditingId(item.id)
    setShowForm(true)
    setDetailItem(null)
  }

  const handleDelete = async (item) => {
    if (!await confirm(`¿Eliminar el pedido "${item.order_reference || item.client_name}"?`)) return
    const { error } = await supabase.from('customer_orders').delete().eq('id', item.id)
    if (error) return toast.error(error.message)
    setDetailItem(null)
    fetchOrders()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const payload = {
      client_name: form.client_name,
      order_reference: form.order_reference || null,
      customer_contact_person: form.customer_contact_person || null,
      customer_email: form.customer_email || null,
      customer_phone: form.customer_phone || null,
      requirements_desc: form.requirements_desc || null,
      requirements_legal: form.requirements_legal || null,
      requirements_implicit: form.requirements_implicit || null,
      capacity_review: form.capacity_review || null,
      reviewed_by: form.reviewed_by || null,
      reviewed_at: form.reviewed_at || null,
      delivery_date: form.delivery_date || null,
      acceptance_date: form.acceptance_date || null,
      review_evidence: form.review_evidence || null,
      evidence_url: form.evidence_url || null,
      quoted_amount: form.quoted_amount === '' ? null : parseFloat(form.quoted_amount),
      currency: form.currency || 'USD',
      priority: form.priority || null,
      status: form.status,
      notes: form.notes || null,
    }
    let error
    if (editingId) {
      // Si cambia el status u otro campo crítico, lo loggeamos en change_log
      const prev = orders.find(o => o.id === editingId)
      const changes = []
      const critical = ['status', 'delivery_date', 'quoted_amount', 'requirements_desc']
      for (const k of critical) {
        if (prev && String(prev[k] ?? '') !== String(payload[k] ?? '')) {
          changes.push({ field: k, from: prev[k] ?? null, to: payload[k] ?? null })
        }
      }
      const newLog = [...(prev?.change_log || []), ...(changes.length ? [{
        at: new Date().toISOString(), changes
      }] : [])]
      ;({ error } = await supabase.from('customer_orders').update({ ...payload, change_log: newLog }).eq('id', editingId))
    } else {
      ({ error } = await supabase.from('customer_orders').insert([payload]))
    }
    if (error) return toast.error(error.message)
    setShowForm(false)
    resetForm()
    fetchOrders()
  }

  const handleStatusChange = async (item, newStatus) => {
    const newLog = [...(item.change_log || []), {
      at: new Date().toISOString(),
      changes: [{ field: 'status', from: item.status, to: newStatus }]
    }]
    const patch = { status: newStatus, change_log: newLog }
    if (newStatus === 'Aprobado' && !item.acceptance_date) {
      patch.acceptance_date = new Date().toISOString().substring(0, 10)
    }
    const { error } = await supabase.from('customer_orders').update(patch).eq('id', item.id)
    if (error) return toast.error(error.message)
    fetchOrders()
  }

  // ---- IA: sugerir requisitos legales típicos según ADN + descripción ----
  const handleSugerirRequisitosLegales = async () => {
    if (!form.requirements_desc?.trim() && !form.client_name?.trim()) {
      return toast.warning('Carga al menos el cliente o la descripción para que la IA tenga contexto')
    }
    setLoadingIA(true)
    setIaResult(null)
    try {
      const { data: profile } = await supabase.from('company_profile').select('*').maybeSingle()
      const resumen = profile ? {
        empresa: profile.name, sector: profile.industry, productos: profile.main_products, pais: profile.location,
      } : null
      const prompt = `
Eres un consultor experto en ISO 9001 cláusula 8.2 (requisitos para productos y servicios).
Empresa proveedora: ${JSON.stringify(resumen)}
Cliente: ${form.client_name || 'No especificado'}
Descripción del pedido: ${form.requirements_desc || 'No especificada'}

Sugiere:
1. Requisitos LEGALES y REGLAMENTARIOS aplicables (normativa local del sector + país, certificaciones obligatorias, regulaciones de producto/servicio).
2. Requisitos IMPLÍCITOS típicos no declarados por el cliente pero esperables (calidad mínima, plazos típicos del rubro, garantía, soporte post-venta, etc.).

Devuelve EXCLUSIVAMENTE este JSON (sin markdown, sin texto extra):
{
  "legal": "Bullet points con saltos de línea: - regulación 1\\n- regulación 2\\n...",
  "implicit": "Bullet points con saltos de línea: - requisito 1\\n- requisito 2\\n..."
}
`
      const respuesta = await consultarIA(
        prompt,
        'Eres un consultor ISO 9001 8.2. Responde solo con el JSON pedido. Sin markdown.'
      )
      console.log('[IA Requisitos] respuesta:', respuesta)
      const objStr = extractFirstJson(respuesta, '{', '}')
      if (!objStr) throw new Error('IA no devolvió JSON válido.')
      const obj = JSON.parse(objStr)
      setIaResult({ legal: obj.legal || '', implicit: obj.implicit || '' })
    } catch (err) {
      toast.error('No pudimos procesarla. ' + (err?.message || ''))
    } finally {
      setLoadingIA(false)
    }
  }

  const applyIaToForm = () => {
    setForm(f => ({
      ...f,
      requirements_legal: f.requirements_legal ? `${f.requirements_legal}\n${iaResult.legal}` : iaResult.legal,
      requirements_implicit: f.requirements_implicit ? `${f.requirements_implicit}\n${iaResult.implicit}` : iaResult.implicit,
    }))
    setIaResult(null)
  }

  // ---- Filtros + dashboard ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter(o =>
      (!filterStatus || o.status === filterStatus) &&
      (!filterPriority || o.priority === filterPriority) &&
      (!q || (o.client_name || '').toLowerCase().includes(q) || (o.order_reference || '').toLowerCase().includes(q))
    )
  }, [orders, filterStatus, filterPriority, search])

  const stats = useMemo(() => {
    const total = orders.length
    const enRevision = orders.filter(o => o.status === 'En Revisión' || o.status === 'Borrador' || o.status === 'Revision').length
    const aprobados = orders.filter(o => o.status === 'Aprobado').length
    const enProd = orders.filter(o => o.status === 'En Producción').length
    const entregados = orders.filter(o => o.status === 'Entregado').length
    const vencidos = orders.filter(o => {
      if (o.status === 'Entregado' || o.status === 'Rechazado') return false
      const d = daysUntil(o.delivery_date)
      return d !== null && d < 0
    }).length
    return { total, enRevision, aprobados, enProd, entregados, vencidos }
  }, [orders])

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>🛍️ Requisitos del Cliente</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>Gestión de pedidos y revisión de contratos (ISO 9001 - 8.2)</p>
        </div>
        {!showForm && (
          <button onClick={handleNew} className="btn btn-primary">
            <Plus size={18} /> Nuevo Pedido
          </button>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['8.2']} />

      {tableError && (
        <div style={{ marginTop: '1rem', padding: '0.9rem 1.1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '0.88rem' }}>
          <strong>⚠ No pudimos cargar la tabla.</strong>
          <p style={{ margin: '0.4rem 0 0 0' }}>{tableError}</p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.82rem' }}>
            Si dice <em>"Could not find the table"</em>, faltaría correr <strong>v35</strong> en Supabase.
          </p>
        </div>
      )}

      {/* ===== Dashboard ===== */}
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
                  placeholder="Buscar cliente o OC..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Filter size={14} style={{ color: 'var(--text-tertiary)' }} />
              <select className="form-select" style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                <option value="">Todos los estados</option>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="form-select" style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
                <option value="">Todas las prioridades</option>
                {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
            <KPI label="Total" value={stats.total} highlight />
            <KPI label="En revisión" value={stats.enRevision} color="#92400e" />
            <KPI label="Aprobados" value={stats.aprobados} color="#166534" />
            <KPI label="En producción" value={stats.enProd} color="#1e40af" />
            <KPI label="Entregados" value={stats.entregados} color="#3730a3" />
            <KPI label="Vencidos" value={stats.vencidos} danger={stats.vencidos > 0} />
          </div>
        </div>
      )}

      {/* ===== Formulario ===== */}
      {showForm && (
        <div className="card fade-in" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ borderBottom: '1px solid #eee', marginBottom: '1.5rem', paddingBottom: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>{editingId ? 'Editar pedido' : 'Registrar Nuevo Pedido'}</h3>
            <button onClick={handleCancel} className="btn-ghost">Cancelar</button>
          </div>
          <form onSubmit={handleSubmit}>
            <FormSection title="👤 Cliente y referencia">
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Cliente *</label>
                  <input required className="form-input" value={form.client_name}
                    onChange={e => setForm({ ...form, client_name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Referencia / OC</label>
                  <input className="form-input" value={form.order_reference}
                    onChange={e => setForm({ ...form, order_reference: e.target.value })}
                    placeholder="OC-2026-0123" />
                </div>
              </div>
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Persona de contacto</label>
                  <input className="form-input" value={form.customer_contact_person}
                    onChange={e => setForm({ ...form, customer_contact_person: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input type="email" className="form-input" value={form.customer_email}
                    onChange={e => setForm({ ...form, customer_email: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono</label>
                <input className="form-input" value={form.customer_phone}
                  onChange={e => setForm({ ...form, customer_phone: e.target.value })} />
              </div>
            </FormSection>

            <FormSection title="📋 Requisitos (ISO 8.2.2)">
              <div className="form-group">
                <label className="form-label">Descripción del pedido / requisitos del cliente *</label>
                <textarea required className="form-textarea" rows={3} value={form.requirements_desc}
                  onChange={e => setForm({ ...form, requirements_desc: e.target.value })}
                  placeholder="Especificaciones del producto/servicio, plazos, condiciones..." />
              </div>

              <div style={{ background: '#eef2ff', padding: '0.85rem 1rem', borderRadius: '8px', border: '1px solid #c7d2fe', marginBottom: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.85rem', color: '#3730a3' }}>
                    💡 ¿No declarado pero necesario? Que la IA te lo arme.
                  </strong>
                  <button type="button" onClick={handleSugerirRequisitosLegales} className="btn btn-ghost"
                    style={{ padding: '0.35rem 0.65rem', fontSize: '0.78rem', color: '#7c3aed' }} disabled={loadingIA}>
                    {loadingIA ? <Loader2 className="animate-spin" size={13} /> : <Sparkles size={13} />}
                    Sugerir legales + implícitos
                  </button>
                </div>
                <p style={{ margin: 0, fontSize: '0.78rem', color: '#475569' }}>
                  Lee el ADN + el cliente + la descripción → te propone requisitos legales y los implícitos típicos del rubro.
                </p>

                {iaResult && (
                  <div style={{ marginTop: '0.75rem', background: 'white', padding: '0.85rem', borderRadius: '6px', border: '1px solid #c7d2fe' }}>
                    <strong style={{ fontSize: '0.78rem', color: '#3730a3' }}>SUGERIDO POR IA</strong>
                    <div style={{ marginTop: '0.5rem', display: 'grid', gap: '0.5rem' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>Legales</div>
                        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: '0.82rem' }}>{iaResult.legal}</pre>
                      </div>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>Implícitos</div>
                        <pre style={{ whiteSpace: 'pre-wrap', margin: 0, fontFamily: 'inherit', fontSize: '0.82rem' }}>{iaResult.implicit}</pre>
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

              <div className="form-group">
                <label className="form-label">Requisitos legales / reglamentarios</label>
                <textarea className="form-textarea" rows={3} value={form.requirements_legal}
                  onChange={e => setForm({ ...form, requirements_legal: e.target.value })}
                  placeholder="Ej: Cumplimiento RGPD, ANMAT, marcado CE, normas IRAM..." />
              </div>
              <div className="form-group">
                <label className="form-label">Requisitos implícitos (no declarados pero necesarios)</label>
                <textarea className="form-textarea" rows={3} value={form.requirements_implicit}
                  onChange={e => setForm({ ...form, requirements_implicit: e.target.value })}
                  placeholder="Ej: Garantía mínima de 6 meses, soporte post-venta, embalaje resistente..." />
              </div>
            </FormSection>

            <FormSection title="✅ Revisión y capacidad (ISO 8.2.3)">
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Revisado por</label>
                  <input className="form-input" value={form.reviewed_by}
                    onChange={e => setForm({ ...form, reviewed_by: e.target.value })}
                    placeholder="Ej: Jefe Comercial" />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de revisión</label>
                  <input type="date" className="form-input" value={form.reviewed_at}
                    onChange={e => setForm({ ...form, reviewed_at: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Análisis de capacidad (¿podemos cumplir?)</label>
                <textarea className="form-textarea" rows={2} value={form.capacity_review}
                  onChange={e => setForm({ ...form, capacity_review: e.target.value })}
                  placeholder="Stock disponible, capacidad de producción, recursos críticos, riesgos..." />
              </div>
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Evidencia de revisión (texto)</label>
                  <input className="form-input" value={form.review_evidence}
                    onChange={e => setForm({ ...form, review_evidence: e.target.value })}
                    placeholder="Ej: Acta reunión #45, Email del 12/05/2026" />
                </div>
                <div className="form-group">
                  <label className="form-label">Link OC firmada / contrato</label>
                  <input type="url" className="form-input" value={form.evidence_url}
                    onChange={e => setForm({ ...form, evidence_url: e.target.value })}
                    placeholder="https://drive.google.com/..." />
                </div>
              </div>
            </FormSection>

            <FormSection title="📅 Fechas y económico">
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Fecha de entrega solicitada</label>
                  <input type="date" className="form-input" value={form.delivery_date}
                    onChange={e => setForm({ ...form, delivery_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha de aceptación</label>
                  <input type="date" className="form-input" value={form.acceptance_date}
                    onChange={e => setForm({ ...form, acceptance_date: e.target.value })} />
                </div>
              </div>
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Monto cotizado</label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input type="number" step="any" className="form-input" value={form.quoted_amount}
                      onChange={e => setForm({ ...form, quoted_amount: e.target.value })}
                      placeholder="0.00" style={{ flex: 1 }} />
                    <select className="form-select" value={form.currency}
                      onChange={e => setForm({ ...form, currency: e.target.value })}
                      style={{ width: '90px' }}>
                      {CURRENCY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Prioridad</label>
                  <select className="form-select" value={form.priority}
                    onChange={e => setForm({ ...form, priority: e.target.value })}>
                    {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
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
                  <label className="form-label">Notas internas</label>
                  <input className="form-input" value={form.notes}
                    onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>
            </FormSection>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" onClick={handleCancel} className="btn btn-ghost">Cancelar</button>
              <button type="submit" className="btn btn-primary">{editingId ? 'Guardar cambios' : 'Registrar pedido'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ===== Lista de pedidos ===== */}
      {!showForm && (
        <>
          {loading && <p>Cargando pedidos...</p>}
          {!loading && orders.length === 0 && !tableError && (
            <div style={{ textAlign: 'center', padding: '4rem', color: '#cbd5e1' }}>
              <ShoppingCart size={64} style={{ marginBottom: '1rem', opacity: 0.3 }} />
              <p>No hay pedidos registrados. Tocá <strong>+ Nuevo Pedido</strong> para arrancar.</p>
            </div>
          )}

          <div className="grid-dashboard">
            {filtered.map(item => {
              const days = daysUntil(item.delivery_date)
              const isOverdue = (item.status !== 'Entregado' && item.status !== 'Rechazado') && days !== null && days < 0
              const isSoon = (item.status !== 'Entregado' && item.status !== 'Rechazado') && days !== null && days >= 0 && days <= 7
              const sc = STATUS_COLORS[item.status] || STATUS_COLORS['Borrador']
              const stripeColor = isOverdue ? '#ef4444' : item.status === 'Aprobado' ? '#22c55e' : item.status === 'Entregado' ? '#6366f1' : '#eab308'

              return (
                <div key={item.id} className="card" style={{ borderLeft: `5px solid ${stripeColor}`, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.4rem' }}>
                    <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>{item.order_reference || 'sin ref'}</span>
                    <span style={{
                      background: sc.bg, color: sc.fg, padding: '0.15rem 0.55rem',
                      borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600
                    }}>{item.status}</span>
                  </div>

                  <h4 style={{ margin: 0 }}>{item.client_name}</h4>
                  {item.customer_contact_person && (
                    <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748b' }}>
                      <User size={11} style={{ verticalAlign: 'middle' }} /> {item.customer_contact_person}
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', fontSize: '0.78rem', color: '#64748b' }}>
                    {item.delivery_date && (
                      <span style={{ color: isOverdue ? '#991b1b' : isSoon ? '#92400e' : '#64748b' }}>
                        <Calendar size={11} style={{ verticalAlign: 'middle' }} /> {item.delivery_date}
                        {isOverdue && ' (vencido)'}
                        {isSoon && ` (${days}d)`}
                      </span>
                    )}
                    {item.priority && (
                      <span style={{
                        background: item.priority === 'Alta' ? '#fee2e2' : item.priority === 'Baja' ? '#f1f5f9' : '#fef3c7',
                        color: item.priority === 'Alta' ? '#991b1b' : item.priority === 'Baja' ? '#64748b' : '#92400e',
                        padding: '0.05rem 0.4rem', borderRadius: '999px', fontSize: '0.7rem'
                      }}>{item.priority}</span>
                    )}
                    {item.quoted_amount && (
                      <span>💰 {Number(item.quoted_amount).toLocaleString()} {item.currency}</span>
                    )}
                  </div>

                  {item.requirements_desc && (
                    <p style={{ margin: 0, fontSize: '0.85rem', color: '#334155', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.requirements_desc}
                    </p>
                  )}

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto', paddingTop: '0.4rem', borderTop: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                      {(item.status === 'Borrador' || item.status === 'En Revisión' || item.status === 'Revision') && (
                        <button onClick={() => handleStatusChange(item, 'Aprobado')} className="btn btn-primary" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem' }}>
                          <CheckCircle size={11} /> Aprobar
                        </button>
                      )}
                      {item.status === 'Aprobado' && (
                        <button onClick={() => handleStatusChange(item, 'En Producción')} className="btn btn-ghost" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem', background: '#dbeafe', color: '#1e40af' }}>
                          → Producción
                        </button>
                      )}
                      {item.status === 'En Producción' && (
                        <button onClick={() => handleStatusChange(item, 'Entregado')} className="btn btn-ghost" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem', background: '#e0e7ff', color: '#3730a3' }}>
                          → Entregar
                        </button>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '0.2rem' }}>
                      {item.evidence_url && (
                        <a href={item.evidence_url} target="_blank" rel="noreferrer" className="btn-ghost" title="OC firmada" style={{ padding: '0.3rem' }}>
                          <ExternalLink size={12} />
                        </a>
                      )}
                      <button onClick={() => setDetailItem(item)} className="btn-ghost" title="Ver detalle" style={{ padding: '0.3rem' }}>
                        <Eye size={12} />
                      </button>
                      <button onClick={() => handleEdit(item)} className="btn-ghost" title="Editar" style={{ padding: '0.3rem' }}>
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => handleDelete(item)} className="btn-ghost" title="Eliminar" style={{ padding: '0.3rem', color: '#ef4444' }}>
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
          {filtered.length === 0 && orders.length > 0 && (
            <p style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>
              No hay pedidos con esos filtros.
            </p>
          )}
        </>
      )}

      {/* ===== Modal detalle ===== */}
      {detailItem && createPortal((
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{
            background: 'white', maxWidth: '760px', width: '100%', padding: 0,
            maxHeight: '90vh', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ShoppingCart size={18} /> {detailItem.client_name}
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  {detailItem.order_reference || 'Sin referencia'} · {detailItem.status}
                </span>
              </div>
              <button onClick={() => setDetailItem(null)} className="btn-ghost"><X size={18} /></button>
            </div>
            <div style={{ overflow: 'auto', padding: '1.25rem', display: 'grid', gap: '1rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <DetailRow label="Contacto" value={detailItem.customer_contact_person} />
                <DetailRow label="Email" value={detailItem.customer_email} />
                <DetailRow label="Teléfono" value={detailItem.customer_phone} />
                <DetailRow label="Prioridad" value={detailItem.priority} />
                <DetailRow label="Monto cotizado" value={detailItem.quoted_amount ? `${Number(detailItem.quoted_amount).toLocaleString()} ${detailItem.currency || ''}` : null} />
                <DetailRow label="Entrega" value={detailItem.delivery_date} />
                <DetailRow label="Revisado por" value={detailItem.reviewed_by} />
                <DetailRow label="Fecha revisión" value={detailItem.reviewed_at} />
                <DetailRow label="Fecha aceptación" value={detailItem.acceptance_date} />
              </div>

              {detailItem.requirements_desc && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>REQUISITOS DEL CLIENTE</div>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{detailItem.requirements_desc}</p>
                </div>
              )}
              {detailItem.requirements_legal && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>LEGALES / REGLAMENTARIOS</div>
                  <pre style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{detailItem.requirements_legal}</pre>
                </div>
              )}
              {detailItem.requirements_implicit && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>IMPLÍCITOS</div>
                  <pre style={{ margin: '0.25rem 0 0 0', fontSize: '0.85rem', whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{detailItem.requirements_implicit}</pre>
                </div>
              )}
              {detailItem.capacity_review && (
                <div style={{ background: '#f0fdf4', padding: '0.7rem 0.85rem', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                  <strong style={{ fontSize: '0.75rem', color: '#14532d' }}>ANÁLISIS DE CAPACIDAD</strong>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.88rem', color: '#14532d' }}>{detailItem.capacity_review}</p>
                </div>
              )}
              {(detailItem.review_evidence || detailItem.evidence_url) && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>EVIDENCIA DE REVISIÓN</div>
                  {detailItem.review_evidence && <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.88rem' }}>{detailItem.review_evidence}</p>}
                  {detailItem.evidence_url && (
                    <a href={detailItem.evidence_url} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ marginTop: '0.4rem' }}>
                      <ExternalLink size={13} /> Ver OC firmada / contrato
                    </a>
                  )}
                </div>
              )}

              {(detailItem.change_log?.length || 0) > 0 && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <History size={11} /> CAMBIOS REGISTRADOS (ISO 8.2.4)
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

// ----- Parser -----
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
