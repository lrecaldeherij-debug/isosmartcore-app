// =============================================================================
// Impartiality — ISO/IEC 17020, fase 4: imparcialidad, quejas y apelaciones
//
// Tres pestañas:
//   1. Riesgos (4.1.3–4.1.6) — amenazas a la imparcialidad, con su nivel y la
//      salvaguarda aplicada. Un riesgo alto no se da por tratado sin decir con
//      qué se lo trató: lo impide la base de datos.
//   2. Compromisos (4.1.7 / 4.2) — la declaración firmada de cada persona, con
//      los conflictos que declara y cómo se manejan.
//   3. Quejas y apelaciones — con la regla que el evaluador va a leer nombre
//      por nombre: quien investiga y quien decide no pueden haber participado
//      en la inspección cuestionada.
//
// El nivel de riesgo usa el mismo criterio que la matriz del SGC (P × I sobre
// 10), así que un riesgo a la imparcialidad se lee igual que cualquier otro.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import {
  Scale, Plus, Pencil, Trash2, Search, AlertTriangle, CheckCircle2, UserX,
  MessageSquareWarning, FileSignature, ShieldAlert, Gavel,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import { can } from './lib/roles'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'
import { riskLevel, RISK_LEGEND } from './lib/riskLevel'
import {
  Button, Modal, Field, Row, Input, Select, Textarea, Badge, Kpi,
  EmptyState, Spinner, Grid, PageHeader, colors, radius, font,
} from './components/ui'

// ─── Catálogos ───────────────────────────────────────────────────────────────

const RISK_SOURCES = [
  'Propiedad', 'Gobernanza', 'Gestión', 'Personal', 'Recursos compartidos',
  'Finanzas', 'Contratos', 'Marketing y ventas', 'Comisiones o incentivos',
  'Actividades relacionadas', 'Relación con el cliente', 'Familiaridad',
  'Intimidación', 'Otro',
]
const RISK_STATUS = {
  'Identificado': 'warning', 'En tratamiento': 'info', 'Tratado': 'success',
  'Aceptado': 'neutral', 'Cerrado': 'neutral',
}
const COMPLAINT_STATUS = {
  'Recibida': 'warning', 'En análisis': 'info', 'En investigación': 'info',
  'Resuelta': 'success', 'Cerrada': 'success', 'Rechazada': 'neutral',
}
const OUTCOMES = ['Procedente', 'Parcialmente procedente', 'No procedente', 'Desistida']
const CLAIMANT_TYPES = ['Cliente', 'Dueño del activo', 'Autoridad', 'Personal propio', 'Otro']

// Amenazas típicas de un organismo tipo no A, para arrancar sin hoja en blanco
const RISK_HINTS = [
  'Inspeccionar un ítem que la empresa fabricó, reparó o mantuvo',
  'El mismo comercial vende el servicio de inspección y el de reparación',
  'Bonos o comisiones ligados a la cantidad de ítems aprobados',
  'Un inspector con parentesco o empleo previo en el cliente',
  'Presión del cliente para cambiar un dictamen ya emitido',
  'Depender de un solo cliente para la mayor parte de la facturación',
]

const EMPTY_RISK = {
  source: 'Actividades relacionadas', description: '', scope_id: '', person_id: '',
  client_name: '', probability: 5, impact: 5, safeguards: '', responsible: '',
  evidence: '', status: 'Identificado', acceptance_note: '', reviewed_at: '',
  next_review: '', notes: '',
}

const EMPTY_COMMITMENT = {
  person_id: '', signed_at: new Date().toISOString().slice(0, 10), valid_until: '',
  covers_impartiality: true, covers_confidentiality: true, free_of_pressure: true,
  declared_conflicts: '', conflict_treatment: '', document_url: '', notes: '',
}

const EMPTY_COMPLAINT = {
  code: '', kind: 'Queja', report_id: '', inspection_id: '',
  received_at: new Date().toISOString().slice(0, 10), channel: '', claimant_name: '',
  claimant_contact: '', claimant_type: 'Cliente', description: '',
  acknowledged_at: '', admissible: true, admissibility_note: '',
  handler_person_id: '', investigation: '', root_cause: '', decision: '',
  decision_by_person_id: '', decision_at: '', outcome: '', report_amended: false,
  notified_at: '', status: 'Recibida', notes: '',
}

const NULLABLE = [
  'scope_id', 'person_id', 'report_id', 'inspection_id', 'handler_person_id',
  'decision_by_person_id', 'reviewed_at', 'next_review', 'valid_until',
  'acknowledged_at', 'decision_at', 'notified_at', 'outcome',
]

function clean(form, orgId) {
  const payload = { ...form, org_id: orgId }
  NULLABLE.forEach(k => { if (k in payload && !payload[k]) payload[k] = null })
  return payload
}

const nameOf = (list, id) => list.find(p => p.id === id)?.full_name || ''

// ─── Componente ──────────────────────────────────────────────────────────────

