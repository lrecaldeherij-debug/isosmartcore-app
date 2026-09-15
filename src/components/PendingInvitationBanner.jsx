// =============================================================================
// PendingInvitationBanner — aviso para quien fue invitado a otra organización
// y ya tenía cuenta (típicamente: se registró sola antes de que la invitaran).
//
// Lee org_invitations por RLS (email del JWT). Al aceptar llama a la RPC
// accept_org_invitation, que la mueve a la org con el rol indicado, y recarga.
// =============================================================================

import { useEffect, useState } from 'react'
import { Mail, Check, X } from 'lucide-react'
import { supabase } from '../supabaseClient'
import { useOrg } from '../OrgContext'
import { confirm } from '../lib/confirm'
import { toast } from '../lib/toast'
import { roleLabel } from '../lib/roles'
import { colors, families, weight } from './ui/tokens'

export default function PendingInvitationBanner() {
  const { org, profile, impersonating } = useOrg()
  const [invitations, setInvitations] = useState([])
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    if (!profile?.user_id || impersonating) return
    let cancelled = false
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user?.email) return
      const { data, error } = await supabase
        .from('org_invitations')
        .select('id, org_id, org_name, role, invited_by_name, expires_at')
        .eq('email', user.email.toLowerCase())
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
      if (!cancelled && !error) setInvitations((data || []).filter(i => i.org_id !== org?.id))
    })()
    return () => { cancelled = true }
  }, [profile?.user_id, org?.id, impersonating])

  if (!invitations.length) return null
  const inv = invitations[0]

  const accept = async () => {
    const ok = await confirm({
      title: `Unirte a ${inv.org_name || 'la organización'}`,
      message:
        `Vas a entrar a ${inv.org_name || 'la organización'} como ${roleLabel(inv.role)} y dejarás de ver "${org?.name || 'tu organización actual'}". ` +
        'Si sos la única persona en esa organización, se elimina junto con lo que hayas cargado ahí.',
    })
    if (!ok) return
    setBusy('accept')
    const { data, error } = await supabase.rpc('accept_org_invitation', { p_invitation_id: inv.id })
    if (error) {
      setBusy(null)
      toast.error(error.message)
      return
    }
    toast.success(`Listo, ya sos parte de ${data?.org_name || 'la organización'}`)
    // El perfil, el rol y todos los datos cambian de org: recarga completa.
    setTimeout(() => window.location.reload(), 700)
  }

  const decline = async () => {
    const ok = await confirm({
      title: 'Rechazar invitación',
      message: `¿Rechazar la invitación a ${inv.org_name || 'la organización'}?`,
      danger: true,
    })
    if (!ok) return
    setBusy('decline')
    const { error } = await supabase.rpc('decline_org_invitation', { p_invitation_id: inv.id })
    setBusy(null)
    if (error) { toast.error(error.message); return }
    setInvitations(list => list.filter(i => i.id !== inv.id))
  }

  const btn = {
    border: 'none', padding: '7px 14px', fontSize: 13, fontWeight: weight.semibold,
    cursor: busy ? 'not-allowed' : 'pointer', fontFamily: families.body,
    display: 'inline-flex', alignItems: 'center', gap: 6, borderRadius: 4,
    opacity: busy ? 0.7 : 1,
  }

  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 4900,
      background: colors.seal, color: colors.paper,
      padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      fontFamily: families.body, fontSize: 14,
      boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
    }}>
      <Mail size={18} style={{ flexShrink: 0 }} />
      <div style={{ flex: '1 1 280px', minWidth: 0 }}>
        <strong>{inv.invited_by_name || 'Alguien'}</strong> te invitó a unirte a{' '}
        <strong>{inv.org_name || 'su organización'}</strong> como <strong>{roleLabel(inv.role)}</strong>.
        {invitations.length > 1 && <span> (+{invitations.length - 1} más)</span>}
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={accept} disabled={!!busy} style={{ ...btn, background: colors.paper, color: colors.seal }}>
          <Check size={14} /> {busy === 'accept' ? 'Uniéndote…' : 'Aceptar y unirme'}
        </button>
        <button onClick={decline} disabled={!!busy} style={{ ...btn, background: 'transparent', color: colors.paper, border: `1px solid ${colors.paper}` }}>
          <X size={14} /> Rechazar
        </button>
      </div>
    </div>
  )
}
