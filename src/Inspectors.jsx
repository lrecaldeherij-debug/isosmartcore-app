// =============================================================================
// Inspectors — ISO/IEC 17020:2026, fase 2: inspectores autorizados
//
// Tres pestañas:
//   1. Autorizaciones (6.1.2 d / 6.1.4) — qué método puede ejecutar cada
//      persona, con su período mentorizado y su estado real.
//   2. Certificaciones (6.1.2) — SNT-TC-1A, ISO 9712, CWI, API, por método y
//      nivel, con vencimiento y examen de agudeza visual.
//   3. Monitoreo (6.1.5–6.1.8) — observación en campo y revisión de informes,
//      con su efecto sobre la autorización.
//
// El estado que se muestra NO es el guardado a mano: sale de la vista
// inspector_authorization_status, que cruza autorización + certificación +
// visión + último monitoreo. Un inspector con certificación vencida aparece
// como tal aunque su autorización diga "Activa".
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck, Plus, Pencil, Trash2, Search, AlertTriangle, CheckCircle2,
  Eye, ClipboardCheck, GraduationCap, Ban, ShieldCheck, Clock,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import { can } from './lib/roles'
import { toast } from './lib/toast'
import { confirm, promptText } from './lib/confirm'
import {
  Button, Modal, Field, Row, Input, Select, Textarea, Badge, Kpi,
  EmptyState, Spinner, Grid, PageHeader, colors, radius, font,
} from './components/ui'

// ─── Catálogos ───────────────────────────────────────────────────────────────

// Métodos de END del alcance inicial + los habituales en integridad mecánica
const NDT_METHODS = ['UT', 'PAUT', 'PT', 'MT', 'VT', 'RT', 'ET', 'LT']
const NDT_LABELS = {
  UT: 'Ultrasonido convencional',
  PAUT: 'Ultrasonido phased array',
  PT: 'Líquidos penetrantes',
  MT: 'Partículas magnéticas',
  VT: 'Inspección visual',
  RT: 'Radiografía',
  ET: 'Corrientes inducidas',
  LT: 'Pruebas de fugas',
}
const SCHEMES = ['SNT-TC-1A', 'ISO 9712', 'AWS CWI', 'API 510', 'API 570', 'API 653', 'ASNT ACCP', 'Otro']
const LEVELS = ['I', 'II', 'III', 'CWI', 'CWI Senior', 'Inspector', 'No aplica']

const AUTH_KINDS = ['Ejecutar', 'Ejecutar e interpretar', 'Interpretar y firmar', 'Solo firmar']
const AUTH_STATUS = ['En mentoría', 'Activa', 'Suspendida', 'Revocada', 'Vencida']

// Cómo se pinta el estado efectivo que calcula la vista
const EFFECTIVE_VARIANT = {
  'Habilitado': 'success',
  'En mentoría': 'info',
  'Sin monitoreo registrado': 'warning',
  'Monitoreo vencido': 'warning',
  'Certificación vencida': 'danger',
  'Visión vencida': 'danger',
  'Autorización vencida': 'danger',
  'Suspendida': 'danger',
  'Revocada': 'neutral',
}

const MONITORING_TYPES = ['Observación en campo', 'Revisión de informe', 'Reinspección', 'Comparación entre inspectores', 'Entrevista técnica']
const MONITORING_RESULTS = ['Satisfactorio', 'Con observaciones', 'No satisfactorio']
const MONITORING_EFFECTS = ['Mantiene', 'Restringe', 'Suspende']

const EMPTY_CERT = {
  person_id: '', scheme: 'SNT-TC-1A', method: 'PAUT', level: 'II',
  certifying_body: '', certificate_number: '', issue_date: '', expiry_date: '',
  vision_exam_date: '', vision_exam_result: 'Apto',
  practical_exam_date: '', training_hours: '', experience_hours: '',
  evidence_url: '', notes: '',
}

const EMPTY_AUTH = {
  person_id: '', method_id: '', scope_id: '', certification_id: '',
  authorization_kind: 'Ejecutar e interpretar', restrictions: '', item_knowledge: '',
  mentoring_required: true, mentor_person_id: '', mentoring_start: '', mentoring_end: '',
  mentoring_inspections: 0, mentoring_notes: '',
  authorized_by: '', authorized_role: '', authorized_at: '', valid_until: '',
  status: 'En mentoría', monitoring_frequency_months: 12, notes: '',
}

const EMPTY_MON = {
  person_id: '', authorization_id: '', method_id: '',
  activity_type: 'Observación en campo', performed_at: new Date().toISOString().slice(0, 10),
  observer_name: '', item_reference: '',
  result: 'Satisfactorio', findings: '', actions_required: '', training_need: '',
  effect: 'Mantiene', next_due_date: '', evidence_url: '',
}

const DATE_KEYS = ['issue_date', 'expiry_date', 'vision_exam_date', 'practical_exam_date',
  'mentoring_start', 'mentoring_end', 'authorized_at', 'valid_until', 'next_due_date', 'performed_at']
