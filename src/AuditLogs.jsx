// =============================================================================
// AuditLogs — registro inmutable de cambios (trigger log_changes en la BD).
//
// Antes era una tabla HTML con el JSON completo del registro (antes y
// después) dentro de un <details>. Al abrirlo, la fila crecía cientos de
// píxeles y como las celdas se alineaban al medio, fecha/usuario/acción/tabla
// quedaban fuera de la pantalla: parecía que estaban vacías. Además mostraba
// el UUID del usuario y el nombre técnico de la tabla.
//
// Ahora cada cambio se lee como una frase ("Ana modificó Cargo · Técnico en
// Corte CNC") y el detalle muestra solo los campos que cambiaron, antes →
// después, con nombres legibles.
// =============================================================================

import { useEffect, useMemo, useState } from 'react'
import { Shield, Search, ChevronDown, ChevronRight, Plus, Pencil, Trash2, RefreshCw } from 'lucide-react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import { toast } from './lib/toast'
import {
  Button, Input, Select, Badge, EmptyState, Spinner, PageHeader, colors, radius, font,
} from './components/ui'

const PAGE_SIZE = 50

// Módulo legible por tabla auditada
const TABLE_LABELS = {
  risk_matrix: 'Riesgos y oportunidades',
  non_conformities: 'No conformidades',
  quality_objectives: 'Objetivos de calidad',
  quality_policy: 'Política de calidad',
  scope_declaration: 'Alcance del SGC',
  context_analysis: 'Contexto (FODA)',
  processes: 'Procesos',
  job_descriptions: 'Cargos y funciones',
  documents_versions: 'Documentos',
  customer_orders: 'Pedidos',
  production_orders: 'Producción',
  operational_incidents: 'Incidentes y cambios',
  suppliers: 'Proveedores',
  company_profile: 'ADN de la empresa',
  stakeholders: 'Partes interesadas',
  internal_audits: 'Auditorías internas',
  management_review: 'Revisión por la dirección',
  personnel: 'Personal',
  training_records: 'Formación',
  qc_inspections: 'Liberación',
  improvement_opportunities: 'Mejora continua',
  strategic_actions: 'Plan de acción',
  qms_changes: 'Cambios del SGC',
}

const ACTIONS = {
  INSERT: { verb: 'creó', label: 'Alta', variant: 'success', icon: Plus },
  UPDATE: { verb: 'modificó', label: 'Cambio', variant: 'warning', icon: Pencil },
  DELETE: { verb: 'eliminó', label: 'Baja', variant: 'danger', icon: Trash2 },
}

// Campos que cambian solos o no aportan al lector
const NOISE_FIELDS = new Set([
  'id', 'org_id', 'company_id', 'user_id', 'created_at', 'updated_at', 'created_by',
  'change_log', 'embedding', 'search_vector',
])

const FIELD_LABELS = {
  title: 'Título', name: 'Nombre', code: 'Código', status: 'Estado', level: 'Nivel',
  area: 'Área', mission: 'Misión', description: 'Descripción', responsible: 'Responsable',
  owner: 'Dueño', parent_id: 'Depende de', salary: 'Salario', dependency: 'Dependencia',
  current_holder: 'Ocupante actual', revision: 'Revisión', version: 'Versión',
  approved_by: 'Aprobado por', approved_at: 'Fecha de aprobación', approved_role: 'Cargo del aprobador',
  due_date: 'Fecha límite', review_date: 'Fecha de revisión', next_review_date: 'Próxima revisión',
  last_reviewed_date: 'Última revisión', risk_description: 'Riesgo', control_measure: 'Control',
  probability_initial: 'Probabilidad inicial', impact_initial: 'Impacto inicial',
  probability_residual: 'Probabilidad residual', impact_residual: 'Impacto residual',
  treatment_strategy: 'Estrategia', category: 'Categoría', type: 'Tipo', factor: 'Factor',
  strategy: 'Estrategia', root_cause: 'Causa raíz', action_plan: 'Plan de acción',
  correction: 'Corrección', effectiveness_result: 'Resultado de eficacia',
  objective: 'Objetivo', indicator: 'Indicador', target: 'Meta', current: 'Valor actual',
  unit: 'Unidad', supplier_name: 'Proveedor', evaluation_score: 'Puntaje de evaluación',
  client_name: 'Cliente', order_reference: 'Referencia', delivery_date: 'Fecha de entrega',
  full_name: 'Nombre', process_type: 'Tipo de proceso', final_policy_statement: 'Declaración de política',
  scope_statement: 'Declaración de alcance', strategic_direction: 'Misión y visión',
  industry: 'Sector', main_products: 'Productos y servicios', employees_count: 'Empleados',
  functions_json: 'Funciones', authorities_json: 'Autoridades', competencies_json: 'Competencias',
  responsibilities_json: 'Responsabilidades', raci_json: 'Matriz RACI', is_sgc_responsible: 'Responsable del SGC',
  expectations: 'Expectativas', influence_level: 'Influencia', severity: 'Severidad',
  document_url: 'Documento', evidence_url: 'Evidencia', notes: 'Notas',
}

