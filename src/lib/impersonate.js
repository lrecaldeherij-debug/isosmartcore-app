// =============================================================================
// Impersonate helper — modo lectura del super_admin para hacer soporte.
//
// Flujo:
//  1. En /admin, super_admin click "Ver como cliente" → startImpersonation(orgId, reason)
//     - Loguea en admin_audit_log (RPC)
//     - Redirige a /app?impersonate=<orgId>
//  2. OrgContext detecta el ?impersonate=<orgId> y (si el user es super_admin)
//     carga esa org en lugar de la propia.
//  3. AppShell muestra el ImpersonateBanner fijo arriba.
//  4. Cualquier intento de mutación es bloqueado por RLS (WITH CHECK falla
//     porque auth_org_id() devuelve la org REAL del super_admin, no la
//     impersonada). Además el banner recuerda que es modo lectura.
//  5. Click "Salir" en el banner → stopImpersonation() → redirect a /admin
// =============================================================================

import { supabase } from '../supabaseClient'

const PARAM = 'impersonate'

export function getImpersonatedOrgId() {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get(PARAM)
}

export function isImpersonating() {
  return !!getImpersonatedOrgId()
}

/**
 * Arranca modo impersonar: loguea la acción y redirige a /app con el param.
 * @param {string} orgId - UUID de la org que vas a impersonar
 * @param {string} orgName - nombre visible (solo para el toast local)
 * @param {string} reason - motivo obligatorio (queda en admin_audit_log)
 */
export async function startImpersonation(orgId, orgName, reason) {
  const { error } = await supabase.rpc('admin_log_impersonation', {
    p_org_id: orgId,
    p_reason: reason || null,
  })
  if (error) throw new Error(error.message)
  // Redirect duro para forzar recarga del OrgContext con el nuevo param
  window.location.href = `/app?${PARAM}=${orgId}`
}

/**
 * Sale de modo impersonar: vuelve al panel admin.
 */
export function stopImpersonation() {
  window.location.href = '/admin'
}
