// =============================================================================
// QmsChanges — cláusula 6.3 Planificación de los cambios
//
// "Cuando la organización determine la necesidad de cambios en el SGC, estos se
//  deben llevar a cabo de manera planificada" considerando: a) propósito y
//  consecuencias potenciales, b) integridad del SGC, c) disponibilidad de
//  recursos, d) asignación o reasignación de responsabilidades y autoridades.
//
// Diferencia con el Plan de Acción (6.1.2 / 6.2.2): allá van acciones para
// tratar riesgos y alcanzar objetivos. Acá va el CAMBIO al sistema: mudanza de
// planta, cambio de ERP, reorganización, nueva línea, cambio de alcance.
//
// Lo que el auditor busca: que el cambio se planificó ANTES de ejecutarlo
// (aprobación previa) y que después se verificó que el SGC siguió íntegro.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import {
  GitBranch, Plus, Search, Pencil, Trash2, ShieldCheck, CheckCircle2,
  AlertTriangle, Clock, Sparkles, Loader2, ClipboardCheck, Lock,
} from 'lucide-react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import { can } from './lib/roles'
import { toast } from './lib/toast'
import { confirm, promptText } from './lib/confirm'
import { consultarIA, parseAiJson, clampString } from './aiClient'
import { companyContextLine } from './lib/companyContext'
import IsoInfoCard from './IsoInfoCard'
import { CLAUSE_GUIDES } from './clauseGuides'
import {
  Button, Modal, Field, Row, Input, Select, Textarea, Badge, Kpi,
  EmptyState, Spinner, Grid, PageHeader, colors, radius, font,
} from './components/ui'

// ─── Catálogos ───────────────────────────────────────────────────────────────

const CHANGE_TYPES = {
  scope:         'Alcance del SGC',
  process:       'Proceso o método de trabajo',
  structure:     'Estructura organizativa / personal',
  infrastructure:'Infraestructura o instalaciones',
  technology:    'Tecnología o sistema informático',
  product:       'Producto o servicio nuevo',
  supplier:      'Proveedor externo crítico',
  legal:         'Requisito legal o normativo',
  documentation: 'Documentación del SGC',
  other:         'Otro',
}

const STATUSES = {
  'Propuesto':     { variant: 'neutral' },
  'Planificado':   { variant: 'info' },
  'Aprobado':      { variant: 'success' },
  'En ejecución':  { variant: 'warning' },
  'Implementado':  { variant: 'info' },
  'Verificado':    { variant: 'success' },
  'Rechazado':     { variant: 'danger' },
  'Cancelado':     { variant: 'neutral' },
}

// Estados en los que el cambio ya se está ejecutando o se ejecutó
const EXECUTING = ['En ejecución', 'Implementado', 'Verificado']
const CLOSED = ['Verificado', 'Rechazado', 'Cancelado']

const RISK_LEVELS = ['Bajo', 'Medio', 'Alto']
const VERIFICATION_RESULTS = ['Eficaz', 'Parcial', 'No eficaz']

const EMPTY_FORM = {
  code: '', title: '', change_type: 'process', description: '',
  purpose: '', consequences: '', affected_clauses: '',
  integrity_actions: '',
  resources_required: '', estimated_cost: '', currency: 'USD',
  responsibilities: '', responsible: '',
  requested_by: '', requested_at: new Date().toISOString().slice(0, 10),
  planned_start: '', planned_end: '',
  status: 'Propuesto', risk_level: 'Medio',
  process_id: '', risk_id: '', objective_id: '', review_id: '',
  evidence_url: '', notes: '',
}

// Campos que la norma pide planificar antes de ejecutar
const PLANNING_FIELDS = [
  ['purpose', 'Propósito del cambio'],
  ['consequences', 'Consecuencias potenciales'],
  ['integrity_actions', 'Integridad del SGC'],
  ['resources_required', 'Recursos necesarios'],
  ['responsibilities', 'Responsabilidades y autoridades'],
]

