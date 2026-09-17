// =============================================================================
// Inspection — ISO/IEC 17020:2026, fase 1: base técnica de la inspección
//
// Tres pestañas, en el orden en que dependen una de otra:
//   1. Alcance (5.2.3)  — qué actividades se ofrecen, con campo, rango, etapa
//      del ítem, normas de referencia y tipo de independencia declarado.
//   2. Métodos (7.2)    — catálogo que distingue norma publicada de método
//      propio o modificado, con los apartados de 7.2.5 y su validación (7.2.6).
//   3. Ítems (7.3)      — lo que se inspecciona, con identificación única y
//      verificación de que está listo antes de tocarlo.
//
// Regla dura que la norma exige y acá se aplica (también en la base de datos):
// un método modificado o propio NO puede quedar vigente sin estar validado.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import {
  Search, Plus, Pencil, Trash2, ShieldCheck, FlaskConical, Boxes, Ruler,
  AlertTriangle, CheckCircle2, Sparkles, Lock, ClipboardCheck,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import { can } from './lib/roles'
import { toast } from './lib/toast'
import { confirm, promptText } from './lib/confirm'
import { consultarIA, parseAiJson, clampString } from './aiClient'
import { companyContextLine } from './lib/companyContext'
import {
  Button, Modal, Field, Row, Input, Select, Textarea, Badge, Kpi,
  EmptyState, Spinner, Grid, PageHeader, colors, radius, font,
} from './components/ui'

// ─── Catálogos ───────────────────────────────────────────────────────────────

const ITEM_STAGES = ['Diseño', 'Fabricación', 'Instalación', 'En servicio', 'Puesta en marcha', 'Desmantelamiento']

const SCOPE_STATUS = {
  'Borrador': 'neutral', 'Vigente': 'success', 'Suspendido': 'warning', 'Retirado': 'neutral',
}
const ACCREDITATION_STATUS = ['No acreditado', 'En preparación', 'Solicitado', 'Acreditado', 'Suspendido']

const METHOD_SOURCES = {
  normalizado: { label: 'Norma publicada', hint: 'Se aplica tal cual una norma vigente (ASTM, API, AWS, ISO).' },
  modificado: { label: 'Norma modificada', hint: 'Parte de una norma pero con desviaciones. Requiere validación.' },
  no_normalizado: { label: 'Método propio', hint: 'Desarrollado por el organismo. Requiere validación.' },
}
const NEEDS_VALIDATION = ['modificado', 'no_normalizado']
const METHOD_STATUS = { 'Borrador': 'neutral', 'Vigente': 'success', 'Obsoleto': 'neutral' }
const VALIDATION_STATUS = ['No aplica', 'Pendiente', 'En curso', 'Validado', 'No validado']

const ITEM_STATUS = {
  'Registrado': 'neutral', 'Listo': 'info', 'En inspección': 'warning',
  'Inspeccionado': 'success', 'No apto': 'danger', 'Fuera de alcance': 'neutral',
}

const EMPTY_SCOPE = {
  code: '', activity: '', field: '', item_types: '', range_description: '',
  item_stage: 'En servicio', reference_standards: '',
  independence_type: 'A', independence_note: '',
  accreditation_status: 'No acreditado', status: 'Borrador',
  approved_by: '', approved_role: '', approved_at: '', notes: '',
}

const EMPTY_METHOD = {
  scope_id: '', code: '', name: '', version: 'v1.0',
  method_source: 'normalizado', standard_ref: '', modification_note: '',
  technique: '', equipment_required: '', sampling_plan: '', client_info_required: '',
  technology_use: '', safety_requirements: '', acceptance_criteria: '',
  validation_status: 'No aplica', validation_evidence: '', validated_by: '', validated_at: '',
  status: 'Borrador', approved_by: '', approved_role: '', approved_at: '', notes: '',
}

const EMPTY_ITEM = {
  tag: '', name: '', item_type: '', client_name: '', location: '',
  manufacturer: '', serial_number: '', service_fluid: '', design_code: '',
  scope_id: '', readiness_verified: false, readiness_notes: '', readiness_by: '', readiness_at: '',
  protection_notes: '', status: 'Registrado', notes: '',
}

const DATE_FIELDS = ['approved_at', 'validated_at', 'readiness_at']

function cleanPayload(form, orgId, extraNullable = []) {
  const payload = { ...form, org_id: orgId }
  ;[...DATE_FIELDS, ...extraNullable].forEach(k => {
    if (k in payload && !payload[k]) payload[k] = null
  })
  if ('scope_id' in payload && !payload.scope_id) payload.scope_id = null
  return payload
}

// ─── Componente ──────────────────────────────────────────────────────────────

