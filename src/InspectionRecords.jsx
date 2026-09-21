// =============================================================================
// InspectionRecords — ISO/IEC 17020, fase 3: la inspección y su informe
//
// Dos pestañas que se usan desde Inspection.jsx:
//   1. Inspecciones (7.4.1) — el registro de campo: ítem, método, quién la
//      ejecutó, equipos, condiciones, cobertura, desviaciones e indicaciones.
//   2. Informes (7.4 / 7.6)  — el informe con dictamen, firmado por persona
//      autorizada. Un informe emitido no se edita: se enmienda.
//
// Las reglas duras están en la base (triggers), así que acá el trabajo es
// avisar ANTES de guardar: a quién no se le puede asignar el ítem porque lo
// intervino, y quién no está habilitado para ejecutar o firmar ese método.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import {
  Search, Plus, Pencil, Trash2, FileText, ClipboardList, AlertTriangle,
  CheckCircle2, UserX, Play, Send, Ban, FilePlus2, ShieldAlert,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { toast } from './lib/toast'
import { confirm, promptText } from './lib/confirm'
import {
  Button, Modal, Field, Row, Input, Select, Textarea, Badge, Kpi,
  EmptyState, Grid, colors, radius, font,
} from './components/ui'

// ─── Catálogos ───────────────────────────────────────────────────────────────

const INSPECTION_STATUS = {
  'Planificada': 'neutral', 'En ejecución': 'warning', 'Ejecutada': 'info',
  'Informe emitido': 'success', 'Cancelada': 'neutral',
}

const REPORT_STATUS = {
  'Borrador': 'neutral', 'Emitido': 'success', 'Reemplazado': 'neutral', 'Anulado': 'danger',
}

const CONCLUSIONS = {
  'Conforme': 'success',
  'Conforme con observaciones': 'warning',
  'No conforme': 'danger',
  'No concluyente': 'neutral',
}

const EVALUATIONS = ['Aceptable', 'Rechazable', 'Registrar', 'Reevaluar']

// Quién puede ejecutar el ensayo y quién puede firmar el dictamen
const EXECUTE_KINDS = ['Ejecutar', 'Ejecutar e interpretar']
const SIGN_KINDS = ['Ejecutar e interpretar', 'Interpretar y firmar', 'Solo firmar']

const EMPTY_INSPECTION = {
  code: '', item_id: '', scope_id: '', method_id: '', client_name: '', purchase_order_ref: '',
  location: '', planned_date: '', performed_at: '',
  lead_inspector_id: '', assistants: '', supervised_by_id: '',
  equipment_used: '', calibration_ref: '', consumables: '', surface_condition: '',
  ambient_conditions: '', coverage: '', sampling_applied: '', acceptance_criteria_ref: '',
  client_info_received: false, item_ready_confirmed: false,
  method_deviations: '', limitations: '', results_summary: '', raw_data_ref: '',
  status: 'Planificada', notes: '',
}

const EMPTY_FINDING = {
  reference: '', indication_type: '', position: '', dimensions: '',
  measured_value: '', unit: 'mm', evaluation: 'Aceptable', criteria_ref: '',
  action_required: '', notes: '',
}

const EMPTY_REPORT = {
  inspection_id: '', report_number: '', revision: 1,
  conclusion: 'Conforme', conclusion_basis: '', decision_rule: '',
  summary: '', recommendations: '', exclusions: '',
  issue_date: '', signed_by_person_id: '', signed_by_name: '', signed_role: '',
  delivered_to: '', delivery_date: '', delivery_channel: '',
  status: 'Borrador', notes: '',
  amends_report_id: '', amendment_reason: '',
}

const NULLABLE = [
  'item_id', 'scope_id', 'method_id', 'lead_inspector_id', 'supervised_by_id',
  'planned_date', 'performed_at', 'issue_date', 'delivery_date',
  'inspection_id', 'signed_by_person_id', 'amends_report_id',
]

function clean(form, orgId) {
  const payload = { ...form, org_id: orgId }
  NULLABLE.forEach(k => { if (k in payload && !payload[k]) payload[k] = null })
  return payload
}

const nameOf = (list, id) => list.find(p => p.id === id)?.full_name || ''

// ─── Pestaña: inspecciones (7.4.1) ───────────────────────────────────────────

