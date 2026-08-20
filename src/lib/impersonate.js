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
 * Arranca modo impersonar: loguea la acción, setea el JWT metadata para RLS,
 * y redirige a /app con el param.
 *
 * El metadata en JWT es lo que las policies _select_impersonate leen para
 * dar acceso cross-org al super_admin. Sin este metadata, el super_admin
 * verá los datos de su propia org aunque el sidebar diga otro nombre.
 *
 * @param {string} orgId - UUID de la org que vas a impersonar
 * @param {string} orgName - nombre visible (solo para el toast local)
 * @param {string} reason - motivo obligatorio (queda en admin_audit_log)
 */
export async function startImpersonation(orgId, orgName, reason) {
  const { error: logErr } = await supabase.rpc('admin_log_impersonation', {
    p_org_id: orgId,
    p_reason: reason || null,
  })
  if (logErr) throw new Error(logErr.message)

  // Setear impersonate_org_id en el JWT metadata → RLS ahora deja al
  // super_admin ver las filas de ESA org (y solo esa).
  const { error: metaErr } = await supabase.auth.updateUser({
    data: { impersonate_org_id: orgId }
  })
  if (metaErr) throw new Error(metaErr.message)

  // Redirect duro para forzar recarga del OrgContext con el nuevo param
  window.location.href = `/app?${PARAM}=${orgId}`
}

/**
 * Sale de modo impersonar: limpia el JWT metadata para revocar el acceso
 * cross-org y vuelve al panel admin. Es crítico limpiar el metadata: si
 * queda seteado, la próxima navegación a /app le mostrará al super_admin
 * datos de la org impersonada aunque no lo pida.
 */
export async function stopImpersonation() {
  try {
    await supabase.auth.updateUser({
      data: { impersonate_org_id: null }
    })
  } catch (e) {
    console.error('[impersonate] No pude limpiar el metadata:', e)
    // Continuamos el redirect igual. OrgContext tiene un safety net que
    // vuelve a limpiar si detecta URL sin ?impersonate=.
  }
  window.location.href = '/admin'
}
