// =============================================================================
// CustomerVoice — "Voz del Cliente"
//
// Cubre dos cláusulas que iban juntas en la práctica pero que la norma separa:
//   · 9.1.2 Satisfacción del cliente  → medir la percepción, ver tendencia
//   · 8.2.1 Comunicación con el cliente → registrar quejas/consultas y cerrarlas
//
// Por qué en un solo módulo: el auditor los revisa en la misma conversación
// ("¿cómo saben si el cliente está conforme?" → encuestas + quejas), y separar
// obligaba al usuario a saltar entre pantallas para armar la misma evidencia.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import {
  Heart, MessageSquareWarning, Plus, Star, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, Clock, Filter, Trash2, Pencil, Search,
  ThumbsUp, ThumbsDown, Minus, ArrowUpRight,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import { can } from './lib/roles'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import {
  Button, Modal, Field, Row, Input, Select, Textarea, Badge, Kpi,
  EmptyState, Spinner, Grid, PageHeader, colors, radius, font,
} from './components/ui'

// ─── Catálogos ───────────────────────────────────────────────────────────────

// Las 6 dimensiones que se puntúan 1-5. El `key` matchea la columna en BD
// (score_<key>) y la clave que espera la RPC pública.
const DIMENSIONS = [
  { key: 'quality',        label: 'Calidad del producto/servicio', hint: '¿Cumplió las especificaciones acordadas?' },
  { key: 'delivery',       label: 'Cumplimiento de plazos',        hint: '¿Se entregó en la fecha comprometida?' },
  { key: 'communication',  label: 'Comunicación y atención',       hint: '¿Fue clara, oportuna y accesible?' },
  { key: 'value',          label: 'Relación precio / valor',       hint: '¿El precio se corresponde con lo recibido?' },
  { key: 'responsiveness', label: 'Respuesta ante problemas',      hint: '¿Reaccionamos rápido cuando algo falló?' },
  { key: 'technical',      label: 'Competencia técnica',           hint: '¿El equipo demostró dominio técnico?' },
]

const FEEDBACK_TYPES = {
  complaint:  { label: 'Queja / Reclamo', variant: 'danger',  icon: ThumbsDown },
  claim:      { label: 'Reclamo formal',  variant: 'danger',  icon: AlertTriangle },
  inquiry:    { label: 'Consulta',        variant: 'info',    icon: MessageSquareWarning },
  suggestion: { label: 'Sugerencia',      variant: 'warning', icon: ArrowUpRight },
  compliment: { label: 'Felicitación',    variant: 'success', icon: ThumbsUp },
  return:     { label: 'Devolución',      variant: 'danger',  icon: TrendingDown },
}

// Prefijo del correlativo según el tipo, para que el código hable por sí solo
// en el registro de auditoría.
const CODE_PREFIXES = {
  complaint: 'QJ',   // queja
  claim:     'RC',   // reclamo formal
  inquiry:   'CO',   // consulta
  suggestion:'SG',   // sugerencia
  compliment:'FE',   // felicitación
  return:    'DV',   // devolución
}

const CHANNELS = {
  email:        'Email',
  phone:        'Teléfono',
  in_person:    'Presencial',
  web_form:     'Formulario web',
  whatsapp:     'WhatsApp',
  social_media: 'Redes sociales',
  letter:       'Carta',
  other:        'Otro',
}

const FEEDBACK_STATUS = {
  received:    { label: 'Recibida',     variant: 'neutral' },
  in_analysis: { label: 'En análisis',  variant: 'info' },
  responded:   { label: 'Respondida',   variant: 'warning' },
  closed:      { label: 'Cerrada',      variant: 'success' },
  escalated:   { label: 'Escalada a NC', variant: 'danger' },
}

const SEVERITIES = {
  low:      { label: 'Baja',    variant: 'neutral' },
  medium:   { label: 'Media',   variant: 'info' },
  high:     { label: 'Alta',    variant: 'warning' },
  critical: { label: 'Crítica', variant: 'danger' },
}

const EMPTY_SURVEY = {
  customer_name: '', customer_contact: '',
  score_quality: 4, score_delivery: 4, score_communication: 4,
  score_value: 4, score_responsiveness: 4, score_technical: 4,
  nps_score: 8, comments: '', survey_date: new Date().toISOString().slice(0, 10),
  source: 'manual', triggered_action: '',
}