export default function Impartiality() {
  const { org, role } = useOrg()
  const canWrite = can(role, 'impartiality_risks', 'write')
  const canDelete = can(role, 'impartiality_risks', 'delete')

  const [tab, setTab] = useState('risks')
  const [risks, setRisks] = useState([])
  const [commitments, setCommitments] = useState([])
  const [complaints, setComplaints] = useState([])
  const [personnel, setPersonnel] = useState([])
  const [scopes, setScopes] = useState([])
  const [reports, setReports] = useState([])
  const [inspections, setInspections] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [ri, co, qu, per, sc, rep, ins] = await Promise.all([
      supabase.from('impartiality_risks').select('*').eq('org_id', org.id).order('created_at', { ascending: false }),
      supabase.from('impartiality_commitments').select('*').eq('org_id', org.id).order('signed_at', { ascending: false }),
      supabase.from('inspection_complaints').select('*').eq('org_id', org.id).order('received_at', { ascending: false }),
      supabase.from('personnel').select('id, full_name, job_title').eq('org_id', org.id).order('full_name'),
      supabase.from('inspection_scopes').select('id, activity').eq('org_id', org.id).order('activity'),
      supabase.from('inspection_reports').select('id, report_number, revision, inspection_id, signed_by_person_id')
        .eq('org_id', org.id).order('created_at', { ascending: false }),
      supabase.from('inspections').select('id, code, lead_inspector_id, client_name').eq('org_id', org.id),
    ])
    const err = ri.error || co.error || qu.error
    if (err) {
      toast.error(/impartiality_|inspection_complaints/i.test(err.message)
        ? 'Falta aplicar la migración de imparcialidad y quejas (fase 4).'
        : 'No se pudo cargar: ' + err.message)
    }
    setRisks(ri.data || [])
    setCommitments(co.data || [])
    setComplaints(qu.data || [])
    setPersonnel(per.data || [])
    setScopes(sc.data || [])
    setReports(rep.data || [])
    setInspections(ins.data || [])
    setLoading(false)
  }

  useEffect(() => { if (org?.id) load() }, [org?.id])

  if (loading) return <Spinner label="Cargando imparcialidad, quejas y apelaciones…" />

  const TABS = [
    { id: 'risks', label: 'Riesgos a la imparcialidad', clause: '4.1', icon: ShieldAlert, n: risks.length },
    { id: 'commitments', label: 'Compromisos del personal', clause: '4.1.7', icon: FileSignature, n: commitments.length },
    { id: 'complaints', label: 'Quejas y apelaciones', clause: '7.5', icon: MessageSquareWarning, n: complaints.length },
  ]

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        icon={<Scale size={28} color={colors.primary} />}
        title="Imparcialidad, quejas y apelaciones"
        subtitle="ISO/IEC 17020: amenazas a la imparcialidad, compromiso del personal y reclamos con revisión independiente"
      />

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '18px' }}>
        {TABS.map(t => (
          <button key={t.id} type="button" onClick={() => setTab(t.id)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '7px',
              padding: '8px 14px', borderRadius: radius.lg, cursor: 'pointer',
              border: `1px solid ${tab === t.id ? colors.primary : colors.border}`,
              background: tab === t.id ? colors.primary : 'white',
              color: tab === t.id ? 'white' : colors.text, fontWeight: 600, fontSize: font.md,
            }}>
            <t.icon size={15} /> {t.label}
            <span style={{ fontFamily: 'monospace', fontSize: font.xs, opacity: 0.75 }}>{t.clause}</span>
            <span style={{
              fontSize: font.xs, padding: '0 6px', borderRadius: '999px',
              background: tab === t.id ? 'rgba(255,255,255,0.25)' : colors.bgSubtle,
            }}>{t.n}</span>
          </button>
        ))}
      </div>

      {tab === 'risks' && (
        <RisksTab risks={risks} scopes={scopes} personnel={personnel} canWrite={canWrite}
          canDelete={canDelete} orgId={org.id} onChanged={load} />
      )}
      {tab === 'commitments' && (
        <CommitmentsTab commitments={commitments} personnel={personnel} canWrite={canWrite}
          canDelete={canDelete} orgId={org.id} onChanged={load} />
      )}
      {tab === 'complaints' && (
        <ComplaintsTab complaints={complaints} reports={reports} inspections={inspections}
          personnel={personnel} canWrite={canWrite} canDelete={canDelete} orgId={org.id} onChanged={load} />
      )}
    </div>
  )
}

// ─── Pestaña 1: riesgos a la imparcialidad ───────────────────────────────────

