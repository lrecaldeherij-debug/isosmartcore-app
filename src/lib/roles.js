// =============================================================================
// Definición central de roles y permisos.
//
// El enum `org_role` en Postgres tiene 4 valores:
//   owner            — propietario de la org (puede todo, gestiona equipo + plan)
//   quality_manager  — gestor de calidad (CRUD en todos los módulos ISO)
//   auditor          — auditor (lee todo, edita solo auditorías y hallazgos)
//   viewer           — operario (solo lectura)
//
// Las RLS en Postgres ya restringen ACCESO por org. Acá agregamos restricciones
// por ROL para la UI. La etapa B agregará policies SQL que repliquen estas
// reglas en la base de datos.
// =============================================================================

export const ROLES = {
  owner:           { label: 'Propietario',     desc: 'Dueño de la cuenta. Acceso total + facturación + gestión de equipo.', color: '#dc2626', icon: '👑' },
  quality_manager: { label: 'Gestor calidad',  desc: 'CRUD completo en todos los módulos ISO. No accede a facturación.',     color: '#0891b2', icon: '🛡️' },
  auditor:         { label: 'Auditor',         desc: 'Lee todo. Edita solo auditorías internas y registra hallazgos.',       color: '#f59e0b', icon: '🔍' },
  viewer:          { label: 'Operario',        desc: 'Solo lectura. Ideal para personal operativo que consulta políticas.',  color: '#64748b', icon: '👁️' },
}

export const ROLE_ORDER = ['owner', 'quality_manager', 'auditor', 'viewer']

// ─── Permisos por entidad ───
// Cada entidad declara qué roles pueden hacer qué.
// La regla general: owner y quality_manager hacen todo. Auditor y viewer son más restringidos.

const FULL_WRITE = new Set(['owner', 'quality_manager'])
const AUDIT_WRITE = new Set(['owner', 'quality_manager', 'auditor'])
const READ_ALL = new Set(['owner', 'quality_manager', 'auditor', 'viewer'])

export const PERMISSIONS = {
  // Módulos ISO operativos
  context_analysis:        { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner', 'quality_manager']) },
  stakeholders:            { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner', 'quality_manager']) },
  scope_declaration:       { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner']) },
  quality_policy:          { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner']) },
  processes:               { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner', 'quality_manager']) },
  job_descriptions:        { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner', 'quality_manager']) },
  risk_matrix:             { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner', 'quality_manager']) },
  quality_objectives:      { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner', 'quality_manager']) },
  strategic_actions:       { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner', 'quality_manager']) },
  training_records:        { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner', 'quality_manager']) },
  personnel:               { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner', 'quality_manager']) },
  suppliers:               { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner', 'quality_manager']) },
  customer_requirements:   { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner', 'quality_manager']) },
  documents:               { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner', 'quality_manager']) },
  communication_matrix:    { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner', 'quality_manager']) },

  // Producción / operativo
  production_orders:       { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner', 'quality_manager']) },
  qc_release:              { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner', 'quality_manager']) },
  operational_incidents:   { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner', 'quality_manager']) },

  // Mejora y auditoría — auditor puede ESCRIBIR
  non_conformities:        { read: READ_ALL, write: AUDIT_WRITE, delete: new Set(['owner', 'quality_manager']) },
  internal_audits:         { read: READ_ALL, write: AUDIT_WRITE, delete: new Set(['owner', 'quality_manager']) },
  improvement_opportunities: { read: READ_ALL, write: AUDIT_WRITE, delete: new Set(['owner', 'quality_manager']) },
  management_review:       { read: READ_ALL, write: FULL_WRITE, delete: new Set(['owner']) },

  // Administración — solo owner
  team:                    { read: new Set(['owner', 'quality_manager']), write: new Set(['owner']), delete: new Set(['owner']) },
  billing:                 { read: new Set(['owner']), write: new Set(['owner']), delete: new Set(['owner']) },
  organization_settings:   { read: READ_ALL, write: new Set(['owner']), delete: new Set(['owner']) },
}

// ─── Helpers ───

export function can(role, entity, action = 'write') {
  if (!role) return false
  const perm = PERMISSIONS[entity]
  if (!perm) return role === 'owner' || role === 'quality_manager'
  const allowed = perm[action]
  if (!allowed) return false
  return allowed.has(role)
}

export function roleLabel(role) {
  return ROLES[role]?.label || role || '—'
}

export function roleColor(role) {
  return ROLES[role]?.color || '#64748b'
}

export function roleIcon(role) {
  return ROLES[role]?.icon || '👤'
}

export function isHigherOrEqual(roleA, roleB) {
  const ia = ROLE_ORDER.indexOf(roleA)
  const ib = ROLE_ORDER.indexOf(roleB)
  if (ia === -1 || ib === -1) return false
  return ia <= ib
}
