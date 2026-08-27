// =============================================================================
// WorkOrderTimeline — timeline de eventos + adjuntos para una fila operativa.
//
// Se integra al pie del detalle de cada modulo (customer_orders,
// production_orders, qc_inspections) para mostrar la trazabilidad end-to-end
// con nombres de responsables, fechas y evidencias.
//
// Uso:
//   <WorkOrderTimeline sourceTable="customer_orders" sourceId={order.id} />
// =============================================================================

import { useEffect, useState, useRef } from 'react'
import { useOrg } from '../OrgContext'
import { can } from '../lib/roles'
import { toast } from '../lib/toast'
import { confirm } from '../lib/confirm'
import {
  Clock, User, Paperclip, ExternalLink, Trash2, Plus, Upload, Link as LinkIcon,
  Loader2, X, MessageSquare, FileText, Download,
} from 'lucide-react'
import {
  fetchTimeline, addEvent, deleteEvent, uploadAttachment, addLink,
  deleteAttachment, signedUrlFor, eventTypesForTable, EVENT_TYPES,
  fmtSize, fmtDateTime,
} from '../lib/workOrderEvents'

// El operator puede escribir. Auditor solo lee. Owner/QM ambas.
function useCanWriteTimeline(role) {
  return can(role, 'work_order_events', 'write')
}

