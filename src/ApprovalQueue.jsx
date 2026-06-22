// ApprovalQueue: bandeja única de solicitudes de aprobación de la organización.
// Muestra:
//   - Pendientes que YO puedo aprobar (no soy el solicitante)
//   - Pendientes esperando a otros (las mías o donde no puedo decidir)
//   - Histórico (aprobadas, rechazadas, canceladas)

import { useEffect, useState } from 'react'
import { supabase } from './supabaseClient'
import { useOrg } from './OrgContext'
import {
  CheckCircle2, XCircle, Clock, FileText, ShieldCheck, ShieldOff,
  AlertCircle, Trash2
} from 'lucide-react'
import { toast } from './lib/toast'
import { confirm } from './lib/confirm'

const ENTITY_LABELS = {
  documents_versions: 'Documento',
}

export default function ApprovalQueue() {
  const { profile, can } = useOrg()
  const [approvals, setApprovals] = useState([])
  const [members, setMembers] = useState({})
  const [docs, setDocs] = useState({})
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [tab, setTab] = useState('toDecide')

  const load = async () => {
    setLoading(true)
    const [{ data: apps }, { data: mems }, { data: ds }] = await Promise.all([
      supabase.from('approvals').select('*').order('created_at', { ascending: false }),
      supabase.from('user_profiles').select('user_id, full_name, role'),
      supabase.from('documents_versions').select('id, code, title, version'),
    ])
    setApprovals(apps || [])
    setMembers(Object.fromEntries((mems || []).map(m => [m.user_id, m])))
    setDocs(Object.fromEntries((ds || []).map(d => [d.id, d])))
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const showMsg = (text, kind = 'ok') => {
    setMsg({ text, kind })
    setTimeout(() => setMsg(null), 4000)
  }

  const handleApprove = async (a) => {
    const comment = prompt('Comentario de aprobación (opcional):') || null
    if (comment === null && !confirm('¿Aprobar sin comentario?')) return
    const { error } = await supabase.rpc('approve_entity', {
      p_approval_id: a.id,
      p_comment: comment,
    })
    if (error) showMsg(error.message, 'err')
    else { showMsg('Aprobado.'); load() }
  }

  const handleReject = async (a) => {
    const reason = prompt('Motivo del rechazo (obligatorio):')
    if (!reason) return
    const { error } = await supabase.rpc('reject_entity', {
      p_approval_id: a.id,
      p_reason: reason,
    })
    if (error) showMsg(error.message, 'err')
    else { showMsg('Rechazado.'); load() }
  }

  const handleCancel = async (a) => {
    if (!await confirm('¿Cancelar tu solicitud? El documento vuelve a borrador.')) return
    const { error } = await supabase.rpc('cancel_approval', { p_approval_id: a.id })
    if (error) showMsg(error.message, 'err')
    else { showMsg('Solicitud cancelada.'); load() }
  }

  const myId = profile?.user_id
  const canDecide = can.write  // owner o quality_manager

  const toDecide = approvals.filter(a =>
    a.status === 'pending' && a.requested_by !== myId && canDecide
  )
  const awaiting = approvals.filter(a =>
    a.status === 'pending' && (a.requested_by === myId || !canDecide)
  )
  const history = approvals.filter(a => a.status !== 'pending')

  const current = tab === 'toDecide' ? toDecide : tab === 'awaiting' ? awaiting : history

  return (
    <div style={{ padding: '2rem', maxWidth: '1100px' }}>
      <h1 style={{ marginTop: 0, display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <ShieldCheck size={28} /> Aprobaciones
      </h1>
      <p style={{ color: 'var(--text-secondary)', marginTop: '-0.5rem' }}>
        Workflow de revisión y aprobación con separación de funciones.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--sidebar-border)', marginBottom: '1rem' }}>
        <TabBtn active={tab === 'toDecide'} onClick={() => setTab('toDecide')}
          icon={CheckCircle2} label={`Para revisar (${toDecide.length})`} highlight={toDecide.length > 0} />
        <TabBtn active={tab === 'awaiting'} onClick={() => setTab('awaiting')}
          icon={Clock} label={`Esperando (${awaiting.length})`} />
        <TabBtn active={tab === 'history'} onClick={() => setTab('history')}
          icon={FileText} label={`Histórico (${history.length})`} />
      </div>

      {msg && (
        <div style={{
          padding: '0.75rem 1rem', marginBottom: '1rem', borderRadius: '6px',
          background: msg.kind === 'err' ? 'var(--danger-bg)' : 'var(--success-bg)',
          color: msg.kind === 'err' ? 'var(--danger-text)' : 'var(--success-text)',
          display: 'flex', alignItems: 'center', gap: '0.5rem'
        }}>
          {msg.kind === 'err' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />}
          {msg.text}
        </div>
      )}

      {loading && <p>Cargando...</p>}
      {!loading && current.length === 0 && (
        <div className="card" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-tertiary)' }}>
          {tab === 'toDecide' && 'No hay solicitudes esperando tu decisión.'}
          {tab === 'awaiting' && 'No hay solicitudes en curso.'}
          {tab === 'history' && 'No hay solicitudes decididas todavía.'}
        </div>
      )}

      <div style={{ display: 'grid', gap: '0.75rem' }}>
        {current.map((a) => (
          <ApprovalCard
            key={a.id}
            approval={a}
            doc={docs[a.entity_id]}
            requester={members[a.requested_by]}
            decider={a.decided_by ? members[a.decided_by] : null}
            myId={myId}
            canDecide={canDecide}
            onApprove={() => handleApprove(a)}
            onReject={() => handleReject(a)}
            onCancel={() => handleCancel(a)}
          />
        ))}
      </div>
    </div>
  )
}

function TabBtn({ active, onClick, icon: Icon, label, highlight }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent', border: 'none',
        borderBottom: active ? '2px solid var(--primary-color)' : '2px solid transparent',
        padding: '0.75rem 1rem',
        color: active ? 'var(--primary-color)' : 'var(--text-secondary)',
        cursor: 'pointer', fontWeight: active ? 600 : 400,
        display: 'flex', alignItems: 'center', gap: '0.5rem',
        position: 'relative',
      }}
    >
      <Icon size={16} /> {label}
      {highlight && (
        <span style={{
          position: 'absolute', top: '0.5rem', right: '0.25rem',
          width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary-color)'
        }} />
      )}
    </button>
  )
}