const EMPTY_FEEDBACK = {
  code: '', feedback_type: 'complaint', channel: 'email',
  customer_name: '', customer_contact: '',
  received_date: new Date().toISOString().slice(0, 10),
  description: '', severity: 'medium', status: 'received',
  assigned_to: '', response: '', response_date: '', closed_date: '',
  customer_satisfied: '', root_cause: '', corrective_action: '',
  evidence_url: '', notes: '',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

// NPS = %promotores − %detractores. Promotor 9-10, pasivo 7-8, detractor 0-6.
// Se recalcula en el cliente además de la vista SQL para que el número se
// actualice al instante cuando cargás una respuesta nueva.
function calcNps(rows) {
  const withNps = rows.filter(r => r.nps_score !== null && r.nps_score !== undefined)
  if (withNps.length === 0) return null
  const promoters = withNps.filter(r => r.nps_score >= 9).length
  const detractors = withNps.filter(r => r.nps_score <= 6).length
  return Math.round(((promoters - detractors) / withNps.length) * 1000) / 10
}

function avgOf(rows, field) {
  const vals = rows.map(r => r[field]).filter(v => v !== null && v !== undefined)
  if (!vals.length) return null
  return Math.round((vals.reduce((a, b) => a + Number(b), 0) / vals.length) * 100) / 100
}

function scoreColor(score) {
  if (score === null || score === undefined) return colors.textGhost
  if (score >= 4.2) return colors.success
  if (score >= 3.4) return colors.warning
  return colors.danger
}

function npsColor(nps) {
  if (nps === null) return colors.textGhost
  if (nps >= 50) return colors.success
  if (nps >= 0) return colors.warning
  return colors.danger
}

// Divide las respuestas en dos mitades temporales para comparar tendencia.
// El auditor no pregunta "¿cuánto sacaron?", pregunta "¿mejoró o empeoró?".
function trendOf(rows) {
  const scored = rows
    .filter(r => r.overall_score !== null)
    .sort((a, b) => new Date(a.survey_date) - new Date(b.survey_date))
  if (scored.length < 4) return null
  const mid = Math.floor(scored.length / 2)
  const older = scored.slice(0, mid)
  const newer = scored.slice(mid)
  const a = avgOf(older, 'overall_score')
  const b = avgOf(newer, 'overall_score')
  if (a === null || b === null) return null
  return Math.round((b - a) * 100) / 100
}

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-EC', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function CustomerVoice() {
  const { org, role } = useOrg()
  const [tab, setTab] = useState('satisfaction')
  // Permiso por entidad, no compartido: hoy ambas son OPERATIONAL_WRITE, pero
  // si mañana se restringe una, la otra no debe arrastrarse.
  const canWriteSat = can(role, 'customer_satisfaction', 'write')
  const canWriteFb = can(role, 'customer_feedback', 'write')

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        icon={<Heart size={28} color={colors.primary} />}
        title="Voz del Cliente"
        subtitle="Satisfacción medida (9.1.2) y comunicación con el cliente incluyendo quejas (8.2.1)"
      />

      <div style={{
        display: 'flex', gap: '4px', marginBottom: '16px',
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <TabBtn active={tab === 'satisfaction'} onClick={() => setTab('satisfaction')}
          icon={<Star size={15} />} label="Satisfacción" clause="9.1.2" />
        <TabBtn active={tab === 'feedback'} onClick={() => setTab('feedback')}
          icon={<MessageSquareWarning size={15} />} label="Comunicación y Quejas" clause="8.2.1" />
      </div>

      {tab === 'satisfaction'
        ? <SatisfactionTab orgId={org?.id} canWrite={canWriteSat} />
        : <FeedbackTab orgId={org?.id} canWrite={canWriteFb} />}
    </div>
  )
}

function TabBtn({ active, onClick, icon, label, clause }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        padding: '9px 14px', border: 'none', background: 'transparent',
        borderBottom: `2px solid ${active ? colors.primary : 'transparent'}`,
        color: active ? colors.primary : colors.textMuted,
        fontWeight: active ? 700 : 500, fontSize: font.base,
        cursor: 'pointer', fontFamily: 'inherit', marginBottom: '-1px',
      }}
    >
      {icon}{label}
      <span style={{
        fontSize: font.xs, color: colors.textGhost,
        background: colors.bgSubtle, padding: '1px 5px', borderRadius: radius.sm,
      }}>{clause}</span>
    </button>
  )
}

// ─── TAB 1: Satisfacción del cliente (9.1.2) ────────────────────────────────