export default function WorkOrderTimeline({ sourceTable, sourceId, compact = false }) {
  const { org, role, impersonating } = useOrg()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const canWrite = useCanWriteTimeline(role) && !impersonating

  const load = async () => {
    if (!sourceId) return
    setLoading(true)
    try {
      const data = await fetchTimeline({ sourceTable, sourceId })
      setEvents(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [sourceTable, sourceId])

  const handleAdded = () => {
    setShowForm(false)
    load()
  }

  const handleDelete = async (ev) => {
    const ok = await confirm({
      title: 'Eliminar evento',
      message: '¿Eliminar este evento del timeline? Se borran también sus adjuntos (archivos incluidos). Esta acción es irreversible.',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteEvent(ev.id)
      toast.success('Evento eliminado')
      load()
    } catch (e) {
      toast.error('Error: ' + e.message)
    }
  }

  return (
    <div style={{
      background: 'white',
      border: '1px solid #e2e8f0',
      borderRadius: '10px',
      padding: compact ? '16px' : '20px',
      marginTop: '16px',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Clock size={18} color="#4f46e5" />
          <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: '#0f172a' }}>
            Historial y evidencias
          </h3>
          <span style={{ fontSize: '12px', color: '#64748b' }}>
            ({events.length} {events.length === 1 ? 'evento' : 'eventos'})
          </span>
        </div>
        {canWrite && !showForm && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              background: '#4f46e5', color: 'white', border: 'none',
              padding: '6px 12px', borderRadius: '6px', fontSize: '12px',
              fontWeight: 600, cursor: 'pointer',
            }}
          >
            <Plus size={14} /> Nuevo evento
          </button>
        )}
      </div>

      {showForm && (
        <NewEventForm
          sourceTable={sourceTable}
          sourceId={sourceId}
          orgId={org?.id}
          onDone={handleAdded}
          onCancel={() => setShowForm(false)}
        />
      )}

      {loading && (
        <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8' }}>
          <Loader2 size={18} className="animate-spin" style={{ display: 'inline-block', verticalAlign: 'middle' }} />
          <span style={{ marginLeft: '6px', fontSize: '13px' }}>Cargando timeline…</span>
        </div>
      )}
      {error && (
        <div style={{ padding: '12px', color: '#991b1b', background: '#fef2f2', borderRadius: '6px', fontSize: '13px' }}>
          Error: {error}
        </div>
      )}
      {!loading && !error && events.length === 0 && (
        <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>
          Sin eventos aún. {canWrite && 'Registrá el primero para arrancar la trazabilidad.'}
        </div>
      )}

      {events.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '8px' }}>
          {events.map(ev => (
            <EventRow
              key={ev.id}
              event={ev}
              canDelete={canWrite}
              onDelete={() => handleDelete(ev)}
              onAttachmentChange={load}
              orgId={org?.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────

function EventRow({ event, canDelete, onDelete, onAttachmentChange, orgId }) {
  const meta = EVENT_TYPES[event.event_type] || { label: event.event_type, color: '#64748b' }
  const [addingAttachment, setAddingAttachment] = useState(false)

  return (
    <div style={{
      padding: '12px',
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      borderRadius: '8px',
      borderLeft: `4px solid ${meta.color}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span style={{
              background: meta.color,
              color: 'white',
              fontSize: '11px',
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: '4px',
              letterSpacing: '0.02em',
            }}>
              {meta.label}
            </span>
            <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <User size={11} />
              {event.performed_by_name || 'Sistema'}
              {event.performed_by_role && (
                <span style={{ color: '#94a3b8' }}>· {event.performed_by_role.replace('_', ' ')}</span>
              )}
            </span>
            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
              {fmtDateTime(event.created_at)}
            </span>
          </div>
          {event.notes && (
            <div style={{
              marginTop: '6px',
              fontSize: '13px',
              color: '#334155',
              lineHeight: 1.5,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}>
              {event.notes}
            </div>
          )}
        </div>
        {canDelete && (
          <button
            onClick={onDelete}
            title="Eliminar evento"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '4px',
              borderRadius: '4px',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#dc2626' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94a3b8' }}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      {event.attachments && event.attachments.length > 0 && (
        <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {event.attachments.map(a => (
            <AttachmentRow
              key={a.id}
              attachment={a}
              canDelete={canDelete}
              onDelete={onAttachmentChange}
            />
          ))}
        </div>
      )}

      {canDelete && (
        <div style={{ marginTop: '8px' }}>
          {addingAttachment ? (
            <AttachmentForm
              eventId={event.id}
              orgId={orgId}
              onDone={() => { setAddingAttachment(false); onAttachmentChange() }}
              onCancel={() => setAddingAttachment(false)}
            />
          ) : (
            <button
              onClick={() => setAddingAttachment(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '4px',
                background: 'transparent', border: '1px dashed #cbd5e1',
                color: '#64748b', padding: '4px 10px', borderRadius: '4px',
                fontSize: '11px', cursor: 'pointer',
              }}
            >
              <Paperclip size={12} /> Agregar evidencia
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function AttachmentRow({ attachment, canDelete, onDelete }) {
  const isFile = attachment.kind === 'file'
  const [opening, setOpening] = useState(false)

  const open = async () => {
    setOpening(true)
    try {
      if (isFile) {
        const url = await signedUrlFor(attachment.storage_path)
        window.open(url, '_blank', 'noopener,noreferrer')
      } else {
        window.open(attachment.external_url, '_blank', 'noopener,noreferrer')
      }
    } catch (e) {
      toast.error('No se pudo abrir: ' + e.message)
    } finally {
      setOpening(false)
    }
  }

  const handleDelete = async () => {
    const ok = await confirm({
      title: 'Eliminar evidencia',
      message: isFile ? '¿Eliminar este archivo? Se borra permanentemente.' : '¿Eliminar este link?',
      danger: true,
    })
    if (!ok) return
    try {
      await deleteAttachment(attachment)
      toast.success('Evidencia eliminada')
      onDelete()
    } catch (e) {
      toast.error('Error: ' + e.message)
    }
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px',
      padding: '6px 10px', background: 'white',
      border: '1px solid #e2e8f0', borderRadius: '6px',
      fontSize: '12px',
    }}>
      {isFile ? <FileText size={13} color="#4f46e5" /> : <LinkIcon size={13} color="#4f46e5" />}
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#334155' }}>
        {attachment.filename || (isFile ? 'Archivo sin nombre' : attachment.external_url)}
      </span>
      {attachment.size_bytes && (
        <span style={{ color: '#94a3b8', fontSize: '11px' }}>{fmtSize(attachment.size_bytes)}</span>
      )}
      <button
        onClick={open}
        disabled={opening}
        title={isFile ? 'Descargar' : 'Abrir link'}
        style={{ background: 'transparent', border: 'none', color: '#4f46e5', cursor: 'pointer', padding: '2px' }}
      >
        {opening ? <Loader2 size={13} className="animate-spin" /> : (isFile ? <Download size={13} /> : <ExternalLink size={13} />)}
      </button>
      {canDelete && (
        <button
          onClick={handleDelete}
          title="Eliminar"
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '2px' }}
          onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
          onMouseLeave={e => e.currentTarget.style.color = '#94a3b8'}
        >
          <Trash2 size={12} />
        </button>
      )}
    </div>
  )
}

// ─── Forms ───────────────────────────────────────────────────────────────────

function NewEventForm({ sourceTable, sourceId, orgId, onDone, onCancel }) {
  const [eventType, setEventType] = useState('comment')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState('')
  const options = eventTypesForTable(sourceTable)

  const handleSubmit = async () => {
    if (saving) return
    setSaving(true)
    try {
      const eventId = await addEvent({ sourceTable, sourceId, eventType, notes: notes || null })
      // Adjuntar archivo si hay
      if (file) {
        await uploadAttachment({ orgId, eventId, file })
      }
      // Adjuntar link si hay
      if (url.trim()) {
        await addLink({ eventId, url: url.trim() })
      }
      toast.success('Evento registrado')
      onDone()
    } catch (e) {
      toast.error('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      background: '#f5f3ff', border: '1px solid #ddd6fe',
      borderRadius: '8px', padding: '14px', marginBottom: '12px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '13px', fontWeight: 700, color: '#5b21b6' }}>Nuevo evento en el historial</span>
        <button onClick={onCancel} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#7c3aed' }}>
          <X size={16} />
        </button>
      </div>
      <div style={{ display: 'grid', gap: '8px' }}>
        <div>
          <label style={fieldLabel}>Tipo de evento</label>
          <select
            value={eventType}
            onChange={e => setEventType(e.target.value)}
            style={fieldInput}
          >
            {options.map(o => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={fieldLabel}>Comentario / notas (opcional)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={2}
            placeholder="Ej: OK a producción. Cliente aprobó plano rev 2."
            style={{ ...fieldInput, resize: 'vertical', minHeight: '44px' }}
          />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <label style={fieldLabel}>Adjuntar archivo (opcional)</label>
            <input
              type="file"
              onChange={e => setFile(e.target.files?.[0] || null)}
              style={{ fontSize: '12px', color: '#334155', width: '100%' }}
            />
          </div>
          <div>
            <label style={fieldLabel}>O pegar link externo</label>
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://drive.google.com/…"
              style={fieldInput}
            />
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
        <button onClick={onCancel} style={btnGhost}>Cancelar</button>
        <button
          onClick={handleSubmit}
          disabled={saving}
          style={{ ...btnPrimary, opacity: saving ? 0.6 : 1, cursor: saving ? 'not-allowed' : 'pointer' }}
        >
          {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          {saving ? 'Guardando…' : 'Registrar evento'}
        </button>
      </div>
    </div>
  )
}

function AttachmentForm({ eventId, orgId, onDone, onCancel }) {
  const [mode, setMode] = useState('file')  // 'file' | 'link'
  const [file, setFile] = useState(null)
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)

  const handleSubmit = async () => {
    if (saving) return
    setSaving(true)
    try {
      if (mode === 'file') {
        if (!file) throw new Error('Elegí un archivo')
        await uploadAttachment({ orgId, eventId, file })
      } else {
        if (!url.trim()) throw new Error('Pegá una URL')
        await addLink({ eventId, url: url.trim() })
      }
      toast.success('Evidencia agregada')
      onDone()
    } catch (e) {
      toast.error('Error: ' + e.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px',
      padding: '8px', background: 'white', border: '1px dashed #cbd5e1',
      borderRadius: '6px',
    }}>
      <select value={mode} onChange={e => setMode(e.target.value)} style={{ fontSize: '11px', padding: '4px 6px' }}>
        <option value="file">Archivo</option>
        <option value="link">Link externo</option>
      </select>
      {mode === 'file' ? (
        <input
          ref={inputRef}
          type="file"
          onChange={e => setFile(e.target.files?.[0] || null)}
          style={{ fontSize: '11px' }}
        />
      ) : (
        <input
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://…"
          style={{ fontSize: '11px', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: '4px', minWidth: '240px' }}
        />
      )}
      <button onClick={handleSubmit} disabled={saving} style={{ ...btnPrimary, padding: '4px 10px', fontSize: '11px' }}>
        {saving ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
        {saving ? 'Subiendo…' : 'Subir'}
      </button>
      <button onClick={onCancel} style={{ ...btnGhost, padding: '4px 10px', fontSize: '11px' }}>Cancelar</button>
    </div>
  )
}

// ─── Estilos compartidos ─────────────────────────────────────────────────────

const fieldLabel = {
  display: 'block',
  fontSize: '11px',
  fontWeight: 600,
  color: '#475569',
  marginBottom: '3px',
  textTransform: 'uppercase',
  letterSpacing: '0.03em',
}
const fieldInput = {
  width: '100%',
  padding: '6px 8px',
  border: '1px solid #cbd5e1',
  borderRadius: '6px',
  fontSize: '13px',
  color: '#0f172a',
  background: 'white',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}
const btnPrimary = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  background: '#4f46e5',
  color: 'white',
  border: 'none',
  padding: '6px 12px',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: 600,
  cursor: 'pointer',
}
const btnGhost = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  background: 'transparent',
  color: '#64748b',
  border: '1px solid #cbd5e1',
  padding: '6px 12px',
  borderRadius: '6px',
  fontSize: '12px',
  fontWeight: 500,
  cursor: 'pointer',
}
