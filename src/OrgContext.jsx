// OrgContext: expone la organización activa, el perfil del usuario y su rol.
// Cualquier componente puede usar useOrg() para saber qué puede mostrar/ocultar
// según el rol. Los filtros de datos los hace RLS en Postgres, no el cliente.

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from './supabaseClient'

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
        .select('user_id, org_id, role, full_name')
        .eq('user_id', session.user.id)
        .single()

      if (cancelled) return

      if (profErr || !prof) {
        // El trigger debería haber creado el perfil. Si no está, es signup
        // pendiente de confirmación de email o un problema de BD.
        setError(profErr?.message || 'No se encontró tu perfil. Confirmá tu email o contactá soporte.')
        setLoading(false)
        return
      }
      setProfile(prof)

      // Intenta primero la vista org_with_plan (v56). Si no existe (migración
      // sin correr), cae a la tabla organizations directa — la app sigue,
      // solo sin info de plan.
      let orgData = null
      let orgErr = null
      const viewRes = await supabase
        .from('org_with_plan')
        .select('*')
        .eq('id', prof.org_id)
        .maybeSingle()

      if (viewRes.error || !viewRes.data) {
        const fallback = await supabase
          .from('organizations')
          .select('*')
          .eq('id', prof.org_id)
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
        setError('No se encontró tu organización. Recargá la página o contactá soporte.')
      } else {
        setOrg(orgData)
      }
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [session?.user?.id, refreshTick])

  const role = profile?.role || null
  const can = {
    write: role === 'owner' || role === 'quality_manager',
    audit: role === 'owner' || role === 'quality_manager' || role === 'auditor',
    admin: role === 'owner',
  }

  return (
    <OrgContext.Provider value={{ profile, org, role, can, loading, error, refresh: () => setRefreshTick(t => t + 1) }}>
      {children}
    </OrgContext.Provider>
  )
}

export function useOrg() {
  const ctx = useContext(OrgContext)
  if (!ctx) throw new Error('useOrg debe usarse dentro de <OrgProvider>')
  return ctx
}