function SatisfactionTab({ orgId, canWrite }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_SURVEY)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!orgId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('customer_satisfaction_surveys')
      .select('*')
      .eq('org_id', orgId)
      .order('survey_date', { ascending: false })
    if (error) toast.error(error.message)
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [orgId])

  const kpis = useMemo(() => {
    const nps = calcNps(rows)
    return {
      total: rows.length,
      avg: avgOf(rows, 'overall_score'),
      nps,
      trend: trendOf(rows),
      promoters: rows.filter(r => r.nps_score >= 9).length,
      detractors: rows.filter(r => r.nps_score !== null && r.nps_score <= 6).length,
      lowScores: rows.filter(r => r.overall_score !== null && r.overall_score < 3).length,
    }
  }, [rows])

  const openNew = () => { setEditing(null); setForm(EMPTY_SURVEY); setModalOpen(true) }

  const openEdit = (row) => {
    setEditing(row)
    setForm({
      ...EMPTY_SURVEY,
      ...row,
      survey_date: row.survey_date || EMPTY_SURVEY.survey_date,
      comments: row.comments || '',
      customer_name: row.customer_name || '',
      customer_contact: row.customer_contact || '',
      triggered_action: row.triggered_action || '',
      // Normalizar los nulos de BD a '' — sin esto, guardar una respuesta sin
      // NPS lo convertía en 0, o sea el peor detractor posible.
      nps_score: row.nps_score ?? '',
      ...DIMENSIONS.reduce((acc, d) => ({
        ...acc, [`score_${d.key}`]: row[`score_${d.key}`] ?? '',
      }), {}),
    })
    setModalOpen(true)
  }

  const save = async () => {
    if (!form.customer_name?.trim()) { toast.error('Poné el nombre del cliente'); return }
    setSaving(true)
    // Solo mandamos las columnas reales de la tabla. overall_score lo calcula
    // el trigger en BD, así que no lo enviamos ni cuando editamos.
    const payload = {
      customer_name: form.customer_name.trim(),
      customer_contact: form.customer_contact?.trim() || null,
      survey_date: form.survey_date,
      source: form.source || 'manual',
      comments: form.comments?.trim() || null,
      triggered_action: form.triggered_action?.trim() || null,
      nps_score: form.nps_score === '' || form.nps_score == null
        ? null : Number(form.nps_score),
    }
    for (const d of DIMENSIONS) {
      const v = form[`score_${d.key}`]
      payload[`score_${d.key}`] = v === '' || v === null ? null : Number(v)
    }

    const q = editing
      ? supabase.from('customer_satisfaction_surveys').update(payload).eq('id', editing.id)
      : supabase.from('customer_satisfaction_surveys').insert([{ ...payload, org_id: orgId }])
    const { error } = await q
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editing ? 'Respuesta actualizada' : 'Respuesta registrada')
    setModalOpen(false)
    load()
  }

  const remove = async (row) => {
    const ok = await confirm({
      title: 'Eliminar respuesta',
      message: `¿Eliminar la evaluación de ${row.customer_name || 'este cliente'}? Se pierde la evidencia de esa medición.`,
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('customer_satisfaction_surveys').delete().eq('id', row.id)
    if (error) { toast.error(error.message); return }
    toast.success('Respuesta eliminada')
    load()
  }

  return (
    <div>
      <IsoInfoCard {...CLAUSE_GUIDES['9.1.2']} />

      <div style={{ marginTop: '14px', marginBottom: '16px' }}><Grid min="180px" gap="10px">
        <Kpi
          label="Respuestas"
          value={kpis.total}
          icon={<Star size={14} />}
          color={colors.primary}
          subtitle="últimos registros"
        />
        <Kpi
          label="Promedio general"
          value={kpis.avg !== null ? kpis.avg.toFixed(2) : '—'}
          icon={<Heart size={14} />}
          color={scoreColor(kpis.avg)}
          subtitle="sobre 5.00"
        />
        <Kpi
          label="NPS"
          value={kpis.nps !== null ? kpis.nps : '—'}
          icon={kpis.nps >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
          color={npsColor(kpis.nps)}
          subtitle={`${kpis.promoters} prom · ${kpis.detractors} detr`}
        />
        <Kpi
          label="Tendencia"
          value={kpis.trend === null ? '—' : (kpis.trend > 0 ? `+${kpis.trend}` : kpis.trend)}
          icon={kpis.trend > 0 ? <TrendingUp size={14} /> : kpis.trend < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
          color={kpis.trend === null ? colors.textGhost : kpis.trend >= 0 ? colors.success : colors.danger}
          subtitle="vs período anterior"
        />
        <Kpi
          label="Evaluaciones bajas"
          value={kpis.lowScores}
          icon={<AlertTriangle size={14} />}
          color={kpis.lowScores > 0 ? colors.danger : colors.success}
          subtitle="menos de 3.0 — requieren acción"
        />
      </Grid></div>

      {rows.length > 0 && <DimensionBars rows={rows} />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '18px 0 10px' }}>
        <h3 style={{ margin: 0, fontSize: font.xl, color: colors.text }}>Evaluaciones registradas</h3>
        {canWrite && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openNew}>
            Registrar evaluación
          </Button>
        )}
      </div>

      {loading ? <Spinner label="Cargando evaluaciones…" />
        : rows.length === 0 ? (
          <EmptyState
            icon={<Star size={32} color={colors.textGhost} />}
            title="Sin mediciones de satisfacción"
            subtitle="La norma exige medir activamente la percepción del cliente. Registrá la primera evaluación tras entregar un pedido."
          />
        ) : (
          <div style={{
            background: 'white', border: `1px solid ${colors.border}`,
            borderRadius: radius.xl, overflow: 'hidden',
          }}>
            {rows.map((r, i) => (
              <SurveyRow
                key={r.id} row={r} isLast={i === rows.length - 1}
                canWrite={canWrite}
                onEdit={() => openEdit(r)} onDelete={() => remove(r)}
              />
            ))}
          </div>
        )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Editar evaluación de satisfacción' : 'Nueva evaluación de satisfacción'}
        maxWidth="720px"
      >
        <Modal.Section title="Cliente">
          <Row>
            <Field label="Nombre del cliente" required>
              <Input value={form.customer_name}
                onChange={e => setForm({ ...form, customer_name: e.target.value })}
                placeholder="Ej. Petroecuador — Refinería Esmeraldas" />
            </Field>
            <Field label="Contacto">
              <Input value={form.customer_contact}
                onChange={e => setForm({ ...form, customer_contact: e.target.value })}
                placeholder="Nombre o email de quien respondió" />
            </Field>
          </Row>
          <Row>
            <Field label="Fecha de la evaluación">
              <Input type="date" value={form.survey_date}
                onChange={e => setForm({ ...form, survey_date: e.target.value })} />
            </Field>
            <Field label="Origen">
              <Select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
                <option value="manual">Carga manual (llamada / reunión)</option>
                <option value="email">Invitación por email</option>
                <option value="public_link">Link público</option>
              </Select>
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Puntuación por dimensión (1 = muy malo · 5 = excelente)">
          {DIMENSIONS.map(d => (
            <ScoreSlider
              key={d.key}
              label={d.label}
              hint={d.hint}
              value={form[`score_${d.key}`]}
              onChange={v => setForm({ ...form, [`score_${d.key}`]: v })}
            />
          ))}
        </Modal.Section>

        <Modal.Section title="Recomendación (NPS)">
          <div style={{ fontSize: font.sm, color: colors.textMuted, marginBottom: '8px' }}>
            ¿Qué tan probable es que recomiende nuestros servicios a un colega? (0 = nada probable, 10 = muy probable)
          </div>
          <NpsPicker value={form.nps_score} onChange={v => setForm({ ...form, nps_score: v })} />
        </Modal.Section>

        <Modal.Section title="Comentarios y acción">
          <Field label="Comentarios del cliente">
            <Textarea rows={3} value={form.comments}
              onChange={e => setForm({ ...form, comments: e.target.value })}
              placeholder="Textual de lo que dijo el cliente. Sirve como evidencia directa en auditoría." />
          </Field>
          <Field
            label="Acción disparada"
            hint="Si la evaluación fue baja, la norma espera que dispare una mejora (10.3) o una no conformidad (10.2)."
          >
            <Input value={form.triggered_action}
              onChange={e => setForm({ ...form, triggered_action: e.target.value })}
              placeholder="Ej. OM-2026-014 — revisar tiempos de respuesta en soporte" />
          </Field>
        </Modal.Section>

        <Modal.Footer>
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {editing ? 'Guardar cambios' : 'Registrar evaluación'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}

// Barras horizontales con el promedio por dimensión. Deja ver de un vistazo
// cuál es el punto débil — que es exactamente lo que el auditor va a preguntar.
function DimensionBars({ rows }) {
  const data = DIMENSIONS.map(d => ({
    ...d,
    avg: avgOf(rows, `score_${d.key}`),
  })).filter(d => d.avg !== null)

  if (!data.length) return null
  const worst = data.reduce((a, b) => (a.avg <= b.avg ? a : b))

  return (
    <div style={{
      background: 'white', border: `1px solid ${colors.border}`,
      borderRadius: radius.xl, padding: '16px',
    }}>
      <h4 style={{ margin: '0 0 12px 0', fontSize: font.lg, color: colors.text }}>
        Promedio por dimensión
      </h4>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        {data.map(d => (
          <div key={d.key} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '190px', fontSize: font.sm, color: colors.textMuted,
              flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {d.label}
            </div>
            <div style={{
              flex: 1, height: '18px', background: colors.bgSubtle,
              borderRadius: radius.pill, overflow: 'hidden', position: 'relative',
            }}>
              <div style={{
                width: `${(d.avg / 5) * 100}%`, height: '100%',
                background: scoreColor(d.avg), borderRadius: radius.pill,
                transition: 'width 0.4s',
              }} />
            </div>
            <div style={{
              width: '42px', textAlign: 'right', fontSize: font.base,
              fontWeight: 700, color: scoreColor(d.avg), flexShrink: 0,
            }}>
              {d.avg.toFixed(2)}
            </div>
          </div>
        ))}
      </div>
      {worst.avg < 4 && (
        <div style={{
          marginTop: '12px', padding: '9px 11px', background: colors.warningLight,
          color: colors.warningText, borderRadius: radius.md, fontSize: font.sm,
          display: 'flex', gap: '7px', alignItems: 'flex-start',
        }}>
          <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>
            <strong>{worst.label}</strong> es tu dimensión más débil ({worst.avg.toFixed(2)}).
            Considerá abrir una oportunidad de mejora (10.3) enfocada ahí — el auditor va a
            preguntar qué hiciste con este dato.
          </span>
        </div>
      )}
    </div>
  )
}

function ScoreSlider({ label, hint, value, onChange }) {
  return (
    <div style={{ marginBottom: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '3px' }}>
        <label style={{ fontSize: font.base, fontWeight: 600, color: colors.text }}>{label}</label>
        <span style={{
          fontSize: font.lg, fontWeight: 700,
          color: scoreColor(Number(value)), minWidth: '18px', textAlign: 'right',
        }}>
          {value === '' || value === null ? '—' : value}
        </span>
      </div>
      {hint && <div style={{ fontSize: font.xs, color: colors.textGhost, marginBottom: '5px' }}>{hint}</div>}
      <div style={{ display: 'flex', gap: '5px' }}>
        {[1, 2, 3, 4, 5].map(n => (
          <button
            key={n}
            onClick={() => onChange(n)}
            style={{
              flex: 1, padding: '6px 0', borderRadius: radius.md,
              border: `1px solid ${Number(value) === n ? scoreColor(n) : colors.border}`,
              background: Number(value) === n ? scoreColor(n) : 'white',
              color: Number(value) === n ? 'white' : colors.textMuted,
              fontWeight: 700, fontSize: font.base, cursor: 'pointer',
              fontFamily: 'inherit', transition: 'all 0.12s',
            }}
          >
            {n}
          </button>
        ))}
        <button
          onClick={() => onChange('')}
          title="Sin respuesta"
          style={{
            padding: '6px 10px', borderRadius: radius.md,
            border: `1px solid ${colors.border}`,
            background: value === '' ? colors.bgSubtle : 'white',
            color: colors.textGhost, fontSize: font.sm, cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          N/A
        </button>
      </div>
    </div>
  )
}

function NpsPicker({ value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
      {Array.from({ length: 11 }, (_, n) => {
        const active = Number(value) === n
        const c = n >= 9 ? colors.success : n >= 7 ? colors.warning : colors.danger
        return (
          <button
            key={n}
            onClick={() => onChange(n)}
            style={{
              width: '38px', height: '36px', borderRadius: radius.md,
              border: `1px solid ${active ? c : colors.border}`,
              background: active ? c : 'white',
              color: active ? 'white' : colors.textMuted,
              fontWeight: 700, fontSize: font.base, cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            {n}
          </button>
        )
      })}
    </div>
  )
}

function SurveyRow({ row, isLast, canWrite, onEdit, onDelete }) {
  const npsLabel = row.nps_score === null || row.nps_score === undefined ? null
    : row.nps_score >= 9 ? { t: 'Promotor', v: 'success' }
    : row.nps_score >= 7 ? { t: 'Pasivo', v: 'warning' }
    : { t: 'Detractor', v: 'danger' }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
      borderBottom: isLast ? 'none' : `1px solid ${colors.border}`,
    }}>
      <div style={{
        width: '46px', height: '46px', borderRadius: radius.lg,
        background: scoreColor(row.overall_score) + '18',
        color: scoreColor(row.overall_score),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: font.lg, flexShrink: 0,
      }}>
        {row.overall_score !== null ? Number(row.overall_score).toFixed(1) : '—'}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <strong style={{ color: colors.text, fontSize: font.lg }}>
            {row.customer_name || <em style={{ color: colors.textGhost }}>Anónimo</em>}
          </strong>
          {npsLabel && <Badge variant={npsLabel.v}>NPS {row.nps_score} · {npsLabel.t}</Badge>}
          {row.source === 'public_link' && <Badge variant="neutral">link público</Badge>}
          {row.triggered_action && <Badge variant="info">acción abierta</Badge>}
        </div>
        <div style={{ fontSize: font.sm, color: colors.textFaint, marginTop: '2px' }}>
          {fmtDate(row.survey_date)}
          {row.customer_contact && ` · ${row.customer_contact}`}
        </div>
        {row.comments && (
          <div style={{
            fontSize: font.sm, color: colors.textMuted, marginTop: '4px',
            fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            “{row.comments}”
          </div>
        )}
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

// ─── TAB 2: Comunicación y quejas (8.2.1) ───────────────────────────────────

function FeedbackTab({ orgId, canWrite }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FEEDBACK)
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterType, setFilterType] = useState('all')
  const [search, setSearch] = useState('')

  const load = async () => {
    if (!orgId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('customer_feedback')
      .select('*')
      .eq('org_id', orgId)
      .order('received_date', { ascending: false })
    if (error) toast.error(error.message)
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [orgId])

  const kpis = useMemo(() => {
    const open = rows.filter(r => ['received', 'in_analysis'].includes(r.status))
    const today = new Date()
    const overdue = rows.filter(r => {
      if (r.status === 'closed') return false
      const days = (today - new Date(r.received_date + 'T00:00:00')) / 86400000
      return days > 30
    })
    const closed = rows.filter(r => r.closed_date && r.received_date)
    const avgDays = closed.length
      ? Math.round(closed.reduce((acc, r) =>
          acc + (new Date(r.closed_date) - new Date(r.received_date)) / 86400000, 0) / closed.length)
      : null
    return {
      total: rows.length,
      open: open.length,
      complaints: rows.filter(r => r.feedback_type === 'complaint' || r.feedback_type === 'claim').length,
      criticalOpen: rows.filter(r => ['high', 'critical'].includes(r.severity) && r.status !== 'closed').length,
      overdue: overdue.length,
      avgDays,
    }
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filterStatus !== 'all' && r.status !== filterStatus) return false
      if (filterType !== 'all' && r.feedback_type !== filterType) return false
      if (q && !(
        (r.customer_name || '').toLowerCase().includes(q) ||
        (r.description || '').toLowerCase().includes(q) ||
        (r.code || '').toLowerCase().includes(q)
      )) return false
      return true
    })
  }, [rows, filterStatus, filterType, search])

  // Sugiere el siguiente correlativo del año mirando los que ya existen.
  // El prefijo va por tipo para que el código sea legible en auditoría: una
  // felicitación numerada "QJ-" (queja) confunde al revisar el registro.
  const suggestCode = (type) => {
    const year = new Date().getFullYear()
    const prefix = `${CODE_PREFIXES[type] || 'VC'}-${year}-`
    const nums = rows
      .map(r => r.code)
      .filter(c => c && c.startsWith(prefix))
      .map(c => parseInt(c.slice(prefix.length), 10))
      .filter(n => !Number.isNaN(n))
    const next = nums.length ? Math.max(...nums) + 1 : 1
    return `${prefix}${String(next).padStart(3, '0')}`
  }

  const openNew = () => {
    setEditing(null)
    setForm({ ...EMPTY_FEEDBACK, code: suggestCode(EMPTY_FEEDBACK.feedback_type) })
    setModalOpen(true)
  }

  // Al cambiar el tipo en un registro nuevo, resugerimos el código. En uno ya
  // guardado no se toca: el código emitido es parte de la evidencia.
  const changeType = (type) => {
    setForm(f => ({
      ...f,
      feedback_type: type,
      code: editing ? f.code : suggestCode(type),
    }))
  }

  const openEdit = (row) => {
    setEditing(row)
    setForm({
      ...EMPTY_FEEDBACK,
      ...row,
      code: row.code || '',
      customer_contact: row.customer_contact || '',
      assigned_to: row.assigned_to || '',
      response: row.response || '',
      response_date: row.response_date || '',
      closed_date: row.closed_date || '',
      customer_satisfied: row.customer_satisfied ?? '',
      root_cause: row.root_cause || '',
      corrective_action: row.corrective_action || '',
      evidence_url: row.evidence_url || '',
      notes: row.notes || '',
    })
    setModalOpen(true)
  }

  const save = async () => {
    if (!form.customer_name?.trim()) { toast.error('Poné el nombre del cliente'); return }
    if (!form.description?.trim()) { toast.error('Describí la comunicación recibida'); return }
    setSaving(true)
    const payload = {
      code: form.code?.trim() || null,
      feedback_type: form.feedback_type,
      channel: form.channel || null,
      customer_name: form.customer_name.trim(),
      customer_contact: form.customer_contact?.trim() || null,
      received_date: form.received_date,
      description: form.description.trim(),
      severity: form.severity,
      status: form.status,
      assigned_to: form.assigned_to?.trim() || null,
      response: form.response?.trim() || null,
      response_date: form.response_date || null,
      closed_date: form.closed_date || null,
      customer_satisfied: form.customer_satisfied === '' ? null : Number(form.customer_satisfied),
      root_cause: form.root_cause?.trim() || null,
      corrective_action: form.corrective_action?.trim() || null,
      evidence_url: form.evidence_url?.trim() || null,
      notes: form.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const q = editing
      ? supabase.from('customer_feedback').update(payload).eq('id', editing.id)
      : supabase.from('customer_feedback').insert([{ ...payload, org_id: orgId }])
    const { error } = await q
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editing ? 'Registro actualizado' : 'Comunicación registrada')
    setModalOpen(false)
    load()
  }

  const remove = async (row) => {
    const ok = await confirm({
      title: 'Eliminar registro',
      message: `¿Eliminar ${row.code || 'este registro'} de ${row.customer_name}? El auditor puede pedir el histórico completo de quejas.`,
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('customer_feedback').delete().eq('id', row.id)
    if (error) { toast.error(error.message); return }
    toast.success('Registro eliminado')
    load()
  }

  return (
    <div>
      <IsoInfoCard {...CLAUSE_GUIDES['8.2.1']} />

      <div style={{ marginTop: '14px', marginBottom: '16px' }}><Grid min="180px" gap="10px">
        <Kpi label="Total registros" value={kpis.total} icon={<MessageSquareWarning size={14} />} color={colors.primary} />
        <Kpi label="Abiertas" value={kpis.open} icon={<Clock size={14} />}
          color={kpis.open > 0 ? colors.warning : colors.success} subtitle="sin cerrar" />
        <Kpi label="Quejas y reclamos" value={kpis.complaints} icon={<ThumbsDown size={14} />}
          color={colors.danger} subtitle="del total" />
        <Kpi label="Críticas abiertas" value={kpis.criticalOpen} icon={<AlertTriangle size={14} />}
          color={kpis.criticalOpen > 0 ? colors.danger : colors.success} subtitle="alta o crítica" />
        <Kpi label="Vencidas" value={kpis.overdue} icon={<AlertTriangle size={14} />}
          color={kpis.overdue > 0 ? colors.danger : colors.success} subtitle="+30 días sin cerrar" />
        <Kpi label="Cierre promedio" value={kpis.avgDays !== null ? `${kpis.avgDays}d` : '—'}
          icon={<CheckCircle2 size={14} />} color={colors.info} subtitle="días hasta el cierre" />
      </Grid></div>

      {kpis.overdue > 0 && (
        <div style={{
          padding: '10px 12px', background: colors.dangerLight, color: colors.dangerText,
          borderRadius: radius.md, marginBottom: '14px', fontSize: font.sm,
          display: 'flex', gap: '8px', alignItems: 'flex-start',
        }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>
            Tenés <strong>{kpis.overdue}</strong> comunicación{kpis.overdue === 1 ? '' : 'es'} sin cerrar
            hace más de 30 días. Es el hallazgo más común en auditoría de 8.2.1: quejas registradas
            pero sin evidencia de cierre.
          </span>
        </div>
      )}

      <div style={{
        display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center',
        marginBottom: '12px',
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={14} style={{
            position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)',
            color: colors.textGhost, pointerEvents: 'none',
          }} />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por cliente, código o descripción…"
            style={{ paddingLeft: '28px' }}
          />
        </div>
        <Select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ width: 'auto', minWidth: '150px' }}>
          <option value="all">Todos los tipos</option>
          {Object.entries(FEEDBACK_TYPES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </Select>
        <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 'auto', minWidth: '150px' }}>
          <option value="all">Todos los estados</option>
          {Object.entries(FEEDBACK_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </Select>
        {canWrite && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openNew}>
            Registrar
          </Button>
        )}
      </div>

      {loading ? <Spinner label="Cargando registros…" />
        : filtered.length === 0 ? (
          <EmptyState
            icon={<MessageSquareWarning size={32} color={colors.textGhost} />}
            title={rows.length === 0 ? 'Sin comunicaciones registradas' : 'Sin resultados con esos filtros'}
            subtitle={rows.length === 0
              ? 'Registrá acá quejas, consultas, sugerencias y felicitaciones. Es lo primero que pide el auditor en la cláusula 8.2.1.'
              : 'Probá limpiando los filtros o la búsqueda.'}
          />
        ) : (
          <div style={{
            background: 'white', border: `1px solid ${colors.border}`,
            borderRadius: radius.xl, overflow: 'hidden',
          }}>
            {filtered.map((r, i) => (
              <FeedbackRow
                key={r.id} row={r} isLast={i === filtered.length - 1}
                canWrite={canWrite}
                onEdit={() => openEdit(r)} onDelete={() => remove(r)}
              />
            ))}
          </div>
        )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `Editar ${form.code || 'registro'}` : 'Registrar comunicación del cliente'}
        maxWidth="760px"
      >
        <Modal.Section title="Identificación">
          <Row>
            <Field label="Código" hint="Correlativo sugerido automáticamente">
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
            </Field>
            <Field label="Tipo" required>
              <Select value={form.feedback_type} onChange={e => changeType(e.target.value)}>
                {Object.entries(FEEDBACK_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Canal de ingreso">
              <Select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>
                {Object.entries(CHANNELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Cliente" required>
              <Input value={form.customer_name}
                onChange={e => setForm({ ...form, customer_name: e.target.value })} />
            </Field>
            <Field label="Contacto">
              <Input value={form.customer_contact}
                onChange={e => setForm({ ...form, customer_contact: e.target.value })}
                placeholder="Persona / email / teléfono" />
            </Field>
            <Field label="Fecha de recepción" required>
              <Input type="date" value={form.received_date}
                onChange={e => setForm({ ...form, received_date: e.target.value })} />
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Contenido">
          <Field label="Descripción de lo comunicado" required>
            <Textarea rows={3} value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Qué dijo el cliente, lo más textual posible." />
          </Field>
          <Row>
            <Field label="Severidad" hint="Alta o crítica debería escalar a no conformidad">
              <Select value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
                {Object.entries(SEVERITIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Estado">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.entries(FEEDBACK_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Responsable del seguimiento">
              <Input value={form.assigned_to}
                onChange={e => setForm({ ...form, assigned_to: e.target.value })} />
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Tratamiento y cierre">
          <Field label="Respuesta dada al cliente">
            <Textarea rows={2} value={form.response}
              onChange={e => setForm({ ...form, response: e.target.value })}
              placeholder="Qué se le comunicó y cuándo. Sin esto la queja queda 'abierta' en auditoría." />
          </Field>
          <Row>
            <Field label="Fecha de respuesta">
              <Input type="date" value={form.response_date}
                onChange={e => setForm({ ...form, response_date: e.target.value })} />
            </Field>
            <Field label="Fecha de cierre">
              <Input type="date" value={form.closed_date}
                onChange={e => setForm({ ...form, closed_date: e.target.value })} />
            </Field>
            <Field label="Conformidad del cliente" hint="1 a 5 — ¿quedó satisfecho con la respuesta?">
              <Select value={form.customer_satisfied}
                onChange={e => setForm({ ...form, customer_satisfied: e.target.value })}>
                <option value="">Sin evaluar</option>
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n}</option>)}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Causa raíz" hint="Obligatorio si escaló a no conformidad">
              <Textarea rows={2} value={form.root_cause}
                onChange={e => setForm({ ...form, root_cause: e.target.value })} />
            </Field>
            <Field label="Acción correctiva">
              <Textarea rows={2} value={form.corrective_action}
                onChange={e => setForm({ ...form, corrective_action: e.target.value })} />
            </Field>
          </Row>
          <Row>
            <Field label="Evidencia (URL)">
              <Input value={form.evidence_url}
                onChange={e => setForm({ ...form, evidence_url: e.target.value })}
                placeholder="Link al email, acta o documento de respaldo" />
            </Field>
            <Field label="Notas internas">
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Footer>
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {editing ? 'Guardar cambios' : 'Registrar'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}

function FeedbackRow({ row, isLast, canWrite, onEdit, onDelete }) {
  const type = FEEDBACK_TYPES[row.feedback_type] || FEEDBACK_TYPES.inquiry
  const status = FEEDBACK_STATUS[row.status] || FEEDBACK_STATUS.received
  const sev = SEVERITIES[row.severity] || SEVERITIES.medium
  const Icon = type.icon

  const daysOpen = row.status === 'closed' ? null
    : Math.floor((new Date() - new Date(row.received_date + 'T00:00:00')) / 86400000)
  const isOverdue = daysOpen !== null && daysOpen > 30

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px',
      borderBottom: isLast ? 'none' : `1px solid ${colors.border}`,
      borderLeft: isOverdue ? `3px solid ${colors.danger}` : '3px solid transparent',
    }}>
      <div style={{
        width: '34px', height: '34px', borderRadius: radius.lg, flexShrink: 0,
        background: colors.bgSubtle, color: colors.textMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {row.code && (
            <span style={{
              fontFamily: 'monospace', fontSize: font.sm, fontWeight: 700,
              color: colors.textMuted,
            }}>{row.code}</span>
          )}
          <strong style={{ color: colors.text, fontSize: font.base }}>{row.customer_name}</strong>
          <Badge variant={type.variant}>{type.label}</Badge>
          <Badge variant={status.variant}>{status.label}</Badge>
          {['high', 'critical'].includes(row.severity) && row.status !== 'closed' && (
            <Badge variant={sev.variant}>{sev.label}</Badge>
          )}
          {isOverdue && <Badge variant="danger">⏰ {daysOpen}d abierta</Badge>}
        </div>

        <div style={{
          fontSize: font.sm, color: colors.textMuted, marginTop: '4px',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}>
          {row.description}
        </div>

        <div style={{ fontSize: font.xs, color: colors.textFaint, marginTop: '4px' }}>
          {fmtDate(row.received_date)}
          {row.channel && ` · ${CHANNELS[row.channel] || row.channel}`}
          {row.assigned_to && ` · ${row.assigned_to}`}
          {row.closed_date && ` · cerrada ${fmtDate(row.closed_date)}`}
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
