// =============================================================================
// DataAnalysis — cláusula 9.1.3 Análisis y Evaluación
//
// La confusión típica: "ya tengo el tablero con los indicadores, ¿no alcanza?".
// No. El tablero muestra el estado ACTUAL en vivo; la cláusula pide el ANÁLISIS
// de un período: qué conclusión sacó la organización de esos números y qué
// decidió hacer. Es un registro fechado, no un gráfico.
//
// Los 6 ejes que la norma lista textualmente:
//   a) conformidad de los productos y servicios
//   b) grado de satisfacción del cliente
//   c) desempeño y eficacia del SGC
//   d) eficacia de lo planificado
//   e) eficacia de las acciones frente a riesgos y oportunidades
//   f) desempeño de los proveedores externos
//
// El módulo recolecta los datos reales del período de todos los otros módulos,
// los congela en un snapshot JSON (para que el informe siga siendo verificable
// aunque los datos cambien después) y ofrece redactar el análisis con IA a
// partir de esos números concretos.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3, Plus, Sparkles, Loader2, FileText, CheckCircle2, Clock,
  Trash2, Pencil, TrendingUp, AlertTriangle, Archive, RefreshCw,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import { can } from './lib/roles'
import { consultarIA } from './aiClient'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import {
  Button, Modal, Field, Row, Input, Select, Textarea, Badge, Kpi,
  EmptyState, Spinner, Grid, PageHeader, colors, radius, font,
} from './components/ui'

// ─── Catálogos ───────────────────────────────────────────────────────────────

const STATUSES = {
  draft:     { label: 'Borrador',   variant: 'neutral' },
  in_review: { label: 'En revisión', variant: 'warning' },
  approved:  { label: 'Aprobado',   variant: 'success' },
  archived:  { label: 'Archivado',  variant: 'neutral' },
}

// Los 6 ejes + el de mejora. El `key` matchea la columna en BD.
const AXES = [
  {
    key: 'analysis_conformity',
    letter: 'a',
    label: 'Conformidad de productos y servicios',
    hint: 'Liberaciones conformes vs no conformes, salidas no conformes detectadas, reprocesos.',
  },
  {
    key: 'analysis_satisfaction',
    letter: 'b',
    label: 'Grado de satisfacción del cliente',
    hint: 'Promedio y tendencia de encuestas, NPS, quejas recibidas y cerradas.',
  },
  {
    key: 'analysis_qms_performance',
    letter: 'c',
    label: 'Desempeño y eficacia del SGC',
    hint: 'Objetivos cumplidos, hallazgos de auditoría interna, no conformidades abiertas.',
  },
  {
    key: 'analysis_planning',
    letter: 'd',
    label: 'Eficacia de lo planificado',
    hint: '¿Lo que planificaste en objetivos y plan estratégico se ejecutó como esperabas?',
  },
  {
    key: 'analysis_risks',
    letter: 'e',
    label: 'Eficacia de acciones sobre riesgos y oportunidades',
    hint: '¿Los riesgos tratados bajaron su nivel? ¿Las oportunidades se materializaron?',
  },
  {
    key: 'analysis_suppliers',
    letter: 'f',
    label: 'Desempeño de proveedores externos',
    hint: 'Evaluaciones realizadas, proveedores condicionados o rechazados, incidencias.',
  },
  {
    key: 'analysis_improvement',
    letter: '+',
    label: 'Necesidad de mejoras en el SGC',
    hint: 'Qué conviene mejorar según todo lo anterior. Alimenta directamente 10.3.',
  },
]