function RisksTab({ risks, scopes, personnel, canWrite, canDelete, orgId, onChanged }) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_RISK)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const score = (r) => (Number(r.probability) || 0) * (Number(r.impact) || 0)

  const kpis = useMemo(() => ({
    total: risks.length,
    altos: risks.filter(r => score(r) >= 36).length,
    sinSalvaguarda: risks.filter(r => score(r) >= 36 && !r.safeguards).length,
    tratados: risks.filter(r => ['Tratado', 'Cerrado'].includes(r.status)).length,
  }), [risks])

  const filtered = useMemo(() => risks.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return [r.description, r.source, r.client_name, r.safeguards, r.responsible]
      .filter(Boolean).join(' ').toLowerCase().includes(q)
  }), [risks, search])

  const openNew = (hint) => {
    setForm({ ...EMPTY_RISK, description: hint || '' })
    setEditing(null); setModal(true)
  }
  const openEdit = (r) => {
    setForm({ ...EMPTY_RISK, ...Object.fromEntries(
      Object.keys(EMPTY_RISK).map(k => [k, r[k] ?? EMPTY_RISK[k]])) })
    setEditing(r); setModal(true)
  }

  const save = async () => {
    if (!form.description.trim()) return toast.warning('Describí la amenaza a la imparcialidad')
    setSaving(true)
    const payload = clean(form, orgId)
    const { error } = editing
      ? await supabase.from('impartiality_risks').update(payload).eq('id', editing.id)
      : await supabase.from('impartiality_risks').insert([payload])
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(editing ? 'Riesgo actualizado' : 'Riesgo registrado')
    setModal(false); onChanged()
  }

  const remove = async (r) => {
    const ok = await confirm('¿Eliminar este riesgo a la imparcialidad?',
      { title: 'Eliminar', tone: 'danger', confirmText: 'Eliminar' })
    if (!ok) return
    const { error } = await supabase.from('impartiality_risks').delete().eq('id', r.id)
    if (error) return toast.error(error.message)
    toast.success('Riesgo eliminado'); onChanged()
  }

  const nivel = riskLevel(Number(form.probability) * Number(form.impact))

  return (
    <>
      <Grid min="170px" gap="10px">
        <Kpi label="Amenazas identificadas" value={kpis.total} icon={<ShieldAlert size={14} />} color={colors.primary} />
        <Kpi label="Altas o críticas" value={kpis.altos} icon={<AlertTriangle size={14} />}
          color={kpis.altos > 0 ? colors.danger : colors.success} />
        <Kpi label="Sin salvaguarda" value={kpis.sinSalvaguarda} icon={<UserX size={14} />}
          color={kpis.sinSalvaguarda > 0 ? colors.danger : colors.success} subtitle="altas sin tratamiento" />
        <Kpi label="Tratadas" value={kpis.tratados} icon={<CheckCircle2 size={14} />} color={colors.success} />
      </Grid>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', margin: '16px 0 12px' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: colors.textGhost }} />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por amenaza, origen o salvaguarda…" style={{ paddingLeft: '30px' }} />
        </div>
        {canWrite && <Button variant="primary" icon={<Plus size={16} />} onClick={() => openNew()}>Nueva amenaza</Button>}
      </div>

      {risks.length === 0 && (
        <div style={{
          background: colors.bgMuted, border: `1px solid ${colors.border}`,
          borderRadius: radius.xl, padding: '16px', marginBottom: '12px',
        }}>
          <p style={{ margin: '0 0 10px', fontSize: font.sm, color: colors.textMuted }}>
            Amenazas habituales en un organismo que también fabrica o repara. Hacé clic para cargarla y ajustarla:
          </p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {RISK_HINTS.map(h => (
              <button key={h} type="button" onClick={() => canWrite && openNew(h)}
                style={{
                  border: `1px solid ${colors.border}`, background: 'white', cursor: canWrite ? 'pointer' : 'default',
                  borderRadius: radius.pill, padding: '6px 12px', fontSize: font.sm, color: colors.text,
                }}>{h}</button>
            ))}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={<ShieldAlert size={32} color={colors.textGhost} />}
          title={risks.length ? 'Sin resultados' : 'Todavía no registraste amenazas'}
          subtitle="La norma pide identificarlas de forma continua, no una sola vez: cada cliente nuevo y cada contrato pueden traer una." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(r => {
            const lvl = riskLevel(score(r))
            const falta = score(r) >= 36 && !r.safeguards
            return (
              <div key={r.id} style={{
                background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl,
                padding: '12px 14px', borderLeft: `4px solid ${lvl.color}`,
              }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Badge variant="neutral">{r.source}</Badge>
                      <Badge variant={RISK_STATUS[r.status] || 'neutral'}>{r.status}</Badge>
                      <span style={{
                        fontSize: font.xs, fontWeight: 700, color: 'white', background: lvl.color,
                        borderRadius: radius.pill, padding: '2px 10px',
                      }}>{lvl.label} · {score(r)}</span>
                    </div>
                    <div style={{ fontSize: font.md, color: colors.text, marginTop: '5px', fontWeight: 600 }}>
                      {r.description}
                    </div>
                    {r.safeguards && (
                      <div style={{ fontSize: font.sm, color: colors.textMuted, marginTop: '3px' }}>
                        <strong>Salvaguarda:</strong> {r.safeguards}
                        {r.responsible && ` · ${r.responsible}`}
                      </div>
                    )}
                    {falta && (
                      <div style={{
                        marginTop: '8px', padding: '6px 8px', background: colors.dangerLight,
                        color: colors.dangerText, borderRadius: radius.md, fontSize: font.xs,
                      }}>
                        Riesgo alto sin salvaguarda declarada: no se puede dar por tratado así.
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {canWrite && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => openEdit(r)}>Editar</Button>}
                    {canDelete && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(r)} />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} maxWidth="820px"
        title={editing ? 'Editar amenaza a la imparcialidad' : 'Nueva amenaza a la imparcialidad'}>
        <Modal.Section title="La amenaza (4.1.3)">
          <Row>
            <Field label="Origen">
              <Select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
                {RISK_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Estado">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.keys(RISK_STATUS).map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </Row>
          <Field label="Descripción" required hint="Qué relación o situación puede sesgar un dictamen">
            <Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Row>
            <Field label="Actividad afectada">
              <Select value={form.scope_id} onChange={e => setForm({ ...form, scope_id: e.target.value })}>
                <option value="">— todas —</option>
                {scopes.map(s => <option key={s.id} value={s.id}>{s.activity}</option>)}
              </Select>
            </Field>
            <Field label="Persona involucrada">
              <Select value={form.person_id} onChange={e => setForm({ ...form, person_id: e.target.value })}>
                <option value="">— no aplica —</option>
                {personnel.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Cliente">
              <Input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} />
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Nivel">
          <Row>
            <Field label="Probabilidad (1-10)">
              <Input type="number" min="1" max="10" value={form.probability}
                onChange={e => setForm({ ...form, probability: e.target.value })} />
            </Field>
            <Field label="Impacto (1-10)">
              <Input type="number" min="1" max="10" value={form.impact}
                onChange={e => setForm({ ...form, impact: e.target.value })} />
            </Field>
            <Field label="Nivel resultante">
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 14px',
                background: nivel.color, color: 'white', borderRadius: radius.md, fontWeight: 700,
              }}>
                {nivel.label} · {Number(form.probability) * Number(form.impact)}
              </div>
            </Field>
          </Row>
          <p style={{ fontSize: font.xs, color: colors.textMuted, margin: 0 }}>
            Mismo criterio que la matriz de riesgos del SGC: {RISK_LEGEND.map(l => `${l.label} ${l.range}`).join(' · ')}
          </p>
        </Modal.Section>

        <Modal.Section title="Tratamiento (4.1.4)">
          <Field label="Salvaguarda aplicada" hint="Qué hacemos concretamente para eliminarla o minimizarla">
            <Textarea rows={2} value={form.safeguards} onChange={e => setForm({ ...form, safeguards: e.target.value })}
              placeholder="No asignar a esa persona a ese cliente · separar la decisión del dictamen de la venta" />
          </Field>
          <Row>
            <Field label="Responsable"><Input value={form.responsible} onChange={e => setForm({ ...form, responsible: e.target.value })} /></Field>
            <Field label="Evidencia"><Input value={form.evidence} onChange={e => setForm({ ...form, evidence: e.target.value })} placeholder="Acta, correo, registro" /></Field>
          </Row>
          {form.status === 'Aceptado' && (
            <Field label="Justificación de la aceptación" required hint="Quién lo acepta y por qué es tolerable">
              <Textarea rows={2} value={form.acceptance_note} onChange={e => setForm({ ...form, acceptance_note: e.target.value })} />
            </Field>
          )}
          <Row>
            <Field label="Última revisión"><Input type="date" value={form.reviewed_at || ''} onChange={e => setForm({ ...form, reviewed_at: e.target.value })} /></Field>
            <Field label="Próxima revisión"><Input type="date" value={form.next_review || ''} onChange={e => setForm({ ...form, next_review: e.target.value })} /></Field>
          </Row>
        </Modal.Section>

        <Modal.Footer>
          <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!canWrite}>Guardar</Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}

// ─── Pestaña 2: compromisos del personal ─────────────────────────────────────

function CommitmentsTab({ commitments, personnel, canWrite, canDelete, orgId, onChanged }) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_COMMITMENT)
  const [saving, setSaving] = useState(false)

  const hoy = new Date().toISOString().slice(0, 10)
  const vigentes = commitments.filter(c => !c.valid_until || c.valid_until >= hoy)
  const firmantes = new Set(vigentes.map(c => c.person_id))
  const sinFirmar = personnel.filter(p => !firmantes.has(p.id))

  const openNew = (personId) => {
    setForm({ ...EMPTY_COMMITMENT, person_id: personId || '' })
    setEditing(null); setModal(true)
  }
  const openEdit = (c) => {
    setForm({ ...EMPTY_COMMITMENT, ...Object.fromEntries(
      Object.keys(EMPTY_COMMITMENT).map(k => [k, c[k] ?? EMPTY_COMMITMENT[k]])) })
    setEditing(c); setModal(true)
  }

  const save = async () => {
    if (!form.person_id) return toast.warning('Elegí la persona que firma')
    setSaving(true)
    const { error } = editing
      ? await supabase.from('impartiality_commitments').update(clean(form, orgId)).eq('id', editing.id)
      : await supabase.from('impartiality_commitments').insert([clean(form, orgId)])
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(editing ? 'Compromiso actualizado' : 'Compromiso registrado')
    setModal(false); onChanged()
  }

  const remove = async (c) => {
    const ok = await confirm('¿Eliminar este compromiso firmado?',
      { title: 'Eliminar', tone: 'danger', confirmText: 'Eliminar' })
    if (!ok) return
    const { error } = await supabase.from('impartiality_commitments').delete().eq('id', c.id)
    if (error) return toast.error(error.message)
    toast.success('Compromiso eliminado'); onChanged()
  }

  return (
    <>
      <Grid min="170px" gap="10px">
        <Kpi label="Compromisos vigentes" value={vigentes.length} icon={<FileSignature size={14} />} color={colors.success} />
        <Kpi label="Personal sin firmar" value={sinFirmar.length} icon={<AlertTriangle size={14} />}
          color={sinFirmar.length > 0 ? colors.warning : colors.success} />
        <Kpi label="Con conflicto declarado" value={commitments.filter(c => c.declared_conflicts).length}
          icon={<UserX size={14} />} color={colors.info} subtitle="requieren tratamiento" />
      </Grid>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', margin: '16px 0 12px' }}>
        <p style={{ flex: 1, margin: 0, fontSize: font.sm, color: colors.textMuted, maxWidth: '70ch' }}>
          Cada persona que participa en inspecciones firma su compromiso con la imparcialidad y la
          confidencialidad, y declara los conflictos que tenga. Si declara uno, hay que decir cómo se maneja.
        </p>
        {canWrite && <Button variant="primary" icon={<Plus size={16} />} onClick={() => openNew()}>Registrar firma</Button>}
      </div>

      {sinFirmar.length > 0 && (
        <div style={{
          background: colors.warningLight, color: colors.warningText, padding: '10px 12px',
          borderRadius: radius.md, marginBottom: '12px', fontSize: font.sm,
        }}>
          <strong>Falta el compromiso de:</strong>{' '}
          {sinFirmar.map(p => (
            <button key={p.id} type="button" onClick={() => canWrite && openNew(p.id)}
              style={{
                border: 'none', background: 'transparent', color: 'inherit', textDecoration: 'underline',
                cursor: canWrite ? 'pointer' : 'default', padding: '0 4px', fontSize: font.sm,
              }}>{p.full_name}</button>
          ))}
        </div>
      )}

      {commitments.length === 0 ? (
        <EmptyState icon={<FileSignature size={32} color={colors.textGhost} />}
          title="Todavía no hay compromisos firmados"
          subtitle="Es uno de los primeros papeles que pide el evaluador, y se renueva periódicamente." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {commitments.map(c => {
            const vencido = c.valid_until && c.valid_until < hoy
            return (
              <div key={c.id} style={{
                background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl,
                padding: '12px 14px', borderLeft: `4px solid ${vencido ? colors.danger : colors.success}`,
              }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong>{nameOf(personnel, c.person_id) || 'Persona no encontrada'}</strong>
                      {vencido ? <Badge variant="danger">Vencido</Badge> : <Badge variant="success">Vigente</Badge>}
                      {c.declared_conflicts && <Badge variant="warning">Conflicto declarado</Badge>}
                    </div>
                    <div style={{ fontSize: font.sm, color: colors.textMuted, marginTop: '3px' }}>
                      Firmado el {c.signed_at}{c.valid_until ? ` · vigente hasta ${c.valid_until}` : ''}
                      {' · '}
                      {[c.covers_impartiality && 'imparcialidad', c.covers_confidentiality && 'confidencialidad',
                        c.free_of_pressure && 'libre de presión'].filter(Boolean).join(', ')}
                    </div>
                    {c.declared_conflicts && (
                      <div style={{ fontSize: font.sm, color: colors.textMuted, marginTop: '3px' }}>
                        <strong>Declara:</strong> {c.declared_conflicts} — <strong>se maneja:</strong> {c.conflict_treatment}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {canWrite && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => openEdit(c)}>Editar</Button>}
                    {canDelete && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(c)} />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} maxWidth="760px"
        title={editing ? 'Editar compromiso' : 'Compromiso de imparcialidad y confidencialidad'}>
        <Modal.Section title="Quién firma">
          <Row>
            <Field label="Persona" required>
              <Select value={form.person_id} onChange={e => setForm({ ...form, person_id: e.target.value })}>
                <option value="">— elegí a la persona —</option>
                {personnel.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Fecha de firma">
              <Input type="date" value={form.signed_at || ''} onChange={e => setForm({ ...form, signed_at: e.target.value })} />
            </Field>
            <Field label="Vigente hasta" hint="Conviene renovarlo cada año">
              <Input type="date" value={form.valid_until || ''} onChange={e => setForm({ ...form, valid_until: e.target.value })} />
            </Field>
          </Row>
          <Row>
            <Field label="Se compromete con la imparcialidad">
              <Select value={form.covers_impartiality ? '1' : '0'} onChange={e => setForm({ ...form, covers_impartiality: e.target.value === '1' })}>
                <option value="1">Sí</option><option value="0">No</option>
              </Select>
            </Field>
            <Field label="Se compromete con la confidencialidad">
              <Select value={form.covers_confidentiality ? '1' : '0'} onChange={e => setForm({ ...form, covers_confidentiality: e.target.value === '1' })}>
                <option value="1">Sí</option><option value="0">No</option>
              </Select>
            </Field>
            <Field label="Declara no estar sujeto a presión comercial">
              <Select value={form.free_of_pressure ? '1' : '0'} onChange={e => setForm({ ...form, free_of_pressure: e.target.value === '1' })}>
                <option value="1">Sí</option><option value="0">No</option>
              </Select>
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Conflictos declarados (4.1.7)">
          <Field label="Qué declara" hint="Empleos previos, parentescos, participación en obras que después inspecciona">
            <Textarea rows={2} value={form.declared_conflicts} onChange={e => setForm({ ...form, declared_conflicts: e.target.value })} />
          </Field>
          <Field label="Cómo se maneja" hint="Obligatorio si declaró algo">
            <Textarea rows={2} value={form.conflict_treatment} onChange={e => setForm({ ...form, conflict_treatment: e.target.value })}
              placeholder="No se le asignan inspecciones de ese cliente ni de ítems que intervino" />
          </Field>
          <Row>
            <Field label="Documento firmado (enlace)"><Input value={form.document_url} onChange={e => setForm({ ...form, document_url: e.target.value })} /></Field>
            <Field label="Notas"><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
          </Row>
        </Modal.Section>

        <Modal.Footer>
          <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!canWrite}>Guardar</Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}

// ─── Pestaña 3: quejas y apelaciones ─────────────────────────────────────────

function ComplaintsTab({ complaints, reports, inspections, personnel, canWrite, canDelete, orgId, onChanged }) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_COMPLAINT)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  // Quién participó en la inspección cuestionada: no puede investigar ni decidir
  const excluded = useMemo(() => {
    const rep = reports.find(r => r.id === form.report_id)
    const insId = form.inspection_id || rep?.inspection_id
    const ins = inspections.find(i => i.id === insId)
    const map = new Map()
    if (ins?.lead_inspector_id) map.set(ins.lead_inspector_id, 'ejecutó la inspección')
    if (rep?.signed_by_person_id) {
      map.set(rep.signed_by_person_id,
        map.has(rep.signed_by_person_id) ? 'ejecutó y firmó' : 'firmó el informe')
    }
    return map
  }, [form.report_id, form.inspection_id, reports, inspections])

  const kpis = useMemo(() => ({
    abiertas: complaints.filter(c => !['Cerrada', 'Rechazada'].includes(c.status)).length,
    apelaciones: complaints.filter(c => c.kind === 'Apelación').length,
    procedentes: complaints.filter(c => ['Procedente', 'Parcialmente procedente'].includes(c.outcome)).length,
    sinAcuse: complaints.filter(c => !c.acknowledged_at && !['Cerrada', 'Rechazada'].includes(c.status)).length,
  }), [complaints])

  const filtered = useMemo(() => complaints.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return [c.code, c.claimant_name, c.description, c.kind, c.status]
      .filter(Boolean).join(' ').toLowerCase().includes(q)
  }), [complaints, search])

  const nextCode = () => {
    const year = new Date().getFullYear()
    const prefix = `QA-${year}-`
    const max = complaints.filter(c => (c.code || '').startsWith(prefix))
      .map(c => parseInt(c.code.slice(prefix.length), 10))
      .filter(n => !Number.isNaN(n))
      .reduce((a, b) => Math.max(a, b), 0)
    return `${prefix}${String(max + 1).padStart(3, '0')}`
  }

  const openNew = () => { setForm({ ...EMPTY_COMPLAINT, code: nextCode() }); setEditing(null); setModal(true) }
  const openEdit = (c) => {
    setForm({ ...EMPTY_COMPLAINT, ...Object.fromEntries(
      Object.keys(EMPTY_COMPLAINT).map(k => [k, c[k] ?? EMPTY_COMPLAINT[k]])) })
    setEditing(c); setModal(true)
  }

  const save = async () => {
    if (!form.code.trim()) return toast.warning('La queja necesita un número')
    if (!form.description.trim()) return toast.warning('Escribí qué reclama')
    if (form.kind === 'Apelación' && !form.report_id) return toast.warning('Una apelación se presenta contra un informe: elegí cuál')
    setSaving(true)
    const payload = clean(form, orgId)
    payload.code = payload.code.trim()
    const { error } = editing
      ? await supabase.from('inspection_complaints').update(payload).eq('id', editing.id)
      : await supabase.from('inspection_complaints').insert([payload])
    setSaving(false)
    if (error) {
      return toast.error(/uq_inspection_complaints_code|duplicate/i.test(error.message)
        ? `Ya existe el número "${payload.code}".` : error.message)
    }
    toast.success(editing ? 'Actualizada' : `${form.kind} registrada`)
    setModal(false); onChanged()
  }

  const remove = async (c) => {
    const ok = await confirm(`¿Eliminar ${c.code}?`, { title: 'Eliminar', tone: 'danger', confirmText: 'Eliminar' })
    if (!ok) return
    const { error } = await supabase.from('inspection_complaints').delete().eq('id', c.id)
    if (error) return toast.error(error.message)
    toast.success('Eliminada'); onChanged()
  }

  const reportLabel = (r) => `${r.report_number} rev. ${r.revision}`

  return (
    <>
      <Grid min="170px" gap="10px">
        <Kpi label="Abiertas" value={kpis.abiertas} icon={<MessageSquareWarning size={14} />}
          color={kpis.abiertas > 0 ? colors.warning : colors.success} />
        <Kpi label="Sin acuse de recibo" value={kpis.sinAcuse} icon={<AlertTriangle size={14} />}
          color={kpis.sinAcuse > 0 ? colors.danger : colors.success} />
        <Kpi label="Apelaciones" value={kpis.apelaciones} icon={<Gavel size={14} />} color={colors.info} />
        <Kpi label="Procedentes" value={kpis.procedentes} icon={<CheckCircle2 size={14} />} color={colors.primary}
          subtitle="dieron la razón al reclamante" />
      </Grid>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', margin: '16px 0 12px' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: colors.textGhost }} />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por número, reclamante o descripción…" style={{ paddingLeft: '30px' }} />
        </div>
        {canWrite && <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>Registrar queja o apelación</Button>}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<MessageSquareWarning size={32} color={colors.textGhost} />}
          title={complaints.length ? 'Sin resultados' : 'Sin quejas ni apelaciones registradas'}
          subtitle="Tener el procedimiento y el registro vacío es correcto; no tener dónde registrarlas, no." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(c => (
            <div key={c.id} style={{
              background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl,
              padding: '12px 14px',
              borderLeft: `4px solid ${['Cerrada', 'Resuelta'].includes(c.status) ? colors.success
                : c.kind === 'Apelación' ? colors.danger : colors.warning}`,
            }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.code}</span>
                    <Badge variant={c.kind === 'Apelación' ? 'danger' : 'info'}>{c.kind}</Badge>
                    <Badge variant={COMPLAINT_STATUS[c.status] || 'neutral'}>{c.status}</Badge>
                    {c.outcome && <Badge variant="neutral">{c.outcome}</Badge>}
                    {!c.acknowledged_at && !['Cerrada', 'Rechazada'].includes(c.status) && (
                      <Badge variant="warning">Sin acuse</Badge>
                    )}
                  </div>
                  <div style={{ fontSize: font.md, color: colors.text, marginTop: '5px' }}>{c.description}</div>
                  <div style={{ fontSize: font.xs, color: colors.textMuted, marginTop: '3px' }}>
                    Recibida el {c.received_at}
                    {c.claimant_name && ` · ${c.claimant_name}`}
                    {c.report_id && ` · informe ${reports.find(r => r.id === c.report_id)?.report_number || ''}`}
                    {c.decision_by_person_id && ` · decide ${nameOf(personnel, c.decision_by_person_id)}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {canWrite && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => openEdit(c)}>Abrir</Button>}
                  {canDelete && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(c)} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} maxWidth="880px"
        title={editing ? `${editing.kind} ${editing.code}` : 'Nueva queja o apelación'}>
        <Modal.Section title="Recepción">
          <Row>
            <Field label="Número" required>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
            </Field>
            <Field label="Tipo" hint="La apelación cuestiona el resultado de un informe">
              <Select value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
                <option value="Queja">Queja</option>
                <option value="Apelación">Apelación</option>
              </Select>
            </Field>
            <Field label="Fecha de recepción">
              <Input type="date" value={form.received_at || ''} onChange={e => setForm({ ...form, received_at: e.target.value })} />
            </Field>
            <Field label="Acuse de recibo" hint="Fecha en que le confirmamos al reclamante">
              <Input type="date" value={form.acknowledged_at || ''} onChange={e => setForm({ ...form, acknowledged_at: e.target.value })} />
            </Field>
          </Row>
          <Row>
            <Field label="Reclamante"><Input value={form.claimant_name} onChange={e => setForm({ ...form, claimant_name: e.target.value })} /></Field>
            <Field label="Tipo de reclamante">
              <Select value={form.claimant_type} onChange={e => setForm({ ...form, claimant_type: e.target.value })}>
                {CLAIMANT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Contacto"><Input value={form.claimant_contact} onChange={e => setForm({ ...form, claimant_contact: e.target.value })} /></Field>
            <Field label="Canal"><Input value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })} placeholder="Correo, teléfono, visita" /></Field>
          </Row>
          <Field label="Qué reclama" required>
            <Textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Row>
            <Field label="Informe cuestionado" hint="Obligatorio en una apelación">
              <Select value={form.report_id} onChange={e => setForm({ ...form, report_id: e.target.value })}>
                <option value="">— no aplica —</option>
                {reports.map(r => <option key={r.id} value={r.id}>{reportLabel(r)}</option>)}
              </Select>
            </Field>
            <Field label="Inspección" hint="Se completa sola desde el informe">
              <Select value={form.inspection_id} onChange={e => setForm({ ...form, inspection_id: e.target.value })}>
                <option value="">— no aplica —</option>
                {inspections.map(i => <option key={i.id} value={i.id}>{i.code}</option>)}
              </Select>
            </Field>
            <Field label="¿Corresponde a nuestra actividad?">
              <Select value={form.admissible ? '1' : '0'} onChange={e => setForm({ ...form, admissible: e.target.value === '1' })}>
                <option value="1">Sí, es admisible</option>
                <option value="0">No corresponde</option>
              </Select>
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Tratamiento con revisión independiente">
          {excluded.size > 0 && (
            <div style={{
              background: colors.warningLight, color: colors.warningText, padding: '10px 12px',
              borderRadius: radius.md, fontSize: font.sm, display: 'flex', gap: '8px', alignItems: 'flex-start',
            }}>
              <UserX size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
              <span>
                No pueden investigar ni decidir, porque participaron:{' '}
                {[...excluded.entries()].map(([id, why]) => `${nameOf(personnel, id)} (${why})`).join(' · ')}.
              </span>
            </div>
          )}
          <Row>
            <Field label="Investiga">
              <Select value={form.handler_person_id} onChange={e => setForm({ ...form, handler_person_id: e.target.value })}>
                <option value="">— sin asignar —</option>
                {personnel.map(p => (
                  <option key={p.id} value={p.id} disabled={excluded.has(p.id)}>
                    {p.full_name}{excluded.has(p.id) ? ` — ${excluded.get(p.id)}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Decide" hint="Tiene que ser alguien que no participó">
              <Select value={form.decision_by_person_id} onChange={e => setForm({ ...form, decision_by_person_id: e.target.value })}>
                <option value="">— sin asignar —</option>
                {personnel.map(p => (
                  <option key={p.id} value={p.id} disabled={excluded.has(p.id)}>
                    {p.full_name}{excluded.has(p.id) ? ` — ${excluded.get(p.id)}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Estado">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.keys(COMPLAINT_STATUS).map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Investigación"><Textarea rows={2} value={form.investigation} onChange={e => setForm({ ...form, investigation: e.target.value })} /></Field>
            <Field label="Causa raíz"><Textarea rows={2} value={form.root_cause} onChange={e => setForm({ ...form, root_cause: e.target.value })} /></Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Decisión y cierre">
          <Field label="Decisión" hint="Qué se resolvió y con qué fundamento">
            <Textarea rows={2} value={form.decision} onChange={e => setForm({ ...form, decision: e.target.value })} />
          </Field>
          <Row>
            <Field label="Resultado">
              <Select value={form.outcome} onChange={e => setForm({ ...form, outcome: e.target.value })}>
                <option value="">— sin resolver —</option>
                {OUTCOMES.map(o => <option key={o} value={o}>{o}</option>)}
              </Select>
            </Field>
            <Field label="¿Hubo que enmendar el informe?">
              <Select value={form.report_amended ? '1' : '0'} onChange={e => setForm({ ...form, report_amended: e.target.value === '1' })}>
                <option value="0">No</option><option value="1">Sí</option>
              </Select>
            </Field>
            <Field label="Fecha de la decisión">
              <Input type="date" value={form.decision_at || ''} onChange={e => setForm({ ...form, decision_at: e.target.value })} />
            </Field>
            <Field label="Notificación al reclamante" hint="Sin esta fecha no se puede cerrar">
              <Input type="date" value={form.notified_at || ''} onChange={e => setForm({ ...form, notified_at: e.target.value })} />
            </Field>
          </Row>
          {form.report_amended && (
            <p style={{
              background: colors.infoLight, color: colors.infoText, padding: '10px 12px',
              borderRadius: radius.md, fontSize: font.sm, margin: 0,
            }}>
              La corrección del informe se hace en <strong>Inspección → Informes → Enmendar</strong>: se emite
              una revisión nueva que reemplaza a la anterior. No se edita el informe emitido.
            </p>
          )}
        </Modal.Section>

        <Modal.Footer>
          <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!canWrite}>Guardar</Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