export default function Inspection() {
  const { org, role } = useOrg()
  const canWrite = can(role, 'inspection_methods', 'write')
  const canDelete = can(role, 'inspection_methods', 'delete')

  const [tab, setTab] = useState('scopes')
  const [scopes, setScopes] = useState([])
  const [methods, setMethods] = useState([])
  const [items, setItems] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)
    const [sc, me, it, cp] = await Promise.all([
      supabase.from('inspection_scopes').select('*').eq('org_id', org.id).order('activity'),
      supabase.from('inspection_methods').select('*').eq('org_id', org.id).order('name'),
      supabase.from('inspection_items').select('*').eq('org_id', org.id).order('tag'),
      supabase.from('company_profile').select('*').eq('org_id', org.id).maybeSingle(),
    ])
    const err = sc.error || me.error || it.error
    if (err) {
      toast.error(/inspection_/i.test(err.message)
        ? 'Falta aplicar la migración del módulo de inspección (17020).'
        : 'No se pudo cargar: ' + err.message)
    }
    setScopes(sc.data || [])
    setMethods(me.data || [])
    setItems(it.data || [])
    setProfile(cp.data || null)
    setLoading(false)
  }

  useEffect(() => { if (org?.id) load() }, [org?.id])

  if (loading) return <Spinner label="Cargando base técnica de inspección…" />

  const TABS = [
    { id: 'scopes', label: 'Alcance', clause: '5.2.3', icon: Ruler, n: scopes.length },
    { id: 'methods', label: 'Métodos', clause: '7.2', icon: FlaskConical, n: methods.length },
    { id: 'items', label: 'Ítems', clause: '7.3', icon: Boxes, n: items.length },
  ]

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        icon={<ShieldCheck size={28} color={colors.primary} />}
        title="Inspección — base técnica"
        subtitle="ISO/IEC 17020: alcance declarado, métodos de inspección e ítems inspeccionados"
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

      {tab === 'scopes' && (
        <ScopesTab scopes={scopes} methods={methods} canWrite={canWrite} canDelete={canDelete}
          orgId={org.id} onChanged={load} />
      )}
      {tab === 'methods' && (
        <MethodsTab methods={methods} scopes={scopes} canWrite={canWrite} canDelete={canDelete}
          orgId={org.id} profile={profile} onChanged={load} />
      )}
      {tab === 'items' && (
        <ItemsTab items={items} scopes={scopes} canWrite={canWrite} canDelete={canDelete}
          orgId={org.id} onChanged={load} />
      )}
    </div>
  )
}

// ─── Pestaña 1: alcance técnico (5.2.3) ──────────────────────────────────────