function ApprovalCard({ approval, doc, requester, decider, myId, canDecide, onApprove, onReject, onCancel }) {
  const isMine = approval.requested_by === myId
  const isPending = approval.status === 'pending'
  const canDecideThis = isPending && canDecide && !isMine

  const statusColor = {
    pending: 'var(--primary-color)',
    approved: 'var(--success-text, #16a34a)',
    rejected: 'var(--danger-text)',
    cancelled: 'var(--text-tertiary)',
  }[approval.status]

  const statusLabel = {
    pending: 'Pendiente',
    approved: 'Aprobado',
    rejected: 'Rechazado',
    cancelled: 'Cancelado',
  }[approval.status]

  return (
    <div className="card" style={{ padding: '1rem', borderLeft: `4px solid ${statusColor}` }}>
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
            <span style={{ background: statusColor, color: 'white', padding: '0.15rem 0.5rem', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
              {statusLabel}
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {ENTITY_LABELS[approval.entity_type] || approval.entity_type}
            </span>
          </div>
          <h3 style={{ margin: '0.25rem 0', fontSize: '1.05rem' }}>
            {doc ? `${doc.code} — ${doc.title} (v${doc.version})` : approval.entity_id}
          </h3>
          <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '0.5rem' }}>
            Solicitado por <strong>{requester?.full_name || '?'}</strong> · {new Date(approval.requested_at).toLocaleString()}
          </div>
          {approval.requester_note && (
            <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontStyle: 'italic', marginTop: '0.25rem' }}>
              Nota: "{approval.requester_note}"
            </div>
          )}
          {approval.status !== 'pending' && (
            <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'var(--bg-color)', borderRadius: '4px', fontSize: '0.85rem' }}>
              Decidido por <strong>{decider?.full_name || '?'}</strong> el {new Date(approval.decided_at).toLocaleString()}
              {approval.decision_comment && <div style={{ fontStyle: 'italic', marginTop: '0.25rem' }}>"{approval.decision_comment}"</div>}
              {approval.content_hash && (
                <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: '0.25rem', fontFamily: 'monospace' }}>
                  hash: {approval.content_hash.substring(0, 16)}…
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {canDecideThis && (
            <>
              <button className="btn btn-primary" onClick={onApprove} style={{ padding: '0.4rem 0.75rem' }}>
                <ShieldCheck size={14} /> Aprobar
              </button>
              <button className="btn" onClick={onReject} style={{ padding: '0.4rem 0.75rem', color: 'var(--danger-text)' }}>
                <ShieldOff size={14} /> Rechazar
              </button>
            </>
          )}
          {isPending && isMine && (
            <button className="btn" onClick={onCancel} style={{ padding: '0.4rem 0.75rem' }}>
              <Trash2 size={14} /> Cancelar
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
