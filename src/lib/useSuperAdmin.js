// =============================================================================
// useSuperAdmin() — hook trivial que devuelve si el usuario actual es super_admin.
//
// Uso:
//   const isSuperAdmin = useSuperAdmin()
//   if (!isSuperAdmin) return <Navigate to="/app" />
//
// El flag viene del profile en OrgContext (que ya lo trae del select).
// =============================================================================

import { useOrg } from '../OrgContext'

export function useSuperAdmin() {
  const { profile } = useOrg()
  return !!profile?.is_super_admin
}