export function InspectionsTab({
  inspections, items, methods, scopes, personnel, restrictions, authStatus,
  canWrite, canDelete, orgId, onChanged, onCreateReport,
}) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_INSPECTION)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [findingsFor, setFindingsFor] = useState(null)

  const kpis = useMemo(() => ({
    total: inspections.length,
    enCurso: inspections.filter(i => i.status === 'En ejecución').length,
    porInformar: inspections.filter(i => i.status === 'Ejecutada').length,
    emitidas: inspections.filter(i => i.status === 'Informe emitido').length,
  }), [inspections])

  const filtered = useMemo(() => inspections.filter(i => {
    if (filterStatus !== 'all' && i.status !== filterStatus) return false
    if (!search) return true
    const item = items.find(x => x.id === i.item_id)
    const q = search.toLowerCase()
    return [i.code, i.client_name, i.location, item?.tag, item?.name]
      .filter(Boolean).join(' ').toLowerCase().includes(q)
  }), [inspections, items, search, filterStatus])

  // Anexo A.2 b): quién quedó inhabilitado para el ítem elegido
  const blockedForItem = useMemo(
    () => (restrictions || []).filter(r => r.item_id === form.item_id),
    [restrictions, form.item_id],
  )
  const blockedIds = new Set(blockedForItem.map(r => r.person_id))

  // 6.1.2 d): estado de la autorización de cada persona para el método elegido
  const authFor = (personId, kinds) => (authStatus || [])
    .filter(a => a.person_id === personId && kinds.includes(a.authorization_kind)
      && (a.method_id === form.method_id || a.authorization_kind === 'Solo firmar'))
    .sort((a, b) => (b.effective_status === 'Habilitado') - (a.effective_status === 'Habilitado'))[0]

  const leadAuth = form.lead_inspector_id && form.method_id
    ? authFor(form.lead_inspector_id, EXECUTE_KINDS) : null
  const leadBlocked = form.lead_inspector_id && blockedIds.has(form.lead_inspector_id)

  const openNew = () => {
    setForm({ ...EMPTY_INSPECTION, code: nextCode(inspections) })
    setEditing(null); setModal(true)
  }
  const openEdit = (ins) => {
    setForm({ ...EMPTY_INSPECTION, ...Object.fromEntries(
      Object.keys(EMPTY_INSPECTION).map(k => [k, ins[k] ?? EMPTY_INSPECTION[k]])) })
    setEditing(ins); setModal(true)
  }

  const save = async () => {
    if (!form.code.trim()) return toast.warning('La inspección necesita un número de registro')
    setSaving(true)
    const payload = clean(form, orgId)
    payload.code = payload.code.trim()
    const { error } = editing
      ? await supabase.from('inspections').update(payload).eq('id', editing.id)
      : await supabase.from('inspections').insert([payload])
    setSaving(false)
    if (error) {
      return toast.error(/uq_inspections_code|duplicate/i.test(error.message)
        ? `Ya existe una inspección con el número "${payload.code}".`
        : error.message)
    }
    toast.success(editing ? 'Inspección actualizada' : 'Inspección registrada')
    setModal(false); onChanged()
  }

  const changeStatus = async (ins, status) => {
    const patch = { status }
    if (status === 'Ejecutada' && !ins.performed_at) patch.performed_at = new Date().toISOString().slice(0, 10)
    if (status === 'Cancelada') {
      const motivo = await promptText('Motivo de la cancelación', { required: true, rows: 2 })
      if (!motivo) return
      patch.cancel_reason = motivo
    }
    const { error } = await supabase.from('inspections').update(patch).eq('id', ins.id)
    if (error) return toast.error(error.message)
    toast.success(`Inspección ${ins.code}: ${status.toLowerCase()}`)
    onChanged()
  }

  const remove = async (ins) => {
    const ok = await confirm(`¿Eliminar la inspección ${ins.code}? También se borran sus indicaciones.`,
      { title: 'Eliminar inspección', tone: 'danger', confirmText: 'Eliminar' })
    if (!ok) return
    const { error } = await supabase.from('inspections').delete().eq('id', ins.id)
    if (error) return toast.error(error.message)
    toast.success('Inspección eliminada'); onChanged()
  }

  const vigentes = methods.filter(m => m.status === 'Vigente')

  return (
    <>
      <Grid min="170px" gap="10px">
        <Kpi label="Inspecciones" value={kpis.total} icon={<ClipboardList size={14} />} color={colors.primary} />
        <Kpi label="En ejecución" value={kpis.enCurso} icon={<Play size={14} />} color={colors.warning} />
        <Kpi label="Esperando informe" value={kpis.porInformar} icon={<FileText size={14} />}
          color={kpis.porInformar > 0 ? colors.info : colors.success} />
        <Kpi label="Con informe emitido" value={kpis.emitidas} icon={<CheckCircle2 size={14} />} color={colors.success} />
      </Grid>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', margin: '16px 0 12px' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: colors.textGhost }} />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por número, ítem o cliente…" style={{ paddingLeft: '30px' }} />
        </div>
        <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 'auto', minWidth: '170px' }}>
          <option value="all">Todos los estados</option>
          {Object.keys(INSPECTION_STATUS).map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        {canWrite && <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>Nueva inspección</Button>}
      </div>

      {vigentes.length === 0 && (
        <div style={{
          background: colors.warningLight, color: colors.warningText, padding: '10px 12px',
          borderRadius: radius.md, fontSize: font.sm, marginBottom: '12px',
          display: 'flex', gap: '8px', alignItems: 'flex-start',
        }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>No hay ningún método vigente. Una inspección no se puede ejecutar sin un método
            vigente (7.2), así que primero aprobá uno en la pestaña <strong>Métodos</strong>.</span>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={<ClipboardList size={32} color={colors.textGhost} />}
          title={inspections.length ? 'Sin resultados' : 'Todavía no registraste inspecciones'}
          subtitle={inspections.length ? 'Probá con otro filtro.'
            : 'Acá se registra cada inspección ejecutada: qué ítem, con qué método, quién la hizo, con qué equipos y en qué condiciones.'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(ins => {
            const item = items.find(x => x.id === ins.item_id)
            const method = methods.find(m => m.id === ins.method_id)
            const blocked = (restrictions || []).some(r =>
              r.item_id === ins.item_id && r.person_id === ins.lead_inspector_id)
            return (
              <div key={ins.id} style={{
                background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl,
                padding: '12px 14px',
                borderLeft: `4px solid ${ins.status === 'Informe emitido' ? colors.success
                  : ins.status === 'Ejecutada' ? colors.info
                  : ins.status === 'En ejecución' ? colors.warning : colors.border}`,
              }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{ins.code}</span>
                      <Badge variant={INSPECTION_STATUS[ins.status] || 'neutral'}>{ins.status}</Badge>
                      {method && <Badge variant="info">{method.code || method.name}</Badge>}
                    </div>
                    <div style={{ fontSize: font.sm, color: colors.textMuted, marginTop: '3px' }}>
                      {[item ? `${item.tag}${item.name ? ` · ${item.name}` : ''}` : 'sin ítem',
                        ins.client_name, ins.location].filter(Boolean).join(' · ')}
                    </div>
                    <div style={{ fontSize: font.xs, color: colors.textMuted, marginTop: '3px' }}>
                      {ins.lead_inspector_id
                        ? `Ejecuta ${nameOf(personnel, ins.lead_inspector_id)}`
                        : 'Sin inspector asignado'}
                      {ins.supervised_by_id && ` · supervisado por ${nameOf(personnel, ins.supervised_by_id)}`}
                      {ins.performed_at && ` · ${ins.performed_at}`}
                    </div>
                    {blocked && (
                      <div style={{
                        marginTop: '8px', padding: '6px 8px', background: colors.dangerLight,
                        color: colors.dangerText, borderRadius: radius.md, fontSize: font.xs,
                        display: 'flex', gap: '6px', alignItems: 'flex-start',
                      }}>
                        <UserX size={14} style={{ flexShrink: 0 }} />
                        <span>Quien figura como inspector intervino este ítem: no puede inspeccionarlo (Anexo A.2 b).</span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <Button size="sm" variant="ghost" icon={<ClipboardList size={14} />}
                      onClick={() => setFindingsFor(ins)}>Indicaciones</Button>
                    {canWrite && ins.status === 'Planificada' && (
                      <Button size="sm" variant="ghost" icon={<Play size={14} />}
                        onClick={() => changeStatus(ins, 'En ejecución')}>Iniciar</Button>
                    )}
                    {canWrite && ins.status === 'En ejecución' && (
                      <Button size="sm" variant="success" icon={<CheckCircle2 size={14} />}
                        onClick={() => changeStatus(ins, 'Ejecutada')}>Cerrar ejecución</Button>
                    )}
                    {canWrite && ins.status === 'Ejecutada' && (
                      <Button size="sm" variant="primary" icon={<FilePlus2 size={14} />}
                        onClick={() => onCreateReport(ins)}>Emitir informe</Button>
                    )}
                    {canWrite && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => openEdit(ins)}>Editar</Button>}
                    {canDelete && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(ins)} />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} maxWidth="880px"
        title={editing ? `Inspección ${editing.code}` : 'Nueva inspección'}>
        <Modal.Section title="Qué se inspecciona (7.3 / 7.4.1)">
          <Row>
            <Field label="Número de registro" required hint="Identificación única de esta inspección">
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="INS-2026-014" />
            </Field>
            <Field label="Estado">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.keys(INSPECTION_STATUS).map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Ítem">
              <Select value={form.item_id} onChange={e => setForm({ ...form, item_id: e.target.value })}>
                <option value="">— elegí el ítem —</option>
                {items.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.tag}{i.name ? ` · ${i.name}` : ''}{i.readiness_verified ? '' : ' (sin verificar listo)'}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Método" hint="Solo los métodos vigentes se pueden ejecutar">
              <Select value={form.method_id} onChange={e => setForm({ ...form, method_id: e.target.value })}>
                <option value="">— elegí el método —</option>
                {methods.map(m => (
                  <option key={m.id} value={m.id} disabled={m.status !== 'Vigente'}>
                    {m.code ? `${m.code} · ` : ''}{m.name}{m.status !== 'Vigente' ? ` (${m.status})` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Actividad del alcance">
              <Select value={form.scope_id} onChange={e => setForm({ ...form, scope_id: e.target.value })}>
                <option value="">— sin asociar —</option>
                {scopes.map(s => <option key={s.id} value={s.id}>{s.activity}</option>)}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Cliente"><Input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} /></Field>
            <Field label="Contrato u orden de compra"><Input value={form.purchase_order_ref} onChange={e => setForm({ ...form, purchase_order_ref: e.target.value })} /></Field>
            <Field label="Lugar"><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></Field>
          </Row>
          <Row>
            <Field label="Fecha planificada"><Input type="date" value={form.planned_date || ''} onChange={e => setForm({ ...form, planned_date: e.target.value })} /></Field>
            <Field label="Fecha de ejecución"><Input type="date" value={form.performed_at || ''} onChange={e => setForm({ ...form, performed_at: e.target.value })} /></Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Quién la ejecuta (7.4.3 / 6.1.2 d)">
          <Row>
            <Field label="Inspector">
              <Select value={form.lead_inspector_id} onChange={e => setForm({ ...form, lead_inspector_id: e.target.value })}>
                <option value="">— elegí al inspector —</option>
                {personnel.map(p => (
                  <option key={p.id} value={p.id} disabled={blockedIds.has(p.id)}>
                    {p.full_name}{blockedIds.has(p.id) ? ' — intervino este ítem' : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Supervisado por" hint="Solo si está en su período mentorizado (6.1.4)">
              <Select value={form.supervised_by_id} onChange={e => setForm({ ...form, supervised_by_id: e.target.value })}>
                <option value="">— trabaja autorizado, sin supervisión —</option>
                {personnel.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Asistentes"><Input value={form.assistants} onChange={e => setForm({ ...form, assistants: e.target.value })} placeholder="No firman ni interpretan" /></Field>
          </Row>

          {leadBlocked && (
            <div style={{
              background: colors.dangerLight, color: colors.dangerText, padding: '10px 12px',
              borderRadius: radius.md, fontSize: font.sm, display: 'flex', gap: '8px',
            }}>
              <UserX size={16} style={{ flexShrink: 0 }} />
              <span><strong>No se puede asignar.</strong> Esta persona intervino el ítem
                ({blockedForItem.find(b => b.person_id === form.lead_inspector_id)?.interventions}),
                así que no puede inspeccionarlo (Anexo A.2 b). La base de datos también lo rechaza.</span>
            </div>
          )}

          {form.lead_inspector_id && form.method_id && !leadBlocked && !form.supervised_by_id && (
            <div style={{
              background: leadAuth?.effective_status === 'Habilitado' ? colors.successLight : colors.warningLight,
              color: leadAuth?.effective_status === 'Habilitado' ? colors.successText : colors.warningText,
              padding: '10px 12px', borderRadius: radius.md, fontSize: font.sm,
              display: 'flex', gap: '8px',
            }}>
              {leadAuth?.effective_status === 'Habilitado'
                ? <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                : <ShieldAlert size={16} style={{ flexShrink: 0 }} />}
              <span>
                {!leadAuth
                  ? 'No tiene autorización para ejecutar este método. Autorizala en Inspectores, o indicá quién lo supervisa mientras está en mentoría.'
                  : leadAuth.effective_status === 'Habilitado'
                    ? `Autorización vigente para este método (${leadAuth.authorization_kind}).`
                    : `Su autorización está en estado "${leadAuth.effective_status}": no puede ejecutar la inspección.`}
              </span>
            </div>
          )}
        </Modal.Section>

        <Modal.Section title="Condiciones del ensayo">
          <Row>
            <Field label="Equipos usados" hint="Con número de serie">
              <Input value={form.equipment_used} onChange={e => setForm({ ...form, equipment_used: e.target.value })} placeholder="Olympus OmniScan X3 S/N 12345" />
            </Field>
            <Field label="Certificados de calibración">
              <Input value={form.calibration_ref} onChange={e => setForm({ ...form, calibration_ref: e.target.value })} />
            </Field>
          </Row>
          <Row>
            <Field label="Consumibles y lotes" hint="Penetrante, revelador, partículas, acoplante">
              <Input value={form.consumables} onChange={e => setForm({ ...form, consumables: e.target.value })} />
            </Field>
            <Field label="Condición de la superficie">
              <Input value={form.surface_condition} onChange={e => setForm({ ...form, surface_condition: e.target.value })} />
            </Field>
            <Field label="Condiciones ambientales">
              <Input value={form.ambient_conditions} onChange={e => setForm({ ...form, ambient_conditions: e.target.value })} placeholder="22 °C, iluminación 1200 lux" />
            </Field>
          </Row>
          <Row>
            <Field label="Cobertura inspeccionada">
              <Input value={form.coverage} onChange={e => setForm({ ...form, coverage: e.target.value })} placeholder="100 % de las juntas circunferenciales" />
            </Field>
            <Field label="Muestreo aplicado">
              <Input value={form.sampling_applied} onChange={e => setForm({ ...form, sampling_applied: e.target.value })} />
            </Field>
            <Field label="Criterio de aceptación">
              <Input value={form.acceptance_criteria_ref} onChange={e => setForm({ ...form, acceptance_criteria_ref: e.target.value })} placeholder="AWS D1.1-2020, cláusula 8.26" />
            </Field>
          </Row>
          <Row>
            <Field label="La información del cliente llegó completa">
              <Select value={form.client_info_received ? '1' : '0'} onChange={e => setForm({ ...form, client_info_received: e.target.value === '1' })}>
                <option value="0">No / parcial</option>
                <option value="1">Sí</option>
              </Select>
            </Field>
            <Field label="El ítem estaba listo" hint="Se verifica en la pestaña Ítems; acá se confirma en campo">
              <Select value={form.item_ready_confirmed ? '1' : '0'} onChange={e => setForm({ ...form, item_ready_confirmed: e.target.value === '1' })}>
                <option value="0">No confirmado</option>
                <option value="1">Confirmado en campo</option>
              </Select>
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Resultado y desviaciones (7.4.1)">
          <Field label="Resumen de resultados">
            <Textarea rows={3} value={form.results_summary} onChange={e => setForm({ ...form, results_summary: e.target.value })} />
          </Field>
          <Row>
            <Field label="Desviaciones respecto del método" hint="Qué se hizo distinto y por qué">
              <Textarea rows={2} value={form.method_deviations} onChange={e => setForm({ ...form, method_deviations: e.target.value })} />
            </Field>
            <Field label="Limitaciones" hint="Zonas sin acceso, restricciones de tiempo">
              <Textarea rows={2} value={form.limitations} onChange={e => setForm({ ...form, limitations: e.target.value })} />
            </Field>
          </Row>
          <Row>
            <Field label="Dónde quedan los datos crudos" hint="Carpeta, archivo del equipo, escaneos">
              <Input value={form.raw_data_ref} onChange={e => setForm({ ...form, raw_data_ref: e.target.value })} />
            </Field>
            <Field label="Notas"><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
          </Row>
        </Modal.Section>

        <Modal.Footer>
          <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!canWrite || leadBlocked}>Guardar</Button>
        </Modal.Footer>
      </Modal>

      <FindingsModal inspection={findingsFor} onClose={() => setFindingsFor(null)}
        orgId={orgId} canWrite={canWrite} />
    </>
  )
}

// Propone el número siguiente: INS-<año>-001
function nextCode(inspections) {
  const year = new Date().getFullYear()
  const prefix = `INS-${year}-`
  const max = inspections
    .filter(i => (i.code || '').startsWith(prefix))
    .map(i => parseInt(i.code.slice(prefix.length), 10))
    .filter(n => !Number.isNaN(n))
    .reduce((a, b) => Math.max(a, b), 0)
  return `${prefix}${String(max + 1).padStart(3, '0')}`
}

// ─── Indicaciones encontradas ────────────────────────────────────────────────

function FindingsModal({ inspection, onClose, orgId, canWrite }) {
  const [rows, setRows] = useState([])
  const [form, setForm] = useState(EMPTY_FINDING)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!inspection) return
    setLoading(true)
    supabase.from('inspection_findings').select('*')
      .eq('inspection_id', inspection.id).order('created_at')
      .then(({ data, error }) => {
        if (error) toast.error(error.message)
        setRows(data || []); setLoading(false)
      })
  }, [inspection])

  const add = async () => {
    if (!form.reference.trim() && !form.indication_type.trim()) {
      return toast.warning('Indicá al menos la referencia o el tipo de indicación')
    }
    setSaving(true)
    const payload = {
      ...form, org_id: orgId, inspection_id: inspection.id,
      measured_value: form.measured_value === '' ? null : Number(form.measured_value),
    }
    const { data, error } = await supabase.from('inspection_findings').insert([payload]).select().single()
    setSaving(false)
    if (error) return toast.error(error.message)
    setRows([...rows, data]); setForm(EMPTY_FINDING)
    toast.success('Indicación registrada')
  }

  const remove = async (row) => {
    const { error } = await supabase.from('inspection_findings').delete().eq('id', row.id)
    if (error) return toast.error(error.message)
    setRows(rows.filter(r => r.id !== row.id))
  }

  if (!inspection) return null
  const rechazables = rows.filter(r => r.evaluation === 'Rechazable').length

  return (
    <Modal open onClose={onClose} maxWidth="820px" title={`Indicaciones · ${inspection.code}`}>
      <Modal.Section title={`Registradas (${rows.length}${rechazables ? ` · ${rechazables} rechazable${rechazables > 1 ? 's' : ''}` : ''})`}>
        {loading ? <p style={{ color: colors.textMuted }}>Cargando…</p>
          : rows.length === 0 ? (
            <p style={{ color: colors.textMuted, fontSize: font.sm, margin: 0 }}>
              Sin indicaciones registradas. Si el ensayo no encontró nada, dejalo vacío y
              aclaralo en el resumen de resultados.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {rows.map(r => (
                <div key={r.id} style={{
                  display: 'flex', gap: '8px', alignItems: 'center',
                  border: `1px solid ${colors.border}`, borderRadius: radius.md, padding: '8px 10px',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <strong style={{ fontFamily: 'monospace' }}>{r.reference || '—'}</strong>
                      <Badge variant={r.evaluation === 'Rechazable' ? 'danger'
                        : r.evaluation === 'Aceptable' ? 'success' : 'warning'}>{r.evaluation}</Badge>
                      {r.indication_type && <span style={{ fontSize: font.sm }}>{r.indication_type}</span>}
                    </div>
                    <div style={{ fontSize: font.xs, color: colors.textMuted }}>
                      {[r.position, r.dimensions,
                        r.measured_value != null ? `${r.measured_value} ${r.unit || ''}`.trim() : null,
                        r.criteria_ref].filter(Boolean).join(' · ')}
                    </div>
                  </div>
                  {canWrite && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(r)} />}
                </div>
              ))}
            </div>
          )}
      </Modal.Section>

      {canWrite && (
        <Modal.Section title="Agregar indicación">
          <Row>
            <Field label="Referencia" hint="Junta, zona, progresiva">
              <Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="J-12" />
            </Field>
            <Field label="Tipo de indicación">
              <Input value={form.indication_type} onChange={e => setForm({ ...form, indication_type: e.target.value })} placeholder="Falta de fusión" />
            </Field>
            <Field label="Evaluación">
              <Select value={form.evaluation} onChange={e => setForm({ ...form, evaluation: e.target.value })}>
                {EVALUATIONS.map(v => <option key={v} value={v}>{v}</option>)}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Posición"><Input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder="Raíz, 8 mm de profundidad" /></Field>
            <Field label="Dimensiones"><Input value={form.dimensions} onChange={e => setForm({ ...form, dimensions: e.target.value })} placeholder="25 mm de longitud" /></Field>
            <Field label="Valor medido">
              <Input type="number" step="any" value={form.measured_value} onChange={e => setForm({ ...form, measured_value: e.target.value })} />
            </Field>
            <Field label="Unidad"><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></Field>
          </Row>
          <Row>
            <Field label="Criterio aplicado"><Input value={form.criteria_ref} onChange={e => setForm({ ...form, criteria_ref: e.target.value })} placeholder="AWS D1.1 tabla 8.2" /></Field>
            <Field label="Acción requerida"><Input value={form.action_required} onChange={e => setForm({ ...form, action_required: e.target.value })} /></Field>
          </Row>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" icon={<Plus size={15} />} onClick={add} loading={saving}>Agregar</Button>
          </div>
        </Modal.Section>
      )}

      <Modal.Footer>
        <Button variant="ghost" onClick={onClose}>Cerrar</Button>
      </Modal.Footer>
    </Modal>
  )
}

// ─── Pestaña: informes (7.4 / 7.6) ───────────────────────────────────────────

export function ReportsTab({
  reports, inspections, items, personnel, authStatus,
  canWrite, canDelete, orgId, onChanged, pendingInspection, onPendingHandled,
}) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_REPORT)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')

  const ejecutadas = inspections.filter(i => ['Ejecutada', 'Informe emitido'].includes(i.status))

  const openFor = (ins) => {
    setForm({
      ...EMPTY_REPORT,
      inspection_id: ins?.id || '',
      report_number: ins ? `INF-${ins.code.replace(/^INS-/, '')}` : '',
      conclusion_basis: ins?.acceptance_criteria_ref || '',
      summary: ins?.results_summary || '',
      exclusions: ins?.limitations || '',
      issue_date: new Date().toISOString().slice(0, 10),
    })
    setEditing(null); setModal(true)
  }

  // Botón "Emitir informe" desde la pestaña de inspecciones
  useEffect(() => {
    if (pendingInspection) { openFor(pendingInspection); onPendingHandled?.() }
  }, [pendingInspection])

  const openEdit = (r) => {
    setForm({ ...EMPTY_REPORT, ...Object.fromEntries(
      Object.keys(EMPTY_REPORT).map(k => [k, r[k] ?? EMPTY_REPORT[k]])) })
    setEditing(r); setModal(true)
  }

  // 7.6: el emitido no se edita, se enmienda con una revisión nueva
  const openAmendment = (r) => {
    setForm({
      ...EMPTY_REPORT,
      ...Object.fromEntries(Object.keys(EMPTY_REPORT).map(k => [k, r[k] ?? EMPTY_REPORT[k]])),
      revision: (r.revision || 1) + 1,
      amends_report_id: r.id,
      amendment_reason: '',
      status: 'Borrador',
      issue_date: new Date().toISOString().slice(0, 10),
      signed_at: null,
    })
    setEditing(null); setModal(true)
  }

  const signerAuth = useMemo(() => {
    if (!form.signed_by_person_id) return null
    const ins = inspections.find(i => i.id === form.inspection_id)
    return (authStatus || [])
      .filter(a => a.person_id === form.signed_by_person_id
        && SIGN_KINDS.includes(a.authorization_kind)
        && (a.method_id === ins?.method_id || a.authorization_kind === 'Solo firmar'))
      .sort((a, b) => (b.effective_status === 'Habilitado') - (a.effective_status === 'Habilitado'))[0]
  }, [form.signed_by_person_id, form.inspection_id, inspections, authStatus])

  const save = async (emitir = false) => {
    if (!form.inspection_id) return toast.warning('Elegí la inspección que respalda el informe')
    if (!form.report_number.trim()) return toast.warning('El informe necesita un número único (7.4.2)')
    if (emitir && !form.signed_by_person_id) return toast.warning('Elegí quién firma el informe')
    if (emitir && !form.conclusion_basis.trim()) return toast.warning('Indicá contra qué criterio se dictamina')

    setSaving(true)
    const payload = clean({ ...form, status: emitir ? 'Emitido' : form.status }, orgId)
    payload.report_number = payload.report_number.trim()
    payload.revision = Number(payload.revision) || 1
    if (payload.signed_by_person_id && !payload.signed_by_name) {
      payload.signed_by_name = nameOf(personnel, payload.signed_by_person_id)
    }
    const { error } = editing
      ? await supabase.from('inspection_reports').update(payload).eq('id', editing.id)
      : await supabase.from('inspection_reports').insert([payload])
    setSaving(false)
    if (error) {
      return toast.error(/uq_inspection_reports_number|duplicate/i.test(error.message)
        ? `Ya existe el informe "${payload.report_number}" revisión ${payload.revision}.`
        : error.message)
    }
    toast.success(emitir ? 'Informe emitido' : editing ? 'Informe actualizado' : 'Informe creado')
    setModal(false); onChanged()
  }

  const emitir = async (r) => {
    const ok = await confirm(
      `¿Emitir el informe ${r.report_number}? Después de emitido no se edita: cualquier corrección se hace con una enmienda (7.6).`,
      { title: 'Emitir informe', confirmText: 'Emitir' })
    if (!ok) return
    const { error } = await supabase.from('inspection_reports')
      .update({ status: 'Emitido' }).eq('id', r.id)
    if (error) return toast.error(error.message)
    toast.success('Informe emitido'); onChanged()
  }

  const anular = async (r) => {
    const motivo = await promptText('Motivo de la anulación (queda en el registro)', { required: true, rows: 2 })
    if (!motivo) return
    const { error } = await supabase.from('inspection_reports')
      .update({ status: 'Anulado', void_reason: motivo }).eq('id', r.id)
    if (error) return toast.error(error.message)
    toast.success('Informe anulado'); onChanged()
  }

  const remove = async (r) => {
    const ok = await confirm(`¿Eliminar el borrador ${r.report_number}?`,
      { title: 'Eliminar informe', tone: 'danger', confirmText: 'Eliminar' })
    if (!ok) return
    const { error } = await supabase.from('inspection_reports').delete().eq('id', r.id)
    if (error) return toast.error(error.message)
    toast.success('Informe eliminado'); onChanged()
  }

  const kpis = useMemo(() => ({
    emitidos: reports.filter(r => r.status === 'Emitido').length,
    borradores: reports.filter(r => r.status === 'Borrador').length,
    noConformes: reports.filter(r => r.status === 'Emitido' && r.conclusion === 'No conforme').length,
    enmiendas: reports.filter(r => r.amends_report_id).length,
  }), [reports])

  const filtered = useMemo(() => reports.filter(r => {
    if (!search) return true
    const ins = inspections.find(i => i.id === r.inspection_id)
    const q = search.toLowerCase()
    return [r.report_number, r.conclusion, r.delivered_to, ins?.code, ins?.client_name]
      .filter(Boolean).join(' ').toLowerCase().includes(q)
  }), [reports, inspections, search])

  return (
    <>
      <Grid min="170px" gap="10px">
        <Kpi label="Informes emitidos" value={kpis.emitidos} icon={<FileText size={14} />} color={colors.success} />
        <Kpi label="Borradores" value={kpis.borradores} icon={<Pencil size={14} />} color={colors.warning} />
        <Kpi label="Dictamen no conforme" value={kpis.noConformes} icon={<AlertTriangle size={14} />}
          color={kpis.noConformes > 0 ? colors.danger : colors.success} />
        <Kpi label="Enmiendas" value={kpis.enmiendas} icon={<FilePlus2 size={14} />} color={colors.info}
          subtitle="correcciones trazables" />
      </Grid>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', margin: '16px 0 12px' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: colors.textGhost }} />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por número, inspección o cliente…" style={{ paddingLeft: '30px' }} />
        </div>
        {canWrite && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={() => openFor(null)}
            disabled={ejecutadas.length === 0}
            title={ejecutadas.length === 0 ? 'Primero cerrá una inspección como Ejecutada' : ''}>
            Nuevo informe
          </Button>
        )}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<FileText size={32} color={colors.textGhost} />}
          title={reports.length ? 'Sin resultados' : 'Todavía no hay informes'}
          subtitle={reports.length ? 'Probá con otra búsqueda.'
            : 'El informe lleva el dictamen y lo firma una persona autorizada. Se crea desde una inspección cerrada como Ejecutada.'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(r => {
            const ins = inspections.find(i => i.id === r.inspection_id)
            const item = items.find(x => x.id === ins?.item_id)
            return (
              <div key={r.id} style={{
                background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl,
                padding: '12px 14px', opacity: r.status === 'Reemplazado' ? 0.65 : 1,
                borderLeft: `4px solid ${r.conclusion === 'No conforme' ? colors.danger
                  : r.status === 'Emitido' ? colors.success : colors.border}`,
              }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{r.report_number}</span>
                      <Badge variant="neutral">rev. {r.revision}</Badge>
                      <Badge variant={REPORT_STATUS[r.status] || 'neutral'}>{r.status}</Badge>
                      <Badge variant={CONCLUSIONS[r.conclusion] || 'neutral'}>{r.conclusion}</Badge>
                      {r.amends_report_id && <Badge variant="info">Enmienda</Badge>}
                    </div>
                    <div style={{ fontSize: font.sm, color: colors.textMuted, marginTop: '3px' }}>
                      {[ins?.code, item?.tag, ins?.client_name].filter(Boolean).join(' · ')}
                    </div>
                    <div style={{ fontSize: font.xs, color: colors.textMuted, marginTop: '3px' }}>
                      {r.status === 'Emitido' && r.issue_date ? `Emitido el ${r.issue_date}` : 'Sin emitir'}
                      {r.signed_by_person_id && ` · firma ${nameOf(personnel, r.signed_by_person_id) || r.signed_by_name}`}
                      {r.delivered_to && ` · entregado a ${r.delivered_to}`}
                    </div>
                    {r.void_reason && (
                      <div style={{ fontSize: font.xs, color: colors.dangerText, marginTop: '3px' }}>
                        Anulado: {r.void_reason}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {canWrite && r.status === 'Borrador' && (
                      <>
                        <Button size="sm" variant="success" icon={<Send size={14} />} onClick={() => emitir(r)}>Emitir</Button>
                        <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => openEdit(r)}>Editar</Button>
                      </>
                    )}
                    {canWrite && r.status === 'Emitido' && (
                      <>
                        <Button size="sm" variant="ghost" icon={<FilePlus2 size={14} />} onClick={() => openAmendment(r)}>Enmendar</Button>
                        <Button size="sm" variant="ghost" icon={<Ban size={14} />} onClick={() => anular(r)}>Anular</Button>
                      </>
                    )}
                    {canDelete && r.status === 'Borrador' && (
                      <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(r)} />
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} maxWidth="860px"
        title={form.amends_report_id ? `Enmienda del informe ${form.report_number}`
          : editing ? `Informe ${editing.report_number}` : 'Nuevo informe'}>

        {form.amends_report_id && (
          <div style={{
            background: colors.infoLight, color: colors.infoText, padding: '10px 12px',
            borderRadius: radius.md, fontSize: font.sm, margin: '0 0 12px',
          }}>
            Esto es una <strong>enmienda</strong> (revisión {form.revision}). Al emitirla, la revisión
            anterior queda marcada como reemplazada, así nunca circulan dos informes vigentes del mismo
            número (7.6).
          </div>
        )}

        <Modal.Section title="Inspección que respalda el informe">
          <Row>
            <Field label="Inspección" required>
              <Select value={form.inspection_id} onChange={e => {
                const ins = inspections.find(i => i.id === e.target.value)
                setForm({
                  ...form, inspection_id: e.target.value,
                  conclusion_basis: form.conclusion_basis || ins?.acceptance_criteria_ref || '',
                  summary: form.summary || ins?.results_summary || '',
                })
              }}>
                <option value="">— elegí la inspección —</option>
                {ejecutadas.map(i => (
                  <option key={i.id} value={i.id}>
                    {i.code}{i.client_name ? ` · ${i.client_name}` : ''}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Número de informe" required hint="Identificación única (7.4.2)">
              <Input value={form.report_number} onChange={e => setForm({ ...form, report_number: e.target.value })} placeholder="INF-2026-014" />
            </Field>
            <Field label="Revisión">
              <Input type="number" min="1" value={form.revision} onChange={e => setForm({ ...form, revision: e.target.value })} />
            </Field>
          </Row>
          {form.amends_report_id && (
            <Field label="Qué corrige esta enmienda" required>
              <Textarea rows={2} value={form.amendment_reason} onChange={e => setForm({ ...form, amendment_reason: e.target.value })}
                placeholder="Se corrige la longitud de la indicación en J-12: decía 25 mm, son 15 mm." />
            </Field>
          )}
        </Modal.Section>

        <Modal.Section title="Dictamen (7.4.2)">
          <Row>
            <Field label="Conclusión" required>
              <Select value={form.conclusion} onChange={e => setForm({ ...form, conclusion: e.target.value })}>
                {Object.keys(CONCLUSIONS).map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Criterio contra el que se dictamina" required hint="Norma, edición y cláusula">
              <Input value={form.conclusion_basis} onChange={e => setForm({ ...form, conclusion_basis: e.target.value })}
                placeholder="AWS D1.1-2020, cláusula 8.26.2" />
            </Field>
          </Row>
          <Field label="Regla de decisión" hint="Cómo se trata la incertidumbre de medición al declarar conformidad">
            <Input value={form.decision_rule} onChange={e => setForm({ ...form, decision_rule: e.target.value })}
              placeholder="Aceptación simple: se compara el valor medido con el límite, sin banda de guarda." />
          </Field>
          <Field label="Resumen de resultados">
            <Textarea rows={3} value={form.summary} onChange={e => setForm({ ...form, summary: e.target.value })} />
          </Field>
          <Row>
            <Field label="Recomendaciones">
              <Textarea rows={2} value={form.recommendations} onChange={e => setForm({ ...form, recommendations: e.target.value })} />
            </Field>
            <Field label="Exclusiones" hint="Qué no cubre este informe">
              <Textarea rows={2} value={form.exclusions} onChange={e => setForm({ ...form, exclusions: e.target.value })} />
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Firma (6.2.4 / 7.4.2)">
          <Row>
            <Field label="Firma el informe" required>
              <Select value={form.signed_by_person_id} onChange={e => setForm({
                ...form, signed_by_person_id: e.target.value,
                signed_by_name: nameOf(personnel, e.target.value),
              })}>
                <option value="">— elegí quién firma —</option>
                {personnel.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </Select>
            </Field>
            <Field label="Cargo con el que firma">
              <Input value={form.signed_role} onChange={e => setForm({ ...form, signed_role: e.target.value })} placeholder="Inspector Nivel II PAUT" />
            </Field>
            <Field label="Fecha de emisión">
              <Input type="date" value={form.issue_date || ''} onChange={e => setForm({ ...form, issue_date: e.target.value })} />
            </Field>
          </Row>

          {form.signed_by_person_id && (
            <div style={{
              background: signerAuth?.effective_status === 'Habilitado' ? colors.successLight : colors.warningLight,
              color: signerAuth?.effective_status === 'Habilitado' ? colors.successText : colors.warningText,
              padding: '10px 12px', borderRadius: radius.md, fontSize: font.sm, display: 'flex', gap: '8px',
            }}>
              {signerAuth?.effective_status === 'Habilitado'
                ? <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
                : <ShieldAlert size={16} style={{ flexShrink: 0 }} />}
              <span>
                {!signerAuth
                  ? 'Esta persona no está autorizada a interpretar ni firmar el método de esta inspección. La base de datos va a rechazar la emisión.'
                  : signerAuth.effective_status === 'Habilitado'
                    ? `Autorización vigente para firmar (${signerAuth.authorization_kind}).`
                    : `Su autorización está en estado "${signerAuth.effective_status}": no puede firmar.`}
              </span>
            </div>
          )}
        </Modal.Section>

        <Modal.Section title="Entrega">
          <Row>
            <Field label="Entregado a"><Input value={form.delivered_to} onChange={e => setForm({ ...form, delivered_to: e.target.value })} /></Field>
            <Field label="Fecha de entrega"><Input type="date" value={form.delivery_date || ''} onChange={e => setForm({ ...form, delivery_date: e.target.value })} /></Field>
            <Field label="Medio"><Input value={form.delivery_channel} onChange={e => setForm({ ...form, delivery_channel: e.target.value })} placeholder="Correo, plataforma del cliente" /></Field>
          </Row>
        </Modal.Section>

        <Modal.Footer>
          <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
          <Button variant="ghost" onClick={() => save(false)} loading={saving} disabled={!canWrite}>Guardar borrador</Button>
          <Button variant="primary" icon={<Send size={15} />} onClick={() => save(true)} loading={saving} disabled={!canWrite}>
            Emitir informe
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
