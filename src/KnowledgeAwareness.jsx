// =============================================================================
// KnowledgeAwareness — dos cláusulas de "Apoyo" que suelen quedar sin cubrir:
//
//   · 7.1.6 Conocimientos de la organización → qué know-how necesitamos, quién
//     lo tiene y qué pasa si esa persona se va
//   · 7.3   Toma de conciencia → el personal entiende la política, los objetivos,
//     su contribución y qué implica no cumplir
//
// Van juntas porque comparten la misma pregunta de fondo: ¿el saber necesario
// para operar está en la organización, o solo en algunas cabezas?
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import {
  BookOpen, GraduationCap, Plus, AlertTriangle, CheckCircle2, Search,
  Trash2, Pencil, Brain, UserCheck, ShieldAlert, Users, CalendarClock,
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

const KNOWLEDGE_TYPES = {
  technical:      { label: 'Know-how técnico',    variant: 'primary' },
  regulatory:     { label: 'Normativa aplicable', variant: 'info' },
  customer:       { label: 'Conocimiento de cliente', variant: 'success' },
  supplier:       { label: 'Conocimiento de proveedor', variant: 'neutral' },
  lesson_learned: { label: 'Lección aprendida',   variant: 'warning' },
  best_practice:  { label: 'Buena práctica',      variant: 'success' },
  institutional:  { label: 'Institucional',       variant: 'neutral' },
}

const LOSS_RISKS = {
  low:      { label: 'Bajo',    variant: 'success' },
  medium:   { label: 'Medio',   variant: 'info' },
  high:     { label: 'Alto',    variant: 'warning' },
  critical: { label: 'Crítico', variant: 'danger' },
}

const KNOWLEDGE_STATUS = {
  active:      { label: 'Vigente',        variant: 'success' },
  in_transfer: { label: 'En transferencia', variant: 'warning' },
  obsolete:    { label: 'Obsoleto',       variant: 'neutral' },
}

const SESSION_TYPES = {
  induction:      { label: 'Inducción (ingreso)',      variant: 'primary' },
  annual_refresh: { label: 'Refuerzo anual',           variant: 'info' },
  policy_change:  { label: 'Cambio de política',       variant: 'warning' },
  post_nc:        { label: 'Post no conformidad',      variant: 'danger' },
  other:          { label: 'Otro',                     variant: 'neutral' },
}

// Los 4 puntos textuales que exige la cláusula 7.3. Van como checkboxes
// separados porque el auditor los verifica uno por uno.
const AWARENESS_POINTS = [
  { key: 'covered_policy',       label: 'La política de calidad' },
  { key: 'covered_objectives',   label: 'Los objetivos de calidad pertinentes a su función' },
  { key: 'covered_contribution', label: 'Su contribución a la eficacia del SGC' },
  { key: 'covered_implications', label: 'Las implicaciones de no cumplir los requisitos' },
]

const EMPTY_KNOWLEDGE = {
  title: '', description: '', knowledge_type: 'technical',
  source: 'internal', source_detail: '', used_in_process: '',
  knowledge_holder: '', loss_risk: 'medium', retention_method: '',
  backup_holder: '', availability: '', evidence_url: '',
  status: 'active', last_review_date: '', next_review_date: '', notes: '',
}

const EMPTY_AWARENESS = {
  person_id: '', person_name: '', person_position: '',
  session_date: new Date().toISOString().slice(0, 10),
  session_type: 'induction',
  covered_policy: false, covered_objectives: false,
  covered_contribution: false, covered_implications: false,
  comprehension_verified: false, verification_method: '', quiz_score: '',
  delivered_by: '', evidence_url: '', notes: '', next_refresh_date: '',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-EC', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// SHA-256 de la constancia. Igual que en los tokens de auditor: el hash queda
// como huella de que esa persona confirmó en esa fecha, y si alguien edita el
// registro después, el hash ya no corresponde.
async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

function awarenessComplete(r) {
  return AWARENESS_POINTS.every(p => r[p.key]) && r.comprehension_verified
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function KnowledgeAwareness() {
  const { org, role } = useOrg()
  const [tab, setTab] = useState('knowledge')

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        icon={<Brain size={28} color={colors.primary} />}
        title="Conocimiento y Conciencia"
        subtitle="Know-how crítico de la organización (7.1.6) y toma de conciencia del personal (7.3)"
      />

      <div style={{
        display: 'flex', gap: '4px', marginBottom: '16px',
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <TabBtn active={tab === 'knowledge'} onClick={() => setTab('knowledge')}
          icon={<BookOpen size={15} />} label="Conocimientos" clause="7.1.6" />
        <TabBtn active={tab === 'awareness'} onClick={() => setTab('awareness')}
          icon={<GraduationCap size={15} />} label="Toma de Conciencia" clause="7.3" />
      </div>

      {tab === 'knowledge'
        ? <KnowledgeTab orgId={org?.id} canWrite={can(role, 'organizational_knowledge', 'write')} />
        : <AwarenessTab orgId={org?.id} canWrite={can(role, 'awareness_records', 'write')} />}
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

// ─── TAB 1: Conocimientos de la organización (7.1.6) ────────────────────────

function KnowledgeTab({ orgId, canWrite }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterRisk, setFilterRisk] = useState('all')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_KNOWLEDGE)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!orgId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('organizational_knowledge')
      .select('*')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    if (error) toast.error(error.message)
    setRows(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [orgId])

  const kpis = useMemo(() => {
    const active = rows.filter(r => r.status === 'active')
    // El riesgo real: conocimiento crítico sin backup ni documentación.
    const unprotected = active.filter(r =>
      ['high', 'critical'].includes(r.loss_risk) &&
      !r.backup_holder?.trim() &&
      !r.retention_method?.trim()
    )
    return {
      total: active.length,
      critical: active.filter(r => r.loss_risk === 'critical').length,
      unprotected: unprotected.length,
      inTransfer: rows.filter(r => r.status === 'in_transfer').length,
    }
  }, [rows])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(r => {
      if (filterRisk !== 'all' && r.loss_risk !== filterRisk) return false
      if (q && !(
        (r.title || '').toLowerCase().includes(q) ||
        (r.knowledge_holder || '').toLowerCase().includes(q) ||
        (r.used_in_process || '').toLowerCase().includes(q)
      )) return false
      return true
    })
  }, [rows, search, filterRisk])

  const openNew = () => { setEditing(null); setForm(EMPTY_KNOWLEDGE); setModalOpen(true) }

  const openEdit = (r) => {
    setEditing(r)
    setForm({
      ...EMPTY_KNOWLEDGE, ...r,
      description: r.description || '', source_detail: r.source_detail || '',
      used_in_process: r.used_in_process || '', knowledge_holder: r.knowledge_holder || '',
      retention_method: r.retention_method || '', backup_holder: r.backup_holder || '',
      availability: r.availability || '', evidence_url: r.evidence_url || '',
      last_review_date: r.last_review_date || '', next_review_date: r.next_review_date || '',
      notes: r.notes || '',
    })
    setModalOpen(true)
  }

  const save = async () => {
    if (!form.title?.trim()) { toast.error('Poné un título al conocimiento'); return }
    setSaving(true)
    const payload = {
      title: form.title.trim(),
      description: form.description?.trim() || null,
      knowledge_type: form.knowledge_type,
      source: form.source,
      source_detail: form.source_detail?.trim() || null,
      used_in_process: form.used_in_process?.trim() || null,
      knowledge_holder: form.knowledge_holder?.trim() || null,
      loss_risk: form.loss_risk,
      retention_method: form.retention_method?.trim() || null,
      backup_holder: form.backup_holder?.trim() || null,
      availability: form.availability?.trim() || null,
      evidence_url: form.evidence_url?.trim() || null,
      status: form.status,
      last_review_date: form.last_review_date || null,
      next_review_date: form.next_review_date || null,
      notes: form.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const q = editing
      ? supabase.from('organizational_knowledge').update(payload).eq('id', editing.id)
      : supabase.from('organizational_knowledge').insert([{ ...payload, org_id: orgId }])
    const { error } = await q
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editing ? 'Conocimiento actualizado' : 'Conocimiento registrado')
    setModalOpen(false)
    load()
  }

  const remove = async (r) => {
    const ok = await confirm({
      title: 'Eliminar conocimiento',
      message: `¿Eliminar "${r.title}" del mapa de conocimientos?`,
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('organizational_knowledge').delete().eq('id', r.id)
    if (error) { toast.error(error.message); return }
    toast.success('Registro eliminado')
    load()
  }

  return (
    <div>
      <IsoInfoCard {...CLAUSE_GUIDES['7.1.6']} />

      <div style={{ marginTop: '14px', marginBottom: '16px' }}>
        <Grid min="180px" gap="10px">
          <Kpi label="Conocimientos" value={kpis.total} icon={<BookOpen size={14} />}
            color={colors.primary} subtitle="vigentes" />
          <Kpi label="Riesgo crítico" value={kpis.critical} icon={<ShieldAlert size={14} />}
            color={kpis.critical > 0 ? colors.danger : colors.success}
            subtitle="pérdida crítica" />
          <Kpi label="Sin respaldo" value={kpis.unprotected} icon={<AlertTriangle size={14} />}
            color={kpis.unprotected > 0 ? colors.danger : colors.success}
            subtitle="alto riesgo, sin backup" />
          <Kpi label="En transferencia" value={kpis.inTransfer} icon={<Users size={14} />}
            color={colors.info} />
        </Grid>
      </div>

      {kpis.unprotected > 0 && (
        <div style={{
          padding: '10px 12px', background: colors.dangerLight, color: colors.dangerText,
          borderRadius: radius.md, marginBottom: '14px', fontSize: font.sm,
          display: 'flex', gap: '8px', alignItems: 'flex-start',
        }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>
            <strong>{kpis.unprotected}</strong> conocimiento{kpis.unprotected === 1 ? '' : 's'} de
            alto riesgo sin persona de respaldo ni método de retención. Si esa persona sale de la
            organización mañana, el proceso queda sin soporte — es justo el riesgo que la cláusula
            7.1.6 busca prevenir.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={14} style={{
            position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)',
            color: colors.textGhost, pointerEvents: 'none',
          }} />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por título, responsable o proceso…"
            style={{ paddingLeft: '28px' }} />
        </div>
        <Select value={filterRisk} onChange={e => setFilterRisk(e.target.value)}
          style={{ width: 'auto', minWidth: '170px' }}>
          <option value="all">Todos los riesgos</option>
          {Object.entries(LOSS_RISKS).map(([k, v]) => (
            <option key={k} value={k}>Riesgo {v.label.toLowerCase()}</option>
          ))}
        </Select>
        {canWrite && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openNew}>
            Registrar conocimiento
          </Button>
        )}
      </div>

      {loading ? <Spinner label="Cargando…" />
        : filtered.length === 0 ? (
          <EmptyState
            icon={<BookOpen size={32} color={colors.textGhost} />}
            title={rows.length === 0 ? 'Sin conocimientos mapeados' : 'Sin resultados'}
            subtitle={rows.length === 0
              ? 'Empezá por lo que solo sabe una persona: procedimientos no escritos, particularidades de clientes clave, criterios de aceptación que se transmiten de boca en boca.'
              : 'Probá limpiando los filtros.'}
          />
        ) : (
          <div style={{
            background: 'white', border: `1px solid ${colors.border}`,
            borderRadius: radius.xl, overflow: 'hidden',
          }}>
            {filtered.map((r, i) => (
              <KnowledgeRow key={r.id} row={r} isLast={i === filtered.length - 1}
                canWrite={canWrite} onEdit={() => openEdit(r)} onDelete={() => remove(r)} />
            ))}
          </div>
        )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? 'Editar conocimiento' : 'Registrar conocimiento crítico'} maxWidth="760px">
        <Modal.Section title="Qué conocimiento es">
          <Field label="Título" required>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Ej. Criterios de aceptación en inspección de soldadura API 1104" />
          </Field>
          <Field label="Descripción">
            <Textarea rows={2} value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="En qué consiste y por qué es necesario para operar." />
          </Field>
          <Row>
            <Field label="Tipo">
              <Select value={form.knowledge_type}
                onChange={e => setForm({ ...form, knowledge_type: e.target.value })}>
                {Object.entries(KNOWLEDGE_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Fuente" hint="La norma pide distinguir interna de externa">
              <Select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
                <option value="internal">Interna (experiencia propia)</option>
                <option value="external">Externa (norma, curso, consultor)</option>
              </Select>
            </Field>
            <Field label="Detalle de la fuente">
              <Input value={form.source_detail}
                onChange={e => setForm({ ...form, source_detail: e.target.value })}
                placeholder="Ej. API 1104 ed. 2021 / curso ASNT" />
            </Field>
          </Row>
          <Field label="Proceso donde se aplica">
            <Input value={form.used_in_process}
              onChange={e => setForm({ ...form, used_in_process: e.target.value })} />
          </Field>
        </Modal.Section>

        <Modal.Section title="Quién lo tiene y qué pasa si se va">
          <Row>
            <Field label="Quién lo posee hoy" hint="La persona que realmente sabe hacerlo">
              <Input value={form.knowledge_holder}
                onChange={e => setForm({ ...form, knowledge_holder: e.target.value })} />
            </Field>
            <Field label="Riesgo de pérdida" hint="Alto si es una sola persona sin documentar">
              <Select value={form.loss_risk} onChange={e => setForm({ ...form, loss_risk: e.target.value })}>
                {Object.entries(LOSS_RISKS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Persona de respaldo">
              <Input value={form.backup_holder}
                onChange={e => setForm({ ...form, backup_holder: e.target.value })}
                placeholder="Quién más podría hacerlo" />
            </Field>
          </Row>
          <Row>
            <Field label="Método de retención" hint="Cómo evitás que se pierda">
              <Input value={form.retention_method}
                onChange={e => setForm({ ...form, retention_method: e.target.value })}
                placeholder="Ej. Procedimiento PR-08 + formación de 2 técnicos" />
            </Field>
            <Field label="Disponibilidad" hint="Cómo accede quien lo necesita">
              <Input value={form.availability}
                onChange={e => setForm({ ...form, availability: e.target.value })}
                placeholder="Ej. Intranet / carpeta compartida / capacitación anual" />
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Estado y revisión">
          <Row>
            <Field label="Estado">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.entries(KNOWLEDGE_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Última revisión">
              <Input type="date" value={form.last_review_date}
                onChange={e => setForm({ ...form, last_review_date: e.target.value })} />
            </Field>
            <Field label="Próxima revisión">
              <Input type="date" value={form.next_review_date}
                onChange={e => setForm({ ...form, next_review_date: e.target.value })} />
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
            {editing ? 'Guardar cambios' : 'Registrar'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}

function KnowledgeRow({ row, isLast, canWrite, onEdit, onDelete }) {
  const type = KNOWLEDGE_TYPES[row.knowledge_type] || KNOWLEDGE_TYPES.technical
  const risk = LOSS_RISKS[row.loss_risk] || LOSS_RISKS.medium
  const st = KNOWLEDGE_STATUS[row.status] || KNOWLEDGE_STATUS.active
  const unprotected = ['high', 'critical'].includes(row.loss_risk)
    && !row.backup_holder?.trim() && !row.retention_method?.trim()

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px',
      borderBottom: isLast ? 'none' : `1px solid ${colors.border}`,
      borderLeft: unprotected ? `3px solid ${colors.danger}` : '3px solid transparent',
      opacity: row.status === 'obsolete' ? 0.6 : 1,
    }}>
      <div style={{
        width: '34px', height: '34px', borderRadius: radius.lg, flexShrink: 0,
        background: colors.bgSubtle, color: colors.textMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <BookOpen size={16} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <strong style={{ color: colors.text, fontSize: font.base }}>{row.title}</strong>
          <Badge variant={type.variant}>{type.label}</Badge>
          <Badge variant={risk.variant}>Riesgo {risk.label.toLowerCase()}</Badge>
          {row.status !== 'active' && <Badge variant={st.variant}>{st.label}</Badge>}
          {unprotected && <Badge variant="danger">sin respaldo</Badge>}
        </div>
        {row.description && (
          <div style={{
            fontSize: font.sm, color: colors.textMuted, marginTop: '3px',
            display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          }}>
            {row.description}
          </div>
        )}
        <div style={{ fontSize: font.xs, color: colors.textFaint, marginTop: '4px' }}>
          {row.knowledge_holder && `Lo tiene: ${row.knowledge_holder}`}
          {row.backup_holder && ` · Respaldo: ${row.backup_holder}`}
          {row.used_in_process && ` · ${row.used_in_process}`}
          {row.source === 'external' && row.source_detail && ` · Fuente: ${row.source_detail}`}
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

// ─── TAB 2: Toma de conciencia (7.3) ────────────────────────────────────────

function AwarenessTab({ orgId, canWrite }) {
  const [rows, setRows] = useState([])
  const [people, setPeople] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_AWARENESS)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    if (!orgId) return
    setLoading(true)
    const [{ data: recs, error }, { data: staff }] = await Promise.all([
      supabase.from('awareness_records').select('*')
        .eq('org_id', orgId).order('session_date', { ascending: false }),
      // El listado de personal es opcional: si la tabla no está poblada el
      // usuario igual puede tipear el nombre a mano.
      // personnel no tiene columna de cargo — el puesto vive en
      // job_descriptions y se enlaza por job_id, así que lo traemos anidado.
      supabase.from('personnel')
        .select('id, full_name, job:job_id (title)')
        .eq('org_id', orgId).order('full_name'),
    ])
    if (error) toast.error(error.message)
    setRows(recs || [])
    setPeople(staff || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [orgId])

  const kpis = useMemo(() => {
    // Una persona está "cubierta" si tiene al menos un registro completo.
    const byPerson = new Map()
    for (const r of rows) {
      const key = r.person_id || r.person_name?.toLowerCase()
      if (!key) continue
      const prev = byPerson.get(key)
      if (!prev || new Date(r.session_date) > new Date(prev.session_date)) {
        byPerson.set(key, r)
      }
    }
    const latest = [...byPerson.values()]
    const complete = latest.filter(awarenessComplete)
    const pendingRefresh = latest.filter(r =>
      r.next_refresh_date && new Date(r.next_refresh_date + 'T00:00:00') < new Date())

    return {
      sessions: rows.length,
      peopleCovered: complete.length,
      peopleTotal: people.length || byPerson.size,
      incomplete: latest.length - complete.length,
      refreshDue: pendingRefresh.length,
    }
  }, [rows, people])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      (r.person_name || '').toLowerCase().includes(q) ||
      (r.person_position || '').toLowerCase().includes(q) ||
      (r.delivered_by || '').toLowerCase().includes(q))
  }, [rows, search])

  const openNew = () => { setEditing(null); setForm(EMPTY_AWARENESS); setModalOpen(true) }

  const openEdit = (r) => {
    setEditing(r)
    setForm({
      ...EMPTY_AWARENESS, ...r,
      person_id: r.person_id || '', person_position: r.person_position || '',
      verification_method: r.verification_method || '', quiz_score: r.quiz_score ?? '',
      delivered_by: r.delivered_by || '', evidence_url: r.evidence_url || '',
      notes: r.notes || '', next_refresh_date: r.next_refresh_date || '',
    })
    setModalOpen(true)
  }

  // Al elegir a alguien del listado de personal, autocompletamos nombre y cargo.
  const pickPerson = (id) => {
    const p = people.find(x => x.id === id)
    setForm(f => ({
      ...f,
      person_id: id || '',
      person_name: p ? p.full_name : f.person_name,
      // El cargo viene del perfil de puesto enlazado; si la persona no tiene
      // job_id asignado, dejamos lo que el usuario haya escrito.
      person_position: p ? (p.job?.title || f.person_position) : f.person_position,
    }))
  }

  const save = async () => {
    if (!form.person_name?.trim()) { toast.error('Indicá de quién es el registro'); return }
    setSaving(true)

    // Constancia: si están los 4 puntos cubiertos y verificada la comprensión,
    // sellamos el registro con fecha y hash. Es el equivalente digital de la
    // firma en el acta de inducción.
    let acknowledged_at = editing?.acknowledged_at || null
    let acknowledgment_hash = editing?.acknowledgment_hash || null
    const complete = AWARENESS_POINTS.every(p => form[p.key]) && form.comprehension_verified
    if (complete && !acknowledged_at) {
      acknowledged_at = new Date().toISOString()
      acknowledgment_hash = await sha256Hex(
        [form.person_name.trim(), form.session_date, form.session_type, acknowledged_at].join('|')
      )
    }

    const payload = {
      person_id: form.person_id || null,
      person_name: form.person_name.trim(),
      person_position: form.person_position?.trim() || null,
      session_date: form.session_date,
      session_type: form.session_type,
      covered_policy: !!form.covered_policy,
      covered_objectives: !!form.covered_objectives,
      covered_contribution: !!form.covered_contribution,
      covered_implications: !!form.covered_implications,
      comprehension_verified: !!form.comprehension_verified,
      verification_method: form.verification_method?.trim() || null,
      quiz_score: form.quiz_score === '' ? null : Number(form.quiz_score),
      delivered_by: form.delivered_by?.trim() || null,
      acknowledged_at,
      acknowledgment_hash,
      evidence_url: form.evidence_url?.trim() || null,
      notes: form.notes?.trim() || null,
      next_refresh_date: form.next_refresh_date || null,
      updated_at: new Date().toISOString(),
    }
    const q = editing
      ? supabase.from('awareness_records').update(payload).eq('id', editing.id)
      : supabase.from('awareness_records').insert([{ ...payload, org_id: orgId }])
    const { error } = await q
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editing ? 'Registro actualizado' : 'Toma de conciencia registrada')
    setModalOpen(false)
    load()
  }

  const remove = async (r) => {
    const ok = await confirm({
      title: 'Eliminar registro',
      message: `¿Eliminar el registro de ${r.person_name}? Es evidencia de cumplimiento de 7.3.`,
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('awareness_records').delete().eq('id', r.id)
    if (error) { toast.error(error.message); return }
    toast.success('Registro eliminado')
    load()
  }

  const coverage = kpis.peopleTotal > 0
    ? Math.round((kpis.peopleCovered / kpis.peopleTotal) * 100) : 0

  return (
    <div>
      <IsoInfoCard {...CLAUSE_GUIDES['7.3']} />

      <div style={{ marginTop: '14px', marginBottom: '16px' }}>
        <Grid min="180px" gap="10px">
          <Kpi label="Sesiones" value={kpis.sessions} icon={<GraduationCap size={14} />}
            color={colors.primary} subtitle="registradas" />
          <Kpi label="Cobertura" value={`${coverage}%`} icon={<UserCheck size={14} />}
            color={coverage >= 90 ? colors.success : coverage >= 60 ? colors.warning : colors.danger}
            subtitle={`${kpis.peopleCovered} de ${kpis.peopleTotal} personas`} />
          <Kpi label="Incompletos" value={kpis.incomplete} icon={<AlertTriangle size={14} />}
            color={kpis.incomplete > 0 ? colors.warning : colors.success}
            subtitle="faltan puntos o verificación" />
          <Kpi label="Refuerzo vencido" value={kpis.refreshDue} icon={<CalendarClock size={14} />}
            color={kpis.refreshDue > 0 ? colors.warning : colors.success} />
        </Grid>
      </div>

      {coverage < 100 && kpis.peopleTotal > 0 && (
        <div style={{
          padding: '10px 12px', background: colors.warningLight, color: colors.warningText,
          borderRadius: radius.md, marginBottom: '14px', fontSize: font.sm,
          display: 'flex', gap: '8px', alignItems: 'flex-start',
        }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>
            Cobertura del <strong>{coverage}%</strong>. El auditor entrevista personal al azar:
            alcanza con que una sola persona no sepa la política para abrir un hallazgo, aunque
            el resto esté al día.
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={14} style={{
            position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)',
            color: colors.textGhost, pointerEvents: 'none',
          }} />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por persona, cargo o instructor…"
            style={{ paddingLeft: '28px' }} />
        </div>
        {canWrite && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openNew}>
            Registrar sesión
          </Button>
        )}
      </div>

      {loading ? <Spinner label="Cargando registros…" />
        : filtered.length === 0 ? (
          <EmptyState
            icon={<GraduationCap size={32} color={colors.textGhost} />}
            title={rows.length === 0 ? 'Sin registros de toma de conciencia' : 'Sin resultados'}
            subtitle={rows.length === 0
              ? 'Registrá acá cada inducción o refuerzo donde cubriste política, objetivos, contribución e implicaciones con una persona.'
              : 'Probá con otro término.'}
          />
        ) : (
          <div style={{
            background: 'white', border: `1px solid ${colors.border}`,
            borderRadius: radius.xl, overflow: 'hidden',
          }}>
            {filtered.map((r, i) => (
              <AwarenessRow key={r.id} row={r} isLast={i === filtered.length - 1}
                canWrite={canWrite} onEdit={() => openEdit(r)} onDelete={() => remove(r)} />
            ))}
          </div>
        )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editing ? `Editar registro · ${form.person_name}` : 'Registrar toma de conciencia'}
        maxWidth="720px">
        <Modal.Section title="Persona y sesión">
          <Row>
            {people.length > 0 && (
              <Field label="Elegir del personal" hint="O escribí el nombre abajo">
                <Select value={form.person_id} onChange={e => pickPerson(e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {people.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name}</option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Nombre" required>
              <Input value={form.person_name}
                onChange={e => setForm({ ...form, person_name: e.target.value })} />
            </Field>
            <Field label="Cargo">
              <Input value={form.person_position}
                onChange={e => setForm({ ...form, person_position: e.target.value })} />
            </Field>
          </Row>
          <Row>
            <Field label="Fecha de la sesión" required>
              <Input type="date" value={form.session_date}
                onChange={e => setForm({ ...form, session_date: e.target.value })} />
            </Field>
            <Field label="Tipo de sesión">
              <Select value={form.session_type}
                onChange={e => setForm({ ...form, session_type: e.target.value })}>
                {Object.entries(SESSION_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Impartida por">
              <Input value={form.delivered_by}
                onChange={e => setForm({ ...form, delivered_by: e.target.value })} />
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Puntos cubiertos (los 4 que exige la cláusula 7.3)">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
            {AWARENESS_POINTS.map(p => (
              <label key={p.key} style={{
                display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer',
                padding: '8px 10px', borderRadius: radius.md,
                background: form[p.key] ? colors.successLight : colors.bgSubtle,
                border: `1px solid ${form[p.key] ? colors.success : colors.border}`,
                transition: 'all 0.12s',
              }}>
                <input type="checkbox" checked={!!form[p.key]}
                  onChange={e => setForm({ ...form, [p.key]: e.target.checked })} />
                <span style={{
                  fontSize: font.base,
                  color: form[p.key] ? colors.successText : colors.textMuted,
                  fontWeight: form[p.key] ? 600 : 400,
                }}>
                  {p.label}
                </span>
              </label>
            ))}
          </div>
        </Modal.Section>

        <Modal.Section title="Verificación de comprensión">
          <div style={{ fontSize: font.sm, color: colors.textMuted, marginBottom: '8px' }}>
            Asistir no es lo mismo que entender. La norma espera que verifiques que la persona
            realmente comprendió — y el auditor lo va a corroborar entrevistándola.
          </div>
          <label style={{
            display: 'flex', alignItems: 'center', gap: '9px', cursor: 'pointer',
            padding: '8px 10px', borderRadius: radius.md, marginBottom: '8px',
            background: form.comprehension_verified ? colors.successLight : colors.bgSubtle,
            border: `1px solid ${form.comprehension_verified ? colors.success : colors.border}`,
          }}>
            <input type="checkbox" checked={!!form.comprehension_verified}
              onChange={e => setForm({ ...form, comprehension_verified: e.target.checked })} />
            <span style={{
              fontSize: font.base, fontWeight: form.comprehension_verified ? 600 : 400,
              color: form.comprehension_verified ? colors.successText : colors.textMuted,
            }}>
              Comprensión verificada
            </span>
          </label>
          <Row>
            <Field label="Método de verificación">
              <Select value={form.verification_method}
                onChange={e => setForm({ ...form, verification_method: e.target.value })}>
                <option value="">— Seleccionar —</option>
                <option value="entrevista">Entrevista</option>
                <option value="cuestionario">Cuestionario escrito</option>
                <option value="observacion">Observación en el puesto</option>
                <option value="otro">Otro</option>
              </Select>
            </Field>
            <Field label="Puntaje del cuestionario (0-100)">
              <Input type="number" min="0" max="100" value={form.quiz_score}
                onChange={e => setForm({ ...form, quiz_score: e.target.value })} />
            </Field>
            <Field label="Próximo refuerzo">
              <Input type="date" value={form.next_refresh_date}
                onChange={e => setForm({ ...form, next_refresh_date: e.target.value })} />
            </Field>
          </Row>
          {editing?.acknowledged_at && (
            <div style={{
              fontSize: font.sm, color: colors.successText, background: colors.successLight,
              padding: '8px 10px', borderRadius: radius.md, marginTop: '6px',
              display: 'flex', gap: '7px', alignItems: 'center',
            }}>
              <CheckCircle2 size={15} />
              Constancia sellada el {new Date(editing.acknowledged_at).toLocaleString('es-EC')}
              {editing.acknowledgment_hash && (
                <span style={{ fontFamily: 'monospace', fontSize: font.xs, opacity: 0.75 }}>
                  · {editing.acknowledgment_hash.slice(0, 12)}…
                </span>
              )}
            </div>
          )}
        </Modal.Section>

        <Modal.Section title="Respaldo">
          <Row>
            <Field label="Evidencia (URL)" hint="Acta firmada escaneada, si la tenés">
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
            {editing ? 'Guardar cambios' : 'Registrar'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}

function AwarenessRow({ row, isLast, canWrite, onEdit, onDelete }) {
  const type = SESSION_TYPES[row.session_type] || SESSION_TYPES.other
  const complete = awarenessComplete(row)
  const covered = AWARENESS_POINTS.filter(p => row[p.key]).length

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
      borderBottom: isLast ? 'none' : `1px solid ${colors.border}`,
      borderLeft: complete ? `3px solid ${colors.success}` : `3px solid ${colors.warning}`,
    }}>
      <div style={{
        width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
        background: complete ? colors.successLight : colors.warningLight,
        color: complete ? colors.successText : colors.warningText,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {complete ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <strong style={{ color: colors.text, fontSize: font.base }}>{row.person_name}</strong>
          {row.person_position && (
            <span style={{ fontSize: font.sm, color: colors.textFaint }}>· {row.person_position}</span>
          )}
          <Badge variant={type.variant}>{type.label}</Badge>
          <Badge variant={complete ? 'success' : 'warning'}>
            {covered}/4 puntos{row.comprehension_verified ? ' · verificado' : ''}
          </Badge>
          {row.acknowledged_at && <Badge variant="success">constancia sellada</Badge>}
        </div>
        <div style={{ fontSize: font.xs, color: colors.textFaint, marginTop: '4px' }}>
          {fmtDate(row.session_date)}
          {row.delivered_by && ` · impartida por ${row.delivered_by}`}
          {row.quiz_score != null && ` · puntaje ${row.quiz_score}/100`}
          {row.next_refresh_date && ` · refuerzo ${fmtDate(row.next_refresh_date)}`}
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
