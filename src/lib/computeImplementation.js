// =============================================================================
// Cálculo de % de implementación por cláusula ISO 9001:2015.
//
// Fuente única de verdad — usado por Dashboard.jsx (para renderizar los cards
// de "SGC GLOBAL: 67%") y por Copilot.jsx (para que la IA vea EXACTAMENTE los
// mismos números que el user cuando responde preguntas sobre estado).
//
// La función `computeImplementation` es pura: recibe un objeto `raw` con
// los datos ya cargados y devuelve la estructura de análisis. `loadSnapshotData`
// hace los queries a Supabase y devuelve el raw listo para computar.
// =============================================================================

const NC_OPEN_STATUSES = [
  'Identificada', 'En Análisis', 'Acción Definida',
  'En Implementación', 'En Verificación', 'Reabierta'
]
const CONTEXT_REVIEW_MONTHS = 12

/**
 * Función pura de cálculo. Se llama con el resultado de loadSnapshotData
 * (o los mismos datos cargados por Dashboard.jsx).
 * @param {object} r - raw data { today, currentYear, risks, ncs, ... }
 */
export function computeImplementation(r) {
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
    // 10.2 No Conformidades
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

/**
 * Carga los raw data que necesita computeImplementation via Supabase.
 * Reusa exactamente los mismos queries que Dashboard.jsx hace en cargarDatos().
 * @param {SupabaseClient} supabase
 * @param {string} orgId
 * @returns {Promise<object>} raw ready to feed computeImplementation
 */
export async function loadSnapshotData(supabase, orgId) {
  const today = new Date()
  const currentYear = today.getFullYear()

  const [
    risks, ncs, suppliers, objectives, measurements, personnel,
    scope, audits, training, opps, processes, jobs, stakeholders,
    context, documents, commMatrix, policy, strategicActions, review
  ] = await Promise.all([
    supabase.from('risk_matrix').select('score_initial, score_residual, status, control_measure').eq('org_id', orgId),
    supabase.from('non_conformities').select('id, status, type, severity, due_date, effectiveness_result, closure_date, is_recurrent, created_at, root_cause, five_whys').eq('org_id', orgId).limit(500),
    supabase.from('suppliers').select('evaluation_score, status').eq('org_id', orgId),
    supabase.from('quality_objectives').select('id, target, current, status, baseline_value').eq('org_id', orgId),
    supabase.from('objective_measurements').select('objective_id, value, measured_at').eq('org_id', orgId).order('measured_at', { ascending: false }).limit(200),
    supabase.from('personnel').select('id, status, next_evaluation_date, job_id, competency_gap').eq('org_id', orgId),
    supabase.from('scope_declaration').select('next_review_date, status, scope_statement, processes_covered, last_reviewed').eq('org_id', orgId).maybeSingle(),
    supabase.from('internal_audits').select('status, planned_date, audit_date, year, is_finished').eq('org_id', orgId),
    supabase.from('training_records').select('status, efficacy_result, planned_year, training_date, planned_quarter').eq('org_id', orgId),
    supabase.from('improvement_opportunities').select('status, priority').eq('org_id', orgId),
    supabase.from('processes').select('id, name, process_type').eq('org_id', orgId),
    supabase.from('job_descriptions').select('id, title, competencies_json').eq('org_id', orgId),
    supabase.from('stakeholders').select('id, name, expectations, needs').eq('org_id', orgId),
    supabase.from('context_analysis').select('id, last_reviewed_date').eq('org_id', orgId),
    supabase.from('documents').select('id').eq('org_id', orgId).limit(1000),
    supabase.from('communication_matrix').select('id').eq('org_id', orgId).limit(1000),
    supabase.from('quality_policy').select('policy_text, status').eq('org_id', orgId).maybeSingle(),
    supabase.from('strategic_actions').select('id').eq('org_id', orgId).limit(500),
    supabase.from('management_review').select('review_date').eq('org_id', orgId),
  ])

  return {
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
  }
}
