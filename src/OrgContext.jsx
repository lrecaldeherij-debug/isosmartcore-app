// OrgContext: expone la organización activa, el perfil del usuario y su rol.
// Cualquier componente puede usar useOrg() para saber qué puede mostrar/ocultar
// según el rol. Los filtros de datos los hace RLS en Postgres, no el cliente.

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { getImpersonatedOrgId } from './lib/impersonate'

const OrgContext = createContext(null)

export function OrgProvider({ session, children }) {
  const [profile, setProfile] = useState(null)
  const [org, setOrg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!session?.user?.id) {
      setProfile(null)
      setOrg(null)
      setLoading(false)
      return
    }

    let cancelled = false

    const load = async () => {
      setLoading(true)
      setError(null)

      const { data: prof, error: profErr } = await supabase
        .from('user_profiles')
        .select('user_id, org_id, role, full_name, is_super_admin')
        .eq('user_id', session.user.id)
        .single()

      if (cancelled) return

      if (profErr || !prof) {
        // El trigger debería haber creado el perfil. Si no está, es signup
        // pendiente de confirmación de email o un problema de BD.
        setError(profErr?.message || 'No se encontró tu perfil. Confirma tu email o contacta soporte.')
        setLoading(false)
        return
      }
      setProfile(prof)

      // Detectar modo impersonar: si super_admin visita /app?impersonate=<orgId>,
      // cargar ESA org en lugar de la del user. Guardas: solo super_admin puede,
      // ignoramos el param en cualquier otro caso.
      const impersonateOrgId = getImpersonatedOrgId()
      const canImpersonate = impersonateOrgId && prof.is_super_admin
      const targetOrgId = canImpersonate ? impersonateOrgId : prof.org_id

      // Sync JWT metadata con URL: las policies _select_impersonate de tablas
      // ISO leen user_metadata.impersonate_org_id. Si el user llega aquí sin
      // ?impersonate= pero el metadata quedó de una sesión previa (cerró el
      // navegador sin llamar stopImpersonation), hay que limpiarlo ANTES de
      // que Dashboard corra queries — sino verá datos de la org impersonada
      // vieja con el nombre de su org real.
      //
      // Si tiene ?impersonate= y todavía no está en metadata (o cambió),
      // setearlo. Esto permite entrar en impersonate compartiendo el link
      // directo sin pasar por startImpersonation.
      const currentMeta = session.user.user_metadata?.impersonate_org_id || null
      if (canImpersonate && currentMeta !== impersonateOrgId) {
        await supabase.auth.updateUser({ data: { impersonate_org_id: impersonateOrgId } })
      } else if (!canImpersonate && currentMeta) {
        await supabase.auth.updateUser({ data: { impersonate_org_id: null } })
      }
      if (cancelled) return

      // Intenta primero la vista org_with_plan (v56). Si no existe (migración
      // sin correr), cae a la tabla organizations directa — la app sigue,
      // solo sin info de plan.
      let orgData = null
      let orgErr = null
      const viewRes = await supabase
        .from('org_with_plan')
        .select('*')
        .eq('id', targetOrgId)
        .maybeSingle()

      if (viewRes.error || !viewRes.data) {
        const fallback = await supabase
          .from('organizations')
          .select('*')
          .eq('id', targetOrgId)
          .maybeSingle()
        orgData = fallback.data
        orgErr = fallback.error
      } else {
        orgData = viewRes.data
      }

      if (cancelled) return

      if (orgErr) {
        setError(orgErr.message)
      } else if (!orgData) {
        setError('No se encontró tu organización. Recarga la página o contacta soporte.')
      } else {
        setOrg(orgData)
      }
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [session?.user?.id, refreshTick])

  const role = profile?.role || null
  const impersonateOrgId = getImpersonatedOrgId()
  const impersonating = !!impersonateOrgId && profile?.is_super_admin && org?.id === impersonateOrgId
  const can = {
    // En modo impersonar todo se bloquea a nivel UI (además de que RLS
    // ya bloquea las mutaciones cross-org a nivel DB).
    write: !impersonating && (role === 'owner' || role === 'quality_manager'),
    audit: !impersonating && (role === 'owner' || role === 'quality_manager' || role === 'auditor'),
    admin: !impersonating && role === 'owner',
  }

  return (
    <OrgContext.Provider value={{
      profile, org, role, can, loading, error,
      impersonating,
      refresh: () => setRefreshTick(t => t + 1),
    }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg debe usarse dentro de <OrgProvider>')
  return ctx
}