// Campo que mejor nombra a un registro, en orden de preferencia
const RECORD_NAME_FIELDS = [
  'title', 'name', 'full_name', 'supplier_name', 'activity', 'tag', 'course_name',
  'risk_description', 'factor', 'objective', 'order_reference', 'client_name',
  'description', 'code',
]

const RANGES = [
  { key: '7', label: 'Últimos 7 días', days: 7 },
  { key: '30', label: 'Últimos 30 días', days: 30 },
  { key: '90', label: 'Últimos 90 días', days: 90 },
  { key: 'all', label: 'Todo', days: null },
]

const prettifyField = (k) => FIELD_LABELS[k]
  || k.replace(/_json$/, '').replace(/_id$/, '').replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())

const tableLabel = (t) => TABLE_LABELS[t] || prettifyField(t)

// Los cambios hechos por triggers o por la IA no tienen usuario: son del sistema
const nameFor = (users, id) => id ? (users[id] || 'Usuario fuera de la organización') : 'Sistema'

function recordName(log) {
  const data = log.new_data || log.old_data || {}
  for (const f of RECORD_NAME_FIELDS) {
    const v = data[f]
    if (typeof v === 'string' && v.trim()) return v.trim().slice(0, 90)
  }
  return log.record_id ? `registro ${String(log.record_id).slice(0, 8)}` : null
}

function formatValue(v) {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (Array.isArray(v)) {
    if (!v.length) return '(vacío)'
    const txt = v.map(x => (x && typeof x === 'object') ? Object.values(x).filter(Boolean).join(' · ') : String(x)).join(' | ')
    return txt.length > 220 ? txt.slice(0, 220) + '…' : txt
  }
  if (typeof v === 'object') {
    const txt = Object.entries(v).filter(([, x]) => x !== null && x !== '').map(([k, x]) => `${k}: ${typeof x === 'object' ? JSON.stringify(x) : x}`).join(' · ')
    return txt.length > 220 ? txt.slice(0, 220) + '…' : (txt || '(vacío)')
  }
  const s = String(v)
  // Fechas ISO completas → legibles
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return new Date(s).toLocaleString('es-EC')
  return s.length > 300 ? s.slice(0, 300) + '…' : s
}

// Solo los campos que efectivamente cambiaron (o, en altas y bajas, los que tienen valor)
function changedFields(log) {
  const oldD = log.old_data || {}
  const newD = log.new_data || {}
  if (log.action === 'UPDATE') {
    const keys = new Set([...Object.keys(oldD), ...Object.keys(newD)])
    return [...keys]
      .filter(k => !NOISE_FIELDS.has(k))
      .filter(k => JSON.stringify(oldD[k] ?? null) !== JSON.stringify(newD[k] ?? null))
      .map(k => ({ key: k, before: oldD[k], after: newD[k] }))
  }
  const src = log.action === 'DELETE' ? oldD : newD
  return Object.keys(src)
    .filter(k => !NOISE_FIELDS.has(k))
    .filter(k => src[k] !== null && src[k] !== '' && !(Array.isArray(src[k]) && !src[k].length))
    .map(k => ({ key: k, before: log.action === 'DELETE' ? src[k] : undefined, after: log.action === 'INSERT' ? src[k] : undefined }))
}