function ScopesTab({ scopes, methods, canWrite, canDelete, orgId, onChanged }) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_SCOPE)
  const [saving, setSaving] = useState(false)

  const kpis = useMemo(() => ({
    total: scopes.length,
    vigentes: scopes.filter(s => s.status === 'Vigente').length,
    acreditados: scopes.filter(s => s.accreditation_status === 'Acreditado').length,
    sinMetodo: scopes.filter(s => !methods.some(m => m.scope_id === s.id)).length,
  }), [scopes, methods])

  const openNew = () => { setForm({ ...EMPTY_SCOPE, code: `ALC-${String(scopes.length + 1).padStart(2, '0')}` }); setEditing(null); setModal(true) }
  const openEdit = (s) => {
    setForm({ ...EMPTY_SCOPE, ...Object.fromEntries(Object.keys(EMPTY_SCOPE).map(k => [k, s[k] ?? EMPTY_SCOPE[k]])) })
    setEditing(s); setModal(true)
  }

  const save = async () => {
    if (!form.activity.trim()) return toast.warning('Poné la actividad de inspección')
    if (form.status === 'Vigente' && !form.reference_standards.trim()) {
      return toast.warning('Un alcance vigente necesita la norma de referencia (5.2.3)')
    }
    setSaving(true)
    const payload = cleanPayload(form, orgId)
    const { error } = editing
      ? await supabase.from('inspection_scopes').update(payload).eq('id', editing.id)
      : await supabase.from('inspection_scopes').insert([payload])
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(editing ? 'Alcance actualizado' : 'Alcance registrado')
    setModal(false); onChanged()
  }

  const remove = async (s) => {
    const usados = methods.filter(m => m.scope_id === s.id).length
    const ok = await confirm(
      usados
        ? `"${s.activity}" tiene ${usados} método(s) asociados. Si lo eliminás, esos métodos quedan sin alcance.`
        : `¿Eliminar el alcance "${s.activity}"?`,
      { title: 'Eliminar alcance', tone: 'danger', confirmText: 'Eliminar' })
    if (!ok) return
    const { error } = await supabase.from('inspection_scopes').delete().eq('id', s.id)
    if (error) return toast.error(error.message)
    toast.success('Alcance eliminado'); onChanged()
  }

  return (
    <>
      <Grid min="170px" gap="10px">
        <Kpi label="Actividades" value={kpis.total} icon={<Ruler size={14} />} color={colors.primary} />
        <Kpi label="Vigentes" value={kpis.vigentes} icon={<CheckCircle2 size={14} />} color={colors.success} />
        <Kpi label="Acreditadas" value={kpis.acreditados} icon={<ShieldCheck size={14} />} color={colors.info} />
        <Kpi label="Sin método" value={kpis.sinMetodo} icon={<AlertTriangle size={14} />}
          color={kpis.sinMetodo > 0 ? colors.warning : colors.success} subtitle="no se pueden ejecutar" />
      </Grid>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 12px', gap: '10px', flexWrap: 'wrap' }}>
        <p style={{ margin: 0, fontSize: font.sm, color: colors.textMuted, maxWidth: '62ch' }}>
          El alcance se declara por actividad: campo, rango, etapa del ítem y norma de referencia.
          Conviene arrancar angosto y ampliar después: cada actividad exige métodos, inspectores autorizados y formato de informe.
        </p>
        {canWrite && <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>Nueva actividad</Button>}
      </div>

      {scopes.length === 0 ? (
        <EmptyState icon={<Ruler size={32} color={colors.textGhost} />}
          title="Todavía no declaraste el alcance técnico"
          subtitle="Ejemplo: medición de espesores por ultrasonido en recipientes a presión en servicio, según API 510 y ASTM E797." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {scopes.map(s => {
            const nMetodos = methods.filter(m => m.scope_id === s.id).length
            return (
              <div key={s.id} style={{ background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl, padding: '14px' }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {s.code && <span style={{ fontFamily: 'monospace', fontSize: font.xs, color: colors.textMuted }}>{s.code}</span>}
                      <Badge variant={SCOPE_STATUS[s.status] || 'neutral'}>{s.status}</Badge>
                      <Badge variant={s.accreditation_status === 'Acreditado' ? 'success' : 'neutral'}>{s.accreditation_status}</Badge>
                      {s.independence_type && <Badge variant="info">Tipo {s.independence_type === 'no_A' ? 'no A' : 'A'}</Badge>}
                      <Badge variant={nMetodos ? 'neutral' : 'warning'}>{nMetodos} método(s)</Badge>
                    </div>
                    <div style={{ fontWeight: 700, color: colors.text, marginTop: '4px' }}>{s.activity}</div>
                    <div style={{ fontSize: font.sm, color: colors.textMuted, marginTop: '2px' }}>
                      {[s.field, s.item_types, s.range_description, s.item_stage].filter(Boolean).join(' · ')}
                    </div>
                    {s.reference_standards && (
                      <div style={{ fontSize: font.sm, color: colors.text, marginTop: '6px' }}>
                        <strong>Normas:</strong> {s.reference_standards}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {canWrite && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => openEdit(s)}>Editar</Button>}
                    {canDelete && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(s)} />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar actividad' : 'Nueva actividad de inspección'} maxWidth="820px">
        <Modal.Section title="Qué se inspecciona">
          <Row>
            <Field label="Código"><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Etapa del ítem" hint="En qué momento de la vida del ítem se inspecciona">
              <Select value={form.item_stage} onChange={e => setForm({ ...form, item_stage: e.target.value })}>
                {ITEM_STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </Row>
          <Field label="Actividad" required>
            <Input value={form.activity} onChange={e => setForm({ ...form, activity: e.target.value })}
              placeholder="Ej: Medición de espesores por ultrasonido" />
          </Field>
          <Row>
            <Field label="Campo"><Input value={form.field} onChange={e => setForm({ ...form, field: e.target.value })} placeholder="Integridad mecánica" /></Field>
            <Field label="Tipos de ítem"><Input value={form.item_types} onChange={e => setForm({ ...form, item_types: e.target.value })} placeholder="Recipientes a presión, líneas de proceso" /></Field>
          </Row>
          <Row>
            <Field label="Rango" hint="Límites técnicos de la actividad">
              <Input value={form.range_description} onChange={e => setForm({ ...form, range_description: e.target.value })} placeholder='Espesores 2-50 mm · DN 2"-24"' />
            </Field>
            <Field label="Normas de referencia" hint="Con edición: API 510 (2022), ASTM E797-21">
              <Input value={form.reference_standards} onChange={e => setForm({ ...form, reference_standards: e.target.value })} />
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Independencia y estado">
          <Row>
            <Field label="Tipo de independencia" hint="Se declara por actividad (Anexo A)">
              <Select value={form.independence_type} onChange={e => setForm({ ...form, independence_type: e.target.value })}>
                <option value="A">Tipo A — independencia total</option>
                <option value="no_A">Tipo no A — con salvaguardas</option>
              </Select>
            </Field>
            <Field label="Estado">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.keys(SCOPE_STATUS).map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Acreditación">
              <Select value={form.accreditation_status} onChange={e => setForm({ ...form, accreditation_status: e.target.value })}>
                {ACCREDITATION_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </Row>
          <Field label="Justificación del tipo" hint="Qué vínculos existen con quien diseña, fabrica o mantiene el ítem, y qué salvaguardas se aplican">
            <Textarea rows={2} value={form.independence_note} onChange={e => setForm({ ...form, independence_note: e.target.value })} />
          </Field>
          <Row>
            <Field label="Aprobado por"><Input value={form.approved_by} onChange={e => setForm({ ...form, approved_by: e.target.value })} /></Field>
            <Field label="Cargo"><Input value={form.approved_role} onChange={e => setForm({ ...form, approved_role: e.target.value })} /></Field>
            <Field label="Fecha"><Input type="date" value={form.approved_at || ''} onChange={e => setForm({ ...form, approved_at: e.target.value })} /></Field>
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

// ─── Pestaña 2: métodos (7.2) ────────────────────────────────────────────────

function MethodsTab({ methods, scopes, canWrite, canDelete, orgId, profile, onChanged }) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_METHOD)
  const [saving, setSaving] = useState(false)
  const [loadingIA, setLoadingIA] = useState(false)
  const [search, setSearch] = useState('')

  const needsValidation = NEEDS_VALIDATION.includes(form.method_source)

  const kpis = useMemo(() => ({
    total: methods.length,
    vigentes: methods.filter(m => m.status === 'Vigente').length,
    propios: methods.filter(m => NEEDS_VALIDATION.includes(m.method_source)).length,
    sinValidar: methods.filter(m => NEEDS_VALIDATION.includes(m.method_source) && m.validation_status !== 'Validado').length,
    incompletos: methods.filter(m => !m.technique || !m.acceptance_criteria).length,
  }), [methods])

  const filtered = useMemo(() => methods.filter(m => {
    if (!search) return true
    const q = search.toLowerCase()
    return [m.name, m.code, m.standard_ref, m.technique].filter(Boolean).join(' ').toLowerCase().includes(q)
  }), [methods, search])

  const openNew = () => { setForm({ ...EMPTY_METHOD, code: `MET-${String(methods.length + 1).padStart(2, '0')}` }); setEditing(null); setModal(true) }
  const openEdit = (m) => {
    setForm({ ...EMPTY_METHOD, ...Object.fromEntries(Object.keys(EMPTY_METHOD).map(k => [k, m[k] ?? EMPTY_METHOD[k]])) })
    setEditing(m); setModal(true)
  }

  const save = async () => {
    if (!form.name.trim()) return toast.warning('Poné el nombre del método')
    if (form.method_source === 'normalizado' && !form.standard_ref.trim()) {
      return toast.warning('Un método normalizado necesita la norma y su edición')
    }
    // 7.2.6 — la base también lo bloquea, pero el aviso acá explica por qué
    if (form.status === 'Vigente' && needsValidation && form.validation_status !== 'Validado') {
      return toast.warning('Un método propio o modificado tiene que estar validado antes de ponerlo vigente (7.2.6)')
    }
    if (form.status === 'Vigente' && (!form.technique.trim() || !form.acceptance_criteria.trim())) {
      return toast.warning('Para ponerlo vigente falta la técnica y el criterio de aceptación (7.2.5)')
    }
    setSaving(true)
    const payload = cleanPayload(form, orgId)
    if (!needsValidation && payload.validation_status === 'No aplica') payload.validation_status = 'No aplica'
    const { error } = editing
      ? await supabase.from('inspection_methods').update(payload).eq('id', editing.id)
      : await supabase.from('inspection_methods').insert([payload])
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(editing ? 'Método actualizado' : 'Método registrado')
    setModal(false); onChanged()
  }

  const remove = async (m) => {
    const ok = await confirm(`¿Eliminar el método "${m.name}"?`, { title: 'Eliminar método', tone: 'danger', confirmText: 'Eliminar' })
    if (!ok) return
    const { error } = await supabase.from('inspection_methods').delete().eq('id', m.id)
    if (error) return toast.error(error.message)
    toast.success('Método eliminado'); onChanged()
  }

  const validar = async (m) => {
    const quien = await promptText('Quién valida el método', { required: true, rows: 1 })
    if (!quien) return
    const evidencia = await promptText('¿Cómo se validó? (ensayos, comparación con método normalizado, bloques patrón…)', { rows: 3, required: true })
    if (!evidencia) return
    const { error } = await supabase.from('inspection_methods').update({
      validation_status: 'Validado', validated_by: quien, validation_evidence: evidencia,
      validated_at: new Date().toISOString().slice(0, 10),
    }).eq('id', m.id)
    if (error) return toast.error(error.message)
    toast.success('Método validado. Ya se puede poner vigente.')
    onChanged()
  }

  const redactarConIA = async () => {
    if (!form.name.trim()) return toast.warning('Escribí primero el nombre del método')
    setLoadingIA(true)
    try {
      const scope = scopes.find(s => s.id === form.scope_id)
      const prompt = `Eres un especialista en ensayos no destructivos e inspección industrial que redacta procedimientos para un organismo de inspección acreditado bajo ISO/IEC 17020:2026.

${companyContextLine(profile)}
MÉTODO: "${form.name}"
ORIGEN: ${METHOD_SOURCES[form.method_source].label}
${form.standard_ref ? 'NORMA DE REFERENCIA: ' + form.standard_ref : ''}
${scope ? `ALCANCE: ${scope.activity} · ${scope.item_types || ''} · ${scope.range_description || ''} · etapa ${scope.item_stage || ''}` : ''}

Redactá el contenido que exige la cláusula 7.2.5. Sé concreto y técnico, sin relleno.

Devuelve SOLO JSON, sin markdown:
{
  "technique": "técnica y secuencia de ejecución, incluida preparación de superficie y calibración previa (máx 700 caracteres)",
  "equipment_required": "equipos, accesorios y bloques patrón, señalando cuáles influyen en el resultado (máx 400)",
  "sampling_plan": "plan de muestreo y su justificación técnica: qué puntos o porcentaje y por qué (máx 400)",
  "client_info_required": "información que el cliente debe entregar antes de la inspección (máx 300)",
  "technology_use": "software, equipos digitales o IA empleados y cómo se controla su validez (máx 300)",
  "safety_requirements": "seguridad del personal y protección del ítem (máx 300)",
  "acceptance_criteria": "criterio de decisión: qué se considera conforme y contra qué referencia, con la regla de decisión frente a la incertidumbre (máx 500)"
}`
      const data = parseAiJson(await consultarIA(prompt, 'Devuelve únicamente JSON válido.'))
      if (!data || Array.isArray(data)) throw new Error('La IA no devolvió un método legible. Probá de nuevo.')
      const campos = ['technique', 'equipment_required', 'sampling_plan', 'client_info_required', 'technology_use', 'safety_requirements', 'acceptance_criteria']
      setForm(prev => {
        const next = { ...prev }
        campos.forEach(k => { if (!prev[k]?.trim() && data[k]) next[k] = clampString(data[k], 900) })
        return next
      })
      toast.success('Borrador aplicado a los campos vacíos. Revisalo: sos vos quien responde por el método.')
    } catch (e) {
      toast.error('Error IA: ' + e.message)
    }
    setLoadingIA(false)
  }

  return (
    <>
      <Grid min="170px" gap="10px">
        <Kpi label="Métodos" value={kpis.total} icon={<FlaskConical size={14} />} color={colors.primary} />
        <Kpi label="Vigentes" value={kpis.vigentes} icon={<CheckCircle2 size={14} />} color={colors.success} />
        <Kpi label="No normalizados" value={kpis.propios} icon={<AlertTriangle size={14} />} color={colors.info}
          subtitle="propios o modificados" />
        <Kpi label="Sin validar" value={kpis.sinValidar} icon={<Lock size={14} />}
          color={kpis.sinValidar > 0 ? colors.danger : colors.success} subtitle="no pueden usarse" />
        <Kpi label="Incompletos" value={kpis.incompletos} icon={<AlertTriangle size={14} />}
          color={kpis.incompletos > 0 ? colors.warning : colors.success} subtitle="falta 7.2.5" />
      </Grid>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', margin: '16px 0 12px' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: colors.textGhost }} />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar método…" style={{ paddingLeft: '30px' }} />
        </div>
        {canWrite && <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>Nuevo método</Button>}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<FlaskConical size={32} color={colors.textGhost} />}
          title={methods.length ? 'Sin resultados' : 'Todavía no hay métodos en el catálogo'}
          subtitle={methods.length ? 'Probá con otra búsqueda.' : 'Cada actividad del alcance necesita al menos un método documentado antes de poder ejecutarse.'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(m => {
            const scope = scopes.find(s => s.id === m.scope_id)
            const bloqueado = NEEDS_VALIDATION.includes(m.method_source) && m.validation_status !== 'Validado'
            const faltan = [!m.technique && 'técnica', !m.acceptance_criteria && 'criterio de aceptación',
              !m.sampling_plan && 'muestreo', !m.safety_requirements && 'seguridad'].filter(Boolean)
            return (
              <div key={m.id} style={{
                background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl, padding: '14px',
                borderLeft: `4px solid ${bloqueado ? colors.danger : m.status === 'Vigente' ? colors.success : colors.border}`,
              }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                  <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      {m.code && <span style={{ fontFamily: 'monospace', fontSize: font.xs, color: colors.textMuted }}>{m.code}</span>}
                      <Badge variant={METHOD_STATUS[m.status] || 'neutral'}>{m.status}</Badge>
                      <Badge variant={m.method_source === 'normalizado' ? 'neutral' : 'warning'}>
                        {METHOD_SOURCES[m.method_source]?.label || m.method_source}
                      </Badge>
                      {NEEDS_VALIDATION.includes(m.method_source) && (
                        <Badge variant={m.validation_status === 'Validado' ? 'success' : 'danger'}>
                          {m.validation_status === 'Validado' ? 'Validado' : 'Sin validar'}
                        </Badge>
                      )}
                      {m.version && <span style={{ fontSize: font.xs, color: colors.textMuted }}>{m.version}</span>}
                    </div>
                    <div style={{ fontWeight: 700, color: colors.text, marginTop: '4px' }}>{m.name}</div>
                    <div style={{ fontSize: font.sm, color: colors.textMuted, marginTop: '2px' }}>
                      {[m.standard_ref, scope?.activity].filter(Boolean).join(' · ') || 'Sin norma ni alcance asociado'}
                    </div>
                    {faltan.length > 0 && (
                      <div style={{ marginTop: '8px', padding: '6px 8px', background: colors.warningLight, color: colors.warningText, borderRadius: radius.md, fontSize: font.xs }}>
                        Falta completar (7.2.5): {faltan.join(', ')}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    {canWrite && bloqueado && (
                      <Button size="sm" variant="success" icon={<ClipboardCheck size={14} />} onClick={() => validar(m)}>Validar</Button>
                    )}
                    {canWrite && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => openEdit(m)}>Editar</Button>}
                    {canDelete && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(m)} />}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar método' : 'Nuevo método de inspección'} maxWidth="880px">
        <Modal.Section title="Identificación">
          <Row>
            <Field label="Código"><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} /></Field>
            <Field label="Versión"><Input value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} /></Field>
            <Field label="Estado">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.keys(METHOD_STATUS).map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </Row>
          <Field label="Nombre del método" required>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Ej: Medición de espesores por ultrasonido pulso-eco" />
          </Field>
          <Row>
            <Field label="Actividad del alcance">
              <Select value={form.scope_id} onChange={e => setForm({ ...form, scope_id: e.target.value })}>
                <option value="">— sin asociar —</option>
                {scopes.map(s => <option key={s.id} value={s.id}>{s.activity}</option>)}
              </Select>
            </Field>
            <Field label="Origen del método" hint={METHOD_SOURCES[form.method_source]?.hint}>
              <Select value={form.method_source} onChange={e => setForm({ ...form, method_source: e.target.value })}>
                {Object.entries(METHOD_SOURCES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Norma y edición" hint="La edición importa: el auditor verifica que sea la vigente">
              <Input value={form.standard_ref} onChange={e => setForm({ ...form, standard_ref: e.target.value })} placeholder="ASTM E797-21" />
            </Field>
            {form.method_source === 'modificado' && (
              <Field label="Qué se modificó">
                <Input value={form.modification_note} onChange={e => setForm({ ...form, modification_note: e.target.value })} />
              </Field>
            )}
          </Row>
          {canWrite && (
            <Button variant="ai" loading={loadingIA} icon={<Sparkles size={16} />} onClick={redactarConIA}>
              Redactar contenido con IA
            </Button>
          )}
        </Modal.Section>

        <Modal.Section title="Contenido exigido por 7.2.5">
          <Field label="Técnica y procedimiento" required>
            <Textarea rows={4} value={form.technique} onChange={e => setForm({ ...form, technique: e.target.value })} />
          </Field>
          <Row>
            <Field label="Equipos" hint="Señalá cuáles influyen en el resultado (6.2.4)">
              <Textarea rows={3} value={form.equipment_required} onChange={e => setForm({ ...form, equipment_required: e.target.value })} />
            </Field>
            <Field label="Plan de muestreo" hint="Qué se inspecciona y por qué esa cantidad">
              <Textarea rows={3} value={form.sampling_plan} onChange={e => setForm({ ...form, sampling_plan: e.target.value })} />
            </Field>
          </Row>
          <Row>
            <Field label="Información que aporta el cliente">
              <Textarea rows={2} value={form.client_info_required} onChange={e => setForm({ ...form, client_info_required: e.target.value })} />
            </Field>
            <Field label="Tecnología, software o IA" hint="Si incide en el resultado, hay que validarla (6.2.9)">
              <Textarea rows={2} value={form.technology_use} onChange={e => setForm({ ...form, technology_use: e.target.value })} />
            </Field>
          </Row>
          <Field label="Seguridad">
            <Textarea rows={2} value={form.safety_requirements} onChange={e => setForm({ ...form, safety_requirements: e.target.value })} />
          </Field>
          <Field label="Criterio de decisión y aceptación" required hint="Contra qué referencia se dictamina conforme o no conforme">
            <Textarea rows={3} value={form.acceptance_criteria} onChange={e => setForm({ ...form, acceptance_criteria: e.target.value })} />
          </Field>
        </Modal.Section>

        {needsValidation && (
          <Modal.Section title="Validación (7.2.6) — obligatoria para este método">
            <Row>
              <Field label="Estado de validación">
                <Select value={form.validation_status} onChange={e => setForm({ ...form, validation_status: e.target.value })}>
                  {VALIDATION_STATUS.map(s => <option key={s} value={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Validado por"><Input value={form.validated_by} onChange={e => setForm({ ...form, validated_by: e.target.value })} /></Field>
              <Field label="Fecha"><Input type="date" value={form.validated_at || ''} onChange={e => setForm({ ...form, validated_at: e.target.value })} /></Field>
            </Row>
            <Field label="Evidencia de la validación" hint="Ensayos, comparación con método normalizado, bloques patrón, repetibilidad">
              <Textarea rows={3} value={form.validation_evidence} onChange={e => setForm({ ...form, validation_evidence: e.target.value })} />
            </Field>
          </Modal.Section>
        )}

        <Modal.Section title="Aprobación">
          <Row>
            <Field label="Aprobado por"><Input value={form.approved_by} onChange={e => setForm({ ...form, approved_by: e.target.value })} /></Field>
            <Field label="Cargo"><Input value={form.approved_role} onChange={e => setForm({ ...form, approved_role: e.target.value })} placeholder="Gerente técnico" /></Field>
            <Field label="Fecha"><Input type="date" value={form.approved_at || ''} onChange={e => setForm({ ...form, approved_at: e.target.value })} /></Field>
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

// ─── Pestaña 3: ítems (7.3) ──────────────────────────────────────────────────

function ItemsTab({ items, scopes, canWrite, canDelete, orgId, onChanged }) {
  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_ITEM)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  const kpis = useMemo(() => ({
    total: items.length,
    listos: items.filter(i => i.readiness_verified).length,
    sinVerificar: items.filter(i => !i.readiness_verified && i.status !== 'Inspeccionado').length,
    noAptos: items.filter(i => i.status === 'No apto').length,
  }), [items])

  const filtered = useMemo(() => items.filter(i => {
    if (filterStatus !== 'all' && i.status !== filterStatus) return false
    if (!search) return true
    const q = search.toLowerCase()
    return [i.tag, i.name, i.client_name, i.location, i.item_type].filter(Boolean).join(' ').toLowerCase().includes(q)
  }), [items, search, filterStatus])

  const openNew = () => { setForm(EMPTY_ITEM); setEditing(null); setModal(true) }
  const openEdit = (it) => {
    setForm({ ...EMPTY_ITEM, ...Object.fromEntries(Object.keys(EMPTY_ITEM).map(k => [k, it[k] ?? EMPTY_ITEM[k]])) })
    setEditing(it); setModal(true)
  }

  const save = async () => {
    if (!form.tag.trim()) return toast.warning('El ítem necesita una identificación única (7.3.1)')
    setSaving(true)
    const payload = cleanPayload(form, orgId)
    payload.tag = payload.tag.trim()
    const { error } = editing
      ? await supabase.from('inspection_items').update(payload).eq('id', editing.id)
      : await supabase.from('inspection_items').insert([payload])
    setSaving(false)
    if (error) {
      return toast.error(/uq_inspection_items_tag|duplicate/i.test(error.message)
        ? `Ya existe un ítem con la identificación "${payload.tag}". La identificación tiene que ser única.`
        : error.message)
    }
    toast.success(editing ? 'Ítem actualizado' : 'Ítem registrado')
    setModal(false); onChanged()
  }

  const verificarListo = async (it) => {
    const quien = await promptText('Quién verifica que el ítem está listo para inspección', { required: true, rows: 1 })
    if (!quien) return
    const notas = await promptText('Condiciones verificadas (limpieza, acceso, desenergizado, andamio, permiso de trabajo…)', { rows: 3 })
    const { error } = await supabase.from('inspection_items').update({
      readiness_verified: true, readiness_by: quien, readiness_notes: notas || null,
      readiness_at: new Date().toISOString().slice(0, 10),
      status: it.status === 'Registrado' ? 'Listo' : it.status,
    }).eq('id', it.id)
    if (error) return toast.error(error.message)
    toast.success('Ítem verificado como listo')
    onChanged()
  }

  const remove = async (it) => {
    const ok = await confirm(`¿Eliminar el ítem "${it.tag}"?`, { title: 'Eliminar ítem', tone: 'danger', confirmText: 'Eliminar' })
    if (!ok) return
    const { error } = await supabase.from('inspection_items').delete().eq('id', it.id)
    if (error) return toast.error(error.message)
    toast.success('Ítem eliminado'); onChanged()
  }

  return (
    <>
      <Grid min="170px" gap="10px">
        <Kpi label="Ítems" value={kpis.total} icon={<Boxes size={14} />} color={colors.primary} />
        <Kpi label="Verificados listos" value={kpis.listos} icon={<CheckCircle2 size={14} />} color={colors.success} />
        <Kpi label="Sin verificar" value={kpis.sinVerificar} icon={<AlertTriangle size={14} />}
          color={kpis.sinVerificar > 0 ? colors.warning : colors.success} subtitle="no inspeccionar aún" />
        <Kpi label="No aptos" value={kpis.noAptos} icon={<AlertTriangle size={14} />}
          color={kpis.noAptos > 0 ? colors.danger : colors.success} />
      </Grid>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', margin: '16px 0 12px' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: colors.textGhost }} />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por identificación, cliente o ubicación…" style={{ paddingLeft: '30px' }} />
        </div>
        <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ width: 'auto', minWidth: '160px' }}>
          <option value="all">Todos los estados</option>
          {Object.keys(ITEM_STATUS).map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        {canWrite && <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>Nuevo ítem</Button>}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<Boxes size={32} color={colors.textGhost} />}
          title={items.length ? 'Sin resultados' : 'Todavía no registraste ítems'}
          subtitle={items.length ? 'Probá con otro filtro.' : 'Un ítem es lo que se inspecciona: un recipiente, una línea, una junta soldada. Cada uno necesita identificación única.'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {filtered.map(it => (
            <div key={it.id} style={{
              background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl, padding: '12px 14px',
              borderLeft: `4px solid ${it.readiness_verified ? colors.success : colors.warning}`,
            }}>
              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                <div style={{ flex: '1 1 300px', minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: 'monospace', fontWeight: 700, color: colors.text }}>{it.tag}</span>
                    <Badge variant={ITEM_STATUS[it.status] || 'neutral'}>{it.status}</Badge>
                    {!it.readiness_verified && <Badge variant="warning">Sin verificar</Badge>}
                  </div>
                  <div style={{ fontSize: font.sm, color: colors.textMuted, marginTop: '3px' }}>
                    {[it.name, it.item_type, it.client_name, it.location].filter(Boolean).join(' · ')}
                  </div>
                  {it.readiness_verified && (
                    <div style={{ fontSize: font.xs, color: colors.textMuted, marginTop: '3px' }}>
                      Listo verificado por {it.readiness_by} el {it.readiness_at}
                    </div>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {canWrite && !it.readiness_verified && (
                    <Button size="sm" variant="success" icon={<ClipboardCheck size={14} />} onClick={() => verificarListo(it)}>
                      Verificar listo
                    </Button>
                  )}
                  {canWrite && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={() => openEdit(it)}>Editar</Button>}
                  {canDelete && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={() => remove(it)} />}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Editar ítem' : 'Nuevo ítem a inspeccionar'} maxWidth="820px">
        <Modal.Section title="Identificación (7.3.1)">
          <Row>
            <Field label="Identificación única" required hint="TAG del cliente o el que asigne el organismo">
              <Input value={form.tag} onChange={e => setForm({ ...form, tag: e.target.value })} placeholder="TK-101 · L-2004-J12" />
            </Field>
            <Field label="Estado">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.keys(ITEM_STATUS).map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Descripción"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Tanque de almacenamiento de diésel" /></Field>
            <Field label="Tipo de ítem"><Input value={form.item_type} onChange={e => setForm({ ...form, item_type: e.target.value })} placeholder="Recipiente a presión" /></Field>
          </Row>
          <Row>
            <Field label="Cliente"><Input value={form.client_name} onChange={e => setForm({ ...form, client_name: e.target.value })} /></Field>
            <Field label="Ubicación"><Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></Field>
            <Field label="Actividad del alcance">
              <Select value={form.scope_id} onChange={e => setForm({ ...form, scope_id: e.target.value })}>
                <option value="">— sin asociar —</option>
                {scopes.map(s => <option key={s.id} value={s.id}>{s.activity}</option>)}
              </Select>
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Datos técnicos">
          <Row>
            <Field label="Fabricante"><Input value={form.manufacturer} onChange={e => setForm({ ...form, manufacturer: e.target.value })} /></Field>
            <Field label="N° de serie"><Input value={form.serial_number} onChange={e => setForm({ ...form, serial_number: e.target.value })} /></Field>
          </Row>
          <Row>
            <Field label="Servicio / fluido"><Input value={form.service_fluid} onChange={e => setForm({ ...form, service_fluid: e.target.value })} /></Field>
            <Field label="Código de diseño"><Input value={form.design_code} onChange={e => setForm({ ...form, design_code: e.target.value })} placeholder="ASME VIII Div.1" /></Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Estado listo y cuidado del ítem (7.3.2 / 7.3.3)">
          <Field label="Condiciones verificadas antes de inspeccionar">
            <Textarea rows={2} value={form.readiness_notes} onChange={e => setForm({ ...form, readiness_notes: e.target.value })}
              placeholder="Limpieza, acceso, desenergizado, permiso de trabajo, andamio" />
          </Field>
          <Field label="Cuidados para evitar deterioro mientras está bajo nuestra custodia">
            <Textarea rows={2} value={form.protection_notes} onChange={e => setForm({ ...form, protection_notes: e.target.value })} />
          </Field>
          <p style={{ fontSize: font.xs, color: colors.textMuted, margin: 0 }}>
            La verificación formal de “listo” se hace desde la lista, con el botón <strong>Verificar listo</strong>: queda registrado quién la hizo y cuándo.
          </p>
        </Modal.Section>

        <Modal.Footer>
          <Button variant="ghost" onClick={() => setModal(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!canWrite}>Guardar</Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
