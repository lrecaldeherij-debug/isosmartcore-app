// =============================================================================
// Infrastructure — cláusula 7.1.3 Infraestructura
//
// "La organización debe determinar, proporcionar y mantener la infraestructura
// necesaria para la operación de sus procesos y lograr la conformidad."
//
// Diferencia clave con Calibración (7.1.5): allá van SOLO los equipos de
// medición cuya exactitud afecta la conformidad del producto. Acá va todo lo
// demás — edificios, maquinaria, vehículos, TIC, servicios de apoyo.
//
// Lo que el auditor pide en esta cláusula no es el listado de activos (eso lo
// tiene cualquiera en contabilidad), es el HISTORIAL de mantenimiento: "mostrame
// las últimas 3 intervenciones del compresor". Por eso el módulo tiene dos
// niveles: activo → sus mantenimientos.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import {
  Building2, Plus, Wrench, AlertTriangle, CheckCircle2, Clock, Search,
  Trash2, Pencil, Server, Truck, Package, Hammer, Zap, Box, History,
  CalendarClock, ChevronRight,
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

const CATEGORIES = {
  building:    { label: 'Edificio / Instalación', icon: Building2 },
  equipment:   { label: 'Maquinaria y equipos',   icon: Package },
  vehicle:     { label: 'Vehículo / Transporte',  icon: Truck },
  it_hardware: { label: 'Hardware TI',            icon: Server },
  it_software: { label: 'Software / Licencias',   icon: Box },
  utility:     { label: 'Servicio de apoyo',      icon: Zap },
  tool:        { label: 'Herramienta',            icon: Hammer },
  other:       { label: 'Otro',                   icon: Box },
}

const STATUSES = {
  operational: { label: 'Operativo',       variant: 'success' },
  maintenance: { label: 'En mantenimiento', variant: 'warning' },
  faulty:      { label: 'Averiado',        variant: 'danger' },
  retired:     { label: 'Dado de baja',    variant: 'neutral' },
}

const CRITICALITIES = {
  low:      { label: 'Baja',    variant: 'neutral' },
  medium:   { label: 'Media',   variant: 'info' },
  high:     { label: 'Alta',    variant: 'warning' },
  critical: { label: 'Crítica', variant: 'danger' },
}

const MAINT_TYPES = {
  preventive: { label: 'Preventivo',  variant: 'success' },
  corrective: { label: 'Correctivo',  variant: 'danger' },
  predictive: { label: 'Predictivo',  variant: 'info' },
  inspection: { label: 'Inspección',  variant: 'neutral' },
}

const MAINT_RESULTS = {
  ok:                { label: 'Conforme',          variant: 'success' },
  partial:           { label: 'Parcial',           variant: 'warning' },
  failed:            { label: 'No conforme',       variant: 'danger' },
  requires_followup: { label: 'Requiere seguimiento', variant: 'warning' },
}

const EMPTY_ASSET = {
  code: '', name: '', category: 'equipment', description: '',
  location: '', responsible: '', used_in_process: '', criticality: 'medium',
  brand: '', model: '', serial_number: '',
  acquisition_date: '', acquisition_cost: '',
  status: 'operational',
  maintenance_frequency_months: '', last_maintenance_date: '', next_maintenance_date: '',
  evidence_url: '', notes: '',
}

const EMPTY_MAINT = {
  maintenance_type: 'preventive',
  performed_date: new Date().toISOString().slice(0, 10),
  performed_by: '', is_external: false, supplier_name: '',
  description: '', findings: '', actions_taken: '', parts_replaced: '',
  cost: '', downtime_hours: '', result: 'ok', next_due_date: '', evidence_url: '',
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d) {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('es-EC', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

// Días hasta el próximo mantenimiento. Negativo = vencido.
function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr + 'T00:00:00') - new Date()) / 86400000)
}

