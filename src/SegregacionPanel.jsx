// =============================================================================
// SegregacionPanel — lista de eventos con conflicto de segregacion de funciones.
//
// Muestra todos los eventos del timeline donde la MISMA persona hizo mas de
// una accion de decision sobre el mismo pedido/orden/inspeccion. Esto es un
// hallazgo automatico para ISO 5.3 y 7.1.2.
//
// Acceso: owner, quality_manager, auditor. El operator NO lo ve (es un
// dashboard de auditoria).
//
// El flag same_person lo calcula el trigger BD (calc_same_person_flag) —
// aca solo leemos y filtramos.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import {
  ShieldAlert, Filter, ExternalLink, Loader2, Calendar, User,
  ShoppingCart, Factory, CheckCircle,
} from 'lucide-react'
import { EVENT_TYPES, fmtDateTime } from './lib/workOrderEvents'
import { PageHeader } from './components/ui/misc'

const SOURCE_LABELS = {
  customer_orders:   { label: 'Pedido',       icon: ShoppingCart, view: 'ventas',      color: '#4f46e5' },
  production_orders: { label: 'Producción',   icon: Factory,      view: 'produccion',  color: '#0891b2' },
  qc_inspections:    { label: 'Liberación',   icon: CheckCircle,  view: 'liberacion',  color: '#16a34a' },
}

// Rangos rapidos: 30 dias es el default (revisiones mensuales).
const RANGES = [
  { key: '7d',   label: 'Últimos 7 días',   days: 7 },
  { key: '30d',  label: 'Últimos 30 días',  days: 30 },
  { key: '90d',  label: 'Últimos 90 días',  days: 90 },
  { key: '365d', label: 'Último año',       days: 365 },
  { key: 'all',  label: 'Todos',            days: null },
]

