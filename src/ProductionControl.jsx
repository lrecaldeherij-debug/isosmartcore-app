import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import {
  Factory, Play, CheckSquare, Clock, AlertTriangle, X, Eye, Pencil, Trash2,
  Search, Filter, BarChart3, ExternalLink, Calendar, Plus, ShoppingCart,
  Ruler, Truck, History, ChevronRight, Pause, Square
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

const STATUS_OPTIONS = ['Pendiente', 'En Proceso', 'En Pausa', 'Terminado', 'Cancelado']
const STATUS_COLORS = {
  'Pendiente':  { bg: '#f1f5f9', fg: '#64748b', stripe: '#94a3b8' },
  'En Proceso': { bg: '#dbeafe', fg: '#1e40af', stripe: '#0284c7' },
  'En Pausa':   { bg: '#fef3c7', fg: '#92400e', stripe: '#f59e0b' },
  'Terminado':  { bg: '#dcfce7', fg: '#166534', stripe: '#16a34a' },
  'Cancelado':  { bg: '#fee2e2', fg: '#991b1b', stripe: '#ef4444' },
}
const PRIORITY_OPTIONS = ['Alta', 'Media', 'Baja']

const EMPTY_FORM = {
  customer_order_id: '',
  order_id: '',
  product_name: '',
  product_spec: '',
  process_instructions: '',
  quality_criteria: '',
  quantity: '',
  unit: 'u',
  batch_number: '',
  start_date: '',
  planned_end_date: '',
  operator: '',
  supervisor: '',
  priority: 'Media',
  status: 'Pendiente',
  notes: '',
  evidence_url: '',
  raw_materials: [],   // [{ supplier, item, lot, quantity, unit }]
  equipment_used: [],  // [{ equipment_id, name }]
}

function autoBatch() {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
  return `LOT-${y}-${n}`
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.round((new Date(dateStr).getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}

export default function ProductionControl() {
  const [orders, setOrders] = useState([])
  const [customerOrders, setCustomerOrders] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [equipment, setEquipment] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [detailItem, setDetailItem] = useState(null)
  const [form, setForm] = useState({ ...EMPTY_FORM })

  // Filtros + vista
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [viewMode, setViewMode] = useState('kanban')   // 'kanban' | 'list'

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: prod, error }, { data: cust }, { data: sup }, { data: eq }] = await Promise.all([
      supabase.from('production_orders').select('*').order('created_at', { ascending: false }),
      supabase.from('customer_orders').select('id, client_name, order_reference, status, delivery_date'),
      supabase.from('suppliers').select('id, supplier_name'),
      supabase.from('equipment_calibration').select('id, equipment_name, equipment_type, status'),
    ])
    if (error) {
      setTableError(error.message)
      console.warn('Error cargando production_orders:', error)
    } else {
      setTableError(null)
      setOrders(prod || [])
    }
    setCustomerOrders(cust || [])
    setSuppliers(sup || [])
    setEquipment(eq || [])
    setLoading(false)
  }

  const resetForm = () => { setForm({ ...EMPTY_FORM }); setEditingId(null) }
  const handleNew = () => { resetForm(); setShowForm(true) }
  const handleCancel = () => { setShowForm(false); resetForm() }

  const handleEdit = (item) => {
    setForm({
      customer_order_id: item.customer_order_id || '',
      order_id: item.order_id || '',
      product_name: item.product_name || '',
      product_spec: item.product_spec || '',
      process_instructions: item.process_instructions || '',
      quality_criteria: item.quality_criteria || '',
      quantity: item.quantity ?? '',
      unit: item.unit || 'u',
      batch_number: item.batch_number || '',
      start_date: item.start_date || '',
      planned_end_date: item.planned_end_date || '',
      operator: item.operator || '',
      supervisor: item.supervisor || '',
      priority: item.priority || 'Media',
      status: item.status || 'Pendiente',
      notes: item.notes || '',
      evidence_url: item.evidence_url || '',
      raw_materials: Array.isArray(item.raw_materials) ? item.raw_materials : [],
      equipment_used: Array.isArray(item.equipment_used) ? item.equipment_used : [],
    })
    setEditingId(item.id)
    setShowForm(true)
    setDetailItem(null)
  }

  // Pre-llenar form desde un customer_order seleccionado
  const handleFromCustomerOrder = (coId) => {
    const co = customerOrders.find(c => c.id === coId)
    if (!co) return
    setForm(f => ({
      ...f,
      customer_order_id: co.id,
      order_id: co.order_reference ? `${co.order_reference} · ${co.client_name}` : co.client_name,
      planned_end_date: co.delivery_date || f.planned_end_date,
    }))
  }

  const handleDelete = async (item) => {
    if (!await confirm(`¿Eliminar la orden "${item.product_name}"?`)) return
    const { error } = await supabase.from('production_orders').delete().eq('id', item.id)
    if (error) return toast.error(error.message)
    setDetailItem(null)
    fetchAll()
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const batch = form.batch_number || autoBatch()
    const payload = {
      customer_order_id: form.customer_order_id || null,
      order_id: form.order_id || null,
      product_name: form.product_name,
      product_spec: form.product_spec || null,
      process_instructions: form.process_instructions || null,
      quality_criteria: form.quality_criteria || null,
      quantity: form.quantity === '' ? null : Number(form.quantity),
      unit: form.unit || null,
      batch_number: batch,
      start_date: form.start_date || null,
      planned_end_date: form.planned_end_date || null,
      operator: form.operator || null,
      supervisor: form.supervisor || null,
      priority: form.priority || null,
      status: form.status,
      notes: form.notes || null,
      evidence_url: form.evidence_url || null,
      raw_materials: form.raw_materials || [],
      equipment_used: form.equipment_used || [],
    }
    let error
    if (editingId) {
      const prev = orders.find(o => o.id === editingId)
      const critical = ['status', 'planned_end_date', 'quantity', 'product_name']
      const changes = []
      for (const k of critical) {
        if (prev && String(prev[k] ?? '') !== String(payload[k] ?? '')) {
          changes.push({ field: k, from: prev[k] ?? null, to: payload[k] ?? null })
        }
      }
      const newLog = [...(prev?.change_log || []), ...(changes.length ? [{ at: new Date().toISOString(), changes }] : [])]
      ;({ error } = await supabase.from('production_orders').update({ ...payload, change_log: newLog }).eq('id', editingId))
    } else {
      ({ error } = await supabase.from('production_orders').insert([payload]))
    }
    if (error) return toast.error(error.message)
    setShowForm(false)
    resetForm()
    fetchAll()
  }

  // Cambio de status desde la card
  const handleAdvance = async (item, newStatus) => {
    const newLog = [...(item.change_log || []), {
      at: new Date().toISOString(),
      changes: [{ field: 'status', from: item.status, to: newStatus }]
    }]
    const patch = { status: newStatus, change_log: newLog }
    if (newStatus === 'En Proceso' && !item.actual_start_date) {
      patch.actual_start_date = new Date().toISOString()
    }
    if (newStatus === 'Terminado' && !item.actual_end_date) {
      patch.actual_end_date = new Date().toISOString()
    }
    const { error } = await supabase.from('production_orders').update(patch).eq('id', item.id)
    if (error) return toast.error(error.message)
    fetchAll()
  }

  // ---- Manejo de raw_materials y equipment_used ----
  const addMaterial = () => {
    setForm(f => ({ ...f, raw_materials: [...(f.raw_materials || []), { supplier: '', item: '', lot: '', quantity: '', unit: '' }] }))
  }
  const updateMaterial = (idx, key, val) => {
    setForm(f => {
      const arr = [...(f.raw_materials || [])]
      arr[idx] = { ...arr[idx], [key]: val }
      return { ...f, raw_materials: arr }
    })
  }
  const removeMaterial = (idx) => {
    setForm(f => ({ ...f, raw_materials: (f.raw_materials || []).filter((_, i) => i !== idx) }))
  }

  const addEquipment = (equipmentId) => {
    if (!equipmentId) return
    const eq = equipment.find(e => e.id === equipmentId)
    if (!eq) return
    if ((form.equipment_used || []).some(e => e.equipment_id === eq.id)) return
    setForm(f => ({
      ...f,
      equipment_used: [...(f.equipment_used || []), { equipment_id: eq.id, name: eq.equipment_name, type: eq.equipment_type }]
    }))
  }
  const removeEquipment = (id) => {
    setForm(f => ({ ...f, equipment_used: (f.equipment_used || []).filter(e => e.equipment_id !== id) }))
  }

  // ---- Filtros + dashboard ----
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return orders.filter(o =>
      (!filterStatus || o.status === filterStatus) &&
      (!filterPriority || o.priority === filterPriority) &&
      (!q || (o.product_name || '').toLowerCase().includes(q) || (o.batch_number || '').toLowerCase().includes(q))
    )
  }, [orders, filterStatus, filterPriority, search])

  const stats = useMemo(() => {
    const total = orders.length
    const pendientes = orders.filter(o => o.status === 'Pendiente').length
    const enProceso = orders.filter(o => o.status === 'En Proceso').length
    const enPausa = orders.filter(o => o.status === 'En Pausa').length
    const terminados = orders.filter(o => o.status === 'Terminado').length
    const vencidos = orders.filter(o => {
      if (o.status === 'Terminado' || o.status === 'Cancelado') return false
      const d = daysUntil(o.planned_end_date)
      return d !== null && d < 0
    }).length
    return { total, pendientes, enProceso, enPausa, terminados, vencidos }
  }, [orders])

  // Mapa rápido para mostrar info del customer order en cards
  const coById = useMemo(() => Object.fromEntries(customerOrders.map(c => [c.id, c])), [customerOrders])

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div>
          <h2 style={{ margin: 0 }}>🏭 Control de Producción</h2>
          <p style={{ color: '#666', fontSize: '14px' }}>Planificación y ejecución con trazabilidad (ISO 9001 - 8.5)</p>
        </div>
        {!showForm && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleNew} className="btn btn-primary">
              <Play size={18} /> Nueva Orden de Trabajo
            </button>
          </div>
        )}
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['8.5']} />

      {tableError && (
        <div style={{ marginTop: '1rem', padding: '0.9rem 1.1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '0.88rem' }}>
          <strong>⚠ No pudimos cargar la tabla.</strong>
          <p style={{ margin: '0.4rem 0 0 0' }}>{tableError}</p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.82rem' }}>
            Si dice <em>"Could not find the table"</em>, faltaría correr <strong>v36</strong> en Supabase.
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
              <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                <button onClick={() => setViewMode('kanban')} className="btn-ghost"
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', background: viewMode === 'kanban' ? '#eef2ff' : 'transparent', color: viewMode === 'kanban' ? '#3730a3' : '#64748b' }}>
                  Kanban
                </button>
                <button onClick={() => setViewMode('list')} className="btn-ghost"
                  style={{ padding: '0.35rem 0.6rem', fontSize: '0.8rem', background: viewMode === 'list' ? '#eef2ff' : 'transparent', color: viewMode === 'list' ? '#3730a3' : '#64748b' }}>
                  Lista
                </button>
              </div>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input className="form-input" style={{ padding: '0.35rem 0.5rem 0.35rem 1.8rem', fontSize: '0.85rem', minWidth: '180px' }}
                  placeholder="Buscar producto o lote..." value={search} onChange={e => setSearch(e.target.value)} />
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
            <KPI label="Pendientes" value={stats.pendientes} color="#64748b" />
            <KPI label="En proceso" value={stats.enProceso} color="#1e40af" />
            <KPI label="En pausa" value={stats.enPausa} warn={stats.enPausa > 0} />
            <KPI label="Terminadas" value={stats.terminados} color="#166534" />
            <KPI label="Vencidas" value={stats.vencidos} danger={stats.vencidos > 0} />
          </div>
        </div>
      )}

      {/* ===== Formulario ===== */}
      {showForm && (
        <div className="card fade-in" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
          <div style={{ borderBottom: '1px solid #eee', marginBottom: '1.5rem', paddingBottom: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
            <h3 style={{ margin: 0 }}>{editingId ? 'Editar orden' : 'Nueva Orden de Producción'}</h3>
            <button onClick={handleCancel} className="btn-ghost">Cancelar</button>
          </div>
          <form onSubmit={handleSubmit}>

            <FormSection title="🔗 Pedido del cliente vinculado (trazabilidad)">
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Pedido del cliente</label>
                  <select className="form-select" value={form.customer_order_id}
                    onChange={e => handleFromCustomerOrder(e.target.value)}>
                    <option value="">— Sin vínculo (orden interna) —</option>
                    {customerOrders.filter(c => ['Aprobado', 'En Producción'].includes(c.status)).map(c => (
                      <option key={c.id} value={c.id}>
                        {c.order_reference || 'Sin ref'} · {c.client_name}
                      </option>
                    ))}
                  </select>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '0.25rem' }}>
                    Solo se muestran pedidos en estado <strong>Aprobado</strong> o <strong>En Producción</strong>.
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Referencia adicional / nota</label>
                  <input className="form-input" value={form.order_id}
                    onChange={e => setForm({ ...form, order_id: e.target.value })}
                    placeholder="Texto libre opcional" />
                </div>
              </div>
            </FormSection>

            <FormSection title="📦 Producto y especificación (ISO 8.5.1)">
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Producto / Servicio *</label>
                  <input required className="form-input" value={form.product_name}
                    onChange={e => setForm({ ...form, product_name: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Lote / ID trazabilidad</label>
                  <input className="form-input" value={form.batch_number}
                    onChange={e => setForm({ ...form, batch_number: e.target.value })}
                    placeholder="Vacío para auto-generar" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Especificación técnica</label>
                <textarea className="form-textarea" rows={2} value={form.product_spec}
                  onChange={e => setForm({ ...form, product_spec: e.target.value })}
                  placeholder="Dimensiones, materiales, tolerancias, ficha técnica..." />
              </div>
              <div className="form-group">
                <label className="form-label">Instrucciones de proceso</label>
                <textarea className="form-textarea" rows={2} value={form.process_instructions}
                  onChange={e => setForm({ ...form, process_instructions: e.target.value })}
                  placeholder="Pasos, parámetros, secuencia..." />
              </div>
              <div className="form-group">
                <label className="form-label">Criterios de aceptación / calidad</label>
                <textarea className="form-textarea" rows={2} value={form.quality_criteria}
                  onChange={e => setForm({ ...form, quality_criteria: e.target.value })}
                  placeholder="Qué condiciones debe cumplir para ser conforme..." />
              </div>
            </FormSection>

            <FormSection title="🧪 Trazabilidad de materia prima (ISO 8.5.2)">
              <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.6rem' }}>
                Carga los materiales con proveedor + lote para poder rastrear hacia atrás en caso de no conformidad.
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '0.72rem' }}>
                    <th style={{ padding: '0.4rem', textAlign: 'left' }}>Proveedor</th>
                    <th style={{ padding: '0.4rem', textAlign: 'left' }}>Material</th>
                    <th style={{ padding: '0.4rem', textAlign: 'left' }}>Lote</th>
                    <th style={{ padding: '0.4rem', textAlign: 'left' }}>Cant.</th>
                    <th style={{ padding: '0.4rem', textAlign: 'left' }}>U.</th>
                    <th style={{ padding: '0.4rem', width: '32px' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {(form.raw_materials || []).map((m, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '0.3rem' }}>
                        <select className="form-select" value={m.supplier}
                          onChange={e => updateMaterial(idx, 'supplier', e.target.value)}
                          style={{ padding: '0.3rem', fontSize: '0.8rem' }}>
                          <option value="">— Seleccionar —</option>
                          {suppliers.map(s => <option key={s.id} value={s.supplier_name}>{s.supplier_name}</option>)}
                          <option value="__custom">Otro / Texto libre</option>
                        </select>
                      </td>
                      <td style={{ padding: '0.3rem' }}>
                        <input className="form-input" value={m.item}
                          onChange={e => updateMaterial(idx, 'item', e.target.value)}
                          style={{ padding: '0.3rem', fontSize: '0.8rem' }} />
                      </td>
                      <td style={{ padding: '0.3rem' }}>
                        <input className="form-input" value={m.lot}
                          onChange={e => updateMaterial(idx, 'lot', e.target.value)}
                          style={{ padding: '0.3rem', fontSize: '0.8rem' }} />
                      </td>
                      <td style={{ padding: '0.3rem' }}>
                        <input type="number" step="any" className="form-input" value={m.quantity}
                          onChange={e => updateMaterial(idx, 'quantity', e.target.value)}
                          style={{ padding: '0.3rem', fontSize: '0.8rem', width: '70px' }} />
                      </td>
                      <td style={{ padding: '0.3rem' }}>
                        <input className="form-input" value={m.unit}
                          onChange={e => updateMaterial(idx, 'unit', e.target.value)}
                          style={{ padding: '0.3rem', fontSize: '0.8rem', width: '50px' }} />
                      </td>
                      <td style={{ padding: '0.3rem', textAlign: 'center' }}>
                        <button type="button" onClick={() => removeMaterial(idx)} className="btn-ghost" style={{ color: '#ef4444', padding: '0.2rem' }}>
                          <X size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" onClick={addMaterial} className="btn-ghost" style={{ marginTop: '0.5rem', padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}>
                <Plus size={12} /> Agregar material
              </button>
            </FormSection>

            <FormSection title="📏 Equipos de medición utilizados (ISO 7.1.5 ↔ 8.5)">
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.6rem' }}>
                <select className="form-select" style={{ flex: 1 }}
                  onChange={e => { addEquipment(e.target.value); e.target.value = '' }}>
                  <option value="">+ Agregar equipo del catálogo</option>
                  {equipment.filter(e => e.status === 'Vigente').map(e => (
                    <option key={e.id} value={e.id}>{e.equipment_name} ({e.equipment_type})</option>
                  ))}
                </select>
              </div>
              {(form.equipment_used || []).length === 0 ? (
                <p style={{ fontSize: '0.78rem', color: '#94a3b8', margin: 0 }}>
                  Ningún equipo asociado. Solo se listan equipos con calibración <strong>Vigente</strong>.
                </p>
              ) : (
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  {(form.equipment_used || []).map(eq => (
                    <span key={eq.equipment_id} style={{
                      background: '#eef2ff', color: '#3730a3', padding: '0.25rem 0.55rem', borderRadius: '999px',
                      fontSize: '0.78rem', display: 'inline-flex', alignItems: 'center', gap: '0.3rem'
                    }}>
                      <Ruler size={11} /> {eq.name}
                      <button type="button" onClick={() => removeEquipment(eq.equipment_id)} className="btn-ghost"
                        style={{ padding: 0, color: '#3730a3', display: 'inline-flex' }}>
                        <X size={11} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </FormSection>

            <FormSection title="📅 Planificación y operación">
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Cantidad *</label>
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <input type="number" required step="any" className="form-input" value={form.quantity}
                      onChange={e => setForm({ ...form, quantity: e.target.value })}
                      style={{ flex: 1 }} />
                    <input className="form-input" value={form.unit}
                      onChange={e => setForm({ ...form, unit: e.target.value })}
                      placeholder="u, kg, m..."
                      style={{ width: '90px' }} />
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
                  <label className="form-label">Fecha inicio programada *</label>
                  <input type="date" required className="form-input" value={form.start_date}
                    onChange={e => setForm({ ...form, start_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Fecha fin estimada</label>
                  <input type="date" className="form-input" value={form.planned_end_date}
                    onChange={e => setForm({ ...form, planned_end_date: e.target.value })} />
                </div>
              </div>
              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Operario</label>
                  <input className="form-input" value={form.operator}
                    onChange={e => setForm({ ...form, operator: e.target.value })}
                    placeholder="Ej: Juan Pérez" />
                </div>
                <div className="form-group">
                  <label className="form-label">Supervisor</label>
                  <input className="form-input" value={form.supervisor}
                    onChange={e => setForm({ ...form, supervisor: e.target.value })}
                    placeholder="Ej: Jefe de Planta" />
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
                  <label className="form-label">Link a evidencia (parte de producción firmado)</label>
                  <input type="url" className="form-input" value={form.evidence_url}
                    onChange={e => setForm({ ...form, evidence_url: e.target.value })}
                    placeholder="https://drive.google.com/..." />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Notas</label>
                <textarea className="form-textarea" rows={2} value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })} />
              </div>
            </FormSection>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1rem' }}>
              <button type="button" onClick={handleCancel} className="btn btn-ghost">Cancelar</button>
              <button type="submit" className="btn btn-primary">{editingId ? 'Guardar cambios' : 'Lanzar orden'}</button>
            </div>
          </form>
        </div>
      )}

      {/* ===== Lista (Kanban o plana) ===== */}
      {!showForm && !loading && (
        viewMode === 'kanban' ? (
          <div className="grid-dashboard" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', alignItems: 'start' }}>
            {STATUS_OPTIONS.map(status => {
              const itemsHere = filtered.filter(o => o.status === status)
              const sc = STATUS_COLORS[status]
              return (
                <div key={status} style={{ background: sc.bg, padding: '1rem', borderRadius: '8px', minHeight: '100px' }}>
                  <h4 style={{ color: sc.fg, borderBottom: `2px solid ${sc.stripe}`, paddingBottom: '0.5rem', margin: '0 0 0.75rem 0', fontSize: '0.95rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{status}</span>
                    <span style={{ fontSize: '0.78rem', opacity: 0.8 }}>{itemsHere.length}</span>
                  </h4>
                  {itemsHere.map(item => (
                    <ProductionCard
                      key={item.id} item={item} co={coById[item.customer_order_id]}
                      onAdvance={handleAdvance}
                      onDetail={setDetailItem}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </div>
              )
            })}
          </div>
        ) : (
          <div style={{ display: 'grid', gap: '0.5rem' }}>
            {filtered.map(item => (
              <ProductionCard
                key={item.id} item={item} co={coById[item.customer_order_id]}
                onAdvance={handleAdvance}
                onDetail={setDetailItem}
                onEdit={handleEdit}
                onDelete={handleDelete}
                listMode
              />
            ))}
            {filtered.length === 0 && (
              <p style={{ textAlign: 'center', color: '#64748b', padding: '2rem' }}>No hay órdenes con esos filtros.</p>
            )}
          </div>
        )
      )}

      {!loading && orders.length === 0 && !tableError && (
        <div style={{ textAlign: 'center', padding: '4rem', color: '#cbd5e1' }}>
          <Factory size={64} style={{ marginBottom: '1rem', opacity: 0.3 }} />
          <p>No hay órdenes registradas. Tocá <strong>+ Nueva Orden</strong> para arrancar.</p>
        </div>
      )}

      {/* ===== Modal detalle ===== */}
      {detailItem && createPortal((
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{
            background: 'white', maxWidth: '780px', width: '100%', padding: 0,
            maxHeight: '90vh', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Factory size={18} /> {detailItem.product_name}
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Lote: {detailItem.batch_number} · {detailItem.status}
                </span>
              </div>
              <button onClick={() => setDetailItem(null)} className="btn-ghost"><X size={18} /></button>
            </div>
            <div style={{ overflow: 'auto', padding: '1.25rem', display: 'grid', gap: '1rem' }}>
              {/* Trazabilidad bidireccional */}
              <div style={{ background: '#eef2ff', padding: '0.85rem', borderRadius: '8px', border: '1px solid #c7d2fe' }}>
                <strong style={{ fontSize: '0.78rem', color: '#3730a3' }}>🔗 TRAZABILIDAD</strong>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.4rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
                  {coById[detailItem.customer_order_id] ? (
                    <>
                      <ShoppingCart size={13} />
                      <span><strong>Pedido:</strong> {coById[detailItem.customer_order_id].order_reference || 'Sin ref'} · {coById[detailItem.customer_order_id].client_name}</span>
                    </>
                  ) : (
                    <span style={{ color: '#64748b' }}>Sin pedido vinculado (orden interna)</span>
                  )}
                  <ChevronRight size={13} style={{ color: '#94a3b8' }} />
                  <Factory size={13} />
                  <span><strong>Lote:</strong> {detailItem.batch_number}</span>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <DetailRow label="Cantidad" value={detailItem.quantity ? `${detailItem.quantity} ${detailItem.unit || ''}` : null} />
                <DetailRow label="Prioridad" value={detailItem.priority} />
                <DetailRow label="Inicio programado" value={detailItem.start_date} />
                <DetailRow label="Fin estimado" value={detailItem.planned_end_date} />
                <DetailRow label="Inicio real" value={detailItem.actual_start_date ? new Date(detailItem.actual_start_date).toLocaleString() : null} />
                <DetailRow label="Fin real" value={detailItem.actual_end_date ? new Date(detailItem.actual_end_date).toLocaleString() : null} />
                <DetailRow label="Operario" value={detailItem.operator} />
                <DetailRow label="Supervisor" value={detailItem.supervisor} />
              </div>

              {detailItem.product_spec && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>ESPECIFICACIÓN</div>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{detailItem.product_spec}</p>
                </div>
              )}
              {detailItem.process_instructions && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>INSTRUCCIONES</div>
                  <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{detailItem.process_instructions}</p>
                </div>
              )}
              {detailItem.quality_criteria && (
                <div style={{ background: '#f0fdf4', padding: '0.7rem 0.85rem', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                  <strong style={{ fontSize: '0.75rem', color: '#14532d' }}>CRITERIOS DE ACEPTACIÓN</strong>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.88rem', color: '#14532d' }}>{detailItem.quality_criteria}</p>
                </div>
              )}

              {/* Materia prima */}
              {(detailItem.raw_materials?.length || 0) > 0 && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Truck size={11} /> MATERIA PRIMA
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginTop: '0.3rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                        <th style={{ padding: '0.4rem', textAlign: 'left' }}>Proveedor</th>
                        <th style={{ padding: '0.4rem', textAlign: 'left' }}>Material</th>
                        <th style={{ padding: '0.4rem', textAlign: 'left' }}>Lote</th>
                        <th style={{ padding: '0.4rem', textAlign: 'left' }}>Cantidad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailItem.raw_materials.map((m, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '0.4rem' }}>{m.supplier || '—'}</td>
                          <td style={{ padding: '0.4rem' }}>{m.item || '—'}</td>
                          <td style={{ padding: '0.4rem', fontFamily: 'monospace' }}>{m.lot || '—'}</td>
                          <td style={{ padding: '0.4rem' }}>{m.quantity} {m.unit}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Equipos */}
              {(detailItem.equipment_used?.length || 0) > 0 && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <Ruler size={11} /> EQUIPOS DE MEDICIÓN UTILIZADOS
                  </div>
                  <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                    {detailItem.equipment_used.map(eq => (
                      <span key={eq.equipment_id} style={{ background: '#eef2ff', color: '#3730a3', padding: '0.2rem 0.5rem', borderRadius: '999px', fontSize: '0.78rem' }}>
                        {eq.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {detailItem.evidence_url && (
                <a href={detailItem.evidence_url} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}>
                  <ExternalLink size={13} /> Ver parte de producción firmado
                </a>
              )}

              {/* Histórico */}
              {(detailItem.change_log?.length || 0) > 0 && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <History size={11} /> CAMBIOS REGISTRADOS
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

// ----- Card de orden -----
function ProductionCard({ item, co, onAdvance, onDetail, onEdit, onDelete, listMode }) {
  const days = daysUntil(item.planned_end_date)
  const isOverdue = (item.status !== 'Terminado' && item.status !== 'Cancelado') && days !== null && days < 0

  return (
    <div className="card" style={{
      marginBottom: '0.6rem', padding: '0.75rem',
      borderLeft: `4px solid ${isOverdue ? '#ef4444' : 'var(--primary-color)'}`,
      ...(listMode ? { borderRadius: '6px' } : {})
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.4rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>{item.batch_number}</div>
          <h4 style={{ margin: '0.1rem 0 0.3rem 0', fontSize: '0.95rem' }}>{item.product_name}</h4>
          <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap', fontSize: '0.78rem', color: '#64748b' }}>
            <span><strong>{item.quantity}</strong> {item.unit}</span>
            {co && (
              <span style={{ color: '#3730a3' }}>
                <ShoppingCart size={10} style={{ verticalAlign: 'middle' }} /> {co.client_name}
              </span>
            )}
            {item.priority && (
              <span style={{
                background: item.priority === 'Alta' ? '#fee2e2' : item.priority === 'Baja' ? '#f1f5f9' : '#fef3c7',
                color: item.priority === 'Alta' ? '#991b1b' : item.priority === 'Baja' ? '#64748b' : '#92400e',
                padding: '0.05rem 0.35rem', borderRadius: '999px', fontSize: '0.68rem'
              }}>{item.priority}</span>
            )}
          </div>
          {item.planned_end_date && (
            <div style={{ fontSize: '0.72rem', color: isOverdue ? '#991b1b' : '#64748b', marginTop: '0.25rem' }}>
              <Calendar size={10} style={{ verticalAlign: 'middle' }} /> Fin: {item.planned_end_date}
              {isOverdue && ' (vencido)'}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.15rem' }}>
          <button onClick={() => onDetail(item)} className="btn-ghost" title="Ver" style={{ padding: '0.25rem' }}>
            <Eye size={11} />
          </button>
          <button onClick={() => onEdit(item)} className="btn-ghost" title="Editar" style={{ padding: '0.25rem' }}>
            <Pencil size={11} />
          </button>
          <button onClick={() => onDelete(item)} className="btn-ghost" title="Eliminar" style={{ padding: '0.25rem', color: '#ef4444' }}>
            <Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Botones de avance según estado */}
      <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
        {item.status === 'Pendiente' && (
          <button onClick={() => onAdvance(item, 'En Proceso')} className="btn btn-primary" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem', flex: 1 }}>
            <Play size={11} /> Iniciar
          </button>
        )}
        {item.status === 'En Proceso' && (
          <>
            <button onClick={() => onAdvance(item, 'En Pausa')} className="btn-ghost" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem', background: '#fef3c7', color: '#92400e' }}>
              <Pause size={11} /> Pausar
            </button>
            <button onClick={() => onAdvance(item, 'Terminado')} className="btn btn-primary" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem', flex: 1, background: '#16a34a' }}>
              <CheckSquare size={11} /> Finalizar
            </button>
          </>
        )}
        {item.status === 'En Pausa' && (
          <button onClick={() => onAdvance(item, 'En Proceso')} className="btn btn-primary" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem', flex: 1 }}>
            <Play size={11} /> Reanudar
          </button>
        )}
        {(item.status === 'Pendiente' || item.status === 'En Proceso' || item.status === 'En Pausa') && (
          <button onClick={() => onAdvance(item, 'Cancelado')} className="btn-ghost" style={{ padding: '0.3rem 0.55rem', fontSize: '0.75rem', color: '#ef4444' }}>
            <Square size={11} />
          </button>
        )}
        {item.status === 'Terminado' && (
          <div style={{ fontSize: '0.75rem', color: '#16a34a', textAlign: 'center', width: '100%' }}>
            ✓ Listo para QC (8.6)
          </div>
        )}
      </div>
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