function maintenanceBadge(asset) {
  const d = daysUntil(asset.next_maintenance_date)
  if (d === null) return null
  if (d < 0) return { label: `Vencido ${Math.abs(d)}d`, variant: 'danger' }
  if (d <= 30) return { label: `En ${d}d`, variant: 'warning' }
  return { label: fmtDate(asset.next_maintenance_date), variant: 'neutral' }
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function Infrastructure() {
  const { org, role } = useOrg()
  const orgId = org?.id
  const canWrite = can(role, 'infrastructure_assets', 'write')
  const canLogMaint = can(role, 'maintenance_records', 'write')

  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showRetired, setShowRetired] = useState(false)

  const [assetModal, setAssetModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_ASSET)
  const [saving, setSaving] = useState(false)

  // Activo cuyo historial de mantenimiento se está viendo.
  const [historyAsset, setHistoryAsset] = useState(null)

  const load = async () => {
    if (!orgId) return
    setLoading(true)
    const { data, error } = await supabase
      .from('infrastructure_assets')
      .select('*')
      .eq('org_id', orgId)
      .order('name')
    if (error) toast.error(error.message)
    setAssets(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [orgId])

  const kpis = useMemo(() => {
    const active = assets.filter(a => a.status !== 'retired')
    return {
      total: active.length,
      operational: active.filter(a => a.status === 'operational').length,
      faulty: active.filter(a => a.status === 'faulty').length,
      critical: active.filter(a => ['high', 'critical'].includes(a.criticality)).length,
      overdue: active.filter(a => {
        const d = daysUntil(a.next_maintenance_date)
        return d !== null && d < 0
      }).length,
      due30: active.filter(a => {
        const d = daysUntil(a.next_maintenance_date)
        return d !== null && d >= 0 && d <= 30
      }).length,
    }
  }, [assets])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return assets.filter(a => {
      if (!showRetired && a.status === 'retired') return false
      if (filterCat !== 'all' && a.category !== filterCat) return false
      if (filterStatus !== 'all' && a.status !== filterStatus) return false
      if (q && !(
        (a.name || '').toLowerCase().includes(q) ||
        (a.code || '').toLowerCase().includes(q) ||
        (a.location || '').toLowerCase().includes(q) ||
        (a.serial_number || '').toLowerCase().includes(q)
      )) return false
      return true
    })
  }, [assets, search, filterCat, filterStatus, showRetired])

  const openNew = () => { setEditing(null); setForm(EMPTY_ASSET); setAssetModal(true) }

  const openEdit = (a) => {
    setEditing(a)
    setForm({
      ...EMPTY_ASSET,
      ...a,
      description: a.description || '', location: a.location || '',
      responsible: a.responsible || '', used_in_process: a.used_in_process || '',
      brand: a.brand || '', model: a.model || '', serial_number: a.serial_number || '',
      acquisition_date: a.acquisition_date || '', acquisition_cost: a.acquisition_cost ?? '',
      maintenance_frequency_months: a.maintenance_frequency_months ?? '',
      last_maintenance_date: a.last_maintenance_date || '',
      next_maintenance_date: a.next_maintenance_date || '',
      evidence_url: a.evidence_url || '', notes: a.notes || '', code: a.code || '',
    })
    setAssetModal(true)
  }

  const save = async () => {
    if (!form.name?.trim()) { toast.error('Poné el nombre del activo'); return }
    setSaving(true)
    const payload = {
      code: form.code?.trim() || null,
      name: form.name.trim(),
      category: form.category,
      description: form.description?.trim() || null,
      location: form.location?.trim() || null,
      responsible: form.responsible?.trim() || null,
      used_in_process: form.used_in_process?.trim() || null,
      criticality: form.criticality,
      brand: form.brand?.trim() || null,
      model: form.model?.trim() || null,
      serial_number: form.serial_number?.trim() || null,
      acquisition_date: form.acquisition_date || null,
      acquisition_cost: form.acquisition_cost === '' ? null : Number(form.acquisition_cost),
      status: form.status,
      maintenance_frequency_months: form.maintenance_frequency_months === ''
        ? null : Number(form.maintenance_frequency_months),
      last_maintenance_date: form.last_maintenance_date || null,
      next_maintenance_date: form.next_maintenance_date || null,
      evidence_url: form.evidence_url?.trim() || null,
      notes: form.notes?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const q = editing
      ? supabase.from('infrastructure_assets').update(payload).eq('id', editing.id)
      : supabase.from('infrastructure_assets').insert([{ ...payload, org_id: orgId }])
    const { error } = await q
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success(editing ? 'Activo actualizado' : 'Activo registrado')
    setAssetModal(false)
    load()
  }

  const remove = async (a) => {
    const ok = await confirm({
      title: 'Eliminar activo',
      message: `¿Eliminar "${a.name}"? Se borra también todo su historial de mantenimiento. Si el activo salió de servicio, es mejor marcarlo como "Dado de baja" para conservar la evidencia.`,
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('infrastructure_assets').delete().eq('id', a.id)
    if (error) { toast.error(error.message); return }
    toast.success('Activo eliminado')
    load()
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <PageHeader
        icon={<Building2 size={28} color={colors.primary} />}
        title="Infraestructura"
        subtitle="Edificios, equipos, TIC y servicios de apoyo con su plan de mantenimiento (7.1.3)"
      />

      <IsoInfoCard {...CLAUSE_GUIDES['7.1.3']} />

      <div style={{ marginTop: '14px', marginBottom: '16px' }}>
        <Grid min="170px" gap="10px">
          <Kpi label="Activos" value={kpis.total} icon={<Package size={14} />} color={colors.primary}
            subtitle="en servicio" />
          <Kpi label="Operativos" value={kpis.operational} icon={<CheckCircle2 size={14} />}
            color={colors.success} />
          <Kpi label="Averiados" value={kpis.faulty} icon={<AlertTriangle size={14} />}
            color={kpis.faulty > 0 ? colors.danger : colors.success} />
          <Kpi label="Críticos" value={kpis.critical} icon={<Zap size={14} />} color={colors.warning}
            subtitle="alta o crítica" />
          <Kpi label="Mant. vencido" value={kpis.overdue} icon={<AlertTriangle size={14} />}
            color={kpis.overdue > 0 ? colors.danger : colors.success} />
          <Kpi label="Próximos 30d" value={kpis.due30} icon={<CalendarClock size={14} />}
            color={colors.info} subtitle="a programar" />
        </Grid>
      </div>

      {kpis.overdue > 0 && (
        <div style={{
          padding: '10px 12px', background: colors.dangerLight, color: colors.dangerText,
          borderRadius: radius.md, marginBottom: '14px', fontSize: font.sm,
          display: 'flex', gap: '8px', alignItems: 'flex-start',
        }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>
            <strong>{kpis.overdue}</strong> activo{kpis.overdue === 1 ? '' : 's'} con mantenimiento
            vencido. Un plan preventivo que no se ejecuta es peor que no tenerlo: el auditor lo
            lee como incumplimiento de tu propio procedimiento.
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
            placeholder="Buscar por nombre, código, ubicación o serie…"
            style={{ paddingLeft: '28px' }} />
        </div>
        <Select value={filterCat} onChange={e => setFilterCat(e.target.value)}
          style={{ width: 'auto', minWidth: '170px' }}>
          <option value="all">Todas las categorías</option>
          {Object.entries(CATEGORIES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </Select>
        <Select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          style={{ width: 'auto', minWidth: '150px' }}>
          <option value="all">Todos los estados</option>
          {Object.entries(STATUSES).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </Select>
        <label style={{
          display: 'flex', alignItems: 'center', gap: '5px',
          fontSize: font.sm, color: colors.textMuted, cursor: 'pointer',
        }}>
          <input type="checkbox" checked={showRetired}
            onChange={e => setShowRetired(e.target.checked)} />
          Ver dados de baja
        </label>
        {canWrite && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={openNew}>
            Nuevo activo
          </Button>
        )}
      </div>

      {loading ? <Spinner label="Cargando activos…" />
        : filtered.length === 0 ? (
          <EmptyState
            icon={<Building2 size={32} color={colors.textGhost} />}
            title={assets.length === 0 ? 'Sin infraestructura registrada' : 'Sin resultados'}
            subtitle={assets.length === 0
              ? 'Registrá los activos que sostienen tus procesos: instalaciones, maquinaria, vehículos, servidores. Los de medición van en Calibración.'
              : 'Probá limpiando los filtros.'}
          />
        ) : (
          <div style={{
            background: 'white', border: `1px solid ${colors.border}`,
            borderRadius: radius.xl, overflow: 'hidden',
          }}>
            {filtered.map((a, i) => (
              <AssetRow
                key={a.id} asset={a} isLast={i === filtered.length - 1}
                canWrite={canWrite}
                onEdit={() => openEdit(a)}
                onDelete={() => remove(a)}
                onHistory={() => setHistoryAsset(a)}
              />
            ))}
          </div>
        )}

      {/* Modal de alta/edición de activo */}
      <Modal
        open={assetModal}
        onClose={() => setAssetModal(false)}
        title={editing ? `Editar ${editing.name}` : 'Nuevo activo de infraestructura'}
        maxWidth="780px"
      >
        <Modal.Section title="Identificación">
          <Row>
            <Field label="Código / Placa interna">
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })}
                placeholder="INF-001" />
            </Field>
            <Field label="Nombre del activo" required flex={2}>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="Ej. Compresor de aire planta 1" />
            </Field>
          </Row>
          <Row>
            <Field label="Categoría" required>
              <Select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {Object.entries(CATEGORIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Estado">
              <Select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {Object.entries(STATUSES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Criticidad" hint="Si falla, ¿para la operación?">
              <Select value={form.criticality} onChange={e => setForm({ ...form, criticality: e.target.value })}>
                {Object.entries(CRITICALITIES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
          </Row>
          <Field label="Descripción">
            <Textarea rows={2} value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })} />
          </Field>
        </Modal.Section>

        <Modal.Section title="Ubicación y responsabilidad">
          <Row>
            <Field label="Ubicación">
              <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })}
                placeholder="Planta / área / sala" />
            </Field>
            <Field label="Responsable">
              <Input value={form.responsible} onChange={e => setForm({ ...form, responsible: e.target.value })} />
            </Field>
            <Field label="Proceso que lo usa" hint="Conecta 7.1.3 con el mapa de procesos (4.4)">
              <Input value={form.used_in_process}
                onChange={e => setForm({ ...form, used_in_process: e.target.value })}
                placeholder="Ej. Inspección en campo" />
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Datos técnicos">
          <Row>
            <Field label="Marca">
              <Input value={form.brand} onChange={e => setForm({ ...form, brand: e.target.value })} />
            </Field>
            <Field label="Modelo">
              <Input value={form.model} onChange={e => setForm({ ...form, model: e.target.value })} />
            </Field>
            <Field label="N° de serie">
              <Input value={form.serial_number}
                onChange={e => setForm({ ...form, serial_number: e.target.value })} />
            </Field>
          </Row>
          <Row>
            <Field label="Fecha de adquisición">
              <Input type="date" value={form.acquisition_date}
                onChange={e => setForm({ ...form, acquisition_date: e.target.value })} />
            </Field>
            <Field label="Costo de adquisición (USD)">
              <Input type="number" step="0.01" value={form.acquisition_cost}
                onChange={e => setForm({ ...form, acquisition_cost: e.target.value })} />
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Section title="Plan de mantenimiento">
          <Row>
            <Field label="Frecuencia (meses)" hint="Vacío = no requiere mantenimiento programado">
              <Input type="number" min="1" value={form.maintenance_frequency_months}
                onChange={e => setForm({ ...form, maintenance_frequency_months: e.target.value })}
                placeholder="Ej. 6" />
            </Field>
            <Field label="Último mantenimiento">
              <Input type="date" value={form.last_maintenance_date}
                onChange={e => setForm({ ...form, last_maintenance_date: e.target.value })} />
            </Field>
            <Field label="Próximo mantenimiento">
              <Input type="date" value={form.next_maintenance_date}
                onChange={e => setForm({ ...form, next_maintenance_date: e.target.value })} />
            </Field>
          </Row>
          <div style={{
            fontSize: font.sm, color: colors.textFaint, background: colors.bgSubtle,
            padding: '8px 10px', borderRadius: radius.md,
          }}>
            Al registrar un mantenimiento en el historial, estas dos fechas se actualizan solas
            según la frecuencia — no hace falta editarlas a mano.
          </div>
        </Modal.Section>

        <Modal.Section title="Otros">
          <Row>
            <Field label="Evidencia (URL)">
              <Input value={form.evidence_url}
                onChange={e => setForm({ ...form, evidence_url: e.target.value })}
                placeholder="Manual, ficha técnica, factura" />
            </Field>
            <Field label="Notas">
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </Field>
          </Row>
        </Modal.Section>

        <Modal.Footer>
          <Button variant="ghost" onClick={() => setAssetModal(false)}>Cancelar</Button>
          <Button variant="primary" onClick={save} loading={saving}>
            {editing ? 'Guardar cambios' : 'Registrar activo'}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Panel de historial de mantenimiento del activo seleccionado */}
      {historyAsset && (
        <MaintenanceHistory
          asset={historyAsset}
          orgId={orgId}
          canWrite={canLogMaint}
          onClose={() => setHistoryAsset(null)}
          onChanged={load}
        />
      )}
    </div>
  )
}

// ─── Fila de activo ──────────────────────────────────────────────────────────

function AssetRow({ asset, isLast, canWrite, onEdit, onDelete, onHistory }) {
  const cat = CATEGORIES[asset.category] || CATEGORIES.other
  const st = STATUSES[asset.status] || STATUSES.operational
  const crit = CRITICALITIES[asset.criticality] || CRITICALITIES.medium
  const maint = maintenanceBadge(asset)
  const Icon = cat.icon
  const isOverdue = maint?.variant === 'danger'

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 14px',
      borderBottom: isLast ? 'none' : `1px solid ${colors.border}`,
      borderLeft: isOverdue ? `3px solid ${colors.danger}` : '3px solid transparent',
      opacity: asset.status === 'retired' ? 0.55 : 1,
    }}>
      <div style={{
        width: '36px', height: '36px', borderRadius: radius.lg, flexShrink: 0,
        background: colors.bgSubtle, color: colors.textMuted,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={17} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {asset.code && (
            <span style={{ fontFamily: 'monospace', fontSize: font.sm, color: colors.textMuted, fontWeight: 700 }}>
              {asset.code}
            </span>
          )}
          <strong style={{ color: colors.text, fontSize: font.base }}>{asset.name}</strong>
          <Badge variant={st.variant}>{st.label}</Badge>
          {['high', 'critical'].includes(asset.criticality) && (
            <Badge variant={crit.variant}>{crit.label}</Badge>
          )}
          {maint && <Badge variant={maint.variant}><Wrench size={9} /> {maint.label}</Badge>}
        </div>
        <div style={{ fontSize: font.sm, color: colors.textFaint, marginTop: '3px' }}>
          {cat.label}
          {asset.location && ` · ${asset.location}`}
          {asset.responsible && ` · ${asset.responsible}`}
          {asset.used_in_process && ` · proceso: ${asset.used_in_process}`}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
        <Button variant="ghost" size="sm" icon={<History size={13} />} onClick={onHistory}
          title="Historial de mantenimiento">Historial</Button>
        {canWrite && <>
          <Button variant="ghost" size="sm" icon={<Pencil size={13} />} onClick={onEdit} title="Editar" />
          <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={onDelete} title="Eliminar" />
        </>}
      </div>
    </div>
  )
}

// ─── Historial de mantenimiento de un activo ────────────────────────────────

function MaintenanceHistory({ asset, orgId, canWrite, onClose, onChanged }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_MAINT)
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('maintenance_records')
      .select('*')
      .eq('asset_id', asset.id)
      .order('performed_date', { ascending: false })
    if (error) toast.error(error.message)
    setRecords(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [asset.id])

  const save = async () => {
    if (!form.description?.trim()) { toast.error('Describí qué se hizo'); return }
    setSaving(true)
    const payload = {
      org_id: orgId,
      asset_id: asset.id,
      maintenance_type: form.maintenance_type,
      performed_date: form.performed_date,
      performed_by: form.performed_by?.trim() || null,
      is_external: !!form.is_external,
      supplier_name: form.is_external ? (form.supplier_name?.trim() || null) : null,
      description: form.description.trim(),
      findings: form.findings?.trim() || null,
      actions_taken: form.actions_taken?.trim() || null,
      parts_replaced: form.parts_replaced?.trim() || null,
      cost: form.cost === '' ? null : Number(form.cost),
      downtime_hours: form.downtime_hours === '' ? null : Number(form.downtime_hours),
      result: form.result,
      next_due_date: form.next_due_date || null,
      evidence_url: form.evidence_url?.trim() || null,
    }
    const { error } = await supabase.from('maintenance_records').insert([payload])
    setSaving(false)
    if (error) { toast.error(error.message); return }
    toast.success('Mantenimiento registrado')
    setFormOpen(false)
    setForm(EMPTY_MAINT)
    load()
    // El trigger en BD ya actualizó last/next_maintenance_date del activo;
    // recargamos la lista de arriba para que el badge refleje la fecha nueva.
    onChanged?.()
  }

  const remove = async (r) => {
    const ok = await confirm({
      title: 'Eliminar registro de mantenimiento',
      message: 'Esto borra evidencia de auditoría. ¿Continuar?',
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase.from('maintenance_records').delete().eq('id', r.id)
    if (error) { toast.error(error.message); return }
    toast.success('Registro eliminado')
    load()
  }

  return (
    <Modal open onClose={onClose} title={`Historial · ${asset.name}`} maxWidth="820px">
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        marginBottom: '12px', flexWrap: 'wrap', gap: '8px',
      }}>
        <div style={{ fontSize: font.sm, color: colors.textMuted }}>
          {asset.maintenance_frequency_months
            ? `Plan preventivo cada ${asset.maintenance_frequency_months} meses`
            : 'Sin plan preventivo definido'}
          {asset.next_maintenance_date && ` · próximo ${fmtDate(asset.next_maintenance_date)}`}
        </div>
        {canWrite && !formOpen && (
          <Button variant="primary" size="sm" icon={<Plus size={13} />} onClick={() => setFormOpen(true)}>
            Registrar mantenimiento
          </Button>
        )}
      </div>

      {formOpen && (
        <div style={{
          background: colors.bgMuted, border: `1px solid ${colors.border}`,
          borderRadius: radius.lg, padding: '12px', marginBottom: '14px',
        }}>
          <Row>
            <Field label="Tipo">
              <Select value={form.maintenance_type}
                onChange={e => setForm({ ...form, maintenance_type: e.target.value })}>
                {Object.entries(MAINT_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
            <Field label="Fecha" required>
              <Input type="date" value={form.performed_date}
                onChange={e => setForm({ ...form, performed_date: e.target.value })} />
            </Field>
            <Field label="Resultado">
              <Select value={form.result} onChange={e => setForm({ ...form, result: e.target.value })}>
                {Object.entries(MAINT_RESULTS).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </Select>
            </Field>
          </Row>
          <Row>
            <Field label="Ejecutado por">
              <Input value={form.performed_by}
                onChange={e => setForm({ ...form, performed_by: e.target.value })}
                placeholder="Técnico o empresa" />
            </Field>
            <Field label="¿Externo?">
              <label style={{
                display: 'flex', alignItems: 'center', gap: '6px', height: '32px',
                fontSize: font.base, color: colors.textMuted, cursor: 'pointer',
              }}>
                <input type="checkbox" checked={form.is_external}
                  onChange={e => setForm({ ...form, is_external: e.target.checked })} />
                Proveedor externo
              </label>
            </Field>
            {form.is_external && (
              <Field label="Proveedor">
                <Input value={form.supplier_name}
                  onChange={e => setForm({ ...form, supplier_name: e.target.value })} />
              </Field>
            )}
          </Row>
          <Field label="Descripción del trabajo" required>
            <Textarea rows={2} value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Qué se hizo concretamente" />
          </Field>
          <Row>
            <Field label="Hallazgos">
              <Textarea rows={2} value={form.findings}
                onChange={e => setForm({ ...form, findings: e.target.value })}
                placeholder="Qué se encontró al intervenir" />
            </Field>
            <Field label="Acciones tomadas">
              <Textarea rows={2} value={form.actions_taken}
                onChange={e => setForm({ ...form, actions_taken: e.target.value })} />
            </Field>
          </Row>
          <Row>
            <Field label="Repuestos cambiados">
              <Input value={form.parts_replaced}
                onChange={e => setForm({ ...form, parts_replaced: e.target.value })} />
            </Field>
            <Field label="Costo (USD)">
              <Input type="number" step="0.01" value={form.cost}
                onChange={e => setForm({ ...form, cost: e.target.value })} />
            </Field>
            <Field label="Parada (horas)">
              <Input type="number" step="0.5" value={form.downtime_hours}
                onChange={e => setForm({ ...form, downtime_hours: e.target.value })} />
            </Field>
            <Field label="Próximo vencimiento" hint="Vacío = se calcula por frecuencia">
              <Input type="date" value={form.next_due_date}
                onChange={e => setForm({ ...form, next_due_date: e.target.value })} />
            </Field>
          </Row>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '6px' }}>
            <Button variant="ghost" size="sm" onClick={() => { setFormOpen(false); setForm(EMPTY_MAINT) }}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" onClick={save} loading={saving}>Guardar</Button>
          </div>
        </div>
      )}

      {loading ? <Spinner label="Cargando historial…" />
        : records.length === 0 ? (
          <EmptyState
            icon={<Wrench size={28} color={colors.textGhost} />}
            title="Sin mantenimientos registrados"
            subtitle="El auditor pide ver las últimas intervenciones de los activos críticos. Registrá acá cada una."
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {records.map(r => {
              const t = MAINT_TYPES[r.maintenance_type] || MAINT_TYPES.preventive
              const res = MAINT_RESULTS[r.result] || MAINT_RESULTS.ok
              return (
                <div key={r.id} style={{
                  border: `1px solid ${colors.border}`, borderRadius: radius.lg,
                  padding: '10px 12px', background: 'white',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap' }}>
                    <Badge variant={t.variant}>{t.label}</Badge>
                    <Badge variant={res.variant}>{res.label}</Badge>
                    <strong style={{ fontSize: font.base, color: colors.text }}>
                      {fmtDate(r.performed_date)}
                    </strong>
                    {r.performed_by && (
                      <span style={{ fontSize: font.sm, color: colors.textFaint }}>
                        · {r.performed_by}{r.is_external && r.supplier_name ? ` (${r.supplier_name})` : ''}
                      </span>
                    )}
                    <div style={{ marginLeft: 'auto' }}>
                      {canWrite && (
                        <Button variant="ghost" size="sm" icon={<Trash2 size={12} />}
                          onClick={() => remove(r)} title="Eliminar" />
                      )}
                    </div>
                  </div>
                  <div style={{ fontSize: font.sm, color: colors.textMuted, marginTop: '5px' }}>
                    {r.description}
                  </div>
                  {(r.findings || r.actions_taken) && (
                    <div style={{ fontSize: font.xs, color: colors.textFaint, marginTop: '4px' }}>
                      {r.findings && <div><strong>Hallazgos:</strong> {r.findings}</div>}
                      {r.actions_taken && <div><strong>Acciones:</strong> {r.actions_taken}</div>}
                    </div>
                  )}
                  {(r.cost || r.downtime_hours || r.parts_replaced) && (
                    <div style={{ fontSize: font.xs, color: colors.textFaint, marginTop: '4px' }}>
                      {r.cost != null && `Costo: $${Number(r.cost).toFixed(2)}`}
                      {r.downtime_hours != null && ` · Parada: ${r.downtime_hours}h`}
                      {r.parts_replaced && ` · Repuestos: ${r.parts_replaced}`}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

      <Modal.Footer>
        <Button variant="ghost" onClick={onClose}>Cerrar</Button>
      </Modal.Footer>
    </Modal>
  )
}
