import { useEffect, useState } from 'react'
import { Users, Mail, Shield, Save, Trash2, UserPlus, Info, Lock, Link as LinkIcon, Copy, Plus, Clock } from 'lucide-react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import { ROLES, ROLE_ORDER, roleLabel, roleIcon, roleColor, can } from './lib/roles'
import { usePlan } from './lib/usePlan'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'
import { colors, radius, font, shadow } from './components/ui/tokens'
import Button from './components/ui/Button'
import Badge from './components/ui/Badge'
import { PageHeader, EmptyState, Spinner, Grid } from './components/ui/misc'

/**
 * Team — gestión de equipo de la organización.
 * - Owner ve la lista, cambia roles, elimina miembros.
 * - Quality manager solo lee la lista.
 * - Otros roles no acceden.
 */
export default function Team() {
  const { role: myRole, profile } = useOrg()
  const plan = usePlan()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  const canRead = can(myRole, 'team', 'read')
  const canWrite = can(myRole, 'team', 'write')

  useEffect(() => {
    if (!canRead) { setLoading(false); return }
    fetchMembers()
  }, [canRead])

  const fetchMembers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id, full_name, role, created_at')
      .order('created_at')
    if (error) { toast.error(error.message); setLoading(false); return }
    setMembers(data || [])
    setLoading(false)
  }

  const changeRole = async (userId, newRole) => {
    if (userId === profile?.user_id && newRole !== 'owner') {
      toast.error('No puedes cambiarte tu propio rol de owner')
      return
    }
    const { error } = await supabase
      .from('user_profiles')
      .update({ role: newRole, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
    if (error) { toast.error(error.message); return }
    toast.success('Rol actualizado')
    fetchMembers()
  }

  const removeMember = async (member) => {
    if (member.user_id === profile?.user_id) {
      toast.error('No puedes eliminarte a ti mismo')
      return
    }
    const ok = await confirm({
      title: 'Eliminar miembro',
      message: `¿Sacar a ${member.full_name || 'este usuario'} de la organización? Pierde acceso inmediatamente.`,
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase
      .from('user_profiles')
      .delete()
      .eq('user_id', member.user_id)
    if (error) { toast.error(error.message); return }
    toast.success('Miembro eliminado')
    fetchMembers()
  }

  if (!canRead) {
    return (
      <div style={{ padding: '40px' }}>
        <EmptyState
          icon={<Lock size={36} color={colors.textGhost} />}
          title="Sin permiso"
          subtitle="Solo el propietario y el gestor de calidad pueden ver la gestión de equipo."
        />
      </div>
    )
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1100px', margin: '0 auto' }}>
      <PageHeader
        icon={<Users size={28} color={colors.primary} />}
        title="Equipo"
        subtitle="Miembros con acceso a esta organización y sus roles"
      />

      <PlanQuotaCard members={members.length} max={plan.maxUsers} />

      {loading ? (
        <Spinner label="Cargando equipo…" />
      ) : members.length === 0 ? (
        <EmptyState
          icon={<Users size={32} color={colors.textGhost} />}
          title="Sin miembros"
          subtitle="Algo raro: deberías estar al menos tú mismo en la lista."
        />
      ) : (
        <div style={{
          background: 'white', border: `1px solid ${colors.border}`,
          borderRadius: radius['2xl'], boxShadow: shadow.sm, overflow: 'hidden',
        }}>
          {members.map((m, i) => (
            <MemberRow
              key={m.user_id}
              member={m}
              isLast={i === members.length - 1}
              isSelf={m.user_id === profile?.user_id}
              canEdit={canWrite}
              onChangeRole={(r) => changeRole(m.user_id, r)}
              onRemove={() => removeMember(m)}
            />
          ))}
        </div>
      )}

      <RoleLegend />

      {canWrite && <AuditorTokensPanel />}

      {canWrite && <InvitePlaceholder />}
    </div>
  )
}

// ─────────────────── Subcomponentes ───────────────────

function PlanQuotaCard({ members, max }) {
  const isUnlimited = max === null || max === undefined
  const pct = isUnlimited ? 0 : Math.min(100, Math.round((members / max) * 100))
  const isWarn = pct >= 80
  return (
    <div style={{
      background: 'white', border: `1px solid ${colors.border}`,
      borderRadius: radius.xl, padding: '14px 16px', marginBottom: '16px',
      display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: '200px' }}>
        <div style={{ fontSize: font.sm, color: colors.textFaint, fontWeight: 600 }}>USUARIOS EN TU PLAN</div>
        <div style={{ fontSize: '20px', fontWeight: 700, color: colors.text }}>
          {members} {isUnlimited ? <span style={{ color: colors.textFaint }}>/ ∞</span> : <span style={{ color: colors.textFaint }}>/ {max}</span>}
        </div>
      </div>
      {!isUnlimited && (
        <div style={{ minWidth: '160px', flex: 1 }}>
          <div style={{ background: colors.bgSubtle, borderRadius: radius.pill, height: '8px', overflow: 'hidden' }}>
            <div style={{
              width: `${pct}%`, height: '100%',
              background: isWarn ? colors.warning : colors.primary,
              borderRadius: radius.pill, transition: 'width 0.5s',
            }} />
          </div>
        </div>
      )}
    </div>
  )
}

function MemberRow({ member, isLast, isSelf, canEdit, onChangeRole, onRemove }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '14px', padding: '14px 16px',
      borderBottom: isLast ? 'none' : `1px solid ${colors.border}`,
    }}>
      <div style={{
        width: '40px', height: '40px', borderRadius: '50%',
        background: roleColor(member.role) + '22', color: roleColor(member.role),
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '20px', flexShrink: 0,
      }}>
        {roleIcon(member.role)}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <strong style={{ color: colors.text, fontSize: font.lg }}>
            {member.full_name || '(sin nombre)'}
          </strong>
          {isSelf && <Badge bg={colors.infoLight} color={colors.infoText}>Tú</Badge>}
        </div>
        <div style={{ fontSize: font.sm, color: colors.textFaint, marginTop: '2px' }}>
          Desde {new Date(member.created_at).toLocaleDateString()}
        </div>
      </div>

      <div style={{ minWidth: '180px' }}>
        {canEdit && !isSelf ? (
          <select
            value={member.role}
            onChange={e => onChangeRole(e.target.value)}
            style={{
              padding: '6px 10px', borderRadius: radius.lg,
              border: `1px solid ${colors.border}`, background: 'white',
              fontSize: font.base, color: colors.text, width: '100%',
            }}
          >
            {ROLE_ORDER.map(r => (
              <option key={r} value={r}>{ROLES[r].icon} {ROLES[r].label}</option>
            ))}
          </select>
        ) : (
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '6px',
            background: roleColor(member.role) + '15', color: roleColor(member.role),
            padding: '4px 10px', borderRadius: radius.pill,
            fontSize: font.sm, fontWeight: 600,
          }}>
            {roleIcon(member.role)} {roleLabel(member.role)}
          </span>
        )}
      </div>

      {canEdit && !isSelf && (
        <Button
          variant="ghost"
          size="sm"
          icon={<Trash2 size={14} />}
          onClick={onRemove}
        >
          Quitar
        </Button>
      )}
    </div>
  )
}

