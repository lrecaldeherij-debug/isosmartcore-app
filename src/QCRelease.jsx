import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import {
  CheckCircle, XCircle, Search, ClipboardCheck, X, Eye, Plus, Filter,
  BarChart3, AlertTriangle, ExternalLink, Trash2, FileText, ShoppingCart,
  Factory, Calendar, Loader2
} from 'lucide-react'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

const DECISION_OPTIONS = ['Liberado', 'Liberación condicional', 'Rechazado']
const DECISION_COLORS = {
  'Liberado':                { bg: '#dcfce7', fg: '#166534', stripe: '#16a34a' },
  'Liberación condicional':  { bg: '#fef3c7', fg: '#92400e', stripe: '#f59e0b' },
  'Rechazado':               { bg: '#fee2e2', fg: '#991b1b', stripe: '#ef4444' },
}

const EMPTY_INSPECTION = {
  inspection_date: new Date().toISOString().substring(0, 10),
  inspector_name: '',
  decision: 'Liberado',
  decision_reason: '',
  checklist: [],
  evidence_url: '',
  concession_authorized_by: '',
  notes: '',
}

// Convierte un string multilinea con criterios en un checklist inicial
function buildChecklistFromCriteria(criteriaText) {
  if (!criteriaText) return []
  return criteriaText
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => ({ criterion: l.replace(/^[-•*]\s*/, ''), expected: '', actual: '', conforme: true }))
}

