import { useEffect, useState } from 'react'
import {
  Shield, Lock, AlertTriangle, FileText, Building2, Target, ShieldAlert,
  AlertOctagon, ClipboardCheck, TrendingUp, Users, Workflow, Map, BookOpen, Calendar, Clock
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { Toaster } from 'react-hot-toast'
import { toast } from './lib/toast'
import { colors, radius, font, shadow } from './components/ui/tokens'
import Badge from './components/ui/Badge'
import { LoadingScreen, EmptyState, Grid, PageHeader } from './components/ui/misc'

/**
 * AuditorView — vista pública read-only para auditores externos.
 * Se accede vía /auditor/<token>. No requiere login. Valida el token contra
 * la RPC `auditor_snapshot` que devuelve un snapshot completo del SGC.
 */
export default function AuditorView({ token }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [snapshot, setSnapshot] = useState(null)

  useEffect(() => { load() }, [token])

  const load = async () => {
    setLoading(true); setError(null)
    const { data, error: rpcErr } = await supabase.rpc('auditor_snapshot', { p_token: token })
    if (rpcErr) { setError(rpcErr.message); setLoading(false); return }
    if (data?.error) { setError(data.error); setLoading(false); return }
    setSnapshot(data); setLoading(false)
  }

  if (loading) return <LoadingScreen label="Validando acceso de auditor…" />

  if (error) return (
    <div style={pageStyle}>
      <Toaster position="top-right" />
      <EmptyState
        icon={<Lock size={40} color={colors.danger} />}
        title={errorTitle(error)}
        subtitle={errorMessage(error)}
      />
    </div>
  )

  if (!snapshot) return null

  return (
    <div style={pageStyle}>
      <Toaster position="top-right" />
      <AuditorBanner info={snapshot.token_info} orgName={snapshot.org?.name} />

      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px' }}>
        <PageHeader
          icon={<Shield size={28} color={colors.primary} />}
          title={`SGC de ${snapshot.org?.name || 'la organización'}`}
          subtitle={`${snapshot.org?.industry || ''} ${snapshot.org?.address ? '· ' + snapshot.org.address : ''}`}
        />

        {/* Resumen rápido */}
        <Grid min="180px" gap="14px">
          <StatCard icon={<Map size={20} />} label="Procesos" value={(snapshot.processes || []).length} color={colors.primary} />
          <StatCard icon={<ShieldAlert size={20} />} label="Riesgos" value={(snapshot.risk_matrix || []).length} color={colors.danger} />
          <StatCard icon={<Target size={20} />} label="Objetivos" value={(snapshot.quality_objectives || []).length} color={colors.success} />
          <StatCard icon={<AlertOctagon size={20} />} label="NCs" value={(snapshot.non_conformities || []).length} color={colors.warning} />
          <StatCard icon={<ClipboardCheck size={20} />} label="Auditorías" value={(snapshot.internal_audits || []).length} color={colors.info} />
          <StatCard icon={<TrendingUp size={20} />} label="Mejoras" value={(snapshot.improvement_opportunities || []).length} color={colors.ai} />
        </Grid>

        {/* Política y alcance */}
        {snapshot.quality_policy && (
          <Section icon={<BookOpen size={22} color={colors.primary} />} title="Política de Calidad (5.2)">
            <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: radius.xl, padding: '14px', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {snapshot.quality_policy.final_policy_statement || snapshot.quality_policy.policy_text || '—'}
            </div>
          </Section>
        )}

        {snapshot.scope_declaration && (
          <Section icon={<FileText size={22} color={colors.primary} />} title="Alcance del SGC (4.3)">
            <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: radius.xl, padding: '14px', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {snapshot.scope_declaration.scope_text || '—'}
            </div>
          </Section>
        )}

        {/* FODA */}
        {snapshot.context_analysis?.length > 0 && (
          <Section icon={<Building2 size={22} color={colors.primary} />} title={`Contexto FODA (4.1) — ${snapshot.context_analysis.length}`}>
            <Grid min="240px" gap="10px">
              {snapshot.context_analysis.slice(0, 12).map((c, i) => (
                <div key={i} style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: radius.lg, padding: '10px' }}>
                  <Badge bg={colors.bgSubtle} color={colors.textMuted}>{c.category}</Badge>
                  <div style={{ fontWeight: 600, color: colors.text, marginTop: '4px' }}>{c.factor}</div>
                  <div style={{ fontSize: font.sm, color: colors.textFaint, marginTop: '2px' }}>{(c.description || '').slice(0, 100)}</div>
                </div>
              ))}
            </Grid>
          </Section>
        )}

        {/* Procesos */}
        {snapshot.processes?.length > 0 && (
          <Section icon={<Workflow size={22} color={colors.primary} />} title={`Mapa de Procesos (4.4) — ${snapshot.processes.length}`}>
            <SimpleTable
              headers={['Código', 'Nombre', 'Tipo', 'Responsable']}
              rows={snapshot.processes.map(p => [p.code || '—', p.name, p.process_type || '—', p.responsible_role || '—'])}
            />
          </Section>
        )}

        {/* Riesgos */}
        {snapshot.risk_matrix?.length > 0 && (
          <Section icon={<ShieldAlert size={22} color={colors.danger} />} title={`Riesgos y Oportunidades (6.1) — ${snapshot.risk_matrix.length}`}>
            <SimpleTable
              headers={['Tipo', 'Descripción', 'Score inicial', 'Score residual', 'Estado']}
              rows={snapshot.risk_matrix.slice(0, 30).map(r => [
                r.type || '—', (r.risk_description || '').slice(0, 80),
                r.score_initial ?? '—', r.score_residual ?? '—', r.status || '—',
              ])}
            />
          </Section>
        )}

        {/* Objetivos */}
        {snapshot.quality_objectives?.length > 0 && (
          <Section icon={<Target size={22} color={colors.success} />} title={`Objetivos de Calidad (6.2) — ${snapshot.quality_objectives.length}`}>
            <SimpleTable
              headers={['Categoría', 'Objetivo', 'Indicador', 'Meta', 'Actual']}
              rows={snapshot.quality_objectives.map(o => [
                o.category || '—', (o.name || o.objective || '').slice(0, 80),
                o.indicator || '—', `${o.target ?? '—'} ${o.unit || ''}`, `${o.current ?? '—'} ${o.unit || ''}`,
              ])}
            />
          </Section>
        )}

        {/* No conformidades */}
        {snapshot.non_conformities?.length > 0 && (
          <Section icon={<AlertOctagon size={22} color={colors.warning} />} title={`No conformidades (10.2) — ${snapshot.non_conformities.length}`}>
            <SimpleTable
              headers={['Tipo', 'Severidad', 'Descripción', 'Estado', 'Eficacia']}
              rows={snapshot.non_conformities.slice(0, 30).map(n => [
                n.type || '—', n.severity || '—', (n.description || '').slice(0, 80),
                n.status || '—', n.effectiveness_result || 'Pendiente',
              ])}
            />
          </Section>
        )}

        {/* Auditorías */}
        {snapshot.internal_audits?.length > 0 && (
          <Section icon={<ClipboardCheck size={22} color={colors.info} />} title={`Auditorías internas (9.2) — ${snapshot.internal_audits.length}`}>
            <SimpleTable
              headers={['Tipo', 'Proceso', 'Fecha', 'Auditor', 'Estado']}
              rows={snapshot.internal_audits.map(a => [
                a.audit_type || '—', a.audit_process || '—',
                a.actual_date || a.planned_date || '—',
                a.lead_auditor || '—', a.status || '—',
              ])}
            />
          </Section>
        )}

        {/* Revisión por dirección */}
        {snapshot.management_review?.length > 0 && (
          <Section icon={<Calendar size={22} color={colors.primary} />} title={`Revisiones por Dirección (9.3) — ${snapshot.management_review.length}`}>
            <SimpleTable
              headers={['Tipo', 'Fecha', 'Presidente', 'Estado']}
              rows={snapshot.management_review.map(r => [
                r.review_type || '—', r.review_date || '—',
                r.chairperson || '—', r.status || '—',
              ])}
            />
          </Section>
        )}

        {/* Mejoras */}
        {snapshot.improvement_opportunities?.length > 0 && (
          <Section icon={<TrendingUp size={22} color={colors.ai} />} title={`Oportunidades de mejora (10.3) — ${snapshot.improvement_opportunities.length}`}>
            <SimpleTable
              headers={['Título', 'Origen', 'Prioridad', 'Estado']}
              rows={snapshot.improvement_opportunities.slice(0, 20).map(o => [
                (o.title || '').slice(0, 80), o.source || '—',
                o.priority || '—', o.status || '—',
              ])}
            />
          </Section>
        )}

        {/* Stakeholders */}
        {snapshot.stakeholders?.length > 0 && (
          <Section icon={<Users size={22} color={colors.primary} />} title={`Partes Interesadas (4.2) — ${snapshot.stakeholders.length}`}>
            <SimpleTable
              headers={['Nombre', 'Tipo', 'Necesidad', 'Influencia']}
              rows={snapshot.stakeholders.map(s => [
                s.name || '—', s.type || '—',
                (s.needs || '').slice(0, 80), s.influence_level || '—',
              ])}
            />
          </Section>
        )}

        <div style={{ padding: '24px', textAlign: 'center', color: colors.textFaint, fontSize: font.sm }}>
          Vista generada por ISO SmartCore · {new Date().toLocaleString()}
        </div>
      </div>
    </div>
  )
}

