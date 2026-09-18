// OrganizationSettings: gestión de la organización (datos generales + miembros).
// - General: renombrar org (solo owner)
// - Miembros: listar, invitar, cambiar rol, eliminar (solo owner para invitar/eliminar)

import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import { Building2, Users, UserPlus, Trash2, Save, AlertCircle, CheckCircle2 } from 'lucide-react'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'
import { useSuperAdmin } from './lib/useSuperAdmin'
import { readFunctionError } from './lib/functionError'

const ROLE_LABELS = {
  owner: 'Owner',
  quality_manager: 'Quality Manager',
  auditor: 'Auditor',
  viewer: 'Viewer',
}

const ROLE_DESCRIPTIONS = {
  owner: 'Administra la organización, miembros y todo el SGC.',
  quality_manager: 'Edita todo el SGC. No gestiona usuarios.',
  auditor: 'Lectura del SGC + edición de auditorías y no conformidades.',
  viewer: 'Solo lectura.',
}

const INVITABLE_ROLES = ['quality_manager', 'auditor', 'viewer']

export default function OrganizationSettings() {
  const { org, profile, can, role: myRole, refresh } = useOrg()
  const [tab, setTab] = useState('general')
  const [orgName, setOrgName] = useState('')
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const [inspectionEnabled, setInspectionEnabled] = useState(false)
  const [savingModule, setSavingModule] = useState(false)
  const [independenceType, setIndependenceType] = useState('no_A')
  const [safeguards, setSafeguards] = useState('')
  const [requestNote, setRequestNote] = useState('')
  const isSuperAdmin = useSuperAdmin()
  const requestedAt = org?.inspection_module_requested_at

  useEffect(() => {
    if (org) {
      setOrgName(org.name)
      setInspectionEnabled(!!org.inspection_module_enabled)
      setIndependenceType(org.inspection_independence_type || 'no_A')
      setSafeguards(org.inspection_safeguards || '')
    }
  }, [org])

  const showMsg = (text, kind = 'ok') => {
    setMsg({ text, kind })
    setTimeout(() => setMsg(null), 4000)
  }

  const loadMembers = async () => {
    setLoading(true)
    const { data, error } = await supabase
      .from('user_profiles')
      .select('user_id, role, full_name, created_at')
      .order('created_at', { ascending: true })
    if (error) showMsg(error.message, 'err')
    else setMembers(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (tab === 'members') loadMembers()
  }, [tab])

  // Módulo ISO/IEC 17020: lo habilita solo el super_admin (trigger en la base).
  // El cliente lo solicita y la solicitud aparece en el Panel de administración.
  const migrationMissing = (error) =>
    /inspection_module|could not find the function|does not exist/i.test(error.message)

  const toggleInspectionModule = async (value) => {
    setSavingModule(true)
    const { error } = await supabase.rpc('admin_set_inspection_module', {
      p_org_id: org.id, p_enabled: value, p_reason: 'Desde Mi Organización',
    })
    setSavingModule(false)
    if (error) {
      showMsg(migrationMissing(error)
        ? 'Falta aplicar la migración 20260918120000 (habilitación del módulo 17020).'
        : error.message, 'err')
      return
    }
    setInspectionEnabled(value)
    showMsg(value
      ? 'Módulos de inspección habilitados. Aparecen en el menú como "Inspección (17020)".'
      : 'Módulos de inspección ocultos. Los datos cargados no se borran.')
    if (typeof refresh === 'function') refresh()
  }

  const requestInspectionModule = async () => {
    setSavingModule(true)
    const { error } = await supabase.rpc('request_inspection_module', { p_note: requestNote || null })
    setSavingModule(false)
    if (error) {
      showMsg(migrationMissing(error)
        ? 'La solicitud todavía no está disponible. Escribinos a soporte para habilitar el módulo.'
        : error.message, 'err')
      return
    }
    setRequestNote('')
    showMsg('Solicitud enviada. Te avisamos cuando el módulo esté habilitado.')
    if (typeof refresh === 'function') refresh()
  }

  const cancelInspectionRequest = async () => {
    if (!await confirm('¿Retirar la solicitud del módulo de inspección?')) return
    setSavingModule(true)
    const { error } = await supabase.rpc('cancel_inspection_module_request')
    setSavingModule(false)
    if (error) { showMsg(error.message, 'err'); return }
    showMsg('Solicitud retirada.')
    if (typeof refresh === 'function') refresh()
  }

  const saveIndependence = async () => {
    setSavingModule(true)
    const { error } = await supabase
      .from('organizations')
      .update({ inspection_independence_type: independenceType, inspection_safeguards: safeguards || null })
      .eq('id', org.id)
    setSavingModule(false)
    if (error) {
      showMsg(/inspection_independence_type/i.test(error.message)
        ? 'Falta aplicar la migración de salvaguardas de tipo no A.'
        : error.message, 'err')
      return
    }
    showMsg('Declaración de independencia guardada.')
    if (typeof refresh === 'function') refresh()
  }

  const saveOrgName = async () => {
    if (!orgName.trim()) return
    setLoading(true)
    const { error } = await supabase
      .from('organizations')
      .update({ name: orgName.trim() })
      .eq('id', org.id)
    setLoading(false)
    if (error) showMsg(error.message, 'err')
    else showMsg('Nombre actualizado.')
  }

  const updateMemberRole = async (userId, newRole) => {
    const { error } = await supabase
      .from('user_profiles')
      .update({ role: newRole })
      .eq('user_id', userId)
    if (error) showMsg(error.message, 'err')
    else {
      showMsg('Rol actualizado.')
      loadMembers()
    }
  }

  const removeMember = async (userId) => {
    if (!await confirm('¿Eliminar a este miembro de la organización?')) return
    const { error } = await supabase
      .from('user_profiles')
      .delete()
      .eq('user_id', userId)
    if (error) showMsg(error.message, 'err')
    else {
      showMsg('Miembro eliminado.')
      loadMembers()
    }
  }

  if (!org) return <div style={{ padding: '2rem' }}>Cargando organización...</div>

  return (
    <div style={{ padding: '2rem', maxWidth: '900px' }}>
      <h1 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Building2 size={28} /> {org.name}
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginTop: '-0.5rem' }}>
        Plan: <strong>{org.plan}</strong> · Tu rol: <strong>{ROLE_LABELS[myRole]}</strong>
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--sidebar-border)', marginBottom: '1.5rem' }}>
        <TabBtn active={tab === 'general'} onClick={() => setTab('general')} icon={Building2} label="General" />
        <TabBtn active={tab === 'members'} onClick={() => setTab('members')} icon={Users} label="Miembros" />
      </div>

      {msg && (
        <div style={{
          padding: '0.75rem 1rem',
          marginBottom: '1rem',
          borderRadius: '6px',
          background: msg.kind === 'err' ? 'var(--danger-bg)' : 'var(--success-bg)',
          color: msg.kind === 'err' ? 'var(--danger-text)' : 'var(--success-text)',
          display: 'flex', alignItems: 'center', gap: '0.5rem'
        }}>
          {msg.kind === 'err' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {msg.text}
        </div>
      )}

      {tab === 'general' && (
        <div className="card" style={{ padding: '1.5rem' }}>
          <h3 style={{ marginTop: 0 }}>Datos de la organización</h3>
          <div className="form-group">
            <label className="form-label">Nombre</label>
            <input
              className="form-input"
              value={orgName}
              disabled={!can.admin}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </div>
          {can.admin && (
            <button className="btn btn-primary" disabled={loading} onClick={saveOrgName}>
              <Save size={16} /> Guardar
            </button>
          )}
          {!can.admin && (
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem' }}>
              Solo el owner puede modificar estos datos.
            </p>
          )}

          <hr style={{ border: 'none', borderTop: '1px solid var(--sidebar-border)', margin: '1.5rem 0' }} />

          <h3 style={{ marginTop: 0 }}>Organismo de inspección (ISO/IEC 17020)</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '-0.25rem' }}>
            Para empresas que hacen inspecciones y van a acreditarse bajo ISO/IEC 17020: agrega los
            módulos técnicos (alcance, métodos, ítems e inspectores autorizados) sobre el mismo SGC.
          </p>

          {isSuperAdmin ? (
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={!!inspectionEnabled}
                disabled={savingModule}
                onChange={(e) => toggleInspectionModule(e.target.checked)}
              />
              <span>Habilitar módulos de inspección <em style={{ color: 'var(--text-tertiary)' }}>(solo administrador de IsoSmartCore)</em></span>
            </label>
          ) : inspectionEnabled ? (
            <p style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success-text)', margin: 0 }}>
              <CheckCircle2 size={16} /> Módulo habilitado para tu organización.
            </p>
          ) : requestedAt ? (
            <div style={{ background: 'var(--warning-bg, #fef3c7)', color: 'var(--warning-text, #92400e)', padding: '0.75rem 1rem', borderRadius: '6px', fontSize: '0.9rem' }}>
              Solicitud enviada el {new Date(requestedAt).toLocaleDateString('es-EC')}. Está pendiente de
              aprobación por el equipo de IsoSmartCore.
              {can.admin && (
                <button className="btn" disabled={savingModule} onClick={cancelInspectionRequest}
                  style={{ marginLeft: '0.75rem', background: 'transparent', border: 'none', textDecoration: 'underline', color: 'inherit', padding: 0 }}>
                  Retirar solicitud
                </button>
              )}
            </div>
          ) : can.admin ? (
            <div>
              <div className="form-group">
                <label className="form-label">Contanos qué inspecciones hacen (opcional)</label>
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                  placeholder="Ej: END en juntas soldadas (UT, PT, MT), queremos acreditarnos ante el SAE"
                />
              </div>
              <button className="btn btn-primary" disabled={savingModule} onClick={requestInspectionModule}>
                Solicitar habilitación
              </button>
            </div>
          ) : (
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', margin: 0 }}>
              El owner de la organización puede solicitar este módulo.
            </p>
          )}

          {inspectionEnabled && (
            <div style={{ marginTop: '1.25rem' }}>
              <div className="form-group">
                <label className="form-label">Tipo de independencia declarado (5.1 / Anexo A)</label>
                <select
                  className="form-select"
                  value={independenceType}
                  disabled={!can.admin}
                  onChange={(e) => setIndependenceType(e.target.value)}
                >
                  <option value="A">Tipo A — no diseñamos, fabricamos, instalamos, reparamos ni mantenemos lo que inspeccionamos</option>
                  <option value="no_A">Tipo no A — también intervenimos ítems del tipo que inspeccionamos</option>
                </select>
              </div>

              {independenceType === 'no_A' && (
                <p style={{
                  background: 'var(--warning-bg, #fef3c7)', color: 'var(--warning-text, #92400e)',
                  padding: '0.75rem 1rem', borderRadius: '6px', fontSize: '0.9rem',
                }}>
                  Como tipo no A, la norma exige una salvaguarda concreta: <strong>quien diseñó, fabricó,
                  instaló, reparó o mantuvo un ítem no puede inspeccionar ese mismo ítem</strong> (Anexo A.2 b).
                  Registrá esas intervenciones en Inspección → Ítems para que el sistema sepa a quién inhabilitar.
                </p>
              )}

              <div className="form-group">
                <label className="form-label">Salvaguardas declaradas</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  value={safeguards}
                  disabled={!can.admin}
                  onChange={(e) => setSafeguards(e.target.value)}
                  placeholder="Separación de responsabilidades y líneas de reporte, control de acceso a registros, quién decide sobre el dictamen"
                />
              </div>

              {can.admin && (
                <button className="btn btn-primary" disabled={savingModule} onClick={saveIndependence}>
                  <Save size={16} /> Guardar declaración
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'members' && (
        <>
          {can.admin && <InviteForm orgId={org.id} onInvited={loadMembers} showMsg={showMsg} />}

          <div className="card" style={{ padding: '1.5rem' }}>
            <h3 style={{ marginTop: 0 }}>Miembros ({members.length})</h3>
            {loading && <p>Cargando...</p>}
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--sidebar-border)' }}>
                  <th style={{ padding: '0.5rem' }}>Nombre</th>
                  <th style={{ padding: '0.5rem' }}>Rol</th>
                  <th style={{ padding: '0.5rem', textAlign: 'right' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id} style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
                    <td style={{ padding: '0.5rem' }}>
                      {m.full_name || <em style={{ color: 'var(--text-tertiary)' }}>(sin nombre)</em>}
                      {m.user_id === profile.user_id && (
                        <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>(tú)</span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem' }}>
                      {can.admin && m.user_id !== profile.user_id ? (
                        <select
                          value={m.role}
                          onChange={(e) => updateMemberRole(m.user_id, e.target.value)}
                          className="form-input"
                          style={{ padding: '0.25rem 0.5rem', width: 'auto' }}
                        >
                          {Object.entries(ROLE_LABELS).map(([v, l]) => (
                            <option key={v} value={v}>{l}</option>
                          ))}
                        </select>
                      ) : (
                        <span title={ROLE_DESCRIPTIONS[m.role]}>{ROLE_LABELS[m.role]}</span>
                      )}
                    </td>
                    <td style={{ padding: '0.5rem', textAlign: 'right' }}>
                      {can.admin && m.user_id !== profile.user_id && (
                        <button
                          className="btn"
                          onClick={() => removeMember(m.user_id)}
                          style={{ color: 'var(--danger-text)', background: 'transparent', border: 'none' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid var(--primary-color)' : '2px solid transparent',
        padding: '0.75rem 1rem',
        color: active ? 'var(--primary-color)' : 'var(--text-secondary)',
        cursor: 'pointer',
        fontWeight: active ? 600 : 400,
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
      }}
    >
      <Icon size={16} /> {label}
    </button>
  )
}

function InviteForm({ orgId, onInvited, showMsg }) {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [role, setRole] = useState('viewer')
  const [sending, setSending] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setSending(true)
    const { data, error } = await supabase.functions.invoke('invite-member', {
      body: { email, full_name: fullName, role },
    })
    setSending(false)
    if (error || data?.error) {
      // Con 4xx el mensaje real (p. ej. límite de usuarios) viene en error.context
      showMsg(error ? await readFunctionError(error, 'Error invitando') : data.error, 'err')
    } else {
      showMsg(`Invitación enviada a ${email}`)
      setEmail(''); setFullName(''); setRole('viewer')
      onInvited()
    }
  }

  return (
    <div className="card" style={{ padding: '1.5rem', marginBottom: '1rem' }}>
      <h3 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <UserPlus size={20} /> Invitar miembro
      </h3>
      <form onSubmit={submit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 200px auto', gap: '0.5rem', alignItems: 'end' }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Email</label>
          <input className="form-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Nombre (opcional)</label>
          <input className="form-input" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Rol</label>
          <select className="form-input" value={role} onChange={(e) => setRole(e.target.value)}>
            {INVITABLE_ROLES.map(r => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" disabled={sending}>
          {sending ? 'Enviando...' : 'Invitar'}
        </button>
      </form>
    </div>
  )
}