export default function AuditLogs() {
  const { org } = useOrg()
  const [logs, setLogs] = useState([])
  const [users, setUsers] = useState({})
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [expanded, setExpanded] = useState(() => new Set())

  const [rangeKey, setRangeKey] = useState('30')
  const [filterTable, setFilterTable] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [filterUser, setFilterUser] = useState('')
  const [search, setSearch] = useState('')

  const buildQuery = (from) => {
    let q = supabase.from('audit_logs').select('*')
      .eq('org_id', org.id)
      .order('created_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    const range = RANGES.find(r => r.key === rangeKey)
    if (range?.days) q = q.gte('created_at', new Date(Date.now() - range.days * 86400000).toISOString())
    if (filterTable) q = q.eq('table_name', filterTable)
    if (filterAction) q = q.eq('action', filterAction)
    if (filterUser) q = q.eq('user_id', filterUser)
    return q
  }

  const load = async () => {
    setLoading(true)
    const [lg, us] = await Promise.all([
      buildQuery(0),
      supabase.from('user_profiles').select('user_id, full_name').eq('org_id', org.id),
    ])
    if (lg.error) toast.error('No se pudo cargar el registro de auditoría: ' + lg.error.message)
    setLogs(lg.data || [])
    setHasMore((lg.data || []).length === PAGE_SIZE)
    setUsers(Object.fromEntries((us.data || []).map(u => [u.user_id, u.full_name])))
    setExpanded(new Set())
    setLoading(false)
  }

  const loadMore = async () => {
    setLoadingMore(true)
    const { data, error } = await buildQuery(logs.length)
    setLoadingMore(false)
    if (error) return toast.error(error.message)
    setLogs(prev => [...prev, ...(data || [])])
    setHasMore((data || []).length === PAGE_SIZE)
  }

  useEffect(() => {
    if (org?.id) load()
  }, [org?.id, rangeKey, filterTable, filterAction, filterUser])

  const userName = (id) => nameFor(users, id)

  // La búsqueda de texto es local sobre lo ya cargado
  const visible = useMemo(() => {
    if (!search.trim()) return logs
    const q = search.toLowerCase()
    return logs.filter(l => [nameFor(users, l.user_id), tableLabel(l.table_name), recordName(l)]
      .filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [logs, search, users])

  const toggle = (id) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const tablesInView = useMemo(() => {
    const set = new Set([...Object.keys(TABLE_LABELS), ...logs.map(l => l.table_name)])
    return [...set].sort((a, b) => tableLabel(a).localeCompare(tableLabel(b)))
  }, [logs])

  return (
    <div style={{ padding: '20px', maxWidth: '1100px', margin: '0 auto' }}>
      <PageHeader
        icon={<Shield size={28} color={colors.primary} />}
        title="Registro de auditoría"
        subtitle="Quién cambió qué y cuándo. Lo escribe la base de datos y no se puede editar ni borrar desde la app."
        actions={<Button variant="ghost" icon={<RefreshCw size={15} />} onClick={load}>Actualizar</Button>}
      />

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' }}>
        <div style={{ position: 'relative', flex: '1 1 220px', minWidth: '180px' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: colors.textGhost }} />
          <Input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por persona, módulo o registro…" style={{ paddingLeft: '30px' }} />
        </div>
        <Select value={rangeKey} onChange={e => setRangeKey(e.target.value)} style={{ width: 'auto', minWidth: '150px' }}>
          {RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
        </Select>
        <Select value={filterTable} onChange={e => setFilterTable(e.target.value)} style={{ width: 'auto', minWidth: '180px' }}>
          <option value="">Todos los módulos</option>
          {tablesInView.map(t => <option key={t} value={t}>{tableLabel(t)}</option>)}
        </Select>
        <Select value={filterAction} onChange={e => setFilterAction(e.target.value)} style={{ width: 'auto', minWidth: '140px' }}>
          <option value="">Todas las acciones</option>
          {Object.entries(ACTIONS).map(([k, a]) => <option key={k} value={k}>{a.label}</option>)}
        </Select>
        <Select value={filterUser} onChange={e => setFilterUser(e.target.value)} style={{ width: 'auto', minWidth: '160px' }}>
          <option value="">Todas las personas</option>
          {Object.entries(users).map(([id, name]) => <option key={id} value={id}>{name || id.slice(0, 8)}</option>)}
        </Select>
      </div>

      {loading ? <Spinner label="Cargando registro…" /> : visible.length === 0 ? (
        <EmptyState icon={<Shield size={32} color={colors.textGhost} />}
          title="Sin cambios registrados"
          subtitle="No hay cambios que coincidan con los filtros en este período." />
      ) : (
        <div style={{ background: 'white', border: `1px solid ${colors.border}`, borderRadius: radius.xl, overflow: 'hidden' }}>
          {visible.map((log, i) => {
            const act = ACTIONS[log.action] || { verb: log.action?.toLowerCase(), label: log.action, variant: 'neutral', icon: Pencil }
            const fields = changedFields(log)
            const open = expanded.has(log.id)
            const name = recordName(log)
            const when = log.created_at ? new Date(log.created_at) : null
            return (
              <div key={log.id} style={{ borderTop: i ? `1px solid ${colors.border}` : 'none' }}>
                <button type="button" onClick={() => toggle(log.id)}
                  style={{
                    width: '100%', display: 'flex', gap: '12px', alignItems: 'flex-start', textAlign: 'left',
                    padding: '12px 14px', background: open ? colors.bgMuted : 'transparent',
                    border: 'none', cursor: 'pointer', font: 'inherit', color: 'inherit',
                  }}>
                  <span style={{ marginTop: '2px', color: colors.textMuted, flexShrink: 0 }}>
                    {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </span>
                  <div style={{ width: '112px', flexShrink: 0, fontSize: font.sm, color: colors.textMuted, lineHeight: 1.35 }}>
                    {when ? <>
                      <div style={{ color: colors.text, fontWeight: 600 }}>{when.toLocaleDateString('es-EC', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
                      <div>{when.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit' })}</div>
                    </> : '—'}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                      <Badge variant={act.variant}>{act.label}</Badge>
                      <span style={{ fontSize: font.sm, color: colors.textMuted }}>{tableLabel(log.table_name)}</span>
                    </div>
                    <div style={{ marginTop: '3px', color: colors.text, overflowWrap: 'anywhere' }}>
                      <strong>{userName(log.user_id)}</strong> {act.verb}{name ? <> <em style={{ fontStyle: 'normal', fontWeight: 600 }}>“{name}”</em></> : ' un registro'}
                    </div>
                    {log.action === 'UPDATE' && (
                      <div style={{ fontSize: font.xs, color: colors.textMuted, marginTop: '2px' }}>
                        {fields.length === 0
                          ? 'Sin cambios visibles (solo campos internos)'
                          : `${fields.length} campo${fields.length > 1 ? 's' : ''}: ${fields.slice(0, 4).map(f => prettifyField(f.key)).join(', ')}${fields.length > 4 ? '…' : ''}`}
                      </div>
                    )}
                  </div>
                </button>

                {open && (
                  <div style={{ padding: '0 14px 14px 42px', background: colors.bgMuted }}>
                    {fields.length === 0 ? (
                      <p style={{ margin: 0, fontSize: font.sm, color: colors.textMuted }}>No hay campos visibles para mostrar.</p>
                    ) : (
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: font.sm, background: 'white', borderRadius: radius.md }}>
                          <thead>
                            <tr style={{ textAlign: 'left', color: colors.textMuted }}>
                              <th style={{ padding: '8px 10px', width: '26%' }}>Campo</th>
                              {log.action !== 'INSERT' && <th style={{ padding: '8px 10px' }}>{log.action === 'DELETE' ? 'Valor eliminado' : 'Antes'}</th>}
                              {log.action !== 'DELETE' && <th style={{ padding: '8px 10px' }}>{log.action === 'INSERT' ? 'Valor' : 'Después'}</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {fields.map(f => (
                              <tr key={f.key} style={{ borderTop: `1px solid ${colors.border}`, verticalAlign: 'top' }}>
                                <td style={{ padding: '8px 10px', fontWeight: 600, color: colors.text }}>{prettifyField(f.key)}</td>
                                {log.action !== 'INSERT' && (
                                  <td style={{ padding: '8px 10px', color: log.action === 'UPDATE' ? colors.danger : colors.text, overflowWrap: 'anywhere' }}>
                                    {formatValue(f.before)}
                                  </td>
                                )}
                                {log.action !== 'DELETE' && (
                                  <td style={{ padding: '8px 10px', color: log.action === 'UPDATE' ? colors.success : colors.text, overflowWrap: 'anywhere' }}>
                                    {formatValue(f.after)}
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {!loading && hasMore && !search && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '14px' }}>
          <Button variant="ghost" loading={loadingMore} onClick={loadMore}>Cargar más</Button>
        </div>
      )}
    </div>
  )
}
