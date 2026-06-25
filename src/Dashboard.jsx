import { useEffect, useState, useMemo } from 'react'
import { supabase } from './supabaseClient'
import {
  AlertTriangle, CheckCircle2, Target, Truck, TrendingUp,
  AlertOctagon, Calendar, ArrowRight, ShieldAlert, Users,
  GraduationCap, Award, ClipboardCheck, FileSearch, Lightbulb,
  Activity, Loader2, FileText, MessageSquare, Layers, Briefcase,
  Sparkles, BookOpen, Settings
} from 'lucide-react'
import { colors, families, tracking, weight, font } from './components/ui/tokens'

const NC_OPEN_STATUSES = ['Identificada', 'En Análisis', 'Acción Definida', 'En Implementación', 'En Verificación', 'Reabierta']

// Cuántos meses considerar "revisión vigente"
const CONTEXT_REVIEW_MONTHS = 12

export default function Dashboard({ alCambiarVista }) {
  const [raw, setRaw] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => { cargarDatos() }, [])

  async function cargarDatos() {
    setLoading(true)
    setError(null)
    const today = new Date()
    const currentYear = today.getFullYear()

    try {
      const [
        risks, ncs, suppliers, objectives, measurements, personnel,
        scope, audits, training, opps, processes, jobs, stakeholders,
        context, documents, commMatrix, policy, strategicActions, review
      ] = await Promise.all([
        supabase.from('risk_matrix').select('score_initial, score_residual, status, control_measure'),
        supabase.from('non_conformities').select('id, status, type, severity, due_date, effectiveness_result, closure_date, is_recurrent, created_at, root_cause, five_whys').limit(500),
        supabase.from('suppliers').select('evaluation_score, status'),
        supabase.from('quality_objectives').select('id, target, current, status, baseline_value'),
        supabase.from('objective_measurements').select('objective_id, value, measured_at').order('measured_at', { ascending: false }).limit(200),
        supabase.from('personnel').select('id, status, next_evaluation_date, job_id, competency_gap'),
        supabase.from('scope_declaration').select('next_review_date, status, scope_statement, processes_covered, last_reviewed').maybeSingle(),
        supabase.from('internal_audits').select('status, planned_date, audit_date, year, is_finished'),
        supabase.from('training_records').select('status, efficacy_result, planned_year, training_date, planned_quarter'),
        supabase.from('improvement_opportunities').select('status, priority'),
        supabase.from('processes').select('id, name, process_type'),
        supabase.from('job_descriptions').select('id, title, competencies_json'),
        supabase.from('stakeholders').select('id, name, expectations, needs'),
        supabase.from('context_analysis').select('id, last_reviewed_date'),
        supabase.from('documents').select('id').limit(1000),
        supabase.from('communication_matrix').select('id').limit(1000),
        supabase.from('quality_policy').select('policy_text, status').maybeSingle(),
        supabase.from('strategic_actions').select('id').limit(500),
        supabase.from('management_review').select('review_date'),
      ])

      setRaw({
        currentYear,
        today,
        risks: risks.data || [],
        ncs: ncs.data || [],
        suppliers: suppliers.data || [],
        objectives: objectives.data || [],
        measurements: measurements.data || [],
        personnel: personnel.data || [],
        scope: scope.data || null,
        audits: audits.data || [],
        training: training.data || [],
        opps: opps.data || [],
        processes: processes.data || [],
        jobs: jobs.data || [],
        stakeholders: stakeholders.data || [],
        context: context.data || [],
        documents: documents.data || [],
        commMatrix: commMatrix.data || [],
        policy: policy.data || null,
        strategicActions: strategicActions.data || [],
        review: review.data || [],
      })
    } catch (err) {
      console.error('Dashboard error:', err)
      setError(err?.message || 'No pudimos cargar los datos del tablero. Revisa tu conexión y vuelve a intentar.')
    }
    setLoading(false)
  }

  // ─────────── Cálculos derivados ───────────
  const impl = useMemo(() => raw ? computeImplementation(raw) : null, [raw])
  const op = useMemo(() => raw ? computeOperationalMetrics(raw) : null, [raw])

  if (loading) return <DashboardSkeleton />
  if (error) return (
    <div className="fade-in" style={{
      padding: '48px 24px', maxWidth: '560px', margin: '40px auto',
      textAlign: 'center', background: 'white',
      border: `1px solid ${colors.hairline}`,
    }}>
      <div style={{
        fontFamily: families.mono, fontSize: '11px',
        letterSpacing: tracking.wider, color: colors.seal,
        textTransform: 'uppercase', fontWeight: weight.bold, marginBottom: '12px',
      }}>
        ERROR · TABLERO
      </div>
      <AlertTriangle size={32} color={colors.seal} style={{ marginBottom: '12px' }} />
      <h2 style={{
        margin: '0 0 12px 0', fontFamily: families.display,
        fontSize: '24px', fontWeight: weight.semibold, color: colors.ink,
      }}>
        No pudimos cargar el tablero.
      </h2>
      <p style={{ color: colors.inkMid, fontSize: '14px', marginBottom: '24px' }}>
        {error}
      </p>
      <button onClick={cargarDatos} style={{
        background: colors.seal, color: colors.paper,
        border: `1.5px solid ${colors.seal}`, padding: '12px 20px',
        borderRadius: '2px', fontWeight: weight.semibold, cursor: 'pointer',
        fontFamily: families.body, fontSize: '14px', letterSpacing: tracking.wide,
      }}>
        Reintentar
      </button>
    </div>
  )
  if (!raw) return <DashboardSkeleton />


  return (
    <div className="fade-in" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* HEADER — estilo expediente */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
        marginBottom: '32px', flexWrap: 'wrap', gap: '16px',
        paddingBottom: '20px', borderBottom: `1px solid ${colors.hairline}`,
      }}>
        <div>
          <div style={{
            fontFamily: families.mono, fontSize: '11px',
            letterSpacing: tracking.wider, color: colors.inkSoft,
            textTransform: 'uppercase', fontWeight: weight.semibold, marginBottom: '8px',
          }}>
            EXPEDIENTE · ISO 9001:2015 · {new Date().getFullYear()}
          </div>
          <h1 style={{
            margin: 0, fontFamily: families.display,
            fontSize: '40px', fontWeight: weight.semibold,
            letterSpacing: tracking.tight, color: colors.ink, lineHeight: 1.05,
          }}>
            Tablero de mando.
          </h1>
          <p style={{
            margin: '8px 0 0 0', fontFamily: families.body, fontSize: '15px',
            color: colors.inkMid, lineHeight: 1.5,
          }}>
            Madurez del Sistema de Gestión de Calidad — implementación y operación.
          </p>
        </div>
        <button onClick={cargarDatos} style={{
          background: 'transparent', border: `1.5px solid ${colors.ink}`,
          color: colors.ink, padding: '10px 16px', borderRadius: '2px',
          fontFamily: families.body, fontSize: '13px', fontWeight: weight.semibold,
          letterSpacing: tracking.wide, cursor: 'pointer',
          display: 'inline-flex', alignItems: 'center', gap: '8px',
          transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = colors.ink; e.currentTarget.style.color = colors.paper }}
        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = colors.ink }}
        >
          <Activity size={14} /> Recalcular
        </button>
      </div>

      {/* ╔═══════════════ HERO: MADUREZ GLOBAL ═══════════════╗ */}
      <HeroMadurez impl={impl} />

      {/* ╔═══════════════ FASE 1: IMPLEMENTACIÓN ═══════════════╗ */}
      <PhaseTitle
        number="1"
        title="Implementación del SGC"
        subtitle="¿TENEMOS LO QUE LA NORMA REQUIERE?"
        color={colors.seal}
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {impl.byClause.map(c => (
          <ImplCard key={c.code} {...c} onClick={() => alCambiarVista(c.route)} />
        ))}
      </div>

      {/* ╔═══════════════ FASE 2: MEDICIÓN OPERATIVA ═══════════════╗ */}
      <PhaseTitle
        number="2"
        title="Medición del SGC en operación"
        subtitle="YA IMPLEMENTADO · ¿CÓMO ESTÁ FUNCIONANDO?"
        color={colors.seal}
      />

      {/* KPIs operativos top */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        <Kpi label="NC abiertas" value={op.ncAbiertas} color={colors.alert} icon={<AlertOctagon size={16} />} onClick={() => alCambiarVista('no_conformidades')} />
        <Kpi label="NC mayores" value={op.ncMayores} color={colors.alertText} icon={<AlertTriangle size={16} />} />
        <Kpi label="NC vencidas" value={op.ncVencidas} color={colors.alert} icon={<Calendar size={16} />} />
        <Kpi label="% Objetivos" value={`${op.objetivosAvance}%`} color={colors.approve} icon={<Target size={16} />} onClick={() => alCambiarVista('objetivos')} />
        <Kpi label="Eficacia training" value={`${op.trainingEficacia}%`} color={colors.seal} icon={<GraduationCap size={16} />} onClick={() => alCambiarVista('formacion')} />
        <Kpi label="Calidad proveedores" value={`${op.calidadProv}%`} color={colors.gold} icon={<Truck size={16} />} onClick={() => alCambiarVista('proveedores')} />
        <Kpi label="Riesgos altos" value={op.riesgosAltos} color={colors.alert} icon={<ShieldAlert size={16} />} onClick={() => alCambiarVista('riesgos')} />
        <Kpi label="Pers. con brecha" value={op.personalBrecha} color={colors.gold} icon={<Users size={16} />} onClick={() => alCambiarVista('personal')} />
      </div>

      {/* CHARTS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '16px' }}>
        <ChartCard title="No Conformidades por severidad" subtitle={`${op.ncTotal} NCs registradas`}>
          <Donut data={op.ncBySeverity} />
        </ChartCard>

        <ChartCard title="No Conformidades por tipo" subtitle="Distribución de hallazgos">
          <Donut data={op.ncByType} />
        </ChartCard>

        <ChartCard title="Riesgos: inicial vs residual" subtitle="Eficacia de los controles aplicados">
          <RiskBarChart data={op.riskLevels} />
        </ChartCard>

        <ChartCard title="Tendencia NCs (últimos 6 meses)" subtitle="Detectadas vs cerradas por mes">
          <LineChart data={op.ncTrend} />
        </ChartCard>

        <ChartCard title="Capacitaciones por trimestre" subtitle={`Año ${raw.currentYear} · ${op.trainingYearTotal} eventos`}>
          <HBarChart data={op.trainingByQuarter} />
        </ChartCard>

        <ChartCard title="Eficacia de acciones correctivas" subtitle="Resultado de verificaciones NCs">
          <Donut data={op.ncEfficacy} />
        </ChartCard>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// CÁLCULO DE IMPLEMENTACIÓN
// ═══════════════════════════════════════════════════════════
function computeImplementation(r) {
  const today = r.today
  const monthsAgo = (m) => { const d = new Date(today); d.setMonth(d.getMonth() - m); return d }
  const reviewCutoff = monthsAgo(CONTEXT_REVIEW_MONTHS)
  const Y = r.currentYear

  const item = (code, name, route, ok, pct, why) => ({ code, name, route, ok, pct, why })

  const byClause = [
    // 4.1 Contexto
    (() => {
      const factores = r.context.length
      const reviewedRecent = r.context.filter(c => c.last_reviewed_date && new Date(c.last_reviewed_date) > reviewCutoff).length
      const pct = Math.min(100, Math.round((factores >= 3 ? 50 : factores * 15) + (reviewedRecent / Math.max(factores, 1) * 50)))
      return item('4.1', 'Contexto (FODA)', 'contexto', pct >= 70, pct, `${factores} factores · ${reviewedRecent} revisados <${CONTEXT_REVIEW_MONTHS}m`)
    })(),
    // 4.2 Stakeholders
    (() => {
      const total = r.stakeholders.length
      const completos = r.stakeholders.filter(s => s.expectations || s.needs).length
      const pct = Math.min(100, Math.round((total >= 3 ? 50 : total * 15) + (completos / Math.max(total, 1) * 50)))
      return item('4.2', 'Partes Interesadas', 'stakeholders', pct >= 70, pct, `${total} mapeadas · ${completos} con needs/expectations`)
    })(),
    // 4.3 Alcance
    (() => {
      const s = r.scope
      if (!s) return item('4.3', 'Alcance del SGC', 'alcance', false, 0, 'No declarado')
      let pct = 20
      if (s.scope_statement) pct += 25
      if (s.status === 'Aprobada' || s.status === 'Comunicada') pct += 25
      if (s.processes_covered) pct += 15
      if (s.last_reviewed && new Date(s.last_reviewed) > reviewCutoff) pct += 15
      return item('4.3', 'Alcance del SGC', 'alcance', pct >= 70, pct, `Status: ${s.status || 'Borrador'}`)
    })(),
    // 4.4 Procesos
    (() => {
      const total = r.processes.length
      const tipados = r.processes.filter(p => p.process_type).length
      const pct = Math.min(100, Math.round((total >= 3 ? 60 : total * 20) + (tipados / Math.max(total, 1) * 40)))
      return item('4.4', 'Mapa de Procesos', 'procesos', pct >= 70, pct, `${total} procesos · ${tipados} clasificados`)
    })(),
    // 5.2 Política
    (() => {
      const p = r.policy
      if (!p) return item('5.2', 'Política de Calidad', 'politica', false, 0, 'Sin política declarada')
      let pct = 30
      if (p.policy_text) pct += 30
      if (p.status === 'Aprobada' || p.status === 'Comunicada') pct += 40
      return item('5.2', 'Política de Calidad', 'politica', pct >= 70, pct, `Status: ${p.status || 'Borrador'}`)
    })(),
    // 5.3 Roles
    (() => {
      const total = r.jobs.length
      const conCompetencias = r.jobs.filter(j => j.competencies_json && Object.keys(j.competencies_json).length).length
      const pct = Math.min(100, Math.round((total >= 3 ? 50 : total * 15) + (conCompetencias / Math.max(total, 1) * 50)))
      return item('5.3', 'Roles y Responsabilidades', 'roles', pct >= 70, pct, `${total} cargos · ${conCompetencias} con competencias`)
    })(),
    // 6.1 Riesgos
    (() => {
      const total = r.risks.length
      const conControl = r.risks.filter(x => x.control_measure).length
      const pct = Math.min(100, Math.round((total >= 5 ? 50 : total * 10) + (conControl / Math.max(total, 1) * 50)))
      return item('6.1', 'Riesgos y Oportunidades', 'riesgos', pct >= 70, pct, `${total} riesgos · ${conControl} con control`)
    })(),
    // 6.2 Objetivos
    (() => {
      const total = r.objectives.length
      const medidos = new Set(r.measurements.map(m => m.objective_id)).size
      const pct = Math.min(100, Math.round((total >= 3 ? 50 : total * 15) + (medidos / Math.max(total, 1) * 50)))
      return item('6.2', 'Objetivos de Calidad', 'objetivos', pct >= 70, pct, `${total} objetivos · ${medidos} con medición`)
    })(),
    // 6.2.b Plan estratégico
    (() => {
      const total = r.strategicActions.length
      const pct = Math.min(100, total >= 3 ? 100 : total * 30)
      return item('6.2b', 'Plan de Acción Estratégico', 'plan_estrategico', pct >= 70, pct, `${total} acciones definidas`)
    })(),
    // 7.1.2 Personal
    (() => {
      const total = r.personnel.length
      const evaluados = r.personnel.filter(p => p.job_id || p.competency_gap).length
      const pct = Math.min(100, Math.round((total >= 1 ? 40 : 0) + (evaluados / Math.max(total, 1) * 60)))
      return item('7.1.2', 'Personal / Competencia', 'personal', pct >= 70, pct, `${total} personas · ${evaluados} con evaluación`)
    })(),
    // 7.2 Formación
    (() => {
      const total = r.training.length
      const planAnual = r.training.filter(t => t.planned_year === Y).length
      const pct = Math.min(100, Math.round((total >= 1 ? 30 : 0) + (planAnual >= 3 ? 70 : planAnual * 20)))
      return item('7.2', 'Plan de Capacitación', 'formacion', pct >= 70, pct, `${total} cursos · ${planAnual} en plan ${Y}`)
    })(),
    // 7.4 Comunicación
    (() => {
      const total = r.commMatrix.length
      const pct = Math.min(100, total >= 3 ? 100 : total * 30)
      return item('7.4', 'Comunicación', 'comunicaciones', pct >= 70, pct, `${total} canales definidos`)
    })(),
    // 7.5 Documentos
    (() => {
      const total = r.documents.length
      const pct = Math.min(100, total >= 5 ? 100 : total * 18)
      return item('7.5', 'Información Documentada', 'documentos', pct >= 70, pct, `${total} documentos registrados`)
    })(),
    // 8.4 Proveedores
    (() => {
      const total = r.suppliers.length
      const evaluados = r.suppliers.filter(s => s.evaluation_score).length
      const pct = Math.min(100, Math.round((total >= 1 ? 40 : 0) + (evaluados / Math.max(total, 1) * 60)))
      return item('8.4', 'Control Proveedores', 'proveedores', pct >= 70, pct, `${total} proveedores · ${evaluados} evaluados`)
    })(),
    // 9.2 Auditorías internas
    (() => {
      const total = r.audits.filter(a => a.year === Y || (a.audit_date && new Date(a.audit_date).getFullYear() === Y)).length
      const cerradas = r.audits.filter(a => (a.status === 'Cerrada' || a.is_finished) && (a.year === Y || (a.audit_date && new Date(a.audit_date).getFullYear() === Y))).length
      const pct = Math.min(100, Math.round((total >= 1 ? 50 : 0) + (cerradas / Math.max(total, 1) * 50)))
      return item('9.2', 'Auditoría Interna', 'auditorias', pct >= 70, pct, `${total} en ${Y} · ${cerradas} cerradas`)
    })(),
    // 9.3 Revisión Dirección
    (() => {
      const total = r.review.filter(rv => rv.review_date && new Date(rv.review_date).getFullYear() === Y).length
      const pct = total >= 1 ? 100 : 0
      return item('9.3', 'Revisión por la Dirección', 'revision_direccion', pct >= 70, pct, `${total} revisiones en ${Y}`)
    })(),
    // 10.2 No Conformidades (módulo activo)
    (() => {
      const total = r.ncs.length
      const conCausa = r.ncs.filter(n => n.root_cause || (Array.isArray(n.five_whys) && n.five_whys.length)).length
      const pct = total === 0 ? 50 : Math.min(100, Math.round(50 + (conCausa / total * 50)))
      return item('10.2', 'No Conformidades', 'no_conformidades', pct >= 70, pct, `${total} registradas · ${conCausa} con causa raíz`)
    })(),
    // 10.3 Mejora
    (() => {
      const total = r.opps.length
      const implementadas = r.opps.filter(o => o.status === 'Implementada').length
      const pct = Math.min(100, Math.round((total >= 1 ? 40 : 0) + (implementadas / Math.max(total, 1) * 60)))
      return item('10.3', 'Mejora Continua', 'mejora_continua', pct >= 70, pct, `${total} oportunidades · ${implementadas} implementadas`)
    })(),
  ]

  const globalPct = Math.round(byClause.reduce((a, c) => a + c.pct, 0) / byClause.length)
  const cumplidos = byClause.filter(c => c.ok).length

  let nivel, nivelColor, nivelIcon
  if (globalPct < 25) { nivel = 'Inicial'; nivelColor = '#dc2626'; nivelIcon = '🌱' }
  else if (globalPct < 50) { nivel = 'En implementación'; nivelColor = '#f59e0b'; nivelIcon = '🛠' }
  else if (globalPct < 80) { nivel = 'Implementado'; nivelColor = '#0891b2'; nivelIcon = '✅' }
  else { nivel = 'Optimizado'; nivelColor = '#16a34a'; nivelIcon = '🏆' }

  return { byClause, globalPct, cumplidos, total: byClause.length, nivel, nivelColor, nivelIcon }
}

// ═══════════════════════════════════════════════════════════
// CÁLCULO MÉTRICAS OPERATIVAS
// ═══════════════════════════════════════════════════════════
function computeOperationalMetrics(r) {
  const todayISO = r.today.toISOString().slice(0, 10)

  // ─── NCs ───
  const ncAbiertas = r.ncs.filter(x => NC_OPEN_STATUSES.includes(x.status)).length
  const ncMayores = r.ncs.filter(x => x.type === 'NC Mayor' && NC_OPEN_STATUSES.includes(x.status)).length
  const ncVencidas = r.ncs.filter(x => x.due_date && x.due_date < todayISO && x.status !== 'Cerrada').length

  const ncBySeverity = ['Crítica', 'Alta', 'Media', 'Baja'].map(sev => ({
    label: sev,
    value: r.ncs.filter(n => n.severity === sev).length,
    color: { 'Crítica': '#7f1d1d', 'Alta': '#dc2626', 'Media': '#f59e0b', 'Baja': '#10b981' }[sev]
  })).filter(d => d.value > 0)

  const ncByType = ['NC Mayor', 'NC Menor', 'Observación', 'Potencial'].map(t => ({
    label: t,
    value: r.ncs.filter(n => n.type === t).length,
    color: { 'NC Mayor': '#991b1b', 'NC Menor': '#f97316', 'Observación': '#eab308', 'Potencial': '#6366f1' }[t]
  })).filter(d => d.value > 0)

  const ncEfficacy = ['Eficaz', 'Eficaz Parcial', 'No Eficaz', 'Pendiente'].map(e => ({
    label: e,
    value: r.ncs.filter(n => n.effectiveness_result === e).length,
    color: { 'Eficaz': '#16a34a', 'Eficaz Parcial': '#f59e0b', 'No Eficaz': '#dc2626', 'Pendiente': '#94a3b8' }[e]
  })).filter(d => d.value > 0)

  // Tendencia 6 meses
  const ncTrend = []
  for (let i = 5; i >= 0; i--) {
    const d = new Date(r.today); d.setMonth(d.getMonth() - i); d.setDate(1)
    const ymKey = d.toISOString().slice(0, 7)
    const label = d.toLocaleDateString('es', { month: 'short' })
    const detectadas = r.ncs.filter(n => n.created_at?.startsWith(ymKey)).length
    const cerradas = r.ncs.filter(n => n.closure_date?.startsWith(ymKey)).length
    ncTrend.push({ label, detectadas, cerradas })
  }

  // ─── Riesgos ───
  const riesgosAltos = r.risks.filter(x => (x.score_initial || 0) >= 15).length
  const riskLevels = [
    { label: 'Alto', initial: r.risks.filter(x => (x.score_initial || 0) >= 15).length, residual: r.risks.filter(x => (x.score_residual || 0) >= 15).length, color: '#dc2626' },
    { label: 'Medio', initial: r.risks.filter(x => (x.score_initial || 0) >= 8 && (x.score_initial || 0) < 15).length, residual: r.risks.filter(x => (x.score_residual || 0) >= 8 && (x.score_residual || 0) < 15).length, color: '#f59e0b' },
    { label: 'Bajo', initial: r.risks.filter(x => (x.score_initial || 0) > 0 && (x.score_initial || 0) < 8).length, residual: r.risks.filter(x => (x.score_residual || 0) > 0 && (x.score_residual || 0) < 8).length, color: '#10b981' },
  ]

  // ─── Objetivos ───
  const lastByObj = {}
  for (const x of [...r.measurements].sort((a, b) => (b.measured_at || '').localeCompare(a.measured_at || ''))) {
    if (!lastByObj[x.objective_id]) lastByObj[x.objective_id] = x.value
  }
  let sumaAvance = 0, conMedicion = 0
  for (const obj of r.objectives) {
    const cur = lastByObj[obj.id] ?? obj.current
    if (obj.target && obj.target > 0) {
      sumaAvance += Math.min((Number(cur) || 0) / Number(obj.target) * 100, 100)
      conMedicion++
    }
  }
  const objetivosAvance = conMedicion ? Math.round(sumaAvance / conMedicion) : 0

  // ─── Training ───
  const trainingYear = r.training.filter(t => t.planned_year === r.currentYear || (t.training_date && new Date(t.training_date).getFullYear() === r.currentYear))
  const trainingByQuarter = [1, 2, 3, 4].map(q => ({
    label: `Q${q}`,
    value: trainingYear.filter(t => t.planned_quarter === q).length,
    color: '#0891b2'
  }))
  const trainingEvaluated = r.training.filter(t => t.efficacy_result && t.efficacy_result !== 'Pendiente').length
  const trainingEficaz = r.training.filter(t => t.efficacy_result === 'Eficaz').length
  const trainingEficacia = trainingEvaluated ? Math.round(trainingEficaz / trainingEvaluated * 100) : 0

  // ─── Proveedores ───
  const calidadProv = r.suppliers.length
    ? Math.round(r.suppliers.reduce((a, b) => a + (b.evaluation_score || 0), 0) / r.suppliers.length)
    : 0

  // ─── Personal ───
  const personalBrecha = r.personnel.filter(p => p.status === 'Brecha Detectada' || p.status === 'En Formación').length

  return {
    ncTotal: r.ncs.length, ncAbiertas, ncMayores, ncVencidas,
    ncBySeverity, ncByType, ncEfficacy, ncTrend,
    riesgosAltos, riskLevels,
    objetivosAvance,
    trainingByQuarter, trainingYearTotal: trainingYear.length, trainingEficacia,
    calidadProv,
    personalBrecha,
  }
}

// ═══════════════════════════════════════════════════════════
// COMPONENTES UI
// ═══════════════════════════════════════════════════════════
function HeroMadurez({ impl }) {
  const statusColor = impl.globalPct >= 70 ? colors.approve : impl.globalPct >= 30 ? colors.gold : colors.alert
  return (
    <div style={{
      background: colors.paperCool,
      border: `1px solid ${colors.hairline}`,
      padding: '32px', marginBottom: '40px',
      display: 'flex', alignItems: 'center', gap: '40px', flexWrap: 'wrap',
    }}>
      <Gauge value={impl.globalPct} color={statusColor} />
      <div style={{ flex: 1, minWidth: '280px' }}>
        <div style={{
          fontFamily: families.mono, fontSize: '11px',
          letterSpacing: tracking.wider, color: colors.inkSoft,
          textTransform: 'uppercase', fontWeight: weight.semibold,
        }}>
          MADUREZ DEL SGC · ESTADO ACTUAL
        </div>
        <h2 style={{
          margin: '8px 0 12px 0', fontFamily: families.display,
          fontSize: '42px', fontWeight: weight.semibold, lineHeight: 1.05,
          letterSpacing: tracking.tight, color: colors.ink,
        }}>
          <span style={{ fontStyle: 'italic', fontWeight: weight.regular, color: statusColor }}>
            {impl.nivel}.
          </span>
        </h2>
        <p style={{
          margin: 0, fontFamily: families.body, fontSize: '15px',
          color: colors.inkMid, lineHeight: 1.55, maxWidth: '480px',
        }}>
          {impl.cumplidos} de {impl.total} cláusulas implementadas (≥70%). Quedan <strong style={{ color: colors.ink, fontWeight: weight.semibold }}>{impl.total - impl.cumplidos}</strong> por completar.
        </p>
        <div style={{ marginTop: '20px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <StatTag label="implementadas" count={impl.byClause.filter(c => c.pct >= 70).length} color={colors.approve} />
          <StatTag label="en curso" count={impl.byClause.filter(c => c.pct >= 30 && c.pct < 70).length} color={colors.gold} />
          <StatTag label="pendientes" count={impl.byClause.filter(c => c.pct < 30).length} color={colors.alert} />
        </div>
      </div>
    </div>
  )
}

function StatTag({ count, label, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
      <span style={{
        fontFamily: families.display, fontSize: '24px', fontWeight: weight.semibold,
        color, letterSpacing: tracking.tight, lineHeight: 1,
      }}>
        {count}
      </span>
      <span style={{
        fontFamily: families.mono, fontSize: '11px',
        letterSpacing: tracking.wide, color: colors.inkMid, textTransform: 'uppercase',
      }}>
        {label}
      </span>
    </div>
  )
}

function PhaseTitle({ number, title, subtitle, color }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'baseline', gap: '16px',
      marginTop: '40px', marginBottom: '20px',
      paddingBottom: '14px', borderBottom: `1px solid ${colors.hairline}`,
    }}>
      <span style={{
        fontFamily: families.mono, fontSize: '14px',
        fontWeight: weight.bold, color: colors.seal,
      }}>
        § {String(number).padStart(2, '0')}
      </span>
      <div>
        <div style={{
          fontFamily: families.mono, fontSize: '10px',
          letterSpacing: tracking.wider, color: colors.inkSoft,
          textTransform: 'uppercase', fontWeight: weight.semibold,
          marginBottom: '4px',
        }}>
          FASE · {subtitle}
        </div>
        <h3 style={{
          margin: 0, fontFamily: families.display,
          fontSize: '26px', fontWeight: weight.semibold,
          letterSpacing: tracking.snug, color: colors.ink, lineHeight: 1.1,
        }}>
          {title}.
        </h3>
      </div>
    </div>
  )
}

function ImplCard({ code, name, pct, why, ok, onClick }) {
  const color = pct >= 70 ? colors.approve : pct >= 30 ? colors.gold : colors.alert
  return (
    <div onClick={onClick} style={{
      background: colors.paperCool, border: `1px solid ${colors.hairline}`,
      padding: '16px 18px', cursor: 'pointer',
      transition: 'all 0.15s ease',
    }}
      onMouseEnter={e => { e.currentTarget.style.background = colors.paperWarm; e.currentTarget.style.borderColor = colors.hairlineStrong }}
      onMouseLeave={e => { e.currentTarget.style.background = colors.paperCool; e.currentTarget.style.borderColor = colors.hairline }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', gap: '12px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: families.mono, fontSize: '10px',
            letterSpacing: tracking.wider, color: colors.inkSoft,
            textTransform: 'uppercase', fontWeight: weight.semibold,
          }}>
            CLÁUSULA · {code}
          </div>
          <div style={{
            fontFamily: families.display, fontSize: '18px', fontWeight: weight.semibold,
            color: colors.ink, letterSpacing: tracking.snug, lineHeight: 1.15, marginTop: '2px',
          }}>
            {name}
          </div>
        </div>
        <div style={{
          fontFamily: families.display, fontSize: '24px', fontWeight: weight.semibold,
          color, letterSpacing: tracking.tight, lineHeight: 1,
        }}>
          {pct}%
        </div>
      </div>
      <div style={{ background: colors.paperEdge, height: '3px', overflow: 'hidden', marginBottom: '8px' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, transition: 'width 0.5s' }} />
      </div>
      <div style={{ fontFamily: families.body, fontSize: '12px', color: colors.inkMid, lineHeight: 1.45 }}>
        {why}
      </div>
    </div>
  )
}

function Kpi({ label, value, color, icon, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: colors.paperCool, border: `1px solid ${colors.hairline}`,
      padding: '14px 16px',
      cursor: onClick ? 'pointer' : 'default',
      borderTop: `2px solid ${color}`,
      transition: 'all 0.15s ease',
    }}
    onMouseEnter={e => { if (onClick) { e.currentTarget.style.background = colors.paperWarm } }}
    onMouseLeave={e => { if (onClick) { e.currentTarget.style.background = colors.paperCool } }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: colors.inkSoft, marginBottom: '8px' }}>
        <span style={{ color }}>{icon}</span>
        <span style={{
          fontFamily: families.mono, fontSize: '10px',
          letterSpacing: tracking.wider, color: colors.inkSoft,
          textTransform: 'uppercase', fontWeight: weight.semibold,
        }}>
          {label}
        </span>
      </div>
      <div style={{
        fontFamily: families.display, fontSize: '28px', fontWeight: weight.semibold,
        color: colors.ink, letterSpacing: tracking.tight, lineHeight: 1,
      }}>
        {value}
      </div>
    </div>
  )
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div style={{
      background: colors.paperCool, border: `1px solid ${colors.hairline}`,
      padding: '18px',
    }}>
      <div style={{
        marginBottom: '14px', paddingBottom: '12px',
        borderBottom: `1px solid ${colors.hairline}`,
      }}>
        <div style={{
          fontFamily: families.display, fontSize: '17px', fontWeight: weight.semibold,
          color: colors.ink, letterSpacing: tracking.snug, lineHeight: 1.2,
        }}>
          {title}
        </div>
        <div style={{
          fontFamily: families.mono, fontSize: '10px',
          letterSpacing: tracking.wide, color: colors.inkSoft,
          textTransform: 'uppercase', marginTop: '3px',
        }}>
          {subtitle}
        </div>
      </div>
      {children}
    </div>
  )
}

function Pill({ color, children }) {
  return (
    <span style={{
      background: color + '22', color, padding: '4px 10px',
      borderRadius: '2px', fontFamily: families.mono, fontSize: '11px',
      letterSpacing: tracking.wide, fontWeight: weight.semibold,
      textTransform: 'uppercase',
    }}>{children}</span>
  )
}

// ═══════════════════════════════════════════════════════════
// SVG CHARTS
// ═══════════════════════════════════════════════════════════
function Gauge({ value, color }) {
  const size = 160
  const stroke = 14
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const offset = c * (1 - Math.min(value, 100) / 100)
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
      />
      <text x="50%" y="48%" textAnchor="middle" fontSize="34" fontWeight="700" fill="#1e293b">{value}%</text>
      <text x="50%" y="65%" textAnchor="middle" fontSize="11" fill="#64748b" fontWeight="600">SGC GLOBAL</text>
    </svg>
  )
}

function Donut({ data }) {
  if (!data || data.length === 0) return <Empty msg="Sin datos para mostrar" />
  const total = data.reduce((a, b) => a + b.value, 0)
  if (total === 0) return <Empty msg="Sin datos para mostrar" />
  const size = 180, stroke = 28
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
        {data.map((d, i) => {
          const portion = d.value / total
          const dash = c * portion
          const dashArr = `${dash} ${c - dash}`
          const seg = (
            <circle
              key={i}
              cx={size / 2} cy={size / 2} r={r}
              fill="none" stroke={d.color} strokeWidth={stroke}
              strokeDasharray={dashArr} strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          )
          offset += dash
          return seg
        })}
        <text x="50%" y="48%" textAnchor="middle" fontSize="28" fontWeight="700" fill="#1e293b">{total}</text>
        <text x="50%" y="62%" textAnchor="middle" fontSize="11" fill="#64748b">TOTAL</text>
      </svg>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {data.map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
            <span style={{ width: '12px', height: '12px', background: d.color, borderRadius: '3px', flexShrink: 0 }} />
            <span style={{ flex: 1, color: '#334155' }}>{d.label}</span>
            <strong style={{ color: '#1e293b' }}>{d.value}</strong>
            <span style={{ color: '#94a3b8', fontSize: '11px', minWidth: '40px', textAlign: 'right' }}>
              {Math.round((d.value / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RiskBarChart({ data }) {
  if (!data) return <Empty msg="Sin riesgos" />
  const max = Math.max(...data.flatMap(d => [d.initial, d.residual]), 1)
  const W = 320, H = 180, pad = 30
  const barW = (W - pad * 2) / data.length / 2.5
  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      {/* eje */}
      <line x1={pad} y1={H - pad} x2={W - pad / 2} y2={H - pad} stroke="#cbd5e1" />
      {data.map((d, i) => {
        const x0 = pad + i * ((W - pad * 2) / data.length) + 10
        const hi = (d.initial / max) * (H - pad * 2)
        const hr = (d.residual / max) * (H - pad * 2)
        return (
          <g key={i}>
            <rect x={x0} y={H - pad - hi} width={barW} height={hi} fill={d.color} opacity={0.5} />
            <rect x={x0 + barW + 4} y={H - pad - hr} width={barW} height={hr} fill={d.color} />
            <text x={x0 + barW + 2} y={H - pad - hi - 4} textAnchor="middle" fontSize="11" fill="#475569" fontWeight="600">
              {d.initial}/{d.residual}
            </text>
            <text x={x0 + barW + 2} y={H - 8} textAnchor="middle" fontSize="11" fill="#64748b">{d.label}</text>
          </g>
        )
      })}
      {/* leyenda */}
      <g transform={`translate(${pad}, 10)`}>
        <rect width="10" height="10" fill="#94a3b8" opacity={0.5} /><text x="14" y="9" fontSize="10" fill="#475569">Inicial</text>
        <rect x="60" width="10" height="10" fill="#94a3b8" /><text x="74" y="9" fontSize="10" fill="#475569">Residual</text>
      </g>
    </svg>
  )
}