function RoleLegend() {
  return (
    <div style={{ marginTop: '24px' }}>
      <h3 style={{ fontSize: font.xl, color: colors.text, marginBottom: '10px' }}>
        Qué puede hacer cada rol
      </h3>
      <Grid min="240px" gap="12px">
        {ROLE_ORDER.map(r => {
          const def = ROLES[r]
          return (
            <div key={r} style={{
              background: 'white', border: `1px solid ${colors.border}`,
              borderRadius: radius.xl, padding: '14px',
              borderLeft: `4px solid ${def.color}`,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                <span style={{ fontSize: '20px' }}>{def.icon}</span>
                <strong style={{ color: colors.text, fontSize: font.lg }}>{def.label}</strong>
              </div>
              <div style={{ fontSize: font.sm, color: colors.textMuted, lineHeight: 1.4 }}>
                {def.desc}
              </div>
            </div>
          )
        })}
      </Grid>
    </div>
  )
}

function InvitePlaceholder() {
  return (
    <div style={{
      marginTop: '24px', padding: '20px',
      background: '#f3e8ff', border: '1px dashed #c084fc',
      borderRadius: radius.xl, display: 'flex', alignItems: 'flex-start', gap: '12px',
    }}>
      <UserPlus size={24} color="#7c3aed" style={{ flexShrink: 0, marginTop: '2px' }} />
      <div>
        <strong style={{ color: '#6b21a8', display: 'block', marginBottom: '4px' }}>
          Invitaciones por email
        </strong>
        <p style={{ margin: 0, color: '#581c87', fontSize: font.sm, lineHeight: 1.5 }}>
          La invitación por email viene en la fase final del lanzamiento (junto con Stripe).
          Por ahora cada usuario crea su cuenta y tú los promueves al rol que corresponda.
        </p>
      </div>
    </div>
  )
}

function AuditorTokensPanel() {
  const [tokens, setTokens] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newDays, setNewDays] = useState(30)

  const fetchTokens = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('audit_share_tokens')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) { toast.error(error.message); setLoading(false); return }
    setTokens(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchTokens() }, [])

  const createToken = async () => {
    if (!newLabel.trim()) { toast.warning('Poné un nombre/motivo para el acceso'); return }
    if (newDays < 1 || newDays > 365) { toast.warning('Duración entre 1 y 365 días'); return }

    // Token opaco aleatorio (64 hex chars)
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    const token = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')

    const expiresAt = new Date(Date.now() + newDays * 86400 * 1000).toISOString()

    const { data: prof, error: profErr } = await supabase.from('user_profiles').select('org_id').single()
    if (profErr || !prof?.org_id) {
      toast.error('No pudimos identificar tu organización. Refresca la página y vuelve a intentar.')
      return
    }

    const { error } = await supabase.from('audit_share_tokens').insert([{
      org_id: prof.org_id,
      token,
      label: newLabel.trim(),
      expires_at: expiresAt,
    }])
    if (error) { toast.error(error.message); return }
    toast.success('Link creado')
    setNewLabel(''); setNewDays(30); setCreating(false)
    fetchTokens()
  }

  const revoke = async (t) => {
    const ok = await confirm({
      title: 'Revocar acceso',
      message: `¿Revocar el link de "${t.label}"? El auditor no podrá seguir accediendo.`,
      danger: true,
    })
    if (!ok) return
    const { error } = await supabase
      .from('audit_share_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', t.id)
    if (error) { toast.error(error.message); return }
    toast.success('Acceso revocado')
    fetchTokens()
  }

  const copyLink = async (t) => {
    const url = `${window.location.origin}/auditor/${t.token}`
    // Path moderno (HTTPS / clipboard API permitido)
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(url)
        toast.success('Link copiado al portapapeles')
        return
      } catch (err) {
        // sigue al fallback
      }
    }
    // Fallback: textarea + execCommand para HTTP, iframes, navegadores viejos
    try {
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus(); ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (ok) {
        toast.success('Link copiado al portapapeles')
      } else {
        throw new Error('execCommand devolvió false')
      }
    } catch (err) {
      // No mentir: si no se pudo, mostrá el link y pide que lo copie a mano
      toast.error('No se pudo copiar automáticamente. Cópialo manualmente: ' + url)
    }
  }

  return (
    <div style={{ marginTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <LinkIcon size={20} color={colors.primary} />
        <h3 style={{ margin: 0, fontSize: font.xl, color: colors.text, flex: 1 }}>
          Accesos para auditores externos
        </h3>
        {!creating && (
          <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setCreating(true)}>
            Nuevo link
          </Button>
        )}
      </div>

      <p style={{ margin: '0 0 12px 0', color: colors.textMuted, fontSize: font.sm, lineHeight: 1.5 }}>
        Genera un link temporal de solo lectura para auditores externos, certificadoras o clientes que necesiten revisar tu SGC sin tener cuenta. El acceso muestra política, alcance, procesos, riesgos, objetivos, NCs y auditorías.
      </p>

      {creating && (
        <div style={{
          background: colors.bgMuted, border: `1px solid ${colors.border}`,
          borderRadius: radius.xl, padding: '14px', marginBottom: '12px',
          display: 'flex', flexDirection: 'column', gap: '8px',
        }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Motivo / nombre del auditor (ej. Certificación SGS 2026)"
              value={newLabel}
              onChange={e => setNewLabel(e.target.value)}
              style={{ flex: 1, minWidth: '220px', padding: '8px 10px', border: `1px solid ${colors.border}`, borderRadius: radius.lg, fontSize: font.base }}
            />
            <input
              type="number"
              min="1"
              max="365"
              value={newDays}
              onChange={e => setNewDays(Number(e.target.value))}
              style={{ width: '90px', padding: '8px 10px', border: `1px solid ${colors.border}`, borderRadius: radius.lg, fontSize: font.base }}
            />
            <span style={{ alignSelf: 'center', color: colors.textFaint, fontSize: font.sm }}>días</span>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="primary" size="sm" onClick={createToken}>Crear link</Button>
            <Button variant="ghost" size="sm" onClick={() => { setCreating(false); setNewLabel('') }}>Cancelar</Button>
          </div>
        </div>
      )}

      {loading ? (
        <Spinner label="Cargando accesos…" />
      ) : tokens.length === 0 ? (
        <EmptyState
          icon={<LinkIcon size={28} color={colors.textGhost} />}
          title="Sin accesos creados"
          subtitle="Cuando una certificadora venga, genera un link temporal aquí."
        />
      ) : (
        <div style={{
          background: 'white', border: `1px solid ${colors.border}`,
          borderRadius: radius.xl, overflow: 'hidden',
        }}>
          {tokens.map((t, i) => (
            <TokenRow
              key={t.id} token={t}
              isLast={i === tokens.length - 1}
              onCopy={() => copyLink(t)}
              onRevoke={() => revoke(t)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TokenRow({ token, isLast, onCopy, onRevoke }) {
  const isRevoked = !!token.revoked_at
  const isExpired = !isRevoked && new Date(token.expires_at) < new Date()
  const isActive = !isRevoked && !isExpired

  const daysLeft = isActive
    ? Math.max(0, Math.ceil((new Date(token.expires_at) - new Date()) / (1000 * 60 * 60 * 24)))
    : null

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '10px', padding: '12px 14px',
      borderBottom: isLast ? 'none' : `1px solid ${colors.border}`,
      opacity: isActive ? 1 : 0.6,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <strong style={{ color: colors.text }}>{token.label}</strong>
          {isRevoked && <Badge bg={colors.dangerLight} color={colors.dangerText}>Revocado</Badge>}
          {isExpired && <Badge bg={colors.bgSubtle} color={colors.textMuted}>Expirado</Badge>}
          {isActive && daysLeft <= 7 && <Badge bg={colors.warningLight} color={colors.warningText}>⏰ {daysLeft}d</Badge>}
          {isActive && daysLeft > 7 && <Badge bg={colors.successLight} color={colors.successText}>Activo</Badge>}
        </div>
        <div style={{ fontSize: font.sm, color: colors.textFaint, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Clock size={11} /> Expira {new Date(token.expires_at).toLocaleDateString()}
          {token.use_count > 0 && <span>· {token.use_count} acceso{token.use_count === 1 ? '' : 's'}</span>}
          {token.last_used_at && <span>· Último: {new Date(token.last_used_at).toLocaleString()}</span>}
        </div>
      </div>

      {isActive && (
        <>
          <Button variant="ghost" size="sm" icon={<Copy size={14} />} onClick={onCopy}>Copiar link</Button>
          <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={onRevoke}>Revocar</Button>
        </>
      )}
    </div>
  )
}
