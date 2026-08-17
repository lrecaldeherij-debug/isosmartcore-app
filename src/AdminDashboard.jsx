// =============================================================================
// AdminDashboard — Panel de super_admin.
//
// Solo visible/accesible si user_profiles.is_super_admin = true.
// Muestra:
//   - KPIs globales (total orgs, activas, en combo, MRR proyectado, etc.)
//   - Tabla de todas las organizaciones con búsqueda + filtros
//   - Detalle por org en modal con acciones (extender trial, marcar combo,
//     cambiar plan, impersonar en modo lectura)
//
// Backend:
//   - RPC list_all_organizations_admin()
//   - RPC admin_metrics()
//   - RPCs de acción (admin_extend_trial, admin_set_combo, admin_change_plan,
//     admin_log_impersonation) — usados en el Bloque 3.
// =============================================================================

import { useEffect, useState, useMemo } from 'react'
import { supabase } from './supabaseClient'
import { useSuperAdmin } from './lib/useSuperAdmin'
import { colors, families, tracking, weight, space } from './components/ui/tokens'
import { toast } from './lib/toast'
import { humanizeDbError } from './lib/humanizeDbError'
import {
  Shield, Search, Building2, Users, Calendar, DollarSign, AlertCircle,
  Eye, ArrowUpRight, Zap, TrendingUp, Clock, X, RefreshCw,
} from 'lucide-react'

