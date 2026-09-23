// =============================================================================
// ResultValidity — ISO/IEC 17020, fase 5: validez de los resultados
//
// Tres pestañas:
//   1. Control de resultados (7.5) — reinspecciones, comparaciones entre
//      inspectores, ensayos de aptitud y verificación intermedia de equipos.
//   2. Validación de métodos (7.2.6) — el expediente que demuestra que el
//      método propio o modificado detecta lo que dice detectar.
//   3. Validación del sistema (7.5.1) — IsoSmartCore versión por versión.
//
// La idea que ordena todo: un control que sale mal no termina en el control.
// Si un inspector falla una comparación o un equipo aparece fuera de
// tolerancia, quedan en duda los informes firmados desde el último control
// bueno. Por eso no se cierra sin evaluar ese impacto.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import {
  Microscope, Plus, Pencil, Trash2, Search, AlertTriangle, CheckCircle2,
  FlaskConical, MonitorCheck, Repeat, ShieldAlert,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import { can } from './lib/roles'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'
import {
  Button, Modal, Field, Row, Input, Select, Textarea, Badge, Kpi,
  EmptyState, Spinner, Grid, PageHeader, colors, radius, font,
} from './components/ui'

// ─── Catálogos ───────────────────────────────────────────────────────────────

const CONTROL_TYPES = [
  'Reinspección interna',
  'Comparación entre inspectores',
  'Ensayo de aptitud',
  'Comparación interlaboratorio',
  'Probeta o patrón de referencia',
  'Verificación intermedia de equipo',
  'Revisión técnica de informes',
]
const RESULTS = { 'Satisfactorio': 'success', 'Cuestionable': 'warning', 'No satisfactorio': 'danger' }
const CONTROL_STATUS = { 'Abierto': 'warning', 'En análisis': 'info', 'Cerrado': 'success' }
const CONCLUSIONS = { 'Válido': 'success', 'Válido con limitaciones': 'warning', 'No válido': 'danger' }
const SYS_RESULTS = { 'Conforme': 'success', 'Conforme con observaciones': 'warning', 'No conforme': 'danger' }
const CONTROL_HEALTH = {
  'Al día': 'success',
  'Sin control de resultados': 'warning',
  'Control vencido': 'warning',
  'Falta validación': 'danger',
  'Último control no satisfactorio': 'danger',
}

const EMPTY_CONTROL = {
  code: '', control_type: 'Reinspección interna', performed_at: new Date().toISOString().slice(0, 10),
  method_id: '', scope_id: '', inspection_id: '', item_id: '',
  person_id: '', second_person_id: '', equipment_ref: '', provider: '',
  reference_value: '', obtained_value: '', deviation: '', acceptance_criteria: '',
  result: 'Satisfactorio', analysis: '', actions_taken: '',
  impact_evaluated: false, impact_note: '', clients_notified: false, nonconformity_ref: '',
  next_due_date: '', evidence_url: '', status: 'Abierto', notes: '',
}

const EMPTY_VALIDATION = {
  method_id: '', validation_date: new Date().toISOString().slice(0, 10), reason: '',
  approach: '', samples_used: '', acceptance_criteria: '', results: '',
  detection_capability: '', limitations: '', performed_by: '', reviewed_by: '',
  conclusion: 'Válido', evidence_url: '', next_review: '', notes: '',
}

const EMPTY_SYSTEM = {
  system_name: 'IsoSmartCore', version_ref: '', change_description: '',
  validation_date: new Date().toISOString().slice(0, 10),
  tests_performed: '', expected_behaviour: '', observed_behaviour: '',
  result: 'Conforme', restrictions: '', authorized_by: '', authorized_at: '',
  backup_verified: false, access_reviewed: false, evidence_url: '', notes: '',
}

const NULLABLE = [
  'method_id', 'scope_id', 'inspection_id', 'item_id', 'person_id', 'second_person_id',
  'next_due_date', 'next_review', 'authorized_at',
]

function clean(form, orgId) {
  const payload = { ...form, org_id: orgId }
  NULLABLE.forEach(k => { if (k in payload && !payload[k]) payload[k] = null })
  return payload
}

// Corte de los ultimos 12 meses, fijado al cargar el modulo
const HACE_12M = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)