export default function SegregacionPanel({ alCambiarVista }) {
  const { org } = useOrg()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [rangeKey, setRangeKey] = useState('30d')
  const [sourceFilter, setSourceFilter] = useState('')

  useEffect(() => { if (org?.id) load() }, [org?.id, rangeKey])

  const load = async () => {
    setLoading(true)
    const range = RANGES.find(r => r.key === rangeKey)
    let q = supabase
      .from('work_order_events')
      .select('id, source_table, source_id, event_type, performed_by_name, performed_by_role, notes, created_at')
      .eq('same_person', true)
      .order('created_at', { ascending: false })
      .limit(500)
    if (range?.days) {
      const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - range.days)
      q = q.gte('created_at', cutoff.toISOString())
    }
    const { data, error } = await q
    if (error) {
      console.warn('SegregacionPanel: load error', error)
      setEvents([])
    } else {
      setEvents(data || [])
    }
    setLoading(false)
  }

  const filtered = useMemo(() => {
    if (!sourceFilter) return events
    return events.filter(e => e.source_table === sourceFilter)
  }, [events, sourceFilter])

  const byPerson = useMemo(() => {
    const acc = new Map()
    for (const e of filtered) {
      const key = e.performed_by_name || 'Sin nombre'
      if (!acc.has(key)) acc.set(key, 0)
      acc.set(key, acc.get(key) + 1)
    }
    return Array.from(acc.entries()).sort((a, b) => b[1] - a[1])
  }, [filtered])

  return (
    <div style={{ padding: '20px 24px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        icon={<ShieldAlert size={26} color="#b45309" />}
        title="Segregación de funciones"
        subtitle="Eventos donde la misma persona hizo más de una acción de decisión sobre el mismo registro (ISO 5.3 y 7.1.2)"
      />

      {/* Contexto: por que existe este panel */}
      <div style={{
        background: '#fefce8', border: '1px solid #fde68a',
        borderRadius: '8px', padding: '14px 16px', marginBottom: '20px',
        display: 'flex', gap: '10px', alignItems: 'flex-start',
      }}>
        <ShieldAlert size={18} color="#b45309" style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ fontSize: '13px', color: '#78350f', lineHeight: 1.55 }}>
          <b>¿Qué es esto?</b> La ISO 9001 pide que las decisiones críticas (aprobar un pedido,
          liberar un producto, autorizar un cambio) las tome una <b>persona distinta</b> a la que
          las generó. Cuando la misma persona hace todo el flujo (crear + aprobar + liberar) hay
          un riesgo de fraude o error no detectado. Esta pantalla lista automáticamente esos casos
          para que los revises en la próxima auditoría interna.
        </div>
      </div>

      {/* Filtros */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '10px', marginBottom: '16px',
        alignItems: 'center', background: 'white', padding: '12px 14px',
        borderRadius: '8px', border: '1px solid #e2e8f0',
      }}>
        <Filter size={16} color="#64748b" />
        <span style={{ fontSize: '13px', color: '#475569', fontWeight: 600 }}>Rango:</span>
        <select
          value={rangeKey}
          onChange={e => setRangeKey(e.target.value)}
          style={selectStyle}
        >
          {RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </select>
        <span style={{ fontSize: '13px', color: '#475569', fontWeight: 600, marginLeft: '10px' }}>Módulo:</span>
        <select
          value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          style={selectStyle}
        >
          <option value="">Todos</option>
          <option value="customer_orders">Pedidos (8.2)</option>
          <option value="production_orders">Producción (8.5)</option>
          <option value="qc_inspections">Liberación (8.6)</option>
        </select>
      </div>

      {/* KPIs */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px', marginBottom: '20px',
      }}>
        <KPI label="Conflictos en rango" value={filtered.length} color="#b45309" />
        <KPI label="Personas involucradas" value={byPerson.length} color="#4f46e5" />
        <KPI
          label="Más conflictos"
          value={byPerson[0] ? `${byPerson[0][0]} (${byPerson[0][1]})` : '—'}
          color="#0891b2"
          small
        />
      </div>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
          <Loader2 size={20} className="animate-spin" style={{ display: 'inline-block' }} />
          <span style={{ marginLeft: '8px' }}>Cargando…</span>
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: '40px', textAlign: 'center',
          background: '#f0fdf4', border: '1px solid #bbf7d0',
          borderRadius: '10px', color: '#166534',
        }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>✓</div>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>Sin conflictos en el rango</div>
          <div style={{ fontSize: '13px', marginTop: '4px', color: '#15803d' }}>
            Todo el flujo operativo respeta segregación de funciones.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(e => (
            <ConflictRow key={e.id} event={e} onOpenSource={alCambiarVista} />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function KPI({ label, value, color, small }) {
  return (
    <div style={{
      background: 'white', border: '1px solid #e2e8f0',
      borderLeft: `4px solid ${color}`, borderRadius: '8px',
      padding: '12px 14px',
    }}>
      <div style={{ fontSize: '11px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 700 }}>
        {label}
      </div>
      <div style={{ fontSize: small ? '15px' : '24px', fontWeight: 700, color: '#0f172a', marginTop: '4px', lineHeight: 1.2 }}>
        {value}
      </div>
    </div>
  )
}

function ConflictRow({ event, onOpenSource }) {
  const src = SOURCE_LABELS[event.source_table] || { label: event.source_table, icon: ShieldAlert, view: null, color: '#64748b' }
  const meta = EVENT_TYPES[event.event_type] || { label: event.event_type, color: '#64748b' }
  const Icon = src.icon
  const goToSource = () => {
    if (src.view && onOpenSource) onOpenSource(src.view)
  }
  return (
    <div style={{
      background: 'white', border: '1px solid #e2e8f0',
      borderLeft: `4px solid #f59e0b`, borderRadius: '8px',
      padding: '12px 14px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flexWrap: 'wrap' }}>
        <Icon size={18} color={src.color} style={{ flexShrink: 0, marginTop: '2px' }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{
              background: meta.color, color: 'white',
              fontSize: '11px', fontWeight: 700,
              padding: '2px 7px', borderRadius: '4px',
            }}>
              {meta.label}
            </span>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#0f172a' }}>
              en {src.label}
            </span>
            <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <User size={11} /> {event.performed_by_name || 'Sin nombre'}
              {event.performed_by_role && <span style={{ color: '#94a3b8' }}> · {event.performed_by_role.replace('_', ' ')}</span>}
            </span>
            <span style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Calendar size={11} /> {fmtDateTime(event.created_at)}
            </span>
          </div>
          {event.notes && (
            <div style={{ marginTop: '6px', fontSize: '12.5px', color: '#334155', whiteSpace: 'pre-wrap' }}>
              {event.notes}
            </div>
          )}
        </div>
        {src.view && (
          <button
            onClick={goToSource}
            title={`Ir al módulo ${src.label}`}
            style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              background: 'transparent', border: '1px solid #cbd5e1',
              padding: '4px 10px', borderRadius: '6px',
              fontSize: '11px', color: '#475569', cursor: 'pointer',
            }}
          >
            Abrir módulo <ExternalLink size={11} />
          </button>
        )}
      </div>
    </div>
  )
}

const selectStyle = {
  padding: '5px 8px', border: '1px solid #cbd5e1',
  borderRadius: '6px', fontSize: '13px', color: '#334155',
  background: 'white', fontFamily: 'inherit',
}