function emptyForm() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth() - 6, 1)
  return {
    title: `Análisis de datos ${now.getFullYear()} — S${now.getMonth() < 6 ? 1 : 2}`,
    period_start: start.toISOString().slice(0, 10),
    period_end: now.toISOString().slice(0, 10),
    analysis_conformity: '', analysis_satisfaction: '', analysis_qms_performance: '',
    analysis_planning: '', analysis_risks: '', analysis_suppliers: '', analysis_improvement: '',
    conclusions: '', recommendations: '',
    status: 'draft', prepared_by: '', reviewed_by: '', approved_by: '', approved_date: '',
    evidence_url: '', notes: '',
    metrics_snapshot: null,
  }
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-EC', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ─── Recolección de métricas del período ────────────────────────────────────
//
// Consulta todos los módulos y arma el snapshot. Cada bloque va en try/catch
// implícito vía Promise.allSettled: si una tabla todavía no existe en esa
// instalación, el resto del informe se arma igual en vez de fallar entero.
async function collectMetrics(orgId, from, to) {
  const q = (table, select, extra = {}) => {
    let query = supabase.from(table).select(select, { count: 'exact' }).eq('org_id', orgId)
    if (extra.dateField) query = query.gte(extra.dateField, from).lte(extra.dateField, to)
    return query
  }

  const results = await Promise.allSettled([
    q('customer_satisfaction_surveys', 'overall_score, nps_score', { dateField: 'survey_date' }),
    q('customer_feedback', 'feedback_type, status, severity, received_date, closed_date', { dateField: 'received_date' }),
    q('non_conformities', 'id, status', {}),
    q('internal_audits', 'id, status', {}),
    q('quality_objectives', 'id, name, target_value, current_value, status', {}),
    q('suppliers', 'id, name, status, criticality', {}),
    q('risk_matrix', 'id, status, risk_level', {}),
    q('qc_inspections', 'id, result', {}),
    q('improvement_opportunities', 'id, status', {}),
    q('infrastructure_assets', 'id, status, next_maintenance_date', {}),
    q('awareness_records', 'id, covered_policy, covered_objectives, covered_contribution, covered_implications, comprehension_verified', {}),
  ])

  const val = (i) => results[i].status === 'fulfilled' ? results[i].value : { data: null, count: null }

  const [sat, feedback, ncs, audits, objectives, suppliers, risks, qc, oms, infra, awareness] =
    results.map((_, i) => val(i))

  // Satisfacción
  const satRows = sat.data || []
  const satScores = satRows.map(r => r.overall_score).filter(v => v != null).map(Number)
  const npsRows = satRows.map(r => r.nps_score).filter(v => v != null)
  const promoters = npsRows.filter(n => n >= 9).length
  const detractors = npsRows.filter(n => n <= 6).length

  // Quejas
  const fbRows = feedback.data || []
  const closedFb = fbRows.filter(r => r.closed_date)

  // Objetivos: cumplido si current >= target
  const objRows = objectives.data || []
  const objMet = objRows.filter(o =>
    o.target_value != null && o.current_value != null &&
    Number(o.current_value) >= Number(o.target_value)).length

  // Toma de conciencia completa
  const awRows = awareness.data || []
  const awComplete = awRows.filter(r =>
    r.covered_policy && r.covered_objectives && r.covered_contribution &&
    r.covered_implications && r.comprehension_verified).length

  return {
    period: { from, to },
    generated_at: new Date().toISOString(),
    satisfaction: {
      responses: satRows.length,
      avg_score: satScores.length
        ? Math.round((satScores.reduce((a, b) => a + b, 0) / satScores.length) * 100) / 100 : null,
      nps: npsRows.length
        ? Math.round(((promoters - detractors) / npsRows.length) * 1000) / 10 : null,
      promoters, detractors,
    },
    customer_feedback: {
      total: fbRows.length,
      complaints: fbRows.filter(r => ['complaint', 'claim'].includes(r.feedback_type)).length,
      open: fbRows.filter(r => ['received', 'in_analysis'].includes(r.status)).length,
      closed: closedFb.length,
      escalated: fbRows.filter(r => r.status === 'escalated').length,
      avg_days_to_close: closedFb.length
        ? Math.round(closedFb.reduce((acc, r) =>
            acc + (new Date(r.closed_date) - new Date(r.received_date)) / 86400000, 0) / closedFb.length)
        : null,
    },
    non_conformities: {
      total: ncs.count ?? (ncs.data || []).length,
      open: (ncs.data || []).filter(r => r.status && !['Cerrada', 'cerrada', 'closed'].includes(r.status)).length,
    },
    internal_audits: { total: audits.count ?? (audits.data || []).length },
    objectives: {
      total: objRows.length,
      met: objMet,
      compliance_pct: objRows.length ? Math.round((objMet / objRows.length) * 100) : null,
    },
    suppliers: {
      total: suppliers.count ?? (suppliers.data || []).length,
      approved: (suppliers.data || []).filter(s => s.status === 'Aprobado').length,
      conditioned: (suppliers.data || []).filter(s => s.status === 'Condicionado').length,
      rejected: (suppliers.data || []).filter(s => s.status === 'Rechazado').length,
      critical: (suppliers.data || []).filter(s => s.criticality === 'Crítico').length,
    },
    risks: {
      total: risks.count ?? (risks.data || []).length,
      high: (risks.data || []).filter(r =>
        ['Alto', 'Crítico', 'alto', 'critico'].includes(r.risk_level)).length,
    },
    qc_inspections: {
      total: qc.count ?? (qc.data || []).length,
    },
    improvement_opportunities: {
      total: oms.count ?? (oms.data || []).length,
    },
    infrastructure: {
      total: (infra.data || []).filter(a => a.status !== 'retired').length,
      faulty: (infra.data || []).filter(a => a.status === 'faulty').length,
      maintenance_overdue: (infra.data || []).filter(a =>
        a.next_maintenance_date && new Date(a.next_maintenance_date) < new Date()).length,
    },
    awareness: {
      sessions: awRows.length,
      complete: awComplete,
    },
  }
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function DataAnalysis() {
  const { org, role } = useOrg()
  const orgId = org?.id
  const canWrite = can(role, 'data_analysis', 'write')

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [collecting, setCollecting] = useState(false)
  const [generating, setGenerating] = useState(false)

  const load = async () => {
    if (!orgId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('data_analysis_reports')
      .select('*')
      .eq('org_id', orgId)
      .order('period_end', { ascending: false })
    if (error) toast.error(error.message)
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [orgId])

  const kpis = useMemo(() => ({
    total: rows.length,
    approved: rows.filter(r => r.status === 'approved').length,
    draft: rows.filter(r => r.status === 'draft').length,
    // Un SGC maduro produce este informe al menos una vez al año.
    lastApproved: rows.filter(r => r.status === 'approved')
      .sort((a, b) => new Date(b.period_end) - new Date(a.period_end))[0] || null,
  }), [rows])

  const openNew = () => { setEditing(null); setForm(emptyForm()); setModalOpen(true) }

  const openEdit = (r) => {
    setEditing(r)
    setForm({
      ...emptyForm(), ...r,
      approved_date: r.approved_date || '',
      prepared_by: r.prepared_by || '', reviewed_by: r.reviewed_by || '',
      approved_by: r.approved_by || '', evidence_url: r.evidence_url || '',
      notes: r.notes || '', conclusions: r.conclusions || '',
      recommendations: r.recommendations || '',
      ...AXES.reduce((acc, a) => ({ ...acc, [a.key]: r[a.key] || '' }), {}),
    })
    setModalOpen(true)
  }

  // Recolecta las métricas reales del período y las congela en el form.
  const doCollect = async () => {
    if (!form.period_start || !form.period_end) {
      toast.error('Definí el período primero'); return
    }
    setCollecting(true)
    try {
      const snap = await collectMetrics(orgId, form.period_start, form.period_end)
      setForm(f => ({ ...f, metrics_snapshot: snap }))
      toast.success('Indicadores recolectados del período')
    } catch (e) {
      toast.error('No se pudieron recolectar los indicadores: ' + e.message)
    } finally {
      setCollecting(false)
    }
  }

  // Redacta los 6 ejes con IA a partir del snapshot. Le pasamos los números
  // reales para que el análisis sea concreto y no genérico.
  const doGenerate = async () => {
    if (!form.metrics_snapshot) {
      toast.error('Recolectá los indicadores primero'); return
    }
    setGenerating(true)
    try {
      const prompt = `Sos un consultor experto en ISO 9001:2015 redactando el informe de Análisis y Evaluación de la cláusula 9.1.3 para la organización "${org?.name || 'la empresa'}".

Período analizado: ${form.period_start} a ${form.period_end}

Indicadores reales recolectados del sistema de gestión:
${JSON.stringify(form.metrics_snapshot, null, 2)}

Redactá el análisis de cada eje que exige la norma. Reglas:
- Usá los NÚMEROS CONCRETOS del snapshot, no generalidades.
- Si un indicador está en null o en cero porque no hay datos, decilo explícitamente ("no se registraron datos en el período") en vez de inventar.
- Tono profesional pero directo, en español de Ecuador. Máximo 4 oraciones por eje.
- Señalá tendencias y puntos débiles cuando los números lo permitan.

Devolvé SOLO un JSON con esta forma exacta:
{
  "analysis_conformity": "...",
  "analysis_satisfaction": "...",
  "analysis_qms_performance": "...",
  "analysis_planning": "...",
  "analysis_risks": "...",
  "analysis_suppliers": "...",
  "analysis_improvement": "...",
  "conclusions": "...",
  "recommendations": "..."
}`

      const raw = await consultarIA(prompt, 'Experto en sistemas de gestión de calidad ISO 9001:2015.')
      let parsed = null
      try {
        parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
      } catch {
        // Si vino con texto alrededor, extraemos el primer objeto JSON.
        const m = typeof raw === 'string' ? raw.match(/\{[\s\S]*\}/) : null
        if (m) { try { parsed = JSON.parse(m[0]) } catch { /* no-op */ } }
      }
      if (!parsed || parsed.error) {
        toast.error(parsed?.error || 'La IA no devolvió un análisis válido')
        return
      }
      setForm(f => ({
        ...f,
        ...AXES.reduce((acc, a) => ({
          ...acc,
          [a.key]: parsed[a.key] || f[a.key],
        }), {}),
        conclusions: parsed.conclusions || f.conclusions,
        recommendations: parsed.recommendations || f.recommendations,
      }))
      toast.success('Análisis redactado — revisalo y ajustalo antes de aprobar')
    } catch (e) {
      toast.error('Error generando el análisis: ' + e.message)
    } finally {
      setGenerating(false)
    }
  }

  const save = async () => {
    if (!form.title?.trim()) { toast.error('Poné un título al informe'); return }
    if (!form.period_start || !form.period_end) { toast.error('Definí el período'); return }
    if (new Date(form.period_end) < new Date(form.period_start)) {
      toast.error('El fin del período no puede ser anterior al inicio'); return
    }
    setSaving(true)
    const payload = {
      title: form.title.trim(),
      period_start: form.period_start,
      period_end: form.period_end,
      ...AXES.reduce((acc, a) => ({ ...acc, [a.key]: form[a.key]?.trim() || null }), {}),
      metrics_snapshot: form.metrics_snapshot || null,
      conclusions: form.conclusions?.trim() || null,
      recommendations: form.recommendations?.trim() || null,
      status: form.status,
      prepared_by: form.prepared_by?.trim() || null,
      reviewed_by: form.reviewed_by?.trim() || null,
      approved_by: form.approved_by?.trim() || null,
      approved_date: form.approved_date || null,
      evidence_url: form.evidence_url?.trim() || null,
      notes: form.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const q = editing
      ? supabase.from('data_analysis_reports').update(payload).eq('id', editing.id)
      : supabase.from('data_analysis_reports').insert([{ ...payload, org_id: orgId }])
    const { error } = await q
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editing ? 'Informe actualizado' : 'Informe creado')
    setModalOpen(false)
    load()
  }

  const remove = async (r) => {
    const ok = await confirm({
      title: 'Eliminar informe',
      message: `¿Eliminar "${r.title}"? Es un registro que alimenta la revisión por la dirección.`,
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('data_analysis_reports').delete().eq('id', r.id)
    if (error) { toast.error(error.message); return }
    toast.success('Informe eliminado')
    load()
  }

  const monthsSinceLast = kpis.lastApproved
    ? Math.floor((new Date() - new Date(kpis.lastApproved.period_end)) / (86400000 * 30))
    : null

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        icon={<BarChart3 size={28} color={colors.primary} />}
        title="Análisis y Evaluación de Datos"
        subtitle="Informe periódico con los 6 ejes de la cláusula 9.1.3 que alimenta la revisión por la dirección"
      />

      <IsoInfoCard {...CLAUSE_GUIDES['9.1.3']} />

      <div style={{ marginTop: '14px', marginBottom: '16px' }}>
        <Grid min="190px" gap="10px">
          <Kpi label="Informes" value={kpis.total} icon={<FileText size={14} />} color={colors.primary} />
          <Kpi label="Aprobados" value={kpis.approved} icon={<CheckCircle2 size={14} />}
            color={kpis.approved > 0 ? colors.success : colors.textGhost} />
          <Kpi label="En borrador" value={kpis.draft} icon={<Clock size={14} />} color={colors.warning} />
          <Kpi
            label="Último aprobado"
            value={monthsSinceLast === null ? '—' : `${monthsSinceLast}m`}
            icon={<TrendingUp size={14} />}
            color={monthsSinceLast === null || monthsSinceLast > 12 ? colors.danger : colors.success}
            subtitle={kpis.lastApproved ? fmtDate(kpis.lastApproved.period_end) : 'sin informes aprobados'}
          />
        </Grid>
      </div>

      {(monthsSinceLast === null || monthsSinceLast > 12) && (
        <div style={{
          padding: '10px 12px', background: colors.warningLight, color: colors.warningText,
          borderRadius: radius.md, marginBottom: '14px', fontSize: font.sm,
          display: 'flex', gap: '8px', alignItems: 'flex-start',
        }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>
            {monthsSinceLast === null
              ? 'Todavía no tenés ningún informe de análisis aprobado. La revisión por la dirección (9.3) necesita este insumo — sin él, el auditor no tiene cómo verificar que analizaste los datos.'
              : `Pasaron ${monthsSinceLast} meses desde el último informe aprobado. Lo esperable es al menos uno por año, antes de cada revisión por la dirección.`}
          </span>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: font.xl, color: colors.text }}>Informes</h3>
        {canWrite && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openNew}>
            Nuevo informe
          </Button>
        )}
      </div>

      {loading ? <Spinner label="Cargando informes…" />
        : rows.length === 0 ? (
          <EmptyState
            icon={<BarChart3 size={32} color={colors.textGhost} />}
            title="Sin informes de análisis"
            subtitle="Creá el primero: el sistema recolecta los indicadores reales del período y la IA te ayuda a redactar el análisis de los 6 ejes."
          />
        ) : (
          <div style={{
            background: 'white', border: `1px solid ${colors.border}`,
            borderRadius: radius.xl, overflow: 'hidden',
          }}>
            {rows.map((r, i) => (
              <ReportRow key={r.id} row={r} isLast={i === rows.length - 1}
                canWrite={canWrite} onEdit={() => openEdit(r)} onDelete={() => remove(r)} />
            ))}
          </div>
        )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar · ${form.title}` : 'Nuevo informe de análisis (9.1.3)'}
        maxWidth="900px"
      >
        <Modal.Section title="Identificación y período">
          <Row>
            <Field label="Título" required flex={2}>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
            </Field>
            <Field label="Estado">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.entries(STATUSES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Inicio del período" required>
              <Input type="date" value={form.period_start}
                onChange={e => setForm({ ...form, period_start: e.target.value })} />
            </Field>
            <Field label="Fin del período" required>
              <Input type="date" value={form.period_end}
                onChange={e => setForm({ ...form, period_end: e.target.value })} />
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Indicadores del período">
          <div style={{
            display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px',
          }}>
            <Button
              variant="secondary" size="sm"
              icon={collecting ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              onClick={doCollect} disabled={collecting}
            >
              {collecting ? 'Recolectando…' : form.metrics_snapshot ? 'Recolectar de nuevo' : 'Recolectar indicadores'}
            </Button>
            {form.metrics_snapshot && (
              <Button
                variant="ai" size="sm"
                icon={generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                onClick={doGenerate} disabled={generating}
              >
                {generating ? 'Redactando…' : 'Redactar análisis con IA'}
              </Button>
            )}
          </div>

          {form.metrics_snapshot ? (
            <SnapshotView snap={form.metrics_snapshot} />
          ) : (
            <div style={{
              fontSize: font.sm, color: colors.textMuted, background: colors.bgSubtle,
              padding: '12px', borderRadius: radius.md,
            }}>
              Al recolectar, el sistema consulta satisfacción, quejas, no conformidades, auditorías,
              objetivos, proveedores, riesgos, infraestructura y toma de conciencia del período, y
              congela esos números en el informe. Después podés pedirle a la IA que redacte el
              análisis a partir de esos datos concretos.
            </div>
          )}
        </Modal.Section>

        <Modal.Section title="Análisis por eje (cláusula 9.1.3)">
          {AXES.map(a => (
            <Field key={a.key} label={`${a.letter}) ${a.label}`} hint={a.hint}>
              <Textarea rows={3} value={form[a.key]}
                onChange={e => setForm({ ...form, [a.key]: e.target.value })} />
            </Field>
          ))}
        </Modal.Section>

        <Modal.Section title="Conclusiones y recomendaciones">
          <Field label="Conclusiones">
            <Textarea rows={3} value={form.conclusions}
              onChange={e => setForm({ ...form, conclusions: e.target.value })}
              placeholder="Qué concluye la organización del análisis completo." />
          </Field>
          <Field label="Recomendaciones" hint="Estas entran como insumo a la revisión por la dirección (9.3)">
            <Textarea rows={3} value={form.recommendations}
              onChange={e => setForm({ ...form, recommendations: e.target.value })} />
          </Field>
        </Modal.Section>

        <Modal.Section title="Firmas y respaldo">
          <Row>
            <Field label="Preparado por">
              <Input value={form.prepared_by}
                onChange={e => setForm({ ...form, prepared_by: e.target.value })} />
            </Field>
            <Field label="Revisado por">
              <Input value={form.reviewed_by}
                onChange={e => setForm({ ...form, reviewed_by: e.target.value })} />
            </Field>
            <Field label="Aprobado por">
              <Input value={form.approved_by}
                onChange={e => setForm({ ...form, approved_by: e.target.value })} />
            </Field>
            <Field label="Fecha de aprobación">
              <Input type="date" value={form.approved_date}
                onChange={e => setForm({ ...form, approved_date: e.target.value })} />
            </Field>
          </Row>
          <Row>
            <Field label="Evidencia (URL)">
              <Input value={form.evidence_url}
                onChange={e => setForm({ ...form, evidence_url: e.target.value })} />
            </Field>
            <Field label="Notas">
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Footer>
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {editing ? 'Guardar cambios' : 'Crear informe'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}

// ─── Vista del snapshot recolectado ─────────────────────────────────────────

function SnapshotView({ snap }) {
  const blocks = [
    {
      title: 'Satisfacción del cliente',
      items: [
        ['Respuestas', snap.satisfaction?.responses],
        ['Promedio', snap.satisfaction?.avg_score ?? '—'],
        ['NPS', snap.satisfaction?.nps ?? '—'],
      ],
    },
    {
      title: 'Quejas y comunicación',
      items: [
        ['Total', snap.customer_feedback?.total],
        ['Quejas', snap.customer_feedback?.complaints],
        ['Abiertas', snap.customer_feedback?.open],
        ['Cierre prom.', snap.customer_feedback?.avg_days_to_close != null
          ? `${snap.customer_feedback.avg_days_to_close}d` : '—'],
      ],
    },
    {
      title: 'No conformidades',
      items: [
        ['Total', snap.non_conformities?.total],
        ['Abiertas', snap.non_conformities?.open],
      ],
    },
    {
      title: 'Objetivos de calidad',
      items: [
        ['Definidos', snap.objectives?.total],
        ['Cumplidos', snap.objectives?.met],
        ['Cumplimiento', snap.objectives?.compliance_pct != null
          ? `${snap.objectives.compliance_pct}%` : '—'],
      ],
    },
    {
      title: 'Proveedores',
      items: [
        ['Total', snap.suppliers?.total],
        ['Aprobados', snap.suppliers?.approved],
        ['Condicionados', snap.suppliers?.conditioned],
        ['Críticos', snap.suppliers?.critical],
      ],
    },
    {
      title: 'Riesgos',
      items: [
        ['Identificados', snap.risks?.total],
        ['Nivel alto', snap.risks?.high],
      ],
    },
    {
      title: 'Infraestructura',
      items: [
        ['Activos', snap.infrastructure?.total],
        ['Averiados', snap.infrastructure?.faulty],
        ['Mant. vencido', snap.infrastructure?.maintenance_overdue],
      ],
    },
    {
      title: 'Toma de conciencia',
      items: [
        ['Sesiones', snap.awareness?.sessions],
        ['Completas', snap.awareness?.complete],
      ],
    },
  ]

  return (
    <div>
      <div style={{ fontSize: font.xs, color: colors.textFaint, marginBottom: '8px' }}>
        Congelado el {new Date(snap.generated_at).toLocaleString('es-EC')} ·
        período {snap.period?.from} a {snap.period?.to}
      </div>
      <Grid min="180px" gap="8px">
        {blocks.map(b => (
          <div key={b.title} style={{
            border: `1px solid ${colors.border}`, borderRadius: radius.lg,
            padding: '10px', background: 'white',
          }}>
            <div style={{
              fontSize: font.xs, fontWeight: 700, textTransform: 'uppercase',
              color: colors.textFaint, marginBottom: '6px', letterSpacing: '0.03em',
            }}>
              {b.title}
            </div>
            {b.items.map(([label, value]) => (
              <div key={label} style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: font.sm, padding: '2px 0',
              }}>
                <span style={{ color: colors.textMuted }}>{label}</span>
                <strong style={{ color: colors.text }}>{value ?? 0}</strong>
              </div>
            ))}
          </div>
        ))}
      </Grid>
    </div>
  )
}

// ─── Fila de informe ─────────────────────────────────────────────────────────

function ReportRow({ row, isLast, canWrite, onEdit, onDelete }) {
  const st = STATUSES[row.status] || STATUSES.draft
  const filledAxes = AXES.filter(a => row[a.key]?.trim()).length

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', padding: '13px 14px',
      borderBottom: isLast ? 'none' : `1px solid ${colors.border}`,
      opacity: row.status === 'archived' ? 0.6 : 1,
    }}>
      <div style={{
        width: '36px', height: '36px', borderRadius: radius.lg, flexShrink: 0,
        background: row.status === 'approved' ? colors.successLight : colors.bgSubtle,
        color: row.status === 'approved' ? colors.successText : colors.textMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {row.status === 'approved' ? <CheckCircle2 size={17} />
          : row.status === 'archived' ? <Archive size={17} /> : <FileText size={17} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <strong style={{ color: colors.text, fontSize: font.base }}>{row.title}</strong>
          <Badge variant={st.variant}>{st.label}</Badge>
          <Badge variant={filledAxes === AXES.length ? 'success' : 'warning'}>
            {filledAxes}/{AXES.length} ejes
          </Badge>
          {row.metrics_snapshot && <Badge variant="info">con indicadores</Badge>}
        </div>
        <div style={{ fontSize: font.sm, color: colors.textFaint, marginTop: '3px' }}>
          {fmtDate(row.period_start)} → {fmtDate(row.period_end)}
          {row.prepared_by && ` · preparado por ${row.prepared_by}`}
          {row.approved_by && ` · aprobado por ${row.approved_by}`}
        </div>
      </div>

      {canWrite && (
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <Button variant="ghost" size="sm" icon={<Pencil size={13} />} onClick={onEdit} title="Editar" />
          <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={onDelete} title="Eliminar" />
        </div>
      )}
    </div>
  )
}