export default function AdminDashboard() {
  const isSuperAdmin = useSuperAdmin()
  const [orgs, setOrgs] = useState([])
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | active | trial | combo | expiring
  const [detailOrg, setDetailOrg] = useState(null)

  useEffect(() => {
    if (isSuperAdmin) loadData()
  }, [isSuperAdmin])

  const loadData = async () => {
    setLoading(true)
    const [orgsRes, metricsRes] = await Promise.all([
      supabase.rpc('list_all_organizations_admin'),
      supabase.rpc('admin_metrics'),
    ])
    if (orgsRes.error) toast.error(humanizeDbError(orgsRes.error))
    else setOrgs(orgsRes.data || [])
    if (!metricsRes.error) setMetrics(metricsRes.data)
    setLoading(false)
  }

  const filtered = useMemo(() => {
    let list = orgs
    if (filter === 'active')   list = list.filter(o => o.subscription_status === 'active')
    if (filter === 'trial')    list = list.filter(o => o.subscription_status === 'trialing')
    if (filter === 'combo')    list = list.filter(o => o.is_combo_client)
    if (filter === 'expiring') list = list.filter(o => o.days_until_expiry !== null && o.days_until_expiry <= 30 && o.days_until_expiry >= 0)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(o =>
        (o.name || '').toLowerCase().includes(q) ||
        (o.owner_email || '').toLowerCase().includes(q) ||
        (o.slug || '').toLowerCase().includes(q)
      )
    }
    return list
  }, [orgs, filter, search])

  if (!isSuperAdmin) {
    return <NoAccess />
  }

  return (
    <div style={{ minHeight: '100vh', background: colors.paper, color: colors.ink, fontFamily: families.body }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '32px 32px 80px' }}>

        {/* Header editorial */}
        <div style={{ marginBottom: 40 }}>
          <div style={{
            fontFamily: families.mono, fontSize: 11, letterSpacing: tracking.wider,
            color: colors.seal, textTransform: 'uppercase', fontWeight: weight.semibold,
            marginBottom: 12,
          }}>
            # 00 · PANEL DE ADMINISTRACIÓN
          </div>
          <h1 style={{
            margin: 0, fontFamily: families.display, fontSize: 42,
            fontWeight: weight.semibold, lineHeight: 1.1, letterSpacing: tracking.tight,
            color: colors.ink,
          }}>
            Clientes activos.
          </h1>
          <div style={{
            marginTop: 12, fontSize: 15, color: colors.inkMid, lineHeight: 1.5, maxWidth: 640,
          }}>
            Vista privada de todas las organizaciones del sistema. Aquí gestionás combos,
            trials, planes y hacés soporte impersonando en modo lectura.
          </div>
        </div>

        {/* KPIs */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12, marginBottom: 32,
        }}>
          <KPICard icon={Building2} label="Total organizaciones" value={metrics?.total_orgs ?? '—'} tone="ink" />
          <KPICard icon={Zap}       label="Activas (pagando)"    value={metrics?.active_orgs ?? '—'} tone="approve" />
          <KPICard icon={Clock}     label="En trial"             value={metrics?.trial_orgs ?? '—'} tone="gold" />
          <KPICard icon={Shield}    label="Clientes combo"       value={metrics?.combo_orgs ?? '—'} tone="seal" />
          <KPICard
            icon={AlertCircle}
            label="Combo vence en 30d"
            value={metrics?.combo_expiring_30d ?? '—'}
            tone={metrics?.combo_expiring_30d > 0 ? 'alert' : 'ink'}
          />
          <KPICard
            icon={DollarSign}
            label="MRR activo (USD)"
            value={metrics?.mrr_potential_usd != null ? `$${Number(metrics.mrr_potential_usd).toFixed(0)}` : '—'}
            tone="approve"
          />
          <KPICard icon={Users}     label="Total usuarios"       value={metrics?.total_users ?? '—'} tone="ink" />
          <KPICard icon={TrendingUp} label="Nuevas en 30d"       value={metrics?.orgs_created_30d ?? '—'} tone="gold" />
        </div>

        {/* Toolbar */}
        <div style={{
          display: 'flex', gap: 12, marginBottom: 20, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <div style={{
            flex: '1 1 280px', maxWidth: 400, display: 'flex', alignItems: 'center',
            gap: 8, background: colors.paperCool, border: `1px solid ${colors.hairline}`,
            padding: '8px 12px',
          }}>
            <Search size={16} style={{ color: colors.inkSoft }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar por nombre, email owner o slug…"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontFamily: families.body, fontSize: 14, color: colors.ink,
              }}
            />
          </div>

          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { id: 'all', label: 'Todas' },
              { id: 'active', label: 'Activas' },
              { id: 'trial', label: 'Trial' },
              { id: 'combo', label: 'Combo' },
              { id: 'expiring', label: 'Por vencer' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                style={{
                  padding: '8px 14px',
                  background: filter === f.id ? colors.seal : 'transparent',
                  color: filter === f.id ? colors.paper : colors.inkMid,
                  border: `1px solid ${filter === f.id ? colors.seal : colors.hairline}`,
                  fontSize: 13, fontFamily: families.body, cursor: 'pointer',
                  fontWeight: weight.medium,
                }}
              >
                {f.label}
              </button>
            ))}
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            style={{
              padding: '8px 12px', background: 'transparent',
              color: colors.inkMid, border: `1px solid ${colors.hairline}`,
              fontSize: 13, cursor: loading ? 'wait' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Refrescar
          </button>

          <div style={{ marginLeft: 'auto', fontSize: 12, color: colors.inkSoft, fontFamily: families.mono }}>
            {filtered.length} de {orgs.length} orgs
          </div>
        </div>

        {/* Tabla */}
        <div style={{
          background: colors.paperCool, border: `1px solid ${colors.hairline}`,
          overflow: 'hidden',
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: colors.paperWarm }}>
                <Th>Organización</Th>
                <Th>Owner</Th>
                <Th>Plan</Th>
                <Th>Estado</Th>
                <Th align="right">Usuarios</Th>
                <Th align="right">Días</Th>
                <Th>Combo</Th>
                <Th align="right">Acciones</Th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: colors.inkSoft }}>Cargando…</td></tr>
              )}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: colors.inkSoft }}>
                  Sin organizaciones que coincidan.
                </td></tr>
              )}
              {!loading && filtered.map(o => (
                <OrgRow key={o.id} org={o} onOpen={() => setDetailOrg(o)} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal detalle */}
      {detailOrg && (
        <OrgDetailModal
          org={detailOrg}
          onClose={() => setDetailOrg(null)}
          onRefresh={loadData}
        />
      )}
    </div>
  )
}

// ─── Subcomponentes ────────────────────────────────────────────────────────

