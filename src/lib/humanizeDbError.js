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
  documents_versions_code_key:
    'Ya existe un documento con ese código. Verificá el listado — si es una nueva versión, usá el botón "Nueva versión" en lugar de crear otro.',
  audit_share_tokens_token_hash_key:
    'Se generó un token colisionado (probabilidad casi nula). Intentá crear el link de nuevo.',
  survey_campaigns_public_slug_key:
    'Ya existe una campaña de encuesta con ese link público. Usá un nombre distinto o cerrala primero.',
}

// Constraints CHECK conocidos → mensaje humano específico
const CHECK_CONSTRAINTS = {
  audit_share_tokens_expires_check:
    'La fecha de expiración debe estar entre hoy y máximo 1 año desde ahora.',
  audit_share_tokens_max_uses_check:
    'El máximo de usos debe estar entre 1 y 10000 (o vacío para ilimitado).',
  audit_share_tokens_label_check:
    'El nombre/motivo del acceso debe tener entre 1 y 200 caracteres.',
  survey_campaigns_public_slug_length:
    'El link de la campaña es muy corto. Regenerá la campaña — los nuevos generan links seguros automáticamente.',
}

// Extrae "columna" de: null value in column "foo" of relation "bar" ...
function extractColumnFromNotNull(msg) {
  const m = msg.match(/column\s+"([^"]+)"/i)
  return m?.[1] || null
}

// Extrae longitud de: value too long for type character varying(20)
function extractMaxLength(msg) {
  const m = msg.match(/character\s+varying\((\d+)\)/i)
  return m?.[1] || null
}

// Extrae nombre de constraint de: violates check constraint "foo_bar_check"
function extractConstraintName(msg) {
  const m = msg.match(/constraint\s+"([^"]+)"/i)
  return m?.[1] || null
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
    const constraintName = extractConstraintName(msg)
    if (constraintName && CHECK_CONSTRAINTS[constraintName]) return CHECK_CONSTRAINTS[constraintName]
    return `Algún valor no cumple las reglas del ${tableLabel}. Revisá que estén dentro de los rangos permitidos.`
  }

  // 23502 — not_null_violation (falta un campo obligatorio)
  if (code === '23502') {
    const col = extractColumnFromNotNull(msg)
    if (col && col !== 'org_id') {
      return `Falta completar el campo obligatorio "${col}" en el ${tableLabel}.`
    }
    if (col === 'org_id') {
      // Este mensaje al user es siempre un bug interno (org_id se resuelve
      // desde la sesión). Lo humanizamos pero indicamos "recargá".
      return `Perdimos tu organización activa. Recargá la página y volvé a intentar.`
    }
    return `Falta completar un campo obligatorio en el ${tableLabel}.`
  }

  // 22001 — string_data_right_truncation (excede varchar(N))
  if (code === '22001') {
    const maxLen = extractMaxLength(msg)
    if (maxLen) {
      return `Uno de los campos del ${tableLabel} excede el máximo de ${maxLen} caracteres. Acortalo y volvé a intentar.`
    }
    return `Uno de los campos del ${tableLabel} es demasiado largo.`
  }

  // 22P02 — invalid_text_representation (UUID/DATE/INT vacío)
  if (code === '22P02') {
    return `Uno de los campos tiene un formato inválido. Revisá fechas, IDs y números — no pueden quedar vacíos si no son opcionales.`
  }

  // 23P01 — exclusion_violation (raro pero puede aparecer en rangos)
  if (code === '23P01') {
    return `Hay un solapamiento con otro ${tableLabel} existente. Revisá fechas o rangos que no se pisen.`
  }

  // 40001 — serialization_failure (dos usuarios editando lo mismo a la vez)
  if (code === '40001') {
    return `Otro usuario acaba de modificar este ${tableLabel} al mismo tiempo. Refrescá la página y volvé a intentar.`
  }

  // 42501 — insufficient_privilege (RLS)
  if (code === '42501') {
    return `No tenés permiso para hacer esta acción en tu organización. Contactá al administrador.`
  }

  // 57014 — query_canceled (timeout del servidor)
  if (code === '57014') {
    return `La consulta tardó demasiado y se canceló. Intentá con un filtro más específico o volvé en unos minutos.`
  }

  // P0001 — raise_exception (mensaje custom desde trigger/función Postgres,
  // ej: enforce_min_one_owner). El mensaje del RAISE ya suele ser humano —
  // devolverlo directo.
  if (code === 'P0001') {
    return msg || `Operación bloqueada por reglas del ${tableLabel}.`
  }

  // PGRST204 — column not found in schema cache
  if (code === 'PGRST204') {
    return `La base de datos aún no está sincronizada con esta versión de la app. Refrescá la página en 1 minuto o contactá soporte si persiste.`
  }

  // PGRST116 — no rows found (para .single())
  if (code === 'PGRST116') {
    return `No se encontró el ${tableLabel} solicitado. Puede que haya sido eliminado.`
  }

  // PGRST202 — RPC no existe (típico cuando faltó correr una migración)
  if (code === 'PGRST202') {
    return `Esta funcionalidad requiere una actualización de la base de datos. Contactá a soporte para que aplique la migración pendiente.`
  }

  // PGRST301 — JWT expired
  if (code === 'PGRST301' || msg.toLowerCase().includes('jwt expired')) {
    return `Tu sesión expiró. Iniciá sesión de nuevo.`
  }

  // Errores de red
  if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('ERR_NETWORK')) {
    return 'Sin conexión con el servidor. Verificá tu internet y volvé a intentar.'
  }

  // Errores de códigos que devuelve Supabase Auth
  if (msg.includes('Invalid login credentials')) {
    return 'Email o contraseña incorrectos.'
  }
  if (msg.includes('Email not confirmed')) {
    return 'Confirmá tu email antes de iniciar sesión. Revisá tu bandeja de entrada.'
  }

  // Fallback: si el msg todavía luce a jerga técnica ("duplicate key value…",
  // "new row for relation…"), reemplazamos por algo genérico. Sino, mostrar
  // el msg original que puede tener contexto útil.
  const looksTechnical = /duplicate key|new row|violates|relation|column|constraint/i.test(msg)
  if (looksTechnical) return `Error al guardar el ${tableLabel}. Revisá los datos y volvé a intentar.`
  return msg || `Error al guardar el ${tableLabel}.`
}