const FK_KEYS = ['person_id', 'method_id', 'scope_id', 'certification_id', 'mentor_person_id',
  'authorization_id', 'observer_person_id']

function cleanPayload(form, orgId) {
  const payload = { ...form, org_id: orgId }
  DATE_KEYS.forEach(k => { if (k in payload && !payload[k]) payload[k] = null })
  FK_KEYS.forEach(k => { if (k in payload && !payload[k]) payload[k] = null })
  ;['training_hours', 'experience_hours', 'mentoring_inspections', 'monitoring_frequency_months'].forEach(k => {
    if (k in payload) payload[k] = payload[k] === '' || payload[k] == null ? null : Number(payload[k])
  })
  return payload
}

const daysUntil = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null
const isExpired = (d) => d != null && daysUntil(d) < 0
const expiresSoon = (d, days = 60) => { const n = daysUntil(d); return n != null && n >= 0 && n <= days }

// ─── Componente ──────────────────────────────────────────────────────────────

export default function Inspectors() {
  const { org, role } = useOrg()
  const canWrite = can(role, 'inspection_methods', 'write')
  const canDelete = can(role, 'inspection_methods', 'delete')

  const [tab, setTab] = useState('auth')
  const [authStatus, setAuthStatus] = useState([])
  const [auths, setAuths] = useState([])
  const [certs, setCerts] = useState([])
  const [monitoring, setMonitoring] = useState([])
  const [personnel, setPersonnel] = useState([])
  const [methods, setMethods] = useState([])
  const [scopes, setScopes] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [st, au, ce, mo, pe, me, sc] = await Promise.all([
      supabase.from('inspector_authorization_status').select('*').eq('org_id', org.id),
      supabase.from('inspector_authorizations').select('*').eq('org_id', org.id),
      supabase.from('inspector_certifications').select('*').eq('org_id', org.id).order('expiry_date'),
      supabase.from('inspector_monitoring').select('*').eq('org_id', org.id).order('performed_at', { ascending: false }),
      supabase.from('personnel').select('id, full_name, job_title').eq('org_id', org.id).order('full_name'),
      supabase.from('inspection_methods').select('id, name, code, status').eq('org_id', org.id).order('name'),
      supabase.from('inspection_scopes').select('id, activity').eq('org_id', org.id).order('activity'),
    ])
    const err = st.error || au.error || ce.error || mo.error
    if (err) {
      toast.error(/inspector_/i.test(err.message)
        ? 'Falta aplicar la migración de inspectores autorizados (fase 2).'
        : 'No se pudo cargar: ' + err.message)
    }
    setAuthStatus(st.data || [])
    setAuths(au.data || [])
    setCerts(ce.data || [])
    setMonitoring(mo.data || [])
    setPersonnel(pe.data || [])
    setMethods(me.data || [])
    setScopes(sc.data || [])
    setLoading(false)
  }

  useEffect(() => { if (org?.id) load() }, [org?.id])

  const personName = (id) => personnel.find(p => p.id === id)?.full_name || '—'
  const methodName = (id) => methods.find(m => m.id === id)?.name || null

  if (loading) return <Spinner label="Cargando inspectores…" />

  const TABS = [
    { id: 'auth', label: 'Autorizaciones', clause: '6.1.2 d', icon: BadgeCheck, n: authStatus.length },
    { id: 'certs', label: 'Certificaciones', clause: '6.1.2', icon: GraduationCap, n: certs.length },
    { id: 'monitoring', label: 'Monitoreo', clause: '6.1.5', icon: Eye, n: monitoring.length },
  ]

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        icon={<BadgeCheck size={28} color={colors.primary} />}
        title="Inspectores autorizados"
        subtitle="Quién puede ejecutar cada método, con qué certificación vigente y bajo qué monitoreo"
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

      {tab === 'auth' && (
        <AuthTab rows={authStatus} auths={auths} certs={certs} personnel={personnel} methods={methods}
          scopes={scopes} orgId={org.id} canWrite={canWrite} canDelete={canDelete} onChanged={load} />
      )}
      {tab === 'certs' && (
        <CertsTab certs={certs} personnel={personnel} orgId={org.id} canWrite={canWrite}
          canDelete={canDelete} personName={personName} onChanged={load} />
      )}
      {tab === 'monitoring' && (
        <MonitoringTab rows={monitoring} authStatus={authStatus} personnel={personnel} methods={methods}
          orgId={org.id} canWrite={canWrite} canDelete={canDelete}
          personName={personName} methodName={methodName} onChanged={load} />
      )}
    </div>
  )
}

// ─── Autorizaciones ──────────────────────────────────────────────────────────