const DATE_FIELDS = ['requested_at', 'planned_start', 'planned_end']
const LINK_FIELDS = ['process_id', 'risk_id', 'objective_id', 'review_id']

export default function QmsChanges() {
  const { org, role } = useOrg()
  const canWrite = can(role, 'qms_changes', 'write')
  const canDelete = can(role, 'qms_changes', 'delete')

  const [items, setItems] = useState([])
  const [processes, setProcesses] = useState([])
  const [risks, setRisks] = useState([])
  const [objectives, setObjectives] = useState([])
  const [reviews, setReviews] = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [loadingIA, setLoadingIA] = useState(false)

  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => { if (org?.id) fetchAll() }, [org?.id])

  const fetchAll = async () => {
    setLoading(true)
    const [main, pr, rk, ob, rv, cp] = await Promise.all([
      supabase.from('qms_changes').select('*').eq('org_id', org.id).order('requested_at', { ascending: false }),
      supabase.from('processes').select('id, name').eq('org_id', org.id).order('name'),
      supabase.from('risk_matrix').select('id, risk_description').eq('org_id', org.id).limit(100),
      supabase.from('quality_objectives').select('id, name, objective').eq('org_id', org.id).limit(100),
      supabase.from('management_review').select('id, review_date').eq('org_id', org.id).order('review_date', { ascending: false }).limit(20),
      supabase.from('company_profile').select('*').eq('org_id', org.id).maybeSingle(),
    ])
    if (main.error) {
      toast.error(/qms_changes/i.test(main.error.message)
        ? 'Falta aplicar la migración de cambios del SGC (6.3).'
        : 'No se pudieron cargar los cambios: ' + main.error.message)
      setItems([])
    } else {
      setItems(main.data || [])
    }
    setProcesses(pr.data || [])
    setRisks(rk.data || [])
    setObjectives(ob.data || [])
    setReviews(rv.data || [])
    setProfile(cp.data || null)
    setLoading(false)
  }

  // ─── KPIs ───
  const kpis = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return {
      total: items.length,
      porAprobar: items.filter(i => ['Propuesto', 'Planificado'].includes(i.status)).length,
      enCurso: items.filter(i => ['Aprobado', 'En ejecución'].includes(i.status)).length,
      sinVerificar: items.filter(i => i.status === 'Implementado').length,
      vencidos: items.filter(i => i.planned_end && i.planned_end < today && !CLOSED.includes(i.status) && i.status !== 'Implementado').length,
      sinPlanificar: items.filter(i => PLANNING_FIELDS.some(([k]) => !i[k]?.trim?.()) && !CLOSED.includes(i.status)).length,
    }
  }, [items])

  const filtered = useMemo(() => items.filter(i => {
    if (filterStatus !== 'all' && i.status !== filterStatus) return false
    if (search) {
      const q = search.toLowerCase()
      const hay = [i.title, i.code, i.description, i.responsible, i.purpose].filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [items, filterStatus, search])

  // ─── CRUD ───
  const openNew = () => {
    const year = new Date().getFullYear()
    const n = items.filter(i => i.code?.startsWith(`CAM-${year}`)).length + 1
    setForm({ ...EMPTY_FORM, code: `CAM-${year}-${String(n).padStart(2, '0')}` })
    setEditingId(null)
    setModalOpen(true)
  }

  const openEdit = (item) => {
    setForm({
      ...EMPTY_FORM,
      ...Object.fromEntries(Object.keys(EMPTY_FORM).map(k => [k, item[k] ?? EMPTY_FORM[k]])),
      estimated_cost: item.estimated_cost ?? '',
    })
    setEditingId(item.id)
    setModalOpen(true)
  }

  const save = async () => {
    if (!form.title.trim()) return toast.warning('Ponele un título al cambio')
    // Un cambio no se ejecuta sin haberlo planificado: la norma pide los 4 puntos
    if (EXECUTING.includes(form.status)) {
      const faltan = PLANNING_FIELDS.filter(([k]) => !form[k]?.trim()).map(([, label]) => label)
      if (faltan.length) {
        return toast.warning(`Antes de ejecutar completá la planificación: ${faltan.join(', ')}`)
      }
    }
    setSaving(true)
    const payload = { ...form, org_id: org.id }
    DATE_FIELDS.forEach(k => { if (!payload[k]) payload[k] = null })
    LINK_FIELDS.forEach(k => { if (!payload[k]) payload[k] = null })
    payload.estimated_cost = payload.estimated_cost === '' ? null : Number(payload.estimated_cost)

    let error
    if (editingId) {
      const prev = items.find(i => i.id === editingId)
      const changes = Object.keys(payload)
        .filter(k => JSON.stringify(prev?.[k] ?? '') !== JSON.stringify(payload[k] ?? ''))
        .map(k => ({ field: k, from: prev?.[k] ?? null, to: payload[k] ?? null }))
      if (changes.length) payload.change_log = [...(prev?.change_log || []), { at: new Date().toISOString(), changes }]
      ;({ error } = await supabase.from('qms_changes').update(payload).eq('id', editingId))
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      payload.created_by = user?.id
      payload.change_log = [{ at: new Date().toISOString(), changes: [{ field: 'created', from: null, to: payload.title }] }]
      ;({ error } = await supabase.from('qms_changes').insert([payload]))
    }
    setSaving(false)
    if (error) return toast.error(error.message)
    toast.success(editingId ? 'Cambio actualizado' : 'Cambio registrado')
    setModalOpen(false)
    fetchAll()
  }

  const remove = async (item) => {
    const ok = await confirm(`¿Eliminar el cambio "${item.title}"? Se pierde su historial de planificación.`,
      { title: 'Eliminar cambio', tone: 'danger', confirmText: 'Eliminar' })
    if (!ok) return
    const { error } = await supabase.from('qms_changes').delete().eq('id', item.id)
    if (error) return toast.error(error.message)
    toast.success('Cambio eliminado')
    fetchAll()
  }

  // ─── Aprobar (antes de ejecutar) ───
  const aprobar = async (item) => {
    const faltan = PLANNING_FIELDS.filter(([k]) => !item[k]?.trim?.()).map(([, label]) => label)
    if (faltan.length) {
      return toast.warning(`No se puede aprobar sin planificar: ${faltan.join(', ')}`)
    }
    const aprobador = await promptText('Nombre de quien aprueba el cambio', { required: true, rows: 1 })
    if (!aprobador) return
    const rol = (await promptText('Cargo del aprobador', { defaultValue: 'Dirección General', rows: 1 })) || 'Dirección General'
    const { error } = await supabase.from('qms_changes').update({
      status: 'Aprobado',
      approved_by: aprobador,
      approved_role: rol,
      approved_at: new Date().toISOString().slice(0, 10),
      change_log: [...(item.change_log || []), { at: new Date().toISOString(), changes: [{ field: 'status', from: item.status, to: 'Aprobado' }, { field: 'approved_by', from: item.approved_by, to: aprobador }] }],
    }).eq('id', item.id)
    if (error) return toast.error(error.message)
    toast.success('Cambio aprobado. Ya puede ejecutarse.')
    fetchAll()
  }

  // ─── Verificar (después de implementar) ───
  const verificar = async (item) => {
    const resultado = await promptText(
      'Resultado de la verificación: escribí Eficaz, Parcial o No eficaz',
      { defaultValue: 'Eficaz', required: true, rows: 1 })
    if (!resultado) return
    const normalizado = VERIFICATION_RESULTS.find(r => r.toLowerCase() === resultado.trim().toLowerCase())
    if (!normalizado) return toast.warning('Escribí exactamente: Eficaz, Parcial o No eficaz')
    const notas = await promptText('¿Cómo se verificó que el SGC quedó íntegro? (evidencia)', { rows: 3 })
    const quien = await promptText('Quién verifica', { required: true, rows: 1 })
    if (!quien) return
    const { error } = await supabase.from('qms_changes').update({
      status: 'Verificado',
      verification_result: normalizado,
      verification_notes: notas || null,
      verified_by: quien,
      verified_at: new Date().toISOString().slice(0, 10),
      actual_end: item.actual_end || new Date().toISOString().slice(0, 10),
      change_log: [...(item.change_log || []), { at: new Date().toISOString(), changes: [{ field: 'status', from: item.status, to: 'Verificado' }, { field: 'verification_result', from: null, to: normalizado }] }],
    }).eq('id', item.id)
    if (error) return toast.error(error.message)
    toast.success('Cambio verificado y cerrado')
    fetchAll()
  }

  const marcarImplementado = async (item) => {
    const { error } = await supabase.from('qms_changes').update({
      status: 'Implementado',
      actual_end: new Date().toISOString().slice(0, 10),
      change_log: [...(item.change_log || []), { at: new Date().toISOString(), changes: [{ field: 'status', from: item.status, to: 'Implementado' }] }],
    }).eq('id', item.id)
    if (error) return toast.error(error.message)
    toast.success('Marcado como implementado. Falta verificar la integridad del SGC.')
    fetchAll()
  }

  // ─── IA: analizar impacto del cambio ───
  const analizarConIA = async () => {
    if (!form.title.trim()) return toast.warning('Escribí primero el título del cambio')
    setLoadingIA(true)
    try {
      const procNames = processes.slice(0, 20).map(p => p.name).join(', ') || '(sin procesos cargados)'
      const prompt = `Eres consultor ISO 9001:2015. Analizá este CAMBIO al sistema de gestión de calidad según la cláusula 6.3.

${companyContextLine(profile)}
PROCESOS DE LA EMPRESA: ${procNames}

CAMBIO: "${form.title}"
TIPO: ${CHANGE_TYPES[form.change_type] || form.change_type}
${form.description ? 'DETALLE: ' + form.description : ''}
${form.purpose ? 'PROPÓSITO INDICADO: ' + form.purpose : ''}

Devuelve SOLO JSON, sin markdown:
{
  "purpose": "propósito del cambio en 1-2 frases (máx 300 caracteres)",
  "consequences": "consecuencias potenciales, incluidas las no deseadas (máx 400)",
  "integrity_actions": "qué hacer para que el SGC siga íntegro: documentos a actualizar, procesos a revalidar, capacitación (máx 400)",
  "resources_required": "recursos necesarios: personas, dinero, tiempo, equipamiento (máx 300)",
  "responsibilities": "qué responsabilidades y autoridades se asignan o reasignan (máx 300)",
  "affected_clauses": "cláusulas ISO 9001 afectadas, separadas por coma (ej: 4.4, 7.1.3, 8.5.1)",
  "risk_level": "Bajo" | "Medio" | "Alto"
}`
      const data = parseAiJson(await consultarIA(prompt, 'Devuelve únicamente JSON válido.'))
      if (!data || Array.isArray(data)) throw new Error('La IA no devolvió un análisis legible. Probá de nuevo.')
      setForm(prev => ({
        ...prev,
        purpose: prev.purpose || clampString(data.purpose, 500),
        consequences: prev.consequences || clampString(data.consequences, 600),
        integrity_actions: prev.integrity_actions || clampString(data.integrity_actions, 600),
        resources_required: prev.resources_required || clampString(data.resources_required, 500),
        responsibilities: prev.responsibilities || clampString(data.responsibilities, 500),
        affected_clauses: prev.affected_clauses || clampString(data.affected_clauses, 200),
        risk_level: RISK_LEVELS.includes(data.risk_level) ? data.risk_level : prev.risk_level,
      }))
      toast.success('Análisis aplicado a los campos vacíos. Revisalo antes de guardar.')
    } catch (e) {
      toast.error('Error IA: ' + e.message)
    }
    setLoadingIA(false)
  }

  if (loading) return <Spinner label="Cargando cambios del SGC…" />

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        icon={<GitBranch size={28} color={colors.primary} />}
        title="Cambios del SGC"
        subtitle="Cambios al sistema planificados antes de ejecutarlos (6.3)"
        actions={canWrite && (
          <Button variant="primary" icon={<Plus size={16} />} onClick={openNew}>Nuevo cambio</Button>
        )}
      />

      <IsoInfoCard {...CLAUSE_GUIDES['6.3']} />

      <div style={{ margin: '16px 0' }}>
        <Grid min="170px" gap="10px">
          <Kpi label="Cambios" value={kpis.total} icon={<GitBranch size={14} />} color={colors.primary} />
          <Kpi label="Por aprobar" value={kpis.porAprobar} icon={<Clock size={14} />} color={colors.warning}
            subtitle="propuestos o planificados" />
          <Kpi label="En curso" value={kpis.enCurso} icon={<ClipboardCheck size={14} />} color={colors.info} />
          <Kpi label="Sin verificar" value={kpis.sinVerificar} icon={<AlertTriangle size={14} />}
            color={kpis.sinVerificar > 0 ? colors.warning : colors.success} subtitle="implementados" />
          <Kpi label="Planificación incompleta" value={kpis.sinPlanificar} icon={<AlertTriangle size={14} />}
            color={kpis.sinPlanificar > 0 ? colors.danger : colors.success} subtitle="falta algún punto de 6.3" />
          <Kpi label="Vencidos" value={kpis.vencidos} icon={<AlertTriangle size={14} />}
            color={kpis.vencidos > 0 ? colors.danger : colors.success} />
        </Grid>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '14px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: colors.textGhost }} />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar cambio…"
            style={{ paddingLeft: '30px' }} />
        </div>
        <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ width: 'auto', minWidth: '170px' }}>
          <option value="all">Todos los estados</option>
          {Object.keys(STATUSES).map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<GitBranch size={32} color={colors.textGhost} />}
          title={items.length ? 'Sin resultados' : 'Todavía no registraste cambios al SGC'}
          subtitle={items.length
            ? 'Probá con otro filtro.'
            : 'Registrá acá cambios como una mudanza, un ERP nuevo, una reorganización o un cambio de alcance. El auditor pide ver que se planificaron antes de ejecutarlos.'}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filtered.map(item => (
            <ChangeCard
              key={item.id}
              item={item}
              canWrite={canWrite}
              canDelete={canDelete}
              onEdit={() => openEdit(item)}
              onDelete={() => remove(item)}
              onApprove={() => aprobar(item)}
              onImplement={() => marcarImplementado(item)}
              onVerify={() => verificar(item)}
            />
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}
        title={editingId ? 'Editar cambio del SGC' : 'Nuevo cambio del SGC'} maxWidth="860px">

        <Modal.Section title="Qué cambia">
          <Row>
            <Field label="Código"><Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="CAM-2026-01" /></Field>
            <Field label="Tipo de cambio">
              <Select value={form.change_type} onChange={e => setForm({ ...form, change_type: e.target.value })}>
                {Object.entries(CHANGE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
          </Row>
          <Field label="Título" required>
            <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Ej: Traslado del taller de inspección a la nueva planta" />
          </Field>
          <Field label="Descripción">
            <Textarea rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="En qué consiste el cambio" />
          </Field>
          {canWrite && (
            <Button variant="ai" loading={loadingIA} icon={<Sparkles size={16} />} onClick={analizarConIA}>
              Analizar impacto con IA
            </Button>
          )}
        </Modal.Section>

        <Modal.Section title="Planificación exigida por 6.3">
          <Field label="a) Propósito del cambio" hint="Por qué se hace y qué se busca lograr">
            <Textarea rows={2} value={form.purpose} onChange={e => setForm({ ...form, purpose: e.target.value })} />
          </Field>
          <Field label="a) Consecuencias potenciales" hint="Incluí las no deseadas: qué puede salir mal">
            <Textarea rows={3} value={form.consequences} onChange={e => setForm({ ...form, consequences: e.target.value })} />
          </Field>
          <Field label="b) Integridad del SGC" hint="Documentos a actualizar, procesos a revalidar, capacitación necesaria">
            <Textarea rows={3} value={form.integrity_actions} onChange={e => setForm({ ...form, integrity_actions: e.target.value })} />
          </Field>
          <Row>
            <Field label="c) Recursos necesarios">
              <Textarea rows={2} value={form.resources_required} onChange={e => setForm({ ...form, resources_required: e.target.value })} />
            </Field>
            <Field label="d) Responsabilidades y autoridades" hint="Quién hace qué y quién decide">
              <Textarea rows={2} value={form.responsibilities} onChange={e => setForm({ ...form, responsibilities: e.target.value })} />
            </Field>
          </Row>
          <Row>
            <Field label="Cláusulas ISO afectadas">
              <Input value={form.affected_clauses} onChange={e => setForm({ ...form, affected_clauses: e.target.value })} placeholder="4.4, 7.1.3, 8.5.1" />
            </Field>
            <Field label="Nivel de riesgo del cambio">
              <Select value={form.risk_level} onChange={e => setForm({ ...form, risk_level: e.target.value })}>
                {RISK_LEVELS.map(r => <option key={r} value={r}>{r}</option>)}
              </Select>
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Responsables y plazos">
          <Row>
            <Field label="Solicitado por"><Input value={form.requested_by} onChange={e => setForm({ ...form, requested_by: e.target.value })} /></Field>
            <Field label="Responsable de ejecutar"><Input value={form.responsible} onChange={e => setForm({ ...form, responsible: e.target.value })} /></Field>
          </Row>
          <Row>
            <Field label="Fecha de solicitud"><Input type="date" value={form.requested_at || ''} onChange={e => setForm({ ...form, requested_at: e.target.value })} /></Field>
            <Field label="Inicio planificado"><Input type="date" value={form.planned_start || ''} onChange={e => setForm({ ...form, planned_start: e.target.value })} /></Field>
            <Field label="Fin planificado"><Input type="date" value={form.planned_end || ''} onChange={e => setForm({ ...form, planned_end: e.target.value })} /></Field>
          </Row>
          <Row>
            <Field label="Costo estimado">
              <Input type="number" min="0" step="any" value={form.estimated_cost}
                onChange={e => setForm({ ...form, estimated_cost: e.target.value })} />
            </Field>
            <Field label="Moneda">
              <Select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}>
                {['USD', 'EUR', 'COP', 'PEN', 'PYG'].map(c => <option key={c} value={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Estado">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.keys(STATUSES).map(s => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Vínculos con el SGC">
          <Row>
            <Field label="Proceso afectado">
              <Select value={form.process_id} onChange={e => setForm({ ...form, process_id: e.target.value })}>
                <option value="">— ninguno —</option>
                {processes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="Riesgo relacionado">
              <Select value={form.risk_id} onChange={e => setForm({ ...form, risk_id: e.target.value })}>
                <option value="">— ninguno —</option>
                {risks.map(r => <option key={r.id} value={r.id}>{(r.risk_description || '').slice(0, 60)}</option>)}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Objetivo relacionado">
              <Select value={form.objective_id} onChange={e => setForm({ ...form, objective_id: e.target.value })}>
                <option value="">— ninguno —</option>
                {objectives.map(o => <option key={o.id} value={o.id}>{(o.name || o.objective || '').slice(0, 60)}</option>)}
              </Select>
            </Field>
            <Field label="Surge de la revisión por la dirección">
              <Select value={form.review_id} onChange={e => setForm({ ...form, review_id: e.target.value })}>
                <option value="">— ninguna —</option>
                {reviews.map(r => <option key={r.id} value={r.id}>{r.review_date || r.id.slice(0, 8)}</option>)}
              </Select>
            </Field>
          </Row>
          <Field label="Evidencia (link)">
            <Input value={form.evidence_url} onChange={e => setForm({ ...form, evidence_url: e.target.value })} placeholder="https://…" />
          </Field>
        </Modal.Section>

        <Modal.Footer>
          <Button variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving} disabled={!canWrite}>
            {editingId ? 'Guardar cambios' : 'Registrar cambio'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}

// ─── Tarjeta de cambio ───────────────────────────────────────────────────────

function ChangeCard({ item, canWrite, canDelete, onEdit, onDelete, onApprove, onImplement, onVerify }) {
  const today = new Date().toISOString().slice(0, 10)
  const vencido = item.planned_end && item.planned_end < today && !CLOSED.includes(item.status) && item.status !== 'Implementado'
  const faltantes = PLANNING_FIELDS.filter(([k]) => !item[k]?.trim?.()).map(([, label]) => label)
  const st = STATUSES[item.status] || { variant: 'neutral' }

  return (
    <div style={{
      background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl,
      padding: '14px', borderLeft: `4px solid ${vencido ? colors.danger : colors.primary}`,
    }}>
      <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {item.code && <span style={{ fontSize: font.xs, color: colors.textMuted, fontFamily: 'monospace' }}>{item.code}</span>}
            <Badge variant={st.variant}>{item.status}</Badge>
            {item.risk_level && <Badge variant={item.risk_level === 'Alto' ? 'danger' : item.risk_level === 'Medio' ? 'warning' : 'neutral'}>Riesgo {item.risk_level}</Badge>}
            {item.verification_result && <Badge variant={item.verification_result === 'Eficaz' ? 'success' : item.verification_result === 'Parcial' ? 'warning' : 'danger'}>{item.verification_result}</Badge>}
          </div>
          <div style={{ fontWeight: 700, color: colors.text, marginTop: '4px' }}>{item.title}</div>
          <div style={{ fontSize: font.sm, color: colors.textMuted, marginTop: '2px' }}>
            {CHANGE_TYPES[item.change_type] || item.change_type}
            {item.responsible ? ` · ${item.responsible}` : ''}
            {item.planned_end ? ` · fin ${item.planned_end}` : ''}
            {vencido ? ' · vencido' : ''}
          </div>
          {item.purpose && (
            <div style={{ fontSize: font.sm, color: colors.text, marginTop: '6px' }}>
              <strong>Propósito:</strong> {item.purpose.slice(0, 180)}
            </div>
          )}
          {item.approved_by && (
            <div style={{ fontSize: font.xs, color: colors.textMuted, marginTop: '4px' }}>
              Aprobado por {item.approved_by}{item.approved_role ? ` (${item.approved_role})` : ''} el {item.approved_at}
            </div>
          )}
          {faltantes.length > 0 && !CLOSED.includes(item.status) && (
            <div style={{
              marginTop: '8px', padding: '6px 8px', background: colors.warningLight,
              color: colors.warningText, borderRadius: radius.md, fontSize: font.xs,
            }}>
              Falta planificar: {faltantes.join(', ')}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'flex-start' }}>
          {canWrite && ['Propuesto', 'Planificado'].includes(item.status) && (
            <Button size="sm" variant="success" icon={faltantes.length ? <Lock size={14} /> : <ShieldCheck size={14} />}
              onClick={onApprove} title={faltantes.length ? 'Completá la planificación antes de aprobar' : ''}>
              Aprobar
            </Button>
          )}
          {canWrite && ['Aprobado', 'En ejecución'].includes(item.status) && (
            <Button size="sm" variant="info" icon={<ClipboardCheck size={14} />} onClick={onImplement}>
              Implementado
            </Button>
          )}
          {canWrite && item.status === 'Implementado' && (
            <Button size="sm" variant="success" icon={<CheckCircle2 size={14} />} onClick={onVerify}>
              Verificar
            </Button>
          )}
          {canWrite && <Button size="sm" variant="ghost" icon={<Pencil size={14} />} onClick={onEdit}>Editar</Button>}
          {canDelete && <Button size="sm" variant="ghost" icon={<Trash2 size={14} />} onClick={onDelete} />}
        </div>
      </div>
    </div>
  )
}