// ─────────────────── Subcomponentes ───────────────────

function AuditorBanner({ info, orgName }) {
  const daysLeft = info?.expires_at
    ? Math.max(0, Math.ceil((new Date(info.expires_at) - new Date()) / (1000 * 60 * 60 * 24)))
    : null
  return (
    <div style={{
      background: '#fef3c7', borderBottom: '2px solid #fde68a', padding: '12px 20px',
      display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
    }}>
      <Shield size={20} color="#92400e" />
      <div style={{ flex: 1, minWidth: '240px' }}>
        <strong style={{ color: '#92400e' }}>Modo auditor · acceso solo lectura</strong>
        <div style={{ fontSize: font.sm, color: '#78350f' }}>
          {info?.label} · Acceso a {orgName}
          {daysLeft !== null && ` · Expira en ${daysLeft} día${daysLeft === 1 ? '' : 's'}`}
        </div>
      </div>
      <Clock size={16} color="#92400e" />
      <span style={{ color: '#78350f', fontSize: font.sm }}>
        {info?.expires_at ? new Date(info.expires_at).toLocaleString() : '—'}
      </span>
    </div>
  )
}

function StatCard({ icon, label, value, color }) {
  return (
    <div style={{
      background: 'white', border: `1px solid ${colors.border}`,
      borderRadius: radius.xl, padding: '14px',
      display: 'flex', alignItems: 'center', gap: '12px',
    }}>
      <div style={{
        width: '40px', height: '40px', borderRadius: '10px',
        background: color + '22', color, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: font.sm, color: colors.textFaint, fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: '24px', fontWeight: 700, color: colors.text, lineHeight: 1 }}>{value}</div>
      </div>
    </div>
  )
}

