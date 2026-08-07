// =============================================================================
// Traductor universal de errores Postgres/PostgREST a mensajes amigables.
//
// Uso:
//   import { humanizeDbError } from './lib/humanizeDbError'
//   if (error) return toast.error(humanizeDbError(error, { table: 'processes' }))
//
// El parámetro `ctx` es opcional pero permite mensajes más específicos
// según la tabla o el módulo.
// =============================================================================

// Mapeo de constraints únicos conocidos → mensaje humano
const UNIQUE_CONSTRAINTS = {
  idx_job_desc_one_sgc_per_org:
    'Ya hay un Responsable del SGC asignado. ISO 5.3 permite solo uno por organización — desmarcá el anterior primero o editá ese perfil.',
  processes_code_key:
    'Ya existe un proceso con ese código en tu organización. Usá un código distinto.',
  processes_name_key:
    'Ya existe un proceso con ese nombre. Usá uno distinto o editá el existente.',
  stakeholders_name_key:
    'Ya existe una parte interesada con ese nombre en tu organización.',
  suppliers_tax_id_key:
    'Ya existe un proveedor con ese RUC/NIT/identificación fiscal.',
}

// Nombres humanos de tablas comunes (para mensajes de FK)
const TABLE_NAMES = {
  processes: 'proceso',
  job_descriptions: 'perfil de cargo',
  stakeholders: 'parte interesada',
  suppliers: 'proveedor',
  personnel: 'persona',
  risk_matrix: 'riesgo',
  quality_objectives: 'objetivo de calidad',
  non_conformities: 'no conformidad',
  internal_audits: 'auditoría interna',
  management_review: 'revisión por la dirección',
  documents_versions: 'documento',
  training_records: 'capacitación',
  customer_orders: 'pedido de cliente',
  production_orders: 'orden de producción',
  improvement_opportunities: 'oportunidad de mejora',
  context_analysis: 'análisis de contexto',
  strategic_actions: 'acción estratégica',
  quality_policy: 'política de calidad',
  scope_declaration: 'alcance del SGC',
  operational_incidents: 'incidente operacional',
  equipment_calibration: 'equipo/calibración',
  communication_matrix: 'canal de comunicación',
  climate_surveys: 'encuesta de clima',
}

export function humanizeDbError(err, ctx = {}) {
  if (!err) return 'Error desconocido.'
  const msg = err.message || ''
  const code = err.code
  const tableLabel = TABLE_NAMES[ctx.table] || 'registro'

  // 23505 — unique_violation
  if (code === '23505') {
    for (const [constraint, humanMsg] of Object.entries(UNIQUE_CONSTRAINTS)) {
      if (msg.includes(constraint)) return humanMsg
    }
    return `Ya existe otro ${tableLabel} con esos datos únicos. Verificá código, nombre o identificador.`
  }

  // 23503 — foreign_key_violation
  if (code === '23503') {
    return `No se puede completar la acción: hay otros registros vinculados a este ${tableLabel}. Eliminá primero los relacionados o cambiá la referencia.`
  }

  // 23514 — check_violation
  if (code === '23514') {
    return `Algún valor no cumple las reglas del ${tableLabel}. Revisá que estén dentro de los rangos permitidos.`
  }

  // 22P02 — invalid_text_representation (UUID/DATE/INT vacío)
  if (code === '22P02') {
    return `Uno de los campos tiene un formato inválido. Revisá fechas, IDs y números — no pueden quedar vacíos si no son opcionales.`
  }

  // 42501 — insufficient_privilege (RLS)
  if (code === '42501') {
    return `No tenés permiso para hacer esta acción en tu organización. Contactá al administrador.`
  }

  // PGRST204 — column not found in schema cache
  if (code === 'PGRST204') {
    return `La base de datos aún no está sincronizada con esta versión de la app. Refrescá la página en 1 minuto o contactá soporte si persiste.`
  }

  // PGRST116 — no rows found (para .single())
  if (code === 'PGRST116') {
    return `No se encontró el ${tableLabel} solicitado. Puede que haya sido eliminado.`
  }

  // Errores de red
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError')) {
    return 'Sin conexión con el servidor. Verificá tu internet y volvé a intentar.'
  }

  // Fallback: devolver el mensaje original si no matcheamos nada conocido
  return msg || `Error al guardar el ${tableLabel}.`
}
