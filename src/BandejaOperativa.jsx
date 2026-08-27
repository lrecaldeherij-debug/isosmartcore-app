// =============================================================================
// BandejaOperativa — pantalla de inicio para el rol operator.
//
// El operativo no ve el Dashboard SGC (FODA, riesgos, objetivos, etc.) porque
// no le interesa y ensucia la UX. En su lugar ve una bandeja focalizada:
//   - Contadores rapidos: pedidos por estado + tareas por hacer
//   - Ultimos pedidos y ordenes recientes con acceso directo al detalle
//   - Links a acciones clave: nuevo pedido, ir a produccion, ir a liberacion
//
// Los otros roles (owner, quality_manager, auditor) siguen viendo Dashboard SGC.
// =============================================================================

import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import {
  ShoppingCart, Factory, CheckCircle, AlertOctagon, Clock, ArrowRight,
  Plus, Loader2, User, Calendar, ChevronRight,
} from 'lucide-react'

export default function BandejaOperativa({ alCambiarVista }) {
  const { org, profile } = useOrg()
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ pedidos: {}, produccion: {}, liberacion: 0, incidentes: 0 })
  const [recentOrders, setRecentOrders] = useState([])
  const [recentProdOrders, setRecentProdOrders] = useState([])

  useEffect(() => { if (org?.id) load() }, [org?.id])

  const load = async () => {
    setLoading(true)
    try {
      const [customerRes, prodRes, qcRes, incRes] = await Promise.all([
        supabase.from('customer_orders').select('id, client_name, order_reference, status, delivery_date, priority, created_at').order('created_at', { ascending: false }).limit(50),
        supabase.from('production_orders').select('id, product_name, batch_number, status, planned_end_date, priority').order('created_at', { ascending: false }).limit(50),
        supabase.from('production_orders').select('id', { count: 'exact', head: true }).eq('status', 'Terminado'),
        supabase.from('operational_incidents').select('id', { count: 'exact', head: true }).eq('status', 'Abierto'),
      ])
      const pedidos = tally(customerRes.data || [], 'status')
      const produccion = tally(prodRes.data || [], 'status')
      setStats({
        pedidos,
        produccion,
        liberacion: qcRes.count || 0,
        incidentes: incRes.count || 0,
      })
      setRecentOrders((customerRes.data || []).slice(0, 6))
      setRecentProdOrders((prodRes.data || []).slice(0, 6))
    } catch (e) {
      console.warn('BandejaOperativa: load error', e)
    } finally {
      setLoading(false)
    }
  }

  const nombre = profile?.full_name?.split(' ')[0] || 'operativo'

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ marginBottom: '20px' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 700, color: '#0f172a' }}>
          Hola, {nombre}
        </h1>
        <p style={{ margin: '4px 0 0 0', fontSize: '14px', color: '#64748b' }}>
          Tu bandeja operativa: pedidos, producción y liberaciones al día.
        </p>
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
          <Loader2 size={20} className="animate-spin" style={{ display: 'inline-block' }} />
          <span style={{ marginLeft: '8px' }}>Cargando…</span>
        </div>
      ) : (
        <>
          {/* Cards de acceso rapido */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: '12px',
            marginBottom: '24px',
          }}>
            <ActionCard
              icon={<ShoppingCart size={22} />}
              title="Pedidos"
              subtitle="Requisitos del cliente · 8.2"
              stats={stats.pedidos}
              color="#4f46e5"
              onGo={() => alCambiarVista('ventas')}
            />
            <ActionCard
              icon={<Factory size={22} />}
              title="Producción"
              subtitle="Órdenes de trabajo · 8.5"
              stats={stats.produccion}
              color="#0891b2"
              onGo={() => alCambiarVista('produccion')}
            />
            <ActionCard
              icon={<CheckCircle size={22} />}
              title="Liberación QC"
              subtitle="Inspecciones · 8.6"
              stats={{ 'Pendientes de inspección': stats.liberacion }}
              color="#16a34a"
              onGo={() => alCambiarVista('liberacion')}
            />
            <ActionCard
              icon={<AlertOctagon size={22} />}
              title="Incidentes"
              subtitle="Cambios y desvíos · 8.5.6"
              stats={{ 'Abiertos': stats.incidentes }}
              color="#dc2626"
              onGo={() => alCambiarVista('incidentes')}
            />
          </div>

          {/* Ultimos pedidos */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))',
            gap: '16px',
          }}>
            <RecentList
              title="Últimos pedidos"
              icon={<ShoppingCart size={16} color="#4f46e5" />}
              items={recentOrders}
              emptyMsg="Sin pedidos aún"
              onGoAll={() => alCambiarVista('ventas')}
              renderItem={o => (
                <div key={o.id} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>
                      {o.order_reference || 'Sin ref.'} · {o.client_name || 'Sin cliente'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {o.status || '—'}
                      {o.delivery_date && ` · entrega ${fmtDate(o.delivery_date)}`}
                    </div>
                  </div>
                  <StatusPill status={o.status} />
                </div>
              )}
            />
            <RecentList
              title="Últimas órdenes de producción"
              icon={<Factory size={16} color="#0891b2" />}
              items={recentProdOrders}
              emptyMsg="Sin órdenes aún"
              onGoAll={() => alCambiarVista('produccion')}
              renderItem={o => (
                <div key={o.id} style={rowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>
                      {o.batch_number || 'Sin lote'} · {o.product_name || 'Sin producto'}
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>
                      {o.status || '—'}
                      {o.planned_end_date && ` · fin plan ${fmtDate(o.planned_end_date)}`}
                    </div>
                  </div>
                  <StatusPill status={o.status} />
                </div>
              )}
            />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function ActionCard({ icon, title, subtitle, stats, color, onGo }) {
  const total = Object.values(stats || {}).reduce((a, b) => a + (b || 0), 0)
  return (
    <button
      onClick={onGo}
      style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderLeft: `4px solid ${color}`,
        borderRadius: '10px',
        padding: '16px',
        textAlign: 'left',
        cursor: 'pointer',
        transition: 'transform 0.12s ease, box-shadow 0.12s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 8px 20px -8px rgba(0,0,0,0.12)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
        <div style={{ color }}>{icon}</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: '15px', color: '#0f172a' }}>{title}</div>
          <div style={{ fontSize: '11px', color: '#64748b' }}>{subtitle}</div>
        </div>
        <ArrowRight size={16} color="#94a3b8" style={{ marginLeft: 'auto' }} />
      </div>
      <div style={{ fontSize: '11px', color: '#475569', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        {total === 0 && <span style={{ color: '#94a3b8', fontStyle: 'italic' }}>Sin registros aún</span>}
        {Object.entries(stats || {}).filter(([, v]) => v > 0).slice(0, 4).map(([k, v]) => (
          <span key={k} style={{
            background: '#f1f5f9', padding: '2px 8px', borderRadius: '10px',
            fontSize: '11px', color: '#334155',
          }}>
            <b>{v}</b> {k}
          </span>
        ))}
      </div>
    </button>
  )
}

function RecentList({ title, icon, items, emptyMsg, renderItem, onGoAll }) {
  return (
    <div style={{
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      padding: '14px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '10px', paddingBottom: '8px', borderBottom: '1px solid #f1f5f9',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {icon}
          <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#0f172a' }}>{title}</h3>
        </div>
        <button
          onClick={onGoAll}
          style={{
            background: 'transparent', border: 'none', color: '#4f46e5',
            fontSize: '12px', fontWeight: 600, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '2px',
          }}
        >
          Ver todos <ChevronRight size={13} />
        </button>
      </div>
      {items.length === 0 ? (
        <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
          {emptyMsg}
        </div>
      ) : (
        <div>{items.map(renderItem)}</div>
      )}
    </div>
  )
}

function StatusPill({ status }) {
  const colors = {
    'Aprobado':     { bg: '#dcfce7', fg: '#166534' },
    'En Revisión':  { bg: '#fef3c7', fg: '#92400e' },
    'Rechazado':    { bg: '#fee2e2', fg: '#991b1b' },
    'En Producción':{ bg: '#dbeafe', fg: '#1e40af' },
    'Entregado':    { bg: '#e0e7ff', fg: '#3730a3' },
    'Borrador':     { bg: '#f1f5f9', fg: '#64748b' },
    'Pendiente':    { bg: '#f1f5f9', fg: '#64748b' },
    'En Proceso':   { bg: '#dbeafe', fg: '#1e40af' },
    'En Pausa':     { bg: '#fef3c7', fg: '#92400e' },
    'Terminado':    { bg: '#dcfce7', fg: '#166534' },
    'Cancelado':    { bg: '#fee2e2', fg: '#991b1b' },
  }
  const c = colors[status] || { bg: '#f1f5f9', fg: '#64748b' }
  return (
    <span style={{
      background: c.bg, color: c.fg,
      padding: '2px 8px', borderRadius: '4px',
      fontSize: '11px', fontWeight: 600,
      whiteSpace: 'nowrap',
    }}>
      {status || '—'}
    </span>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tally(rows, field) {
  const acc = {}
  for (const r of rows) {
    const k = r[field] || 'Sin estado'
    acc[k] = (acc[k] || 0) + 1
  }
  return acc
}

function fmtDate(s) {
  if (!s) return '—'
  try {
    return new Date(s).toLocaleDateString('es-EC', { day: '2-digit', month: 'short' })
  } catch { return s }
}

const rowStyle = {
  display: 'flex', alignItems: 'center', gap: '8px',
  padding: '8px 4px', borderBottom: '1px solid #f8fafc',
}