export default function QCRelease() {
  const { profile } = useOrg()
  const [pendingOrders, setPendingOrders] = useState([])
  const [inspections, setInspections] = useState([])
  const [customerOrders, setCustomerOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [tableError, setTableError] = useState(null)

  // Modal de inspección
  const [inspectingOrder, setInspectingOrder] = useState(null)
  const [insp, setInsp] = useState({ ...EMPTY_INSPECTION })
  const [saving, setSaving] = useState(false)

  // Modal detalle
  const [detailItem, setDetailItem] = useState(null)

  // Filtros
  const [search, setSearch] = useState('')
  const [filterDecision, setFilterDecision] = useState('')

  useEffect(() => { fetchAll() }, [])

  const fetchAll = async () => {
    setLoading(true)
    const [{ data: pending, error }, { data: insp }, { data: cust }] = await Promise.all([
      supabase.from('production_orders').select('*').eq('status', 'Terminado').order('actual_end_date', { ascending: false, nullsFirst: false }),
      supabase.from('qc_inspections').select('*').order('inspection_date', { ascending: false }).limit(200),
      supabase.from('customer_orders').select('id, client_name, order_reference'),
    ])
    if (error) {
      setTableError(error.message)
      console.warn('Error cargando qc:', error)
    } else setTableError(null)
    setPendingOrders(pending || [])
    setInspections(insp || [])
    setCustomerOrders(cust || [])
    setLoading(false)
  }

  const openInspection = (order) => {
    setInspectingOrder(order)
    setInsp({
      ...EMPTY_INSPECTION,
      inspector_name: profile?.full_name || '',
      checklist: buildChecklistFromCriteria(order.quality_criteria),
    })
  }

  // ---- Checklist handlers ----
  const addChecklistRow = () => {
    setInsp(i => ({ ...i, checklist: [...(i.checklist || []), { criterion: '', expected: '', actual: '', conforme: true }] }))
  }
  const updateChecklist = (idx, key, val) => {
    setInsp(i => {
      const arr = [...(i.checklist || [])]
      arr[idx] = { ...arr[idx], [key]: val }
      return { ...i, checklist: arr }
    })
  }
  const removeChecklist = (idx) => {
    setInsp(i => ({ ...i, checklist: (i.checklist || []).filter((_, j) => j !== idx) }))
  }

  // Cuando hay ítems no conformes, sugerir decisión Rechazado
  const checklistFailedCount = (insp.checklist || []).filter(c => !c.conforme).length

  const handleSaveInspection = async () => {
    if (!inspectingOrder) return
    if (insp.decision === 'Liberación condicional' && !insp.concession_authorized_by?.trim()) {
      return toast.warning('Falta el nombre del responsable que autoriza la liberación condicional')
    }
    setSaving(true)
    try {
      // 1. Crear la inspección
      const { error: iErr } = await supabase.from('qc_inspections').insert([{
        production_order_id: inspectingOrder.id,
        inspection_date: insp.inspection_date,
        inspector_name: insp.inspector_name || null,
        inspector_user_id: profile?.user_id || null,
        decision: insp.decision,
        decision_reason: insp.decision_reason || null,
        checklist: insp.checklist || [],
        evidence_url: insp.evidence_url || null,
        concession_authorized_by: insp.decision === 'Liberación condicional' ? (insp.concession_authorized_by || null) : null,
        notes: insp.notes || null,
      }])
      if (iErr) throw iErr

      // 2. Actualizar el estado del production_order
      const newPoStatus = insp.decision === 'Rechazado' ? 'Rechazado' : 'Liberado'
      const newLog = [...(inspectingOrder.change_log || []), {
        at: new Date().toISOString(),
        changes: [{ field: 'status', from: inspectingOrder.status, to: newPoStatus }]
      }]
      const { error: pErr } = await supabase.from('production_orders').update({
        status: newPoStatus, change_log: newLog
      }).eq('id', inspectingOrder.id)
      if (pErr) throw pErr

      setInspectingOrder(null)
      setInsp({ ...EMPTY_INSPECTION })
      fetchAll()
    } catch (err) {
      toast.error('Error al guardar: ' + (err?.message || ''))
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteInspection = async (item) => {
    if (!await confirm('¿Eliminar este registro de inspección? Esto NO revierte el estado del lote.')) return
    const { error } = await supabase.from('qc_inspections').delete().eq('id', item.id)
    if (error) return toast.error(error.message)
    setDetailItem(null)
    fetchAll()
  }

  // ---- Filtros + dashboard ----
  const filteredInspections = useMemo(() => {
    const q = search.trim().toLowerCase()
    return inspections.filter(i =>
      (!filterDecision || i.decision === filterDecision) &&
      (!q || (i.inspector_name || '').toLowerCase().includes(q) || (i.decision_reason || '').toLowerCase().includes(q))
    )
  }, [inspections, filterDecision, search])

  const stats = useMemo(() => {
    const total = inspections.length
    const liberadas = inspections.filter(i => i.decision === 'Liberado').length
    const condicionales = inspections.filter(i => i.decision === 'Liberación condicional').length
    const rechazadas = inspections.filter(i => i.decision === 'Rechazado').length
    const pendientes = pendingOrders.length
    const tasaAprobacion = total > 0 ? Math.round(((liberadas + condicionales) / total) * 100) : 0
    return { total, liberadas, condicionales, rechazadas, pendientes, tasaAprobacion }
  }, [inspections, pendingOrders])

  // Mapa rápido para resolver el production order desde la inspección
  const poById = useMemo(() => {
    // pendientes + ya inspeccionadas: necesitamos todas las production_orders posibles
    // Vamos a hacer un fetch adicional para resolver las que ya cambiaron de status
    return null  // Se resuelve abajo con una llamada lazy en el modal de detalle
  }, [])
  const coById = useMemo(() => Object.fromEntries(customerOrders.map(c => [c.id, c])), [customerOrders])

  return (
    <div className="fade-in" style={{ padding: '20px' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>✅ Liberación de Productos</h2>
        <p style={{ color: '#666', fontSize: '14px' }}>Inspección final y aprobación de salida (ISO 9001 - 8.6)</p>
      </div>

      <IsoInfoCard {...CLAUSE_GUIDES['8.6']} />

      {tableError && (
        <div style={{ marginTop: '1rem', padding: '0.9rem 1.1rem', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '0.88rem' }}>
          <strong>⚠ No pudimos cargar la tabla.</strong>
          <p style={{ margin: '0.4rem 0 0 0' }}>{tableError}</p>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.82rem' }}>
            Si dice <em>"Could not find the table"</em>, faltaría correr <strong>v37</strong> en Supabase.
          </p>
        </div>
      )}

      {/* ===== Dashboard ===== */}
      {!loading && (stats.total > 0 || stats.pendientes > 0) && (
        <div className="card" style={{ marginTop: '1rem', marginBottom: '1.5rem', padding: '1.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <BarChart3 size={18} /> Resumen
            </h4>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
                <input className="form-input" style={{ padding: '0.35rem 0.5rem 0.35rem 1.8rem', fontSize: '0.85rem', minWidth: '180px' }}
                  placeholder="Buscar inspector o motivo..." value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <Filter size={14} style={{ color: 'var(--text-tertiary)' }} />
              <select className="form-select" style={{ padding: '0.35rem 0.5rem', fontSize: '0.85rem' }}
                value={filterDecision} onChange={e => setFilterDecision(e.target.value)}>
                <option value="">Todas las decisiones</option>
                {DECISION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '0.75rem' }}>
            <KPI label="Pendientes" value={stats.pendientes} warn={stats.pendientes > 0} />
            <KPI label="Liberadas" value={stats.liberadas} color="#166534" />
            <KPI label="Condicionales" value={stats.condicionales} color="#92400e" />
            <KPI label="Rechazadas" value={stats.rechazadas} danger={stats.rechazadas > 0} />
            <KPI label="% aprobación" value={`${stats.tasaAprobacion}%`} highlight />
          </div>
        </div>
      )}

      {/* ===== Pendientes de inspección ===== */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', margin: 0, color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <AlertTriangle size={18} /> Pendientes de Liberación
          <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#64748b', fontWeight: 400 }}>
            {pendingOrders.length} lote{pendingOrders.length !== 1 ? 's' : ''} en cuarentena
          </span>
        </h3>

        {loading && <p style={{ marginTop: '1rem' }}>Cargando...</p>}
        {!loading && pendingOrders.length === 0 && (
          <p style={{ marginTop: '1rem', color: '#94a3b8', fontStyle: 'italic' }}>
            No hay lotes esperando inspección. Cuando una orden de producción se finalice, aparecerá acá.
          </p>
        )}

        <div style={{ display: 'grid', gap: '0.75rem', marginTop: '1rem' }}>
          {pendingOrders.map(order => (
            <PendingCard key={order.id} order={order} co={coById[order.customer_order_id]} onInspect={openInspection} />
          ))}
        </div>
      </div>

      {/* ===== Historial de inspecciones ===== */}
      <div className="card">
        <h3 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', margin: 0, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <ClipboardCheck size={18} /> Historial de inspecciones
          <span style={{ marginLeft: 'auto', fontSize: '0.85rem', color: '#64748b', fontWeight: 400 }}>
            {filteredInspections.length} registro{filteredInspections.length !== 1 ? 's' : ''}
          </span>
        </h3>

        {!loading && filteredInspections.length === 0 && (
          <p style={{ marginTop: '1rem', color: '#94a3b8', fontStyle: 'italic' }}>Sin inspecciones registradas todavía.</p>
        )}

        <div style={{ marginTop: '1rem', display: 'grid', gap: '0.5rem' }}>
          {filteredInspections.map(item => {
            const dc = DECISION_COLORS[item.decision] || DECISION_COLORS['Liberado']
            const failedCount = (item.checklist || []).filter(c => !c.conforme).length
            return (
              <div key={item.id} style={{
                padding: '0.7rem 0.9rem', border: '1px solid #e2e8f0', borderRadius: '8px',
                borderLeft: `4px solid ${dc.stripe}`, background: 'white',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap'
              }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                  <div style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{
                      background: dc.bg, color: dc.fg, padding: '0.15rem 0.55rem',
                      borderRadius: '999px', fontSize: '0.72rem', fontWeight: 600
                    }}>{item.decision}</span>
                    <strong>{item.inspector_name || '—'}</strong>
                    <span style={{ color: '#64748b' }}>· {item.inspection_date}</span>
                    {failedCount > 0 && (
                      <span style={{ fontSize: '0.7rem', background: '#fee2e2', color: '#991b1b', padding: '0.05rem 0.4rem', borderRadius: '999px' }}>
                        {failedCount} no conforme{failedCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {item.decision_reason && (
                    <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.78rem', color: '#475569', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {item.decision_reason}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  {item.evidence_url && (
                    <a href={item.evidence_url} target="_blank" rel="noreferrer" className="btn-ghost" title="Evidencia" style={{ padding: '0.3rem' }}>
                      <ExternalLink size={12} />
                    </a>
                  )}
                  <button onClick={() => setDetailItem(item)} className="btn-ghost" title="Ver detalle" style={{ padding: '0.3rem' }}>
                    <Eye size={12} />
                  </button>
                  <button onClick={() => handleDeleteInspection(item)} className="btn-ghost" title="Eliminar" style={{ padding: '0.3rem', color: '#ef4444' }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ===== Modal inspección ===== */}
      {inspectingOrder && createPortal((
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 1000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
        }}>
          <div className="card" style={{
            background: 'white', maxWidth: '820px', width: '100%', padding: 0,
            maxHeight: '92vh', overflow: 'hidden',
            display: 'flex', flexDirection: 'column',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.35)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0' }}>
              <div>
                <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <ClipboardCheck size={18} /> Inspección de QC
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Lote: <strong>{inspectingOrder.batch_number}</strong> · {inspectingOrder.product_name}
                </span>
              </div>
              <button onClick={() => setInspectingOrder(null)} className="btn-ghost"><X size={18} /></button>
            </div>

            <div style={{ overflow: 'auto', padding: '1.25rem', display: 'grid', gap: '1rem' }}>
              {/* Datos del lote */}
              <div style={{ background: '#f8fafc', padding: '0.7rem 0.9rem', borderRadius: '6px', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  <span><strong>Cantidad:</strong> {inspectingOrder.quantity} {inspectingOrder.unit || ''}</span>
                  {inspectingOrder.operator && <span><strong>Operario:</strong> {inspectingOrder.operator}</span>}
                  {coById[inspectingOrder.customer_order_id] && (
                    <span style={{ color: '#3730a3' }}>
                      <ShoppingCart size={11} style={{ verticalAlign: 'middle' }} /> {coById[inspectingOrder.customer_order_id].client_name}
                    </span>
                  )}
                </div>
              </div>

              <div className="grid-2-col">
                <div className="form-group">
                  <label className="form-label">Fecha de inspección</label>
                  <input type="date" className="form-input" value={insp.inspection_date}
                    onChange={e => setInsp({ ...insp, inspection_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Inspector</label>
                  <input className="form-input" value={insp.inspector_name}
                    onChange={e => setInsp({ ...insp, inspector_name: e.target.value })}
                    placeholder="Nombre de quien inspecciona" />
                </div>
              </div>

              {/* Checklist */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                  <label className="form-label" style={{ margin: 0 }}>Checklist de inspección</label>
                  <button type="button" onClick={addChecklistRow} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', fontSize: '0.78rem' }}>
                    <Plus size={11} /> Agregar criterio
                  </button>
                </div>
                {inspectingOrder.quality_criteria && insp.checklist?.length > 0 && (
                  <p style={{ fontSize: '0.75rem', color: '#64748b', margin: '0 0 0.4rem 0' }}>
                    💡 Pre-cargué los criterios desde la orden de producción. Podés ajustarlos.
                  </p>
                )}
                {(insp.checklist || []).length === 0 ? (
                  <p style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>
                    Sin criterios. Cargá al menos uno o defininlos en la orden de producción.
                  </p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#64748b', fontSize: '0.72rem' }}>
                        <th style={{ padding: '0.4rem', textAlign: 'left' }}>Criterio</th>
                        <th style={{ padding: '0.4rem', textAlign: 'left' }}>Esperado</th>
                        <th style={{ padding: '0.4rem', textAlign: 'left' }}>Real</th>
                        <th style={{ padding: '0.4rem', textAlign: 'center', width: '80px' }}>Conforme</th>
                        <th style={{ padding: '0.4rem', width: '32px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {insp.checklist.map((c, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: c.conforme === false ? '#fef2f2' : 'transparent' }}>
                          <td style={{ padding: '0.3rem' }}>
                            <input className="form-input" value={c.criterion}
                              onChange={e => updateChecklist(i, 'criterion', e.target.value)}
                              style={{ padding: '0.3rem', fontSize: '0.8rem' }} />
                          </td>
                          <td style={{ padding: '0.3rem' }}>
                            <input className="form-input" value={c.expected}
                              onChange={e => updateChecklist(i, 'expected', e.target.value)}
                              style={{ padding: '0.3rem', fontSize: '0.8rem' }} />
                          </td>
                          <td style={{ padding: '0.3rem' }}>
                            <input className="form-input" value={c.actual}
                              onChange={e => updateChecklist(i, 'actual', e.target.value)}
                              style={{ padding: '0.3rem', fontSize: '0.8rem' }} />
                          </td>
                          <td style={{ padding: '0.3rem', textAlign: 'center' }}>
                            <select value={c.conforme ? 'true' : 'false'}
                              onChange={e => updateChecklist(i, 'conforme', e.target.value === 'true')}
                              style={{ padding: '0.25rem', fontSize: '0.78rem', border: '1px solid #cbd5e1', borderRadius: '4px', background: c.conforme === false ? '#fee2e2' : '#dcfce7', color: c.conforme === false ? '#991b1b' : '#166534' }}>
                              <option value="true">✓ Sí</option>
                              <option value="false">✗ No</option>
                            </select>
                          </td>
                          <td style={{ padding: '0.3rem', textAlign: 'center' }}>
                            <button type="button" onClick={() => removeChecklist(i)} className="btn-ghost" style={{ padding: '0.2rem', color: '#94a3b8' }}>
                              <X size={11} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {checklistFailedCount > 0 && (
                  <div style={{ marginTop: '0.4rem', padding: '0.4rem 0.6rem', background: '#fef3c7', color: '#92400e', borderRadius: '6px', fontSize: '0.78rem' }}>
                    ⚠ Hay {checklistFailedCount} criterio(s) marcados como No Conforme. Considerá decisión <strong>Rechazado</strong> o <strong>Liberación condicional</strong>.
                  </div>
                )}
              </div>

              {/* Decisión */}
              <div className="form-group">
                <label className="form-label">Decisión *</label>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {DECISION_OPTIONS.map(d => {
                    const dc = DECISION_COLORS[d]
                    const selected = insp.decision === d
                    return (
                      <button key={d} type="button"
                        onClick={() => setInsp({ ...insp, decision: d })}
                        style={{
                          padding: '0.5rem 0.85rem', borderRadius: '8px', cursor: 'pointer',
                          border: `2px solid ${selected ? dc.stripe : '#e2e8f0'}`,
                          background: selected ? dc.bg : 'white',
                          color: selected ? dc.fg : '#64748b',
                          fontWeight: selected ? 600 : 400,
                          fontSize: '0.85rem',
                          display: 'flex', alignItems: 'center', gap: '0.3rem'
                        }}>
                        {d === 'Liberado' ? <CheckCircle size={14} /> : d === 'Rechazado' ? <XCircle size={14} /> : <AlertTriangle size={14} />}
                        {d}
                      </button>
                    )
                  })}
                </div>
              </div>

              {insp.decision === 'Liberación condicional' && (
                <div className="form-group">
                  <label className="form-label">Autorizado por (responsable) *</label>
                  <input className="form-input" value={insp.concession_authorized_by}
                    onChange={e => setInsp({ ...insp, concession_authorized_by: e.target.value })}
                    placeholder="Ej: Gerente de Calidad – Juan Pérez" />
                  <div style={{ fontSize: '0.75rem', color: '#92400e', marginTop: '0.25rem' }}>
                    ISO 8.6 exige autorización explícita para liberar antes de tiempo o con desvíos.
                  </div>
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Motivo / observaciones</label>
                <textarea className="form-textarea" rows={2} value={insp.decision_reason}
                  onChange={e => setInsp({ ...insp, decision_reason: e.target.value })}
                  placeholder="Resumen de la decisión, condicionantes, próximos pasos..." />
              </div>

              <div className="form-group">
                <label className="form-label">Link a evidencia (acta firmada, fotos, planilla escaneada)</label>
                <input type="url" className="form-input" value={insp.evidence_url}
                  onChange={e => setInsp({ ...insp, evidence_url: e.target.value })}
                  placeholder="https://drive.google.com/..." />
              </div>

              {insp.decision === 'Rechazado' && (
                <div style={{ padding: '0.75rem 0.9rem', background: '#fee2e2', borderRadius: '8px', border: '1px solid #fca5a5', fontSize: '0.85rem', color: '#991b1b' }}>
                  <strong>⚠ Producto Rechazado</strong>
                  <p style={{ margin: '0.3rem 0 0 0' }}>
                    Recordá abrir una <strong>No Conformidad</strong> en el módulo 10.2 con la trazabilidad del lote para activar el plan de acción correctivo (ISO 8.7).
                  </p>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => setInspectingOrder(null)} className="btn btn-ghost" disabled={saving}>Cancelar</button>
              <button onClick={handleSaveInspection} className="btn btn-primary" disabled={saving}>
                {saving ? <><Loader2 className="animate-spin" size={14} /> Guardando...</> : <>Guardar inspección</>}
              </button>
            </div>
          </div>
        </div>
      ), document.body)}

      {/* ===== Modal detalle ===== */}
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
                  <FileText size={18} /> Inspección {detailItem.inspection_date}
                </h4>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                  Inspector: {detailItem.inspector_name || '—'}
                </span>
              </div>
              <button onClick={() => setDetailItem(null)} className="btn-ghost"><X size={18} /></button>
            </div>
            <div style={{ overflow: 'auto', padding: '1.25rem', display: 'grid', gap: '0.85rem' }}>
              <div style={{
                background: DECISION_COLORS[detailItem.decision].bg,
                border: `1px solid ${DECISION_COLORS[detailItem.decision].stripe}`,
                padding: '0.7rem 0.9rem', borderRadius: '8px', color: DECISION_COLORS[detailItem.decision].fg,
                fontWeight: 600
              }}>
                Decisión: {detailItem.decision}
              </div>

              {detailItem.decision_reason && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>MOTIVO</div>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{detailItem.decision_reason}</p>
                </div>
              )}

              {detailItem.concession_authorized_by && (
                <div style={{ background: '#fef3c7', padding: '0.6rem 0.8rem', borderRadius: '6px', fontSize: '0.85rem', color: '#92400e' }}>
                  <strong>Concesión autorizada por:</strong> {detailItem.concession_authorized_by}
                </div>
              )}

              {(detailItem.checklist?.length || 0) > 0 && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>CHECKLIST</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', marginTop: '0.3rem' }}>
                    <thead>
                      <tr style={{ background: '#f8fafc', color: '#64748b' }}>
                        <th style={{ padding: '0.4rem', textAlign: 'left' }}>Criterio</th>
                        <th style={{ padding: '0.4rem', textAlign: 'left' }}>Esperado</th>
                        <th style={{ padding: '0.4rem', textAlign: 'left' }}>Real</th>
                        <th style={{ padding: '0.4rem', textAlign: 'center', width: '70px' }}>Conf.</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailItem.checklist.map((c, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: c.conforme === false ? '#fef2f2' : 'transparent' }}>
                          <td style={{ padding: '0.4rem' }}>{c.criterion}</td>
                          <td style={{ padding: '0.4rem' }}>{c.expected || '—'}</td>
                          <td style={{ padding: '0.4rem' }}>{c.actual || '—'}</td>
                          <td style={{ padding: '0.4rem', textAlign: 'center', color: c.conforme === false ? '#991b1b' : '#166534', fontWeight: 600 }}>
                            {c.conforme === false ? '✗' : '✓'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {detailItem.evidence_url && (
                <a href={detailItem.evidence_url} target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }}>
                  <ExternalLink size={13} /> Ver evidencia firmada
                </a>
              )}

              {detailItem.notes && (
                <div>
                  <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase' }}>NOTAS</div>
                  <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.88rem' }}>{detailItem.notes}</p>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.75rem 1.25rem', borderTop: '1px solid #e2e8f0' }}>
              <button onClick={() => handleDeleteInspection(detailItem)} className="btn btn-ghost" style={{ color: '#ef4444' }}>
                <Trash2 size={14} /> Eliminar
              </button>
              <button onClick={() => setDetailItem(null)} className="btn btn-primary">Cerrar</button>
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  )
}

// ----- Card de pendiente -----
function PendingCard({ order, co, onInspect }) {
  return (
    <div style={{
      border: '1px solid #fde68a', borderRadius: '8px', padding: '0.85rem 1rem',
      background: '#fffbeb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap'
    }}>
      <div style={{ flex: 1, minWidth: '200px' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.3rem' }}>
          <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>{order.batch_number}</span>
          <strong style={{ fontSize: '0.95rem' }}>{order.product_name}</strong>
          <span style={{ fontSize: '0.78rem', color: '#64748b' }}>{order.quantity} {order.unit || ''}</span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.78rem', color: '#64748b' }}>
          {co && (
            <span style={{ color: '#3730a3' }}>
              <ShoppingCart size={11} style={{ verticalAlign: 'middle' }} /> {co.client_name}
            </span>
          )}
          {order.actual_end_date && (
            <span>
              <Factory size={11} style={{ verticalAlign: 'middle' }} /> Terminado: {new Date(order.actual_end_date).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
      <button onClick={() => onInspect(order)} className="btn btn-primary" style={{ padding: '0.45rem 0.9rem', fontSize: '0.85rem' }}>
        <ClipboardCheck size={14} /> Inspeccionar
      </button>
    </div>
  )
}

// ----- Subcomponentes -----
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
