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
  const { role: myRole, profile, org } = useOrg()
  const plan = usePlan()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  const canRead = can(myRole, 'team', 'read')
  const canWrite = can(myRole, 'team', 'write')
  const orgId = org?.id

  useEffect(() => {
    if (!canRead || !orgId) { setLoading(false); return }
    fetchMembers()
  }, [canRead, orgId])

  const fetchMembers = async () => {
    setLoading(true)
    // Defense-in-depth: filter explícito por org_id.
    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id, full_name, role, created_at')
      .eq('org_id', orgId)
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

      {canWrite && (
        <InvitePanel
          members={members}
          maxUsers={plan.maxUsers}
          onInvited={fetchMembers}
        />
      )}
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

// InvitePanel — Owner invita a un nuevo miembro por email. Llama a la edge
// function `invite-member` que crea un auth.user con metadata invited_org_id
// + invited_role, y Supabase manda el email de bienvenida con link magico.
// Cuando el user completa signup, un trigger BD lo une a la org con el rol.
//
// Respeta el limite del plan (maxUsers). Roles invitables: quality_manager,
// auditor, operator, viewer — owner no se invita, se transfiere aparte.
const INVITABLE_ROLES = ['quality_manager', 'auditor', 'operator', 'viewer']

function InvitePanel({ members, maxUsers, onInvited }) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('operator')
  const [fullName, setFullName] = useState('')
  const [sending, setSending] = useState(false)
  const [lastInvited, setLastInvited] = useState(null)  // { email, at }

  const isUnlimited = maxUsers == null
  const atLimit = !isUnlimited && members.length >= maxUsers

  const reset = () => {
    setEmail('')
    setRole('operator')
    setFullName('')
    setOpen(false)
  }

  const handleInvite = async () => {
    const cleanEmail = email.trim().toLowerCase()
    if (!cleanEmail || !cleanEmail.includes('@')) {
      toast.error('Email inválido')
      return
    }
    // No dejar duplicar: si ya es miembro, no tiene sentido reinvitarlo.
    if (members.some(m => m.full_name && cleanEmail === m.full_name.toLowerCase())) {
      // El full_name no siempre es el email — este check es aproximado. Igual
      // el edge function y el trigger BD son idempotentes: reinvitar a alguien
      // que ya es miembro simplemente lo re-notifica.
    }

    setSending(true)
    try {
      const { data, error } = await supabase.functions.invoke('invite-member', {
        body: {
          email: cleanEmail,
          role,
          full_name: fullName.trim(),
        },
      })
      // El edge function devuelve { error: "..." } con 4xx, o { ok: true, user_id }.
      // Cuando la function tira 4xx, supabase-js pone el status en `error`
      // pero el body sigue en `data`.
      if (error) {
        const msg = data?.error || error.message || 'Error invitando'
        toast.error(msg)
        return
      }
      if (data?.error) {
        toast.error(data.error)
        return
      }
      toast.success(`Invitación enviada a ${cleanEmail}`)
      setLastInvited({ email: cleanEmail, at: new Date().toISOString() })
      reset()
      onInvited?.()
    } catch (e) {
      toast.error(e.message || 'Error invitando')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ marginTop: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <UserPlus size={20} color={colors.primary} />
        <h3 style={{ margin: 0, fontSize: font.xl, color: colors.text, flex: 1 }}>
          Invitar por email
        </h3>
        {!open && (
          <Button
            variant="primary"
            size="sm"
            icon={<Mail size={14} />}
            onClick={() => setOpen(true)}
            disabled={atLimit}
            title={atLimit ? `Alcanzaste el límite del plan (${maxUsers} usuarios). Actualizá el plan para invitar más.` : ''}
          >
            Nueva invitación
          </Button>
        )}
      </div>

      <p style={{ margin: '0 0 12px 0', color: colors.textMuted, fontSize: font.sm, lineHeight: 1.5 }}>
        La persona recibe un email con link de acceso. Cuando completa el registro se une automáticamente a la organización con el rol indicado.
      </p>

      {atLimit && (
        <div style={{
          background: colors.warningLight, color: colors.warningText,
          padding: '10px 12px', borderRadius: radius.md, marginBottom: '12px',
          fontSize: font.sm, display: 'flex', gap: '8px', alignItems: 'flex-start',
        }}>
          <Info size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>
            Alcanzaste el límite del plan ({maxUsers} usuarios). Para invitar más gente actualizá el plan desde <strong>Plan y facturación</strong>.
          </span>
        </div>
      )}

      {open && !atLimit && (
        <div style={{
          background: colors.bgMuted, border: `1px solid ${colors.border}`,
          borderRadius: radius.xl, padding: '14px', marginBottom: '12px',
          display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div>
              <label style={{ fontSize: font.sm, fontWeight: 600, color: colors.textMuted, display: 'block', marginBottom: '4px' }}>
                Email de la persona
              </label>
              <input
                type="email"
                autoComplete="off"
                placeholder="ej. calidad@empresa.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                disabled={sending}
                style={{
                  width: '100%', padding: '8px 10px', border: `1px solid ${colors.border}`,
                  borderRadius: radius.lg, fontSize: font.base, boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ fontSize: font.sm, fontWeight: 600, color: colors.textMuted, display: 'block', marginBottom: '4px' }}>
                Nombre (opcional)
              </label>
              <input
                type="text"
                autoComplete="off"
                placeholder="María González"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                disabled={sending}
                style={{
                  width: '100%', padding: '8px 10px', border: `1px solid ${colors.border}`,
                  borderRadius: radius.lg, fontSize: font.base, boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div>
            <label style={{ fontSize: font.sm, fontWeight: 600, color: colors.textMuted, display: 'block', marginBottom: '4px' }}>
              Rol al aceptar la invitación
            </label>
            <select
              value={role}
              onChange={e => setRole(e.target.value)}
              disabled={sending}
              style={{
                width: '100%', padding: '8px 10px', border: `1px solid ${colors.border}`,
                borderRadius: radius.lg, fontSize: font.base, background: 'white',
              }}
            >
              {INVITABLE_ROLES.map(r => (
                <option key={r} value={r}>{ROLES[r].icon} {ROLES[r].label} — {ROLES[r].desc}</option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '4px' }}>
            <Button variant="ghost" size="sm" onClick={reset} disabled={sending}>Cancelar</Button>
            <Button variant="primary" size="sm" icon={<Mail size={14} />} onClick={handleInvite} disabled={sending}>
              {sending ? 'Enviando…' : 'Enviar invitación'}
            </Button>
          </div>
        </div>
      )}

      {lastInvited && (
        <div style={{
          background: colors.successLight, color: colors.successText,
          padding: '10px 12px', borderRadius: radius.md,
          fontSize: font.sm, display: 'flex', gap: '8px', alignItems: 'flex-start',
        }}>
          <Mail size={16} style={{ flexShrink: 0, marginTop: '1px' }} />
          <span>
            Invitación enviada a <strong>{lastInvited.email}</strong>. Aparecerá acá arriba cuando complete el registro.
          </span>
        </div>
      )}
    </div>
  )
}

// SHA-256 en el cliente. El plaintext nunca se envía al servidor; solo el hash
// se persiste. Web Crypto está disponible en cualquier navegador moderno bajo
// contexto seguro (HTTPS o localhost).
async function sha256Hex(str) {
  const buf = new TextEncoder().encode(str)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
}

async function copyToClipboard(text) {
  if (navigator.clipboard && window.isSecureContext) {
    try { await navigator.clipboard.writeText(text); return true } catch {}
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus(); ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch { return false }
}

function AuditorTokensPanel() {
  const { org } = useOrg()
  const orgId = org?.id
  const [tokens, setTokens] = useState([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newLabel, setNewLabel] = useState('')
  const [newDays, setNewDays] = useState(30)
  const [newMaxUses, setNewMaxUses] = useState('')
  // Modal show-once del link recién creado. Guardamos aquí el plaintext
  // TEMPORALMENTE (memoria del componente, no persistido) para que el owner
  // pueda copiar el link. Al cerrar el modal, se limpia y ya no se puede
  // recuperar — es el único momento en toda la vida del token en que el
  // plaintext existe fuera del hash.
  const [freshLink, setFreshLink] = useState(null)  // { url, label, expiresAt, maxUses }

  const fetchTokens = async () => {
    setLoading(true)
    // Defense-in-depth: filter explícito por org_id.
    const { data, error } = await supabase
      .from('audit_share_tokens')
      .select('id, org_id, label, created_at, expires_at, revoked_at, last_used_at, use_count, max_uses')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
    if (error) { toast.error(error.message); setLoading(false); return }
    setTokens(data || [])
    setLoading(false)
  }

  useEffect(() => { if (orgId) fetchTokens() }, [orgId])

  const createToken = async () => {
    if (!newLabel.trim()) { toast.warning('Poné un nombre/motivo para el acceso'); return }
    if (newDays < 1 || newDays > 365) { toast.warning('Duración entre 1 y 365 días'); return }
    const maxUsesParsed = newMaxUses.trim() === '' ? null : Number(newMaxUses)
    if (maxUsesParsed !== null && (!Number.isInteger(maxUsesParsed) || maxUsesParsed < 1 || maxUsesParsed > 10000)) {
      toast.warning('Máximo de usos entre 1 y 10000 (o vacío para ilimitado)')
      return
    }

    // Token opaco aleatorio (64 hex chars = 32 bytes de entropía). Nunca va a
    // BD en plaintext; solo su sha256. El plaintext vive únicamente en la URL
    // que el owner copie en este momento.
    const bytes = new Uint8Array(32)
    crypto.getRandomValues(bytes)
    const plaintext = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    const tokenHash = await sha256Hex(plaintext)

    const expiresAt = new Date(Date.now() + newDays * 86400 * 1000).toISOString()

    const { data: prof, error: profErr } = await supabase.from('user_profiles').select('org_id').single()
    if (profErr || !prof?.org_id) {
      toast.error('No pudimos identificar tu organización. Refresca la página y vuelve a intentar.')
      return
    }

    const { error } = await supabase.from('audit_share_tokens').insert([{
      org_id: prof.org_id,
      token_hash: tokenHash,
      label: newLabel.trim(),
      expires_at: expiresAt,
      max_uses: maxUsesParsed,
    }])
    if (error) { toast.error(error.message); return }

    // Mostrar el link 1 sola vez. Si el owner cierra el modal sin copiar,
    // pierde acceso — tiene que revocar y regenerar.
    setFreshLink({
      url: `${window.location.origin}/auditor/${plaintext}`,
      label: newLabel.trim(),
      expiresAt,
      maxUses: maxUsesParsed,
    })
    setNewLabel(''); setNewDays(30); setNewMaxUses(''); setCreating(false)
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
            <input
              type="number"
              min="1"
              max="10000"
              placeholder="Máx usos (opcional)"
              value={newMaxUses}
              onChange={e => setNewMaxUses(e.target.value)}
              title="Vacío = ilimitado. Si ponés un número, el link se inutiliza después de esa cantidad de accesos."
              style={{ width: '160px', padding: '8px 10px', border: `1px solid ${colors.border}`, borderRadius: radius.lg, fontSize: font.base }}
            />
          </div>
          <div style={{ fontSize: font.sm, color: colors.warningText, background: colors.warningLight, padding: '8px 10px', borderRadius: radius.md }}>
            🔒 El link se mostrará <strong>una sola vez</strong> al crearlo. Guardalo bien: por seguridad no lo volvemos a mostrar después.
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button variant="primary" size="sm" onClick={createToken}>Crear link</Button>
            <Button variant="ghost" size="sm" onClick={() => { setCreating(false); setNewLabel(''); setNewMaxUses('') }}>Cancelar</Button>
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
              onRevoke={() => revoke(t)}
            />
          ))}
        </div>
      )}

      {freshLink && <FreshLinkModal fresh={freshLink} onClose={() => setFreshLink(null)} />}
    </div>
  )
}

function TokenRow({ token, isLast, onRevoke }) {
  const isRevoked = !!token.revoked_at
  const isExpired = !isRevoked && new Date(token.expires_at) < new Date()
  const isUsedUp = !isRevoked && !isExpired && token.max_uses != null && token.use_count >= token.max_uses
  const isActive = !isRevoked && !isExpired && !isUsedUp

  const daysLeft = isActive
    ? Math.max(0, Math.ceil((new Date(token.expires_at) - new Date()) / (1000 * 60 * 60 * 24)))
    : null
  const usesLeft = isActive && token.max_uses != null
    ? Math.max(0, token.max_uses - token.use_count)
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
          {isUsedUp && <Badge bg={colors.bgSubtle} color={colors.textMuted}>Sin usos restantes</Badge>}
          {isActive && daysLeft <= 7 && <Badge bg={colors.warningLight} color={colors.warningText}>⏰ {daysLeft}d</Badge>}
          {isActive && daysLeft > 7 && <Badge bg={colors.successLight} color={colors.successText}>Activo</Badge>}
        </div>
        <div style={{ fontSize: font.sm, color: colors.textFaint, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <Clock size={11} /> Expira {new Date(token.expires_at).toLocaleDateString()}
          {token.use_count > 0 && <span>· {token.use_count} acceso{token.use_count === 1 ? '' : 's'}</span>}
          {usesLeft != null && <span>· {usesLeft} usos restantes</span>}
          {token.last_used_at && <span>· Último: {new Date(token.last_used_at).toLocaleString()}</span>}
        </div>
      </div>

      {isActive && (
        <Button variant="ghost" size="sm" icon={<Trash2 size={14} />} onClick={onRevoke}>Revocar</Button>
      )}
    </div>
  )
}

function FreshLinkModal({ fresh, onClose }) {
  const [copied, setCopied] = useState(false)
  const [ackWarning, setAckWarning] = useState(false)

  const doCopy = async () => {
    const ok = await copyToClipboard(fresh.url)
    if (ok) {
      setCopied(true)
      toast.success('Link copiado al portapapeles')
    } else {
      toast.error('No se pudo copiar. Seleccioná el link y copialo con Ctrl+C.')
    }
  }

  const handleClose = () => {
    if (!copied && !ackWarning) {
      setAckWarning(true)
      toast.warning('Confirmá que copiaste el link. No lo vamos a mostrar de nuevo.')
      return
    }
    onClose()
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)',
      backdropFilter: 'blur(4px)', zIndex: 1200,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
    }}>
      <div style={{
        background: 'white', maxWidth: '640px', width: '100%',
        borderRadius: radius['2xl'], boxShadow: '0 25px 60px -12px rgba(0,0,0,0.35)',
        padding: '20px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <LinkIcon size={20} color={colors.primary} />
          <h3 style={{ margin: 0, fontSize: font.xl, color: colors.text }}>
            Link generado para <em>{fresh.label}</em>
          </h3>
        </div>

        <div style={{
          background: colors.warningLight, color: colors.warningText,
          padding: '10px 12px', borderRadius: radius.md, marginBottom: '12px',
          fontSize: font.sm, lineHeight: 1.5,
        }}>
          🔒 <strong>Este link se muestra una sola vez.</strong> Al cerrar este modal ya no
          vas a poder verlo de nuevo. Copialo ahora y enviálo al auditor por un canal seguro
          (WhatsApp, email cifrado, no lo pegues en Slack público).
        </div>

        <div style={{
          background: colors.bgSubtle, border: `1px solid ${colors.border}`,
          borderRadius: radius.lg, padding: '10px', marginBottom: '10px',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <input
            readOnly
            value={fresh.url}
            onClick={e => e.target.select()}
            style={{
              flex: 1, fontFamily: 'monospace', fontSize: '12px',
              padding: '6px 8px', border: `1px solid ${colors.border}`,
              borderRadius: radius.md, background: 'white',
            }}
          />
          <Button variant="primary" size="sm" icon={<Copy size={14} />} onClick={doCopy}>
            {copied ? 'Copiado ✓' : 'Copiar'}
          </Button>
        </div>

        <div style={{ fontSize: font.sm, color: colors.textFaint, marginBottom: '14px' }}>
          Expira: {new Date(fresh.expiresAt).toLocaleString()}
          {fresh.maxUses != null && <> · Máx {fresh.maxUses} usos</>}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button variant={copied ? 'primary' : 'ghost'} size="sm" onClick={handleClose}>
            {copied ? 'Cerrar' : ackWarning ? 'Cerrar sin copiar' : 'Cerrar'}
          </Button>
        </div>
      </div>
    </div>
  )
}