function AuthTab({ rows, auths, certs, personnel, methods, scopes, orgId, canWrite, canDelete, onChanged }) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_AUTH)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const kpis = useMemo(() => ({
    total: rows.length,
    habilitados: rows.filter(r => r.effective_status === 'Habilitado').length,
    mentoria: rows.filter(r => r.effective_status === 'En mentoría').length,
    bloqueados: rows.filter(r => ['Certificación vencida', 'Visión vencida', 'Autorización vencida', 'Suspendida'].includes(r.effective_status)).length,
    sinMonitoreo: rows.filter(r => ['Sin monitoreo registrado', 'Monitoreo vencido'].includes(r.effective_status)).length,
  }), [rows])

  const filtered = useMemo(() => rows.filter(r => {
    if (!search) return true
    const q = search.toLowerCase()
    return [r.person_name, r.method_name, r.scheme, r.cert_method, r.cert_level].filter(Boolean).join(' ').toLowerCase().includes(q)
  }), [rows, search])

  const openNew = () => { setForm(EMPTY_AUTH); setEditing(null); setModal(true) }
  const openEdit = (id) => {
    const a = auths.find(x => x.id === id)
    if (!a) return
    setForm({ ...EMPTY_AUTH, ...Object.fromEntries(Object.keys(EMPTY_AUTH).map(k => [k, a[k] ?? EMPTY_AUTH[k]])) })
    setEditing(a); setModal(true)
  }

  const save = async () => {
    if (!form.person_id) return toast.warning('Elegí a la persona')
    if (!form.method_id) return toast.warning('La autorización es por método: elegí cuál')
    setSaving(true)
    const payload = cleanPayload(form, orgId)
    const { error } = editing
      ? await supabase.from('inspector_authorizations').update(payload).eq('id', editing.id)
      : await supabase.from('inspector_authorizations').insert([payload])
    setSaving(false)
    if (error) return toast.error(error.message)   // el trigger explica por qué no se puede activar
    toast.success(editing ? 'Autorización actualizada' : 'Autorización registrada')
    setModal(false); onChanged()
  }

  const cerrarMentoria = async (r) => {
    const a = auths.find(x => x.id === r.id)
    const n = await promptText('¿Cuántas inspecciones supervisadas hizo durante la mentoría?', {
      defaultValue: String(a?.mentoring_inspections || ''), required: true, rows: 1,
    })
    if (!n) return
    const notas = await promptText('Conclusión del mentor sobre su desempeño', { rows: 3, required: true })
    if (!notas) return
    const { error } = await supabase.from('inspector_authorizations').update({
      mentoring_end: new Date().toISOString().slice(0, 10),
      mentoring_inspections: Number(n) || 0,
      mentoring_notes: notas,
    }).eq('id', r.id)
    if (error) return toast.error(error.message)
    toast.success('Mentoría cerrada. Ya se puede activar la autorización.')
    onChanged()
  }

  const cambiarEstado = async (r, nuevo) => {
    let motivo = null
    if (nuevo === 'Suspendida' || nuevo === 'Revocada') {
      motivo = await promptText(`Motivo de la ${nuevo === 'Revocada' ? 'revocación' : 'suspensión'}`, { required: true, rows: 2 })
      if (!motivo) return
    }
    if (nuevo === 'Activa') {
      const quien = await promptText('Quién autoriza (gerente técnico)', { required: true, rows: 1 })
      if (!quien) return
      const cargo = (await promptText('Cargo de quien autoriza', { defaultValue: 'Gerente técnico', rows: 1 })) || 'Gerente técnico'
      const { error } = await supabase.from('inspector_authorizations').update({
        status: 'Activa', authorized_by: quien, authorized_role: cargo,
        authorized_at: new Date().toISOString().slice(0, 10),
        suspension_reason: null,
      }).eq('id', r.id)
      if (error) return toast.error(error.message)
      toast.success('Autorización activada')
      return onChanged()
    }
    const { error } = await supabase.from('inspector_authorizations')
      .update({ status: nuevo, suspension_reason: motivo }).eq('id', r.id)
    if (error) return toast.error(error.message)
    toast.success(`Autorización ${nuevo.toLowerCase()}`)
    onChanged()
  }

  const remove = async (r) => {
    const ok = await confirm(
      `¿Eliminar la autorización de ${r.person_name} para ${r.method_name || 'ese método'}? Para dejar rastro conviene revocarla en vez de borrarla.`,
      { title: 'Eliminar autorización', tone: 'danger', confirmText: 'Eliminar' })
    if (!ok) return
    const { error } = await supabase.from('inspector_authorizations').delete().eq('id', r.id)
    if (error) return toast.error(error.message)
    toast.success('Autorización eliminada'); onChanged()
  }

  const certsDePersona = certs.filter(c => c.person_id === form.person_id)

  return (
    <>
      <Grid min="170px" gap="10px">
        <Kpi label="Autorizaciones" value={kpis.total} icon={<BadgeCheck size={14} />} color={colors.primary} />
        <Kpi label="Habilitados hoy" value={kpis.habilitados} icon={<CheckCircle2 size={14} />} color={colors.success} />
        <Kpi label="En mentoría" value={kpis.mentoria} icon={<GraduationCap size={14} />} color={colors.info} />
        <Kpi label="Bloqueados" value={kpis.bloqueados} icon={<Ban size={14} />}
          color={kpis.bloqueados > 0 ? colors.danger : colors.success} subtitle="vencidos o suspendidos" />
        <Kpi label="Monitoreo pendiente" value={kpis.sinMonitoreo} icon={<Clock size={14} />}
          color={kpis.sinMonitoreo > 0 ? colors.warning : colors.success} />
      </Grid>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', margin: '16px 0 12px' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: colors.textGhost }} />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por persona o método…" style={{ paddingLeft: '30px' }} />
        </div>
        {canWrite && <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>Nueva autorización</Button>}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<BadgeCheck size={32} color={colors.textGhost} />}
          title={rows.length ? 'Sin resultados' : 'Nadie está autorizado todavía'}
          subtitle={rows.length ? 'Probá con otra búsqueda.' : 'Un inspector se autoriza por método: primero cargá su certificación, después la autorización con su período mentorizado.'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(r => {
            const variant = EFFECTIVE_VARIANT[r.effective_status] || 'neutral'
            const bloqueado = ['danger'].includes(variant)
            return (
              <div key={r.id} style={{
                background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl, padding: '14px',
                borderLeft: `4px solid ${bloqueado ? colors.danger : r.effective_status === 'Habilitado' ? colors.success : colors.warning}`,
              }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Badge variant={variant}>{r.effective_status}</Badge>
                      <Badge variant="neutral">{r.authorization_kind}</Badge>
                      {r.cert_method && <Badge variant="info">{r.cert_method} {r.cert_level}</Badge>}
                    </div>
                    <div style={{ fontWeight: 700, color: colors.text, marginTop: '4px' }}>
                      {r.person_name} — {r.method_name || 'método no asignado'}
                    </div>
                    <div style={{ fontSize: font.sm, color: colors.textMuted, marginTop: '2px' }}>
                      {[
                        r.scheme && `${r.scheme}${r.certificate_number ? ' ' + r.certificate_number : ''}`,
                        r.cert_expiry && `cert. vence ${r.cert_expiry}`,
                        r.vision_exam_date && `visión ${r.vision_exam_date}`,
                        r.last_monitoring_at ? `último monitoreo ${r.last_monitoring_at}` : 'sin monitoreo',
                      ].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {canWrite && r.status === 'En mentoría' && (
                      <Button size="sm" variant="info" icon={<GraduationCap size={14} />} onClick={() => cerrarMentoria(r)}>
                        Cerrar mentoría
                      </Button>
                    )}
                    {canWrite && ['En mentoría', 'Suspendida', 'Vencida'].includes(r.status) && (
                      <Button size="sm" variant="success" icon={<ShieldCheck size={14} />} onClick={() => cambiarEstado(r, 'Activa')}>
                        Activar
                      </Button>
                    )}
                    {canWrite && r.status === 'Activa' && (
                      <Button size="sm" variant="warning" icon={<Ban size={14} />} onClick={() => cambiarEstado(r, 'Suspendida')}>
                        Suspender
                      </Button>
                    )}
                    {canWrite && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => openEdit(r.id)}>Editar</Button>}
                    {canDelete && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(r)} />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar autorización' : 'Nueva autorización'} maxWidth="840px">
        <Modal.Section title="Quién y para qué método">
          <Row>
            <Field label="Persona" required>
              <Select value={form.person_id} onChange={e => setForm({ ...form, person_id: e.target.value, certification_id: '' })}>
                <option value="">— elegí —</option>
                {personnel.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Método" required hint="La autorización siempre es por método (6.1.2 d)">
              <Select value={form.method_id} onChange={e => setForm({ ...form, method_id: e.target.value })}>
                <option value="">— elegí —</option>
                {methods.map(m => <option key={m.id} value={m.id}>{m.name}{m.status !== 'Vigente' ? ` (${m.status})` : ''}</option>)}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Alcance">
              <Select value={form.scope_id} onChange={e => setForm({ ...form, scope_id: e.target.value })}>
                <option value="">— sin asociar —</option>
                {scopes.map(s => <option key={s.id} value={s.id}>{s.activity}</option>)}
              </Select>
            </Field>
            <Field label="Certificación que la respalda" hint="Cargala primero en la pestaña Certificaciones">
              <Select value={form.certification_id} onChange={e => setForm({ ...form, certification_id: e.target.value })}>
                <option value="">— ninguna —</option>
                {certsDePersona.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.scheme} {c.method} {c.level} {c.expiry_date ? `· vence ${c.expiry_date}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Qué puede hacer">
              <Select value={form.authorization_kind} onChange={e => setForm({ ...form, authorization_kind: e.target.value })}>
                {AUTH_KINDS.map(k => <option key={k} value={k}>{k}</option>)}
              </Select>
            </Field>
            <Field label="Restricciones" hint="Espesores, materiales, sedes, configuraciones">
              <Input value={form.restrictions} onChange={e => setForm({ ...form, restrictions: e.target.value })} />
            </Field>
          </Row>
          <Field label="Conocimiento del ítem y sus defectos (6.1.3)"
            hint="Qué sabe de los ítems que va a inspeccionar, los defectos esperables y qué significa cada desviación">
            <Textarea rows={2} value={form.item_knowledge} onChange={e => setForm({ ...form, item_knowledge: e.target.value })} />
          </Field>
        </Modal.Section>

        <Modal.Section title="Período mentorizado (6.1.4)">
          <Row>
            <Field label="¿Requiere mentoría?">
              <Select value={form.mentoring_required ? 'si' : 'no'} onChange={e => setForm({ ...form, mentoring_required: e.target.value === 'si' })}>
                <option value="si">Sí</option>
                <option value="no">No (justificar en notas)</option>
              </Select>
            </Field>
            <Field label="Mentor">
              <Select value={form.mentor_person_id} onChange={e => setForm({ ...form, mentor_person_id: e.target.value })}>
                <option value="">— elegí —</option>
                {personnel.filter(p => p.id !== form.person_id).map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Inicio"><Input type="date" value={form.mentoring_start || ''} onChange={e => setForm({ ...form, mentoring_start: e.target.value })} /></Field>
            <Field label="Cierre" hint="Sin esta fecha la autorización no se puede activar">
              <Input type="date" value={form.mentoring_end || ''} onChange={e => setForm({ ...form, mentoring_end: e.target.value })} />
            </Field>
            <Field label="Inspecciones supervisadas">
              <Input type="number" min="0" value={form.mentoring_inspections} onChange={e => setForm({ ...form, mentoring_inspections: e.target.value })} />
            </Field>
          </Row>
          <Field label="Conclusión del mentor">
            <Textarea rows={2} value={form.mentoring_notes} onChange={e => setForm({ ...form, mentoring_notes: e.target.value })} />
          </Field>
        </Modal.Section>

        <Modal.Section title="Autorización y vigilancia">
          <Row>
            <Field label="Estado">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {AUTH_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Autorizada por"><Input value={form.authorized_by} onChange={e => setForm({ ...form, authorized_by: e.target.value })} /></Field>
            <Field label="Cargo"><Input value={form.authorized_role} onChange={e => setForm({ ...form, authorized_role: e.target.value })} placeholder="Gerente técnico" /></Field>
          </Row>
          <Row>
            <Field label="Fecha de autorización"><Input type="date" value={form.authorized_at || ''} onChange={e => setForm({ ...form, authorized_at: e.target.value })} /></Field>
            <Field label="Válida hasta"><Input type="date" value={form.valid_until || ''} onChange={e => setForm({ ...form, valid_until: e.target.value })} /></Field>
            <Field label="Monitoreo cada (meses)" hint="Según el riesgo de la actividad (6.1.5)">
              <Input type="number" min="1" max="60" value={form.monitoring_frequency_months}
                onChange={e => setForm({ ...form, monitoring_frequency_months: e.target.value })} />
            </Field>
          </Row>
          <Field label="Notas">
            <Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </Modal.Section>

        <Modal.Footer>
          <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!canWrite}>Guardar</Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}

// ─── Certificaciones ─────────────────────────────────────────────────────────

function CertsTab({ certs, personnel, orgId, canWrite, canDelete, personName, onChanged }) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_CERT)
  const [saving, setSaving] = useState(false)

  const kpis = useMemo(() => ({
    total: certs.length,
    vencidas: certs.filter(c => isExpired(c.expiry_date)).length,
    porVencer: certs.filter(c => expiresSoon(c.expiry_date)).length,
    visionVencida: certs.filter(c => c.vision_exam_date && daysUntil(c.vision_exam_date) < -365).length,
  }), [certs])

  const openNew = () => { setForm(EMPTY_CERT); setEditing(null); setModal(true) }
  const openEdit = (c) => {
    setForm({ ...EMPTY_CERT, ...Object.fromEntries(Object.keys(EMPTY_CERT).map(k => [k, c[k] ?? EMPTY_CERT[k]])) })
    setEditing(c); setModal(true)
  }

  const save = async () => {
    if (!form.person_id) return toast.warning('Elegí a la persona')
    if (!form.scheme) return toast.warning('Indicá el esquema de certificación')
    setSaving(true)
    const { error } = editing
      ? await supabase.from('inspector_certifications').update(cleanPayload(form, orgId)).eq('id', editing.id)
      : await supabase.from('inspector_certifications').insert([cleanPayload(form, orgId)])
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(editing ? 'Certificación actualizada' : 'Certificación registrada')
    setModal(false); onChanged()
  }

  const remove = async (c) => {
    const ok = await confirm(`¿Eliminar la certificación ${c.scheme} ${c.method || ''} de ${personName(c.person_id)}?`,
      { title: 'Eliminar certificación', tone: 'danger', confirmText: 'Eliminar' })
    if (!ok) return
    const { error } = await supabase.from('inspector_certifications').delete().eq('id', c.id)
    if (error) return toast.error(error.message)
    toast.success('Certificación eliminada'); onChanged()
  }

  return (
    <>
      <Grid min="170px" gap="10px">
        <Kpi label="Certificaciones" value={kpis.total} icon={<GraduationCap size={14} />} color={colors.primary} />
        <Kpi label="Vencidas" value={kpis.vencidas} icon={<AlertTriangle size={14} />}
          color={kpis.vencidas > 0 ? colors.danger : colors.success} />
        <Kpi label="Vencen en 60 días" value={kpis.porVencer} icon={<Clock size={14} />}
          color={kpis.porVencer > 0 ? colors.warning : colors.success} />
        <Kpi label="Visión vencida" value={kpis.visionVencida} icon={<Eye size={14} />}
          color={kpis.visionVencida > 0 ? colors.danger : colors.success} subtitle="examen anual" />
      </Grid>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 12px', gap: '10px', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: font.sm, color: colors.textMuted, maxWidth: '64ch' }}>
          El examen de agudeza visual de SNT-TC-1A e ISO 9712 vence al año. Con la visión vencida
          el sistema no deja activar la autorización, que es exactamente lo que revisa el evaluador.
        </p>
        {canWrite && <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>Nueva certificación</Button>}
      </div>

      {certs.length === 0 ? (
        <EmptyState icon={<GraduationCap size={32} color={colors.textGhost} />}
          title="Sin certificaciones cargadas"
          subtitle="Cargá las certificaciones por método y nivel: PAUT II, PT II, MT II, CWI, API 510…" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {certs.map(c => {
            const vencida = isExpired(c.expiry_date)
            const proxima = expiresSoon(c.expiry_date)
            const visionVencida = c.vision_exam_date && daysUntil(c.vision_exam_date) < -365
            return (
              <div key={c.id} style={{
                background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl, padding: '12px 14px',
                borderLeft: `4px solid ${vencida || visionVencida ? colors.danger : proxima ? colors.warning : colors.success}`,
              }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ color: colors.text }}>{personName(c.person_id)}</strong>
                      <Badge variant="info">{c.scheme}</Badge>
                      {c.method && <Badge variant="neutral">{c.method} {c.level}</Badge>}
                      {vencida && <Badge variant="danger">Vencida</Badge>}
                      {!vencida && proxima && <Badge variant="warning">Vence en {daysUntil(c.expiry_date)} días</Badge>}
                      {visionVencida && <Badge variant="danger">Visión vencida</Badge>}
                    </div>
                    <div style={{ fontSize: font.sm, color: colors.textMuted, marginTop: '3px' }}>
                      {[
                        c.method && NDT_LABELS[c.method],
                        c.certificate_number && `N° ${c.certificate_number}`,
                        c.certifying_body,
                        c.expiry_date && `vence ${c.expiry_date}`,
                        c.vision_exam_date && `visión ${c.vision_exam_date} (${c.vision_exam_result || 's/d'})`,
                      ].filter(Boolean).join(' · ')}
                    </div>
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

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar certificación' : 'Nueva certificación'} maxWidth="820px">
        <Modal.Section title="Certificación">
          <Row>
            <Field label="Persona" required>
              <Select value={form.person_id} onChange={e => setForm({ ...form, person_id: e.target.value })}>
                <option value="">— elegí —</option>
                {personnel.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Esquema">
              <Select value={form.scheme} onChange={e => setForm({ ...form, scheme: e.target.value })}>
                {SCHEMES.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Método">
              <Select value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
                <option value="">— no aplica —</option>
                {NDT_METHODS.map(m => <option key={m} value={m}>{m} — {NDT_LABELS[m]}</option>)}
              </Select>
            </Field>
            <Field label="Nivel">
              <Select value={form.level} onChange={e => setForm({ ...form, level: e.target.value })}>
                {LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
              </Select>
            </Field>
            <Field label="N° de certificado"><Input value={form.certificate_number} onChange={e => setForm({ ...form, certificate_number: e.target.value })} /></Field>
          </Row>
          <Row>
            <Field label="Certificado por" hint="En SNT-TC-1A certifica el empleador; en ISO 9712, un organismo">
              <Input value={form.certifying_body} onChange={e => setForm({ ...form, certifying_body: e.target.value })} />
            </Field>
            <Field label="Emisión"><Input type="date" value={form.issue_date || ''} onChange={e => setForm({ ...form, issue_date: e.target.value })} /></Field>
            <Field label="Vencimiento"><Input type="date" value={form.expiry_date || ''} onChange={e => setForm({ ...form, expiry_date: e.target.value })} /></Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Agudeza visual y respaldo">
          <Row>
            <Field label="Fecha del examen visual" hint="Vence al año">
              <Input type="date" value={form.vision_exam_date || ''} onChange={e => setForm({ ...form, vision_exam_date: e.target.value })} />
            </Field>
            <Field label="Resultado">
              <Select value={form.vision_exam_result} onChange={e => setForm({ ...form, vision_exam_result: e.target.value })}>
                <option value="Apto">Apto</option>
                <option value="Apto con corrección">Apto con corrección</option>
                <option value="No apto">No apto</option>
              </Select>
            </Field>
            <Field label="Examen práctico"><Input type="date" value={form.practical_exam_date || ''} onChange={e => setForm({ ...form, practical_exam_date: e.target.value })} /></Field>
          </Row>
          <Row>
            <Field label="Horas de formación"><Input type="number" min="0" value={form.training_hours} onChange={e => setForm({ ...form, training_hours: e.target.value })} /></Field>
            <Field label="Horas de experiencia"><Input type="number" min="0" value={form.experience_hours} onChange={e => setForm({ ...form, experience_hours: e.target.value })} /></Field>
            <Field label="Evidencia (link)"><Input value={form.evidence_url} onChange={e => setForm({ ...form, evidence_url: e.target.value })} /></Field>
          </Row>
          <Field label="Notas"><Textarea rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        </Modal.Section>

        <Modal.Footer>
          <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!canWrite}>Guardar</Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}

// ─── Monitoreo ───────────────────────────────────────────────────────────────

function MonitoringTab({ rows, authStatus, personnel, methods, orgId, canWrite, canDelete, personName, methodName, onChanged }) {
  const [modal, setModal] = useState(false)
  const [form, setForm] = useState(EMPTY_MON)
  const [saving, setSaving] = useState(false)

  const pendientes = useMemo(
    () => authStatus.filter(a => ['Sin monitoreo registrado', 'Monitoreo vencido'].includes(a.effective_status)),
    [authStatus])

  const kpis = useMemo(() => {
    const year = new Date().getFullYear()
    const delAnio = rows.filter(r => (r.performed_at || '').startsWith(String(year)))
    return {
      total: rows.length,
      anio: delAnio.length,
      enCampo: delAnio.filter(r => r.activity_type === 'Observación en campo').length,
      noSatisfactorios: rows.filter(r => r.result === 'No satisfactorio').length,
      pendientes: pendientes.length,
    }
  }, [rows, pendientes])

  const openNew = (auth = null) => {
    setForm({
      ...EMPTY_MON,
      person_id: auth?.person_id || '',
      authorization_id: auth?.id || '',
      method_id: auth?.method_id || '',
    })
    setModal(true)
  }

  const save = async () => {
    if (!form.person_id) return toast.warning('Elegí al inspector observado')
    if (!form.observer_name.trim()) return toast.warning('Indicá quién hizo la observación')
    if (form.result !== 'Satisfactorio' && !form.findings.trim()) {
      return toast.warning('Describí los hallazgos: un resultado no satisfactorio sin detalle no sirve como evidencia')
    }
    setSaving(true)
    const { data: { user } } = await supabase.auth.getUser()
    const payload = { ...cleanPayload(form, orgId), created_by: user?.id }
    const { error } = await supabase.from('inspector_monitoring').insert([payload])
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(form.effect === 'Suspende'
      ? 'Monitoreo registrado. La autorización quedó suspendida.'
      : 'Monitoreo registrado')
    setModal(false); onChanged()
  }

  const remove = async (r) => {
    const ok = await confirm('¿Eliminar este registro de monitoreo? Es evidencia de vigilancia del inspector.',
      { title: 'Eliminar monitoreo', tone: 'danger', confirmText: 'Eliminar' })
    if (!ok) return
    const { error } = await supabase.from('inspector_monitoring').delete().eq('id', r.id)
    if (error) return toast.error(error.message)
    toast.success('Registro eliminado'); onChanged()
  }

  return (
    <>
      <Grid min="170px" gap="10px">
        <Kpi label="Registros" value={kpis.total} icon={<Eye size={14} />} color={colors.primary} />
        <Kpi label="Este año" value={kpis.anio} icon={<ClipboardCheck size={14} />} color={colors.info} />
        <Kpi label="En campo" value={kpis.enCampo} icon={<Eye size={14} />} color={colors.info}
          subtitle="observación in situ" />
        <Kpi label="No satisfactorios" value={kpis.noSatisfactorios} icon={<AlertTriangle size={14} />}
          color={kpis.noSatisfactorios > 0 ? colors.warning : colors.success} />
        <Kpi label="Pendientes" value={kpis.pendientes} icon={<Clock size={14} />}
          color={kpis.pendientes > 0 ? colors.warning : colors.success} subtitle="según su frecuencia" />
      </Grid>

      {pendientes.length > 0 && (
        <div style={{
          margin: '16px 0 0', padding: '12px 14px', background: colors.warningLight,
          color: colors.warningText, borderRadius: radius.xl,
        }}>
          <strong>Monitoreo pendiente ({pendientes.length}).</strong> La norma pide observar en campo a cada
          inspector con la frecuencia que fijó el organismo (6.1.5–6.1.6).
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
            {pendientes.map(a => (
              <div key={a.id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', fontSize: font.sm }}>
                <span style={{ flex: '1 1 240px' }}>
                  {a.person_name} — {a.method_name || 'método no asignado'}
                  {a.last_monitoring_at ? ` · último ${a.last_monitoring_at}` : ' · nunca observado'}
                </span>
                {canWrite && (
                  <Button size="sm" variant="primary" icon={<Plus size={13} />} onClick={() => openNew(a)}>
                    Registrar
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', margin: '16px 0 12px' }}>
        {canWrite && <Button variant="primary" icon={<Plus size={16} />} onClick={() => openNew()}>Nuevo monitoreo</Button>}
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<Eye size={32} color={colors.textGhost} />}
          title="Sin monitoreos registrados"
          subtitle="La observación en campo es la evidencia que más peso tiene en la evaluación de acreditación." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {rows.map(r => (
            <div key={r.id} style={{
              background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl, padding: '12px 14px',
              borderLeft: `4px solid ${r.result === 'No satisfactorio' ? colors.danger : r.result === 'Con observaciones' ? colors.warning : colors.success}`,
            }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong style={{ color: colors.text }}>{personName(r.person_id)}</strong>
                    <Badge variant={r.result === 'Satisfactorio' ? 'success' : r.result === 'Con observaciones' ? 'warning' : 'danger'}>
                      {r.result}
                    </Badge>
                    <Badge variant="neutral">{r.activity_type}</Badge>
                    {r.effect !== 'Mantiene' && <Badge variant="danger">{r.effect}</Badge>}
                  </div>
                  <div style={{ fontSize: font.sm, color: colors.textMuted, marginTop: '3px' }}>
                    {[r.performed_at, methodName(r.method_id), r.observer_name && `observó ${r.observer_name}`, r.item_reference]
                      .filter(Boolean).join(' · ')}
                  </div>
                  {r.findings && <div style={{ fontSize: font.sm, color: colors.text, marginTop: '5px' }}>{r.findings}</div>}
                  {r.training_need && (
                    <div style={{ fontSize: font.xs, color: colors.textMuted, marginTop: '4px' }}>
                      <strong>Necesidad de formación:</strong> {r.training_need}
                    </div>
                  )}
                </div>
                {canDelete && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(r)} />}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title="Registrar monitoreo de inspector" maxWidth="820px">
        <Modal.Section title="Qué se observó">
          <Row>
            <Field label="Inspector" required>
              <Select value={form.person_id} onChange={e => setForm({ ...form, person_id: e.target.value })}>
                <option value="">— elegí —</option>
                {personnel.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Autorización vigilada" hint="Si la elegís, el resultado puede suspenderla">
              <Select value={form.authorization_id} onChange={e => {
                const a = authStatus.find(x => x.id === e.target.value)
                setForm({ ...form, authorization_id: e.target.value, method_id: a?.method_id || form.method_id, person_id: a?.person_id || form.person_id })
              }}>
                <option value="">— ninguna —</option>
                {authStatus.map(a => <option key={a.id} value={a.id}>{a.person_name} — {a.method_name || 'sin método'}</option>)}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Tipo de monitoreo">
              <Select value={form.activity_type} onChange={e => setForm({ ...form, activity_type: e.target.value })}>
                {MONITORING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Fecha"><Input type="date" value={form.performed_at} onChange={e => setForm({ ...form, performed_at: e.target.value })} /></Field>
            <Field label="Método">
              <Select value={form.method_id} onChange={e => setForm({ ...form, method_id: e.target.value })}>
                <option value="">— sin método —</option>
                {methods.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Quién observó" required><Input value={form.observer_name} onChange={e => setForm({ ...form, observer_name: e.target.value })} /></Field>
            <Field label="Ítem o informe observado"><Input value={form.item_reference} onChange={e => setForm({ ...form, item_reference: e.target.value })} /></Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Resultado y consecuencias">
          <Row>
            <Field label="Resultado">
              <Select value={form.result} onChange={e => setForm({ ...form, result: e.target.value })}>
                {MONITORING_RESULTS.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
            <Field label="Efecto sobre la autorización" hint="“Suspende” la deja inhabilitada al instante">
              <Select value={form.effect} onChange={e => setForm({ ...form, effect: e.target.value })}>
                {MONITORING_EFFECTS.map(e2 => <option key={e2} value={e2}>{e2}</option>)}
              </Select>
            </Field>
            <Field label="Próximo monitoreo"><Input type="date" value={form.next_due_date || ''} onChange={e => setForm({ ...form, next_due_date: e.target.value })} /></Field>
          </Row>
          <Field label="Hallazgos"><Textarea rows={3} value={form.findings} onChange={e => setForm({ ...form, findings: e.target.value })} /></Field>
          <Row>
            <Field label="Acciones requeridas"><Textarea rows={2} value={form.actions_required} onChange={e => setForm({ ...form, actions_required: e.target.value })} /></Field>
            <Field label="Necesidad de formación detectada (6.1.8)">
              <Textarea rows={2} value={form.training_need} onChange={e => setForm({ ...form, training_need: e.target.value })} />
            </Field>
          </Row>
          <Field label="Evidencia (link)"><Input value={form.evidence_url} onChange={e => setForm({ ...form, evidence_url: e.target.value })} /></Field>
        </Modal.Section>

        <Modal.Footer>
          <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!canWrite}>Registrar</Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