function LineChart({ data }) {
  if (!data || data.length === 0) return <Empty msg="Sin datos" />
  const W = 360, H = 200, pad = 28
  const maxVal = Math.max(...data.flatMap(d => [d.detectadas, d.cerradas]), 1)
  const xStep = (W - pad * 2) / (data.length - 1 || 1)
  const yScale = (v) => H - pad - (v / maxVal) * (H - pad * 2)
  const path = (key) => data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${pad + i * xStep} ${yScale(d[key])}`).join(' ')

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="#cbd5e1" />
      <line x1={pad} y1={pad} x2={pad} y2={H - pad} stroke="#cbd5e1" />
      <path d={path('detectadas')} fill="none" stroke="#dc2626" strokeWidth="2" />
      <path d={path('cerradas')} fill="none" stroke="#16a34a" strokeWidth="2" />
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={pad + i * xStep} cy={yScale(d.detectadas)} r="3" fill="#dc2626" />
          <circle cx={pad + i * xStep} cy={yScale(d.cerradas)} r="3" fill="#16a34a" />
          <text x={pad + i * xStep} y={H - 8} textAnchor="middle" fontSize="10" fill="#64748b">{d.label}</text>
        </g>
      ))}
      <g transform={`translate(${pad}, 6)`}>
        <circle cx="4" cy="4" r="4" fill="#dc2626" /><text x="14" y="8" fontSize="10" fill="#475569">Detectadas</text>
        <circle cx="84" cy="4" r="4" fill="#16a34a" /><text x="94" y="8" fontSize="10" fill="#475569">Cerradas</text>
      </g>
    </svg>
  )
}

function HBarChart({ data }) {
  if (!data) return <Empty msg="Sin datos" />
  const max = Math.max(...data.map(d => d.value), 1)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', paddingTop: '4px' }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '32px', fontSize: '12px', color: '#475569', fontWeight: 600 }}>{d.label}</span>
          <div style={{ flex: 1, background: '#f1f5f9', borderRadius: '4px', height: '20px', position: 'relative', overflow: 'hidden' }}>
            <div style={{
              width: `${(d.value / max) * 100}%`, height: '100%',
              background: d.color, borderRadius: '4px',
              display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
              paddingRight: '6px', color: 'white', fontSize: '11px', fontWeight: 600
            }}>
              {d.value > 0 ? d.value : ''}
            </div>
            {d.value === 0 && <span style={{ position: 'absolute', left: '8px', top: '2px', fontSize: '11px', color: '#94a3b8' }}>0</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function Empty({ msg }) {
  return (
    <div style={{ padding: '30px', textAlign: 'center', color: '#94a3b8', fontSize: '13px', fontStyle: 'italic' }}>
      {msg}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════
// Estilos
// ═══════════════════════════════════════════════════════════
const recalcBtn = {
  display: 'inline-flex', alignItems: 'center', gap: '6px',
  padding: '7px 14px', background: '#f1f5f9', color: '#334155',
  border: '1px solid #cbd5e1', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600
}

// ═══════════════════════════════════════════════════════════
// SKELETON LOADING
// ═══════════════════════════════════════════════════════════
function DashboardSkeleton() {
  return (
    <div className="fade-in" style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header skeleton */}
      <div style={{ marginBottom: '20px' }}>
        <Sk w="240px" h="32px" mb="8px" />
        <Sk w="380px" h="14px" />
      </div>

      {/* Hero skeleton */}
      <div style={{
        background: 'linear-gradient(135deg, #f1f5f9 0%, white 60%)',
        border: '1px solid #e2e8f0', borderRadius: '14px',
        padding: '24px', marginBottom: '24px',
        display: 'flex', alignItems: 'center', gap: '30px', flexWrap: 'wrap',
      }}>
        <Sk w="160px" h="160px" r="50%" />
        <div style={{ flex: 1, minWidth: '280px' }}>
          <Sk w="80px" h="11px" mb="6px" />
          <Sk w="240px" h="36px" mb="12px" />
          <Sk w="100%" h="14px" mb="14px" />
          <div style={{ display: 'flex', gap: '8px' }}>
            <Sk w="120px" h="24px" r="999px" />
            <Sk w="100px" h="24px" r="999px" />
            <Sk w="110px" h="24px" r="999px" />
          </div>
        </div>
      </div>

      {/* Phase 1 title */}
      <Sk w="260px" h="20px" mb="14px" />

      {/* Impl cards skeleton — 9 cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '12px', marginBottom: '24px' }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} style={{
            background: 'white', border: '1px solid #e2e8f0',
            borderRadius: '10px', padding: '12px 14px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div>
                <Sk w="40px" h="11px" mb="4px" />
                <Sk w="140px" h="14px" />
              </div>
              <Sk w="40px" h="20px" />
            </div>
            <Sk w="100%" h="6px" r="999px" mb="6px" />
            <Sk w="180px" h="11px" />
          </div>
        ))}
      </div>

      {/* Phase 2 title */}
      <Sk w="280px" h="20px" mb="14px" />

      {/* KPIs skeleton — 8 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '20px' }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{
            background: 'white', border: '1px solid #e2e8f0', borderLeft: '4px solid #e2e8f0',
            borderRadius: '8px', padding: '12px',
          }}>
            <Sk w="80px" h="11px" mb="6px" />
            <Sk w="50px" h="22px" />
          </div>
        ))}
      </div>

      {/* Floating hint */}
      <div style={{
        position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
        background: 'white', border: '1px solid #e2e8f0', borderRadius: '999px',
        padding: '10px 18px', boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
        display: 'inline-flex', alignItems: 'center', gap: '10px',
        color: '#475569', fontSize: '13px', fontWeight: 500,
      }}>
        <Loader2 size={14} className="spin" />
        Calculando madurez del SGC…
      </div>

      <style>{`
        @keyframes shimmer {
          0%   { background-position: -1000px 0; }
          100% { background-position: 1000px 0; }
        }
      `}</style>
    </div>
  )
}

function Sk({ w = '100%', h = '14px', r = '6px', mb = 0 }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: r, marginBottom: mb,
      background: 'linear-gradient(90deg, #f1f5f9 0%, #e2e8f0 50%, #f1f5f9 100%)',
      backgroundSize: '1000px 100%',
      animation: 'shimmer 1.6s linear infinite',
    }} />
  )
}