function Section({ icon, title, children }) {
  return (
    <div style={{ marginTop: '28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        {icon}
        <h2 style={{ margin: 0, fontSize: font['2xl'], color: colors.text }}>{title}</h2>
      </div>
      {children}
    </div>
  )
}

function SimpleTable({ headers, rows }) {
  return (
    <div style={{
      background: 'white', border: `1px solid ${colors.border}`,
      borderRadius: radius.xl, overflow: 'auto',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.sm }}>
        <thead>
          <tr style={{ background: colors.bgMuted }}>
            {headers.map((h, i) => (
              <th key={i} style={{
                padding: '8px 10px', textAlign: 'left',
                color: colors.textMuted, fontWeight: 600,
                borderBottom: `1px solid ${colors.border}`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${colors.bgSubtle}` }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '8px 10px', color: colors.text }}>
                  {cell ?? '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const pageStyle = {
  minHeight: '100vh', background: colors.bgMuted,
}

function errorTitle(err) {
  if (err === 'invalid_or_inactive_token' || err === 'invalid_token' || err === 'expired' || err === 'revoked') {
    return 'Acceso no disponible'
  }
  return 'No se pudo cargar'
}
function errorMessage(err) {
  // Mensaje unificado opaco — no revelamos si el token nunca existió, expiró o fue revocado
  // (evita enumeración por anon). El owner sabe el estado real desde su panel.
  if (err === 'invalid_or_inactive_token' || err === 'invalid_token' || err === 'expired' || err === 'revoked') {
    return 'Este link no está activo. Pide a la organización un acceso vigente o verifica que la URL esté completa.'
  }
  return err
}