const nameOf = (list, id) => list.find(p => p.id === id)?.full_name || ''
const methodLabel = (methods, id) => {
  const m = methods.find(x => x.id === id)
  return m ? `${m.code ? m.code + ' · ' : ''}${m.name}` : ''
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function ResultValidity() {
  const { org, role } = useOrg()
  const canWrite = can(role, 'result_quality_controls', 'write')
  const canDelete = can(role, 'result_quality_controls', 'delete')

  const [tab, setTab] = useState('controls')
  const [controls, setControls] = useState([])
  const [validations, setValidations] = useState([])
  const [systemRecords, setSystemRecords] = useState([])
  const [methods, setMethods] = useState([])
  const [personnel, setPersonnel] = useState([])
  const [inspections, setInspections] = useState([])
  const [health, setHealth] = useState([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [qc, mv, sv, me, per, ins, st] = await Promise.all([
      supabase.from('result_quality_controls').select('*').eq('org_id', org.id).order('performed_at', { ascending: false }),
      supabase.from('method_validations').select('*').eq('org_id', org.id).order('validation_date', { ascending: false }),
      supabase.from('system_validation_records').select('*').eq('org_id', org.id).order('validation_date', { ascending: false }),
      supabase.from('inspection_methods').select('id, code, name, status, method_source, validation_status').eq('org_id', org.id).order('name'),
      supabase.from('personnel').select('id, full_name').eq('org_id', org.id).order('full_name'),
      supabase.from('inspections').select('id, code').eq('org_id', org.id).order('created_at', { ascending: false }),
      supabase.from('method_quality_control_status').select('*').eq('org_id', org.id),
    ])
    const err = qc.error || mv.error || sv.error
    if (err) {
      toast.error(/result_quality_controls|method_validations|system_validation/i.test(err.message)
        ? 'Falta aplicar la migración de validez de resultados (fase 5).'
        : 'No se pudo cargar: ' + err.message)
    }
    setControls(qc.data || [])
    setValidations(mv.data || [])
    setSystemRecords(sv.data || [])
    setMethods(me.data || [])
    setPersonnel(per.data || [])
    setInspections(ins.data || [])
    setHealth(st.data || [])
    setLoading(false)
  }

  useEffect(() => { if (org?.id) load() }, [org?.id])

  if (loading) return <Spinner label="Cargando control de la validez de los resultados…" />

  const TABS = [
    { id: 'controls', label: 'Control de resultados', clause: '7.5', icon: Repeat, n: controls.length },
    { id: 'validations', label: 'Validación de métodos', clause: '7.2.6', icon: FlaskConical, n: validations.length },
    { id: 'system', label: 'Validación del sistema', clause: '7.5.1', icon: MonitorCheck, n: systemRecords.length },
  ]

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        icon={<Microscope size={28} color={colors.primary} />}
        title="Validez de los resultados"
        subtitle="ISO/IEC 17020: controles de calidad técnica, validación de métodos y validación del sistema"
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

      {tab === 'controls' && (
        <ControlsTab controls={controls} methods={methods} personnel={personnel}
          inspections={inspections} health={health} canWrite={canWrite} canDelete={canDelete}
          orgId={org.id} onChanged={load} />
      )}
      {tab === 'validations' && (
        <ValidationsTab validations={validations} methods={methods} canWrite={canWrite}
          canDelete={canDelete} orgId={org.id} onChanged={load} />
      )}
      {tab === 'system' && (
        <SystemTab records={systemRecords} canWrite={canWrite} canDelete={canDelete}
          orgId={org.id} onChanged={load} />
      )}
    </div>
  )
}

// ─── Pestaña 1: control de la validez de los resultados ──────────────────────

function ControlsTab({ controls, methods, personnel, inspections, health, canWrite, canDelete, orgId, onChanged }) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_CONTROL)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const kpis = useMemo(() => ({
    total12m: controls.filter(c => c.performed_at >= HACE_12M).length,
    fallidos: controls.filter(c => c.result === 'No satisfactorio').length,
    sinImpacto: controls.filter(c => c.result !== 'Satisfactorio' && !c.impact_evaluated).length,
    abiertos: controls.filter(c => c.status !== 'Cerrado').length,
  }), [controls])

  const alerta = health.filter(h => h.control_status && h.control_status !== 'Al día')

  const filtered = useMemo(() => controls.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return [c.code, c.control_type, c.equipment_ref, c.provider, c.analysis, methodLabel(methods, c.method_id)]
      .filter(Boolean).join(' ').toLowerCase().includes(q)
  }), [controls, methods, search])

  const openNew = (methodId) => {
    setForm({ ...EMPTY_CONTROL, method_id: methodId || '' })
    setEditing(null); setModal(true)
  }
  const openEdit = (c) => {
    setForm({ ...EMPTY_CONTROL, ...Object.fromEntries(
      Object.keys(EMPTY_CONTROL).map(k => [k, c[k] ?? EMPTY_CONTROL[k]])) })
    setEditing(c); setModal(true)
  }

  const save = async () => {
    if (!form.acceptance_criteria.trim()) {
      return toast.warning('Decí contra qué criterio se juzga el resultado del control')
    }
    setSaving(true)
    const { error } = editing
      ? await supabase.from('result_quality_controls').update(clean(form, orgId)).eq('id', editing.id)
      : await supabase.from('result_quality_controls').insert([clean(form, orgId)])
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(editing ? 'Control actualizado' : 'Control registrado')
    setModal(false); onChanged()
  }

  const remove = async (c) => {
    const ok = await confirm('¿Eliminar este control?', { title: 'Eliminar', tone: 'danger', confirmText: 'Eliminar' })
    if (!ok) return
    const { error } = await supabase.from('result_quality_controls').delete().eq('id', c.id)
    if (error) return toast.error(error.message)
    toast.success('Control eliminado'); onChanged()
  }

  const malResultado = form.result !== 'Satisfactorio'

  return (
    <>
      <Grid min="170px" gap="10px">
        <Kpi label="Controles (12 meses)" value={kpis.total12m} icon={<Repeat size={14} />} color={colors.primary} />
        <Kpi label="No satisfactorios" value={kpis.fallidos} icon={<AlertTriangle size={14} />}
          color={kpis.fallidos > 0 ? colors.danger : colors.success} />
        <Kpi label="Sin evaluar impacto" value={kpis.sinImpacto} icon={<ShieldAlert size={14} />}
          color={kpis.sinImpacto > 0 ? colors.danger : colors.success} subtitle="informes en duda" />
        <Kpi label="Abiertos" value={kpis.abiertos} icon={<CheckCircle2 size={14} />}
          color={kpis.abiertos > 0 ? colors.warning : colors.success} />
      </Grid>

      {alerta.length > 0 && (
        <div style={{
          background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl,
          padding: '12px 14px', marginTop: '16px',
        }}>
          <div style={{ fontSize: font.sm, fontWeight: 700, color: colors.text, marginBottom: '8px' }}>
            Métodos que necesitan atención
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {alerta.map(h => (
              <div key={h.method_id} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
                <Badge variant={CONTROL_HEALTH[h.control_status] || 'neutral'}>{h.control_status}</Badge>
                <span style={{ fontSize: font.sm, flex: 1 }}>
                  {h.method_code ? `${h.method_code} · ` : ''}{h.method_name}
                  {h.last_control_at && (
                    <span style={{ color: colors.textMuted }}> · último control {h.last_control_at}</span>
                  )}
                </span>
                {canWrite && (
                  <Button size="sm" variant="ghost" icon={<Plus size={14} />} onClick={() => openNew(h.method_id)}>
                    Registrar control
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', margin: '16px 0 12px' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: colors.textGhost }} />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por tipo, método o equipo…" style={{ paddingLeft: '30px' }} />
        </div>
        {canWrite && <Button variant="primary" icon={<Plus size={16} />} onClick={() => openNew()}>Nuevo control</Button>}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Repeat size={32} color={colors.textGhost} />}
          title={controls.length ? 'Sin resultados' : 'Todavía no registraste controles'}
          subtitle="La norma pide demostrar que los resultados siguen siendo válidos: reinspeccionar una pieza ya inspeccionada, comparar dos inspectores sobre el mismo ítem o verificar un equipo contra un patrón." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(c => (
            <div key={c.id} style={{
              background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl,
              padding: '12px 14px',
              borderLeft: `4px solid ${c.result === 'No satisfactorio' ? colors.danger
                : c.result === 'Cuestionable' ? colors.warning : colors.success}`,
            }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {c.code && <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{c.code}</span>}
                    <Badge variant="info">{c.control_type}</Badge>
                    <Badge variant={RESULTS[c.result] || 'neutral'}>{c.result}</Badge>
                    <Badge variant={CONTROL_STATUS[c.status] || 'neutral'}>{c.status}</Badge>
                    {c.result !== 'Satisfactorio' && !c.impact_evaluated && (
                      <Badge variant="danger">Falta evaluar impacto</Badge>
                    )}
                  </div>
                  <div style={{ fontSize: font.sm, color: colors.textMuted, marginTop: '4px' }}>
                    {[c.performed_at, methodLabel(methods, c.method_id),
                      c.person_id ? nameOf(personnel, c.person_id) : null,
                      c.equipment_ref, c.provider].filter(Boolean).join(' · ')}
                  </div>
                  {(c.reference_value || c.obtained_value) && (
                    <div style={{ fontSize: font.sm, color: colors.text, marginTop: '3px' }}>
                      Referencia: {c.reference_value || '—'} · Obtenido: {c.obtained_value || '—'}
                      {c.deviation && ` · Desvío: ${c.deviation}`}
                    </div>
                  )}
                  {c.impact_note && (
                    <div style={{ fontSize: font.xs, color: colors.textMuted, marginTop: '3px' }}>
                      <strong>Impacto:</strong> {c.impact_note}
                    </div>
                  )}
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

      <Modal open={modal} onClose={() => setModal(false)} maxWidth="860px"
        title={editing ? 'Control de la validez de los resultados' : 'Nuevo control'}>
        <Modal.Section title="Qué se controló">
          <Row>
            <Field label="Tipo de control">
              <Select value={form.control_type} onChange={e => setForm({ ...form, control_type: e.target.value })}>
                {CONTROL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Select>
            </Field>
            <Field label="Fecha">
              <Input type="date" value={form.performed_at || ''} onChange={e => setForm({ ...form, performed_at: e.target.value })} />
            </Field>
            <Field label="Número"><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="CC-2026-004" /></Field>
          </Row>
          <Row>
            <Field label="Método">
              <Select value={form.method_id} onChange={e => setForm({ ...form, method_id: e.target.value })}>
                <option value="">— no aplica —</option>
                {methods.map(m => <option key={m.id} value={m.id}>{methodLabel(methods, m.id)}</option>)}
              </Select>
            </Field>
            <Field label="Inspección relacionada">
              <Select value={form.inspection_id} onChange={e => setForm({ ...form, inspection_id: e.target.value })}>
                <option value="">— no aplica —</option>
                {inspections.map(i => <option key={i.id} value={i.id}>{i.code}</option>)}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Inspector evaluado">
              <Select value={form.person_id} onChange={e => setForm({ ...form, person_id: e.target.value })}>
                <option value="">— no aplica —</option>
                {personnel.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Se compara con">
              <Select value={form.second_person_id} onChange={e => setForm({ ...form, second_person_id: e.target.value })}>
                <option value="">— no aplica —</option>
                {personnel.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Equipo verificado">
              <Input value={form.equipment_ref} onChange={e => setForm({ ...form, equipment_ref: e.target.value })} placeholder="OmniScan X3 S/N 12345" />
            </Field>
            <Field label="Organizador" hint="Ensayos de aptitud o comparaciones externas">
              <Input value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} />
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Resultado">
          <Row>
            <Field label="Valor de referencia" hint="Defecto patrón, valor conocido o resultado esperado">
              <Input value={form.reference_value} onChange={e => setForm({ ...form, reference_value: e.target.value })} />
            </Field>
            <Field label="Valor obtenido"><Input value={form.obtained_value} onChange={e => setForm({ ...form, obtained_value: e.target.value })} /></Field>
            <Field label="Desvío"><Input value={form.deviation} onChange={e => setForm({ ...form, deviation: e.target.value })} /></Field>
          </Row>
          <Row>
            <Field label="Criterio de aceptación" required hint="Contra qué se juzga el desvío">
              <Input value={form.acceptance_criteria} onChange={e => setForm({ ...form, acceptance_criteria: e.target.value })}
                placeholder="Diferencia menor a 0,5 mm respecto del valor patrón" />
            </Field>
            <Field label="Resultado">
              <Select value={form.result} onChange={e => setForm({ ...form, result: e.target.value })}>
                {Object.keys(RESULTS).map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
            <Field label="Estado">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.keys(CONTROL_STATUS).map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </Row>
          <Field label="Análisis"><Textarea rows={2} value={form.analysis} onChange={e => setForm({ ...form, analysis: e.target.value })} /></Field>
        </Modal.Section>

        {malResultado && (
          <Modal.Section title="Qué hacemos con los informes ya emitidos (7.5)">
            <div style={{
              background: colors.dangerLight, color: colors.dangerText, padding: '10px 12px',
              borderRadius: radius.md, fontSize: font.sm, marginBottom: '10px',
            }}>
              Un resultado <strong>{form.result.toLowerCase()}</strong> pone en duda lo firmado desde el último
              control bueno. Sin evaluar ese impacto, el control no se puede cerrar.
            </div>
            <Field label="Acciones tomadas" required>
              <Textarea rows={2} value={form.actions_taken} onChange={e => setForm({ ...form, actions_taken: e.target.value })} />
            </Field>
            <Row>
              <Field label="¿Se evaluó el impacto?">
                <Select value={form.impact_evaluated ? '1' : '0'} onChange={e => setForm({ ...form, impact_evaluated: e.target.value === '1' })}>
                  <option value="0">Todavía no</option>
                  <option value="1">Sí, evaluado</option>
                </Select>
              </Field>
              <Field label="¿Se avisó a los clientes alcanzados?">
                <Select value={form.clients_notified ? '1' : '0'} onChange={e => setForm({ ...form, clients_notified: e.target.value === '1' })}>
                  <option value="0">No hizo falta</option>
                  <option value="1">Sí</option>
                </Select>
              </Field>
              <Field label="No conformidad abierta">
                <Input value={form.nonconformity_ref} onChange={e => setForm({ ...form, nonconformity_ref: e.target.value })} placeholder="NC-2026-012" />
              </Field>
            </Row>
            <Field label="Qué informes quedaron alcanzados y qué se resolvió" required>
              <Textarea rows={2} value={form.impact_note} onChange={e => setForm({ ...form, impact_note: e.target.value })}
                placeholder="Informes INF-2026-031 a 034: se reinspeccionaron las juntas y se emitió enmienda del 033." />
            </Field>
          </Modal.Section>
        )}

        <Modal.Section title="Seguimiento">
          <Row>
            <Field label="Próximo control"><Input type="date" value={form.next_due_date || ''} onChange={e => setForm({ ...form, next_due_date: e.target.value })} /></Field>
            <Field label="Evidencia (enlace)"><Input value={form.evidence_url} onChange={e => setForm({ ...form, evidence_url: e.target.value })} /></Field>
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

// ─── Pestaña 2: validación de métodos ────────────────────────────────────────

function ValidationsTab({ validations, methods, canWrite, canDelete, orgId, onChanged }) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_VALIDATION)
  const [saving, setSaving] = useState(false)

  // Los que la norma obliga a validar: método propio o norma modificada
  const requieren = methods.filter(m => ['modificado', 'no_normalizado'].includes(m.method_source))
  const validados = new Set(validations.filter(v => v.conclusion !== 'No válido').map(v => v.method_id))
  const faltan = requieren.filter(m => !validados.has(m.id))

  const openNew = (methodId) => { setForm({ ...EMPTY_VALIDATION, method_id: methodId || '' }); setEditing(null); setModal(true) }
  const openEdit = (v) => {
    setForm({ ...EMPTY_VALIDATION, ...Object.fromEntries(
      Object.keys(EMPTY_VALIDATION).map(k => [k, v[k] ?? EMPTY_VALIDATION[k]])) })
    setEditing(v); setModal(true)
  }

  const save = async () => {
    if (!form.method_id) return toast.warning('Elegí el método validado')
    if (!form.acceptance_criteria.trim()) return toast.warning('Indicá contra qué criterio se valida')
    setSaving(true)
    const { error } = editing
      ? await supabase.from('method_validations').update(clean(form, orgId)).eq('id', editing.id)
      : await supabase.from('method_validations').insert([clean(form, orgId)])
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success('Validación registrada. El método quedó marcado en consecuencia.')
    setModal(false); onChanged()
  }

  const remove = async (v) => {
    const ok = await confirm('¿Eliminar este expediente de validación?',
      { title: 'Eliminar', tone: 'danger', confirmText: 'Eliminar' })
    if (!ok) return
    const { error } = await supabase.from('method_validations').delete().eq('id', v.id)
    if (error) return toast.error(error.message)
    toast.success('Validación eliminada'); onChanged()
  }

  return (
    <>
      <Grid min="170px" gap="10px">
        <Kpi label="Validaciones registradas" value={validations.length} icon={<FlaskConical size={14} />} color={colors.primary} />
        <Kpi label="Métodos que la requieren" value={requieren.length} icon={<AlertTriangle size={14} />} color={colors.info}
          subtitle="propios o modificados" />
        <Kpi label="Sin validar" value={faltan.length} icon={<ShieldAlert size={14} />}
          color={faltan.length > 0 ? colors.danger : colors.success} />
      </Grid>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', margin: '16px 0 12px' }}>
        <p style={{ flex: 1, margin: 0, fontSize: font.sm, color: colors.textMuted, maxWidth: '72ch' }}>
          Validar no es firmar un papel: es demostrar con probetas o con comparaciones que el método detecta
          lo que dice detectar. Al guardar la conclusión, el método queda marcado como validado o no validado.
        </p>
        {canWrite && <Button variant="primary" icon={<Plus size={16} />} onClick={() => openNew()}>Nueva validación</Button>}
      </div>

      {faltan.length > 0 && (
        <div style={{
          background: colors.warningLight, color: colors.warningText, padding: '10px 12px',
          borderRadius: radius.md, marginBottom: '12px', fontSize: font.sm,
        }}>
          <strong>Sin expediente de validación:</strong>{' '}
          {faltan.map(m => (
            <button key={m.id} type="button" onClick={() => canWrite && openNew(m.id)}
              style={{
                border: 'none', background: 'transparent', color: 'inherit', textDecoration: 'underline',
                cursor: canWrite ? 'pointer' : 'default', padding: '0 4px', fontSize: font.sm,
              }}>{methodLabel(methods, m.id)}</button>
          ))}
        </div>
      )}

      {validations.length === 0 ? (
        <EmptyState icon={<FlaskConical size={32} color={colors.textGhost} />}
          title="Sin expedientes de validación"
          subtitle="Solo hacen falta para métodos propios o que modifican la norma. Un método aplicado tal cual la norma no se valida: se verifica que se ejecuta bien." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {validations.map(v => (
            <div key={v.id} style={{
              background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl,
              padding: '12px 14px',
              borderLeft: `4px solid ${v.conclusion === 'No válido' ? colors.danger
                : v.conclusion === 'Válido con limitaciones' ? colors.warning : colors.success}`,
            }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong>{methodLabel(methods, v.method_id) || 'Método eliminado'}</strong>
                    <Badge variant={CONCLUSIONS[v.conclusion] || 'neutral'}>{v.conclusion}</Badge>
                    <span style={{ fontSize: font.xs, color: colors.textMuted }}>{v.validation_date}</span>
                  </div>
                  {v.detection_capability && (
                    <div style={{ fontSize: font.sm, color: colors.text, marginTop: '4px' }}>
                      <strong>Capacidad demostrada:</strong> {v.detection_capability}
                    </div>
                  )}
                  <div style={{ fontSize: font.sm, color: colors.textMuted, marginTop: '3px' }}>
                    {[v.approach, v.samples_used, v.performed_by && `por ${v.performed_by}`]
                      .filter(Boolean).join(' · ')}
                  </div>
                  {v.limitations && (
                    <div style={{ fontSize: font.xs, color: colors.warningText, marginTop: '3px' }}>
                      Limitaciones: {v.limitations}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {canWrite && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => openEdit(v)}>Abrir</Button>}
                  {canDelete && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(v)} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} maxWidth="820px"
        title={editing ? 'Expediente de validación' : 'Validar un método'}>
        <Modal.Section title="Qué se valida (7.2.6)">
          <Row>
            <Field label="Método" required>
              <Select value={form.method_id} onChange={e => setForm({ ...form, method_id: e.target.value })}>
                <option value="">— elegí el método —</option>
                {methods.map(m => <option key={m.id} value={m.id}>{methodLabel(methods, m.id)}</option>)}
              </Select>
            </Field>
            <Field label="Fecha">
              <Input type="date" value={form.validation_date || ''} onChange={e => setForm({ ...form, validation_date: e.target.value })} />
            </Field>
            <Field label="Conclusión">
              <Select value={form.conclusion} onChange={e => setForm({ ...form, conclusion: e.target.value })}>
                {Object.keys(CONCLUSIONS).map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
          </Row>
          <Field label="Por qué se valida" hint="Método propio, desviación de la norma, cambio de equipo o de técnica">
            <Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
          </Field>
        </Modal.Section>

        <Modal.Section title="Cómo se validó">
          <Row>
            <Field label="Enfoque" hint="Probetas con defectos conocidos, comparación con otro método, datos históricos">
              <Textarea rows={2} value={form.approach} onChange={e => setForm({ ...form, approach: e.target.value })} />
            </Field>
            <Field label="Probetas usadas" hint="Con sus defectos reales y dimensiones">
              <Textarea rows={2} value={form.samples_used} onChange={e => setForm({ ...form, samples_used: e.target.value })} />
            </Field>
          </Row>
          <Field label="Criterio de aceptación" required hint="Qué tenía que cumplir para considerarse válido">
            <Input value={form.acceptance_criteria} onChange={e => setForm({ ...form, acceptance_criteria: e.target.value })}
              placeholder="Detectar el 100 % de los defectos de 3 mm o más, sin falsos rechazos por encima del 10 %" />
          </Field>
          <Field label="Resultados obtenidos" required>
            <Textarea rows={2} value={form.results} onChange={e => setForm({ ...form, results: e.target.value })} />
          </Field>
          <Row>
            <Field label="Capacidad de detección demostrada">
              <Input value={form.detection_capability} onChange={e => setForm({ ...form, detection_capability: e.target.value })}
                placeholder="Defecto mínimo detectado: 2 mm de altura" />
            </Field>
            <Field label="Limitaciones">
              <Input value={form.limitations} onChange={e => setForm({ ...form, limitations: e.target.value })}
                placeholder="No aplicable a espesores menores de 8 mm" />
            </Field>
          </Row>
          <Row>
            <Field label="Ejecutó"><Input value={form.performed_by} onChange={e => setForm({ ...form, performed_by: e.target.value })} /></Field>
            <Field label="Revisó y aprobó"><Input value={form.reviewed_by} onChange={e => setForm({ ...form, reviewed_by: e.target.value })} placeholder="Nivel III" /></Field>
            <Field label="Evidencia (enlace)"><Input value={form.evidence_url} onChange={e => setForm({ ...form, evidence_url: e.target.value })} /></Field>
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

// ─── Pestaña 3: validación del sistema ───────────────────────────────────────

function SystemTab({ records, canWrite, canDelete, orgId, onChanged }) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_SYSTEM)
  const [saving, setSaving] = useState(false)

  const openNew = () => { setForm(EMPTY_SYSTEM); setEditing(null); setModal(true) }
  const openEdit = (r) => {
    setForm({ ...EMPTY_SYSTEM, ...Object.fromEntries(
      Object.keys(EMPTY_SYSTEM).map(k => [k, r[k] ?? EMPTY_SYSTEM[k]])) })
    setEditing(r); setModal(true)
  }

  const save = async () => {
    if (!form.version_ref.trim()) return toast.warning('Indicá qué versión o cambio se valida')
    setSaving(true)
    const { error } = editing
      ? await supabase.from('system_validation_records').update(clean(form, orgId)).eq('id', editing.id)
      : await supabase.from('system_validation_records').insert([clean(form, orgId)])
    setSaving(false)
    if (error) {
      return toast.error(/uq_system_validation_version|duplicate/i.test(error.message)
        ? `Ya registraste la versión "${form.version_ref}".` : error.message)
    }
    toast.success('Validación del sistema registrada')
    setModal(false); onChanged()
  }

  const remove = async (r) => {
    const ok = await confirm('¿Eliminar este registro?', { title: 'Eliminar', tone: 'danger', confirmText: 'Eliminar' })
    if (!ok) return
    const { error } = await supabase.from('system_validation_records').delete().eq('id', r.id)
    if (error) return toast.error(error.message)
    toast.success('Registro eliminado'); onChanged()
  }

  return (
    <>
      <div style={{
        background: colors.bgMuted, border: `1px solid ${colors.border}`, borderRadius: radius.xl,
        padding: '14px 16px', marginBottom: '14px',
      }}>
        <p style={{ margin: 0, fontSize: font.sm, color: colors.textMuted, lineHeight: 1.5, maxWidth: '78ch' }}>
          La norma exime al software comercial de uso general, pero conviene no apoyarse en esa exención: el
          sistema calcula estados, bloquea firmas y emite informes. Con dejar registrado, versión por versión,
          <strong> qué cambió, qué se probó y quién autorizó usarlo</strong>, el requisito queda cubierto sin
          discusión.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '12px' }}>
        <Kpi label="Versiones validadas" value={records.length} icon={<MonitorCheck size={14} />} color={colors.primary} />
        {canWrite && <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>Registrar versión</Button>}
      </div>

      {records.length === 0 ? (
        <EmptyState icon={<MonitorCheck size={32} color={colors.textGhost} />}
          title="Sin versiones registradas"
          subtitle="Empezá por la versión que estás usando hoy: qué probaste (que no se pueda firmar sin autorización, que el informe emitido no se edite) y quién autorizó su uso." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {records.map(r => (
            <div key={r.id} style={{
              background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl,
              padding: '12px 14px',
              borderLeft: `4px solid ${r.result === 'No conforme' ? colors.danger
                : r.result === 'Conforme con observaciones' ? colors.warning : colors.success}`,
            }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <strong>{r.system_name}</strong>
                    <span style={{ fontFamily: 'monospace' }}>{r.version_ref}</span>
                    <Badge variant={SYS_RESULTS[r.result] || 'neutral'}>{r.result}</Badge>
                    {r.backup_verified && <Badge variant="success">Respaldo probado</Badge>}
                    {r.access_reviewed && <Badge variant="success">Accesos revisados</Badge>}
                  </div>
                  {r.change_description && (
                    <div style={{ fontSize: font.sm, color: colors.text, marginTop: '4px' }}>{r.change_description}</div>
                  )}
                  <div style={{ fontSize: font.xs, color: colors.textMuted, marginTop: '3px' }}>
                    Validado el {r.validation_date}
                    {r.authorized_by && ` · autorizado por ${r.authorized_by}${r.authorized_at ? ` el ${r.authorized_at}` : ''}`}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {canWrite && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => openEdit(r)}>Abrir</Button>}
                  {canDelete && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(r)} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} maxWidth="820px"
        title={editing ? 'Validación del sistema' : 'Registrar validación de una versión'}>
        <Modal.Section title="Qué versión se valida (7.5.1)">
          <Row>
            <Field label="Sistema"><Input value={form.system_name} onChange={e => setForm({ ...form, system_name: e.target.value })} /></Field>
            <Field label="Versión o cambio" required>
              <Input value={form.version_ref} onChange={e => setForm({ ...form, version_ref: e.target.value })} placeholder="2026-09 · fase 5" />
            </Field>
            <Field label="Fecha">
              <Input type="date" value={form.validation_date || ''} onChange={e => setForm({ ...form, validation_date: e.target.value })} />
            </Field>
          </Row>
          <Field label="Qué cambió respecto de la versión anterior">
            <Textarea rows={2} value={form.change_description} onChange={e => setForm({ ...form, change_description: e.target.value })} />
          </Field>
        </Modal.Section>

        <Modal.Section title="Pruebas">
          <Field label="Qué se probó" required hint="Las funciones que afectan al resultado o al informe">
            <Textarea rows={2} value={form.tests_performed} onChange={e => setForm({ ...form, tests_performed: e.target.value })}
              placeholder="No deja firmar a un inspector no autorizado · no deja editar un informe emitido · el estado del inspector considera la visión vencida" />
          </Field>
          <Row>
            <Field label="Comportamiento esperado"><Textarea rows={2} value={form.expected_behaviour} onChange={e => setForm({ ...form, expected_behaviour: e.target.value })} /></Field>
            <Field label="Comportamiento observado"><Textarea rows={2} value={form.observed_behaviour} onChange={e => setForm({ ...form, observed_behaviour: e.target.value })} /></Field>
          </Row>
          <Row>
            <Field label="Resultado">
              <Select value={form.result} onChange={e => setForm({ ...form, result: e.target.value })}>
                {Object.keys(SYS_RESULTS).map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
            <Field label="Restricciones de uso"><Input value={form.restrictions} onChange={e => setForm({ ...form, restrictions: e.target.value })} /></Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Autorización y resguardo">
          <Row>
            <Field label="Autoriza el uso" required hint="La norma pide autorizar el cambio antes de implementarlo">
              <Input value={form.authorized_by} onChange={e => setForm({ ...form, authorized_by: e.target.value })} />
            </Field>
            <Field label="Fecha de autorización" required>
              <Input type="date" value={form.authorized_at || ''} onChange={e => setForm({ ...form, authorized_at: e.target.value })} />
            </Field>
          </Row>
          <Row>
            <Field label="¿Se probó el respaldo y la recuperación?">
              <Select value={form.backup_verified ? '1' : '0'} onChange={e => setForm({ ...form, backup_verified: e.target.value === '1' })}>
                <option value="0">Todavía no</option><option value="1">Sí</option>
              </Select>
            </Field>
            <Field label="¿Se revisaron los permisos de acceso?">
              <Select value={form.access_reviewed ? '1' : '0'} onChange={e => setForm({ ...form, access_reviewed: e.target.value === '1' })}>
                <option value="0">Todavía no</option><option value="1">Sí</option>
              </Select>
            </Field>
            <Field label="Evidencia (enlace)"><Input value={form.evidence_url} onChange={e => setForm({ ...form, evidence_url: e.target.value })} /></Field>
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