function KPICard({ icon: Icon, label, value, tone = 'ink' }) {
  const toneColors = {
    ink:     { border: colors.hairline,      icon: colors.inkMid, valueColor: colors.ink },
    seal:    { border: colors.seal,         icon: colors.seal,   valueColor: colors.seal },
    approve: { border: colors.approve,      icon: colors.approve, valueColor: colors.approveText },
    gold:    { border: colors.gold,         icon: colors.gold,    valueColor: colors.goldText },
    alert:   { border: colors.alert,        icon: colors.alert,   valueColor: colors.alertText },
  }
  const c = toneColors[tone] || toneColors.ink

  return (
    <div style={{
      background: colors.paperCool,
      border: `1px solid ${c.border}`,
      borderLeft: `3px solid ${c.border}`,
      padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Icon size={13} style={{ color: c.icon }} />
        <span style={{
          fontFamily: families.mono, fontSize: 10, letterSpacing: tracking.wider,
          textTransform: 'uppercase', color: colors.inkSoft, fontWeight: weight.medium,
        }}>{label}</span>
      </div>
      <div style={{
        fontFamily: families.display, fontSize: 28, fontWeight: weight.semibold,
        lineHeight: 1, color: c.valueColor, letterSpacing: tracking.tight,
      }}>{value}</div>
    </div>
  )
}

function Th({ children, align = 'left' }) {
  return (
    <th style={{
      padding: '12px 14px', textAlign: align, borderBottom: `1px solid ${colors.hairline}`,
      fontFamily: families.mono, fontSize: 10, letterSpacing: tracking.wider,
      textTransform: 'uppercase', color: colors.inkSoft, fontWeight: weight.semibold,
    }}>{children}</th>
  )
}

function OrgRow({ org, onOpen }) {
  const statusBadge = getStatusBadge(org)
  const daysColor =
    org.days_until_expiry == null ? colors.inkSoft :
    org.days_until_expiry < 0 ? colors.alert :
    org.days_until_expiry <= 7 ? colors.alert :
    org.days_until_expiry <= 30 ? colors.gold : colors.approve

  return (
    <tr
      onClick={onOpen}
      style={{ cursor: 'pointer', borderBottom: `1px solid ${colors.hairline}` }}
      onMouseEnter={e => e.currentTarget.style.background = colors.paperWarm}
      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
    >
      <td style={{ padding: '14px' }}>
        <div style={{ fontWeight: weight.semibold, color: colors.ink }}>{org.name}</div>
        {org.slug && (
          <div style={{ fontFamily: families.mono, fontSize: 11, color: colors.inkSoft, marginTop: 2 }}>
            /{org.slug}
          </div>
        )}
        {org.is_internal_account && (
          <span style={{
            display: 'inline-block', marginTop: 4, fontSize: 10,
            padding: '1px 6px', background: colors.sealLight, color: colors.sealText,
            fontFamily: families.mono, textTransform: 'uppercase', letterSpacing: tracking.wide,
          }}>INTERNA</span>
        )}
      </td>
      <td style={{ padding: '14px', color: colors.inkMid, fontSize: 12 }}>
        {org.owner_email || <span style={{ color: colors.inkGhost }}>—</span>}
      </td>
      <td style={{ padding: '14px' }}>
        <span style={{
          padding: '2px 8px', border: `1px solid ${colors.hairline}`,
          fontFamily: families.mono, fontSize: 11, textTransform: 'uppercase',
          color: colors.ink,
        }}>{org.plan_id || '—'}</span>
      </td>
      <td style={{ padding: '14px' }}>
        <span style={{
          padding: '2px 8px', background: statusBadge.bg, color: statusBadge.text,
          fontFamily: families.mono, fontSize: 11, textTransform: 'uppercase',
          letterSpacing: tracking.wide, fontWeight: weight.medium,
        }}>{statusBadge.label}</span>
      </td>
      <td style={{ padding: '14px', textAlign: 'right', fontFamily: families.mono, color: colors.ink }}>
        {org.users_count ?? 0}
      </td>
      <td style={{ padding: '14px', textAlign: 'right', fontFamily: families.mono, color: daysColor, fontWeight: weight.semibold }}>
        {org.days_until_expiry ?? '—'}
      </td>
      <td style={{ padding: '14px', fontSize: 12, color: colors.inkMid }}>
        {org.is_combo_client
          ? <span style={{ color: colors.seal, fontWeight: weight.semibold }}>SÍ · hasta {org.combo_end_date || '—'}</span>
          : <span style={{ color: colors.inkGhost }}>No</span>}
      </td>
      <td style={{ padding: '14px', textAlign: 'right' }} onClick={e => e.stopPropagation()}>
        <button
          onClick={onOpen}
          style={{
            padding: '6px 10px', background: colors.paperWarm,
            border: `1px solid ${colors.hairline}`, cursor: 'pointer',
            fontSize: 12, color: colors.ink, display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          <Eye size={12} /> Ver
        </button>
      </td>
    </tr>
  )
}

function getStatusBadge(org) {
  if (org.is_internal_account) return { label: 'INTERNA', bg: colors.sealLight, text: colors.sealText }
  const s = org.subscription_status
  if (s === 'active')   return { label: 'ACTIVA',   bg: colors.approveLight, text: colors.approveText }
  if (s === 'trialing') return { label: 'TRIAL',    bg: colors.goldLight,    text: colors.goldText }
  if (s === 'past_due') return { label: 'MOROSA',   bg: colors.alertLight,   text: colors.alertText }
  if (s === 'canceled') return { label: 'CANCELADA', bg: colors.paperWarm,   text: colors.inkMid }
  if (s === 'expired')  return { label: 'EXPIRADA', bg: colors.alertLight,   text: colors.alertText }
  return { label: (s || '—').toUpperCase(), bg: colors.paperWarm, text: colors.inkMid }
}

// ─── Modal detalle ─────────────────────────────────────────────────────────

function OrgDetailModal({ org, onClose, onRefresh }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(46,31,26,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: colors.paper, maxWidth: 720, width: '100%',
          maxHeight: '90vh', overflowY: 'auto',
          border: `1px solid ${colors.hairlineStrong}`,
        }}
      >
        {/* Header */}
        <div style={{
          padding: '24px 28px', borderBottom: `1px solid ${colors.hairline}`,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{
              fontFamily: families.mono, fontSize: 11, letterSpacing: tracking.wider,
              color: colors.seal, textTransform: 'uppercase', fontWeight: weight.semibold,
              marginBottom: 6,
            }}>ORGANIZACIÓN</div>
            <h2 style={{
              margin: 0, fontFamily: families.display, fontSize: 28,
              fontWeight: weight.semibold, letterSpacing: tracking.tight, color: colors.ink,
            }}>{org.name}</h2>
            {org.slug && (
              <div style={{ fontFamily: families.mono, fontSize: 12, color: colors.inkSoft, marginTop: 4 }}>
                /{org.slug} · creada {new Date(org.created_at).toLocaleDateString('es-EC')}
              </div>
            )}
          </div>
          <button onClick={onClose} style={{
            background: 'transparent', border: 'none', cursor: 'pointer', color: colors.inkMid, padding: 4,
          }}>
            <X size={20} />
          </button>
        </div>

        {/* Info block */}
        <div style={{ padding: '20px 28px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
            <InfoItem label="Owner" value={org.owner_email} />
            <InfoItem label="Plan actual" value={org.plan_id} mono />
            <InfoItem label="Estado" value={org.subscription_status} mono />
            <InfoItem label="Usuarios" value={org.users_count} />
            <InfoItem
              label="Trial vence"
              value={org.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString('es-EC') : '—'}
            />
            <InfoItem
              label="Combo vence"
              value={org.combo_end_date || '—'}
            />
          </div>

          {org.is_combo_client && (
            <div style={{
              padding: 14, background: colors.sealLight, border: `1px solid ${colors.seal}`,
              marginBottom: 16, fontSize: 13, color: colors.sealText,
            }}>
              <strong style={{ display: 'block', marginBottom: 4 }}>Cliente combo (asesoría + sistema)</strong>
              {org.combo_start_date && <div>Inicio: {org.combo_start_date}</div>}
              {org.combo_end_date && <div>Fin gratis: {org.combo_end_date}</div>}
              {org.combo_notes && (
                <div style={{ marginTop: 8, padding: 8, background: colors.paperCool, color: colors.ink, whiteSpace: 'pre-wrap' }}>
                  {org.combo_notes}
                </div>
              )}
            </div>
          )}

          {/* Placeholder acciones — Bloque 3 */}
          <div style={{
            padding: 16, background: colors.paperWarm, border: `1px dashed ${colors.hairline}`,
            fontSize: 13, color: colors.inkMid, textAlign: 'center',
          }}>
            <div style={{ fontFamily: families.mono, fontSize: 10, letterSpacing: tracking.wider, textTransform: 'uppercase', marginBottom: 4 }}>
              PRÓXIMAMENTE
            </div>
            Acciones (extender trial, marcar/quitar combo, cambiar plan, impersonar) llegan en el próximo bloque.
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoItem({ label, value, mono }) {
  return (
    <div>
      <div style={{
        fontFamily: families.mono, fontSize: 10, letterSpacing: tracking.wider,
        textTransform: 'uppercase', color: colors.inkSoft, fontWeight: weight.medium,
        marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontFamily: mono ? families.mono : families.body,
        fontSize: 14, color: colors.ink, fontWeight: weight.medium,
      }}>{value ?? '—'}</div>
    </div>
  )
}

function NoAccess() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: colors.paper, fontFamily: families.body, padding: 20,
    }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <Shield size={40} style={{ color: colors.alert, marginBottom: 16 }} />
        <h1 style={{ fontFamily: families.display, fontSize: 24, color: colors.ink, margin: '0 0 8px' }}>
          Acceso restringido
        </h1>
        <p style={{ color: colors.inkMid, fontSize: 14 }}>
          Este panel es solo para el administrador del sistema. Si crees que deberías tener acceso, contactá soporte.
        </p>
        <a href="/app" style={{
          display: 'inline-block', marginTop: 20, color: colors.seal, fontWeight: weight.semibold,
        }}>← Volver al expediente</a>
      </div>
    </div>
  )
}
