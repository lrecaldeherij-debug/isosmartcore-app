// =============================================================================
// NotificationBell — campanita del header con badge de no-leidas + dropdown.
//
// Uso:
//   <NotificationBell onNavigate={(view) => setVistaActual(view)} />
//
// Polling: refresca el unreadCount cada 60s. Cuando el user abre el dropdown,
// hace fetch fresh + marca las visibles como leidas al colapsar (opcional).
// =============================================================================

import { useEffect, useRef, useState } from 'react'
import { Bell, X, Check, CheckCheck, ShieldAlert, Package, Factory, ClipboardCheck, Trash2 } from 'lucide-react'
import {
  fetchNotifications, unreadCount, markAsRead, markAllAsRead, deleteNotification,
  viewForNotification,
} from '../lib/notifications'
import { toast } from '../lib/toast'
import { fmtDateTime } from '../lib/workOrderEvents'

const POLL_MS = 60_000

export default function NotificationBell({ onNavigate }) {
  const [open, setOpen] = useState(false)
  const [notifs, setNotifs] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Poll del count (barato, solo count via head:true).
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const c = await unreadCount()
        if (!cancelled && mountedRef.current) setCount(c)
      } catch {
        // silencio: si falla el poll no vale la pena molestar al user
      }
    }
    tick()
    const iv = setInterval(tick, POLL_MS)
    return () => { cancelled = true; clearInterval(iv) }
  }, [])

  // Cerrar al click afuera
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next) {
      setLoading(true)
      try {
        const data = await fetchNotifications({ limit: 30 })
        if (mountedRef.current) setNotifs(data)
      } catch (e) {
        toast.error('No se pudieron cargar las notificaciones')
      } finally {
        if (mountedRef.current) setLoading(false)
      }
    }
  }

  const handleClick = async (notif) => {
    // Marca como leida optimistamente + navega si aplica
    if (!notif.read_at) {
      setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, read_at: new Date().toISOString() } : n))
      setCount(c => Math.max(0, c - 1))
      try { await markAsRead(notif.id) } catch { /* revertir seria molesto, el poll corrige */ }
    }
    const view = viewForNotification(notif)
    if (view && onNavigate) {
      onNavigate(view)
      setOpen(false)
    }
  }

  const handleMarkAll = async () => {
    const previous = notifs
    setNotifs(prev => prev.map(n => n.read_at ? n : { ...n, read_at: new Date().toISOString() }))
    setCount(0)
    try {
      await markAllAsRead()
    } catch (e) {
      setNotifs(previous)
      toast.error('No se pudo marcar todo como leído')
    }
  }

  const handleDelete = async (e, notif) => {
    e.stopPropagation()
    const previous = notifs
    setNotifs(prev => prev.filter(n => n.id !== notif.id))
    if (!notif.read_at) setCount(c => Math.max(0, c - 1))
    try {
      await deleteNotification(notif.id)
    } catch {
      setNotifs(previous)
      toast.error('No se pudo eliminar')
    }
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={toggle}
        title="Notificaciones"
        aria-label={`Notificaciones${count > 0 ? ` (${count} sin leer)` : ''}`}
        style={{
          position: 'relative',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          padding: '6px',
          borderRadius: '6px',
          color: 'var(--text-secondary, #64748b)',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <Bell size={18} />
        {count > 0 && (
          <span style={{
            position: 'absolute',
            top: '2px',
            right: '2px',
            minWidth: '16px',
            height: '16px',
            padding: '0 4px',
            background: '#dc2626',
            color: 'white',
            borderRadius: '10px',
            fontSize: '10px',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid white',
            boxSizing: 'content-box',
          }}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 6px)',
          right: 0,
          width: '340px',
          maxHeight: '480px',
          background: 'white',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          boxShadow: '0 10px 30px rgba(15, 23, 42, 0.15)',
          zIndex: 9999,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          <div style={{
            padding: '10px 14px',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: '#f8fafc',
          }}>
            <span style={{ fontWeight: 700, fontSize: '13px', color: '#0f172a' }}>Notificaciones</span>
            <div style={{ display: 'flex', gap: '6px' }}>
              {count > 0 && (
                <button
                  onClick={handleMarkAll}
                  title="Marcar todas como leídas"
                  style={iconBtn}
                >
                  <CheckCheck size={14} />
                </button>
              )}
              <button onClick={() => setOpen(false)} title="Cerrar" style={iconBtn}>
                <X size={14} />
              </button>
            </div>
          </div>

          <div style={{ overflowY: 'auto', flex: 1 }}>
            {loading ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                Cargando…
              </div>
            ) : notifs.length === 0 ? (
              <div style={{ padding: '30px 20px', textAlign: 'center', color: '#94a3b8', fontSize: '12px' }}>
                Sin notificaciones.
              </div>
            ) : (
              notifs.map(n => (
                <NotifRow
                  key={n.id}
                  notif={n}
                  onClick={() => handleClick(n)}
                  onDelete={(e) => handleDelete(e, n)}
                />
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function NotifRow({ notif, onClick, onDelete }) {
  const isRead = !!notif.read_at
  const Icon = iconFor(notif)
  const color = notif.kind === 'segregation_conflict' ? '#b45309' : '#4f46e5'

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 14px',
        borderBottom: '1px solid #f1f5f9',
        cursor: 'pointer',
        display: 'flex',
        gap: '10px',
        background: isRead ? 'white' : '#eef2ff',
        transition: 'background 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.background = isRead ? '#f8fafc' : '#e0e7ff'}
      onMouseLeave={e => e.currentTarget.style.background = isRead ? 'white' : '#eef2ff'}
    >
      <div style={{
        flexShrink: 0,
        width: '28px', height: '28px',
        borderRadius: '50%',
        background: color + '22',
        color,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <Icon size={14} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: '12.5px',
          fontWeight: isRead ? 500 : 700,
          color: '#0f172a',
          lineHeight: 1.35,
        }}>
          {notif.title}
        </div>
        {notif.body && (
          <div style={{
            fontSize: '11.5px',
            color: '#64748b',
            marginTop: '3px',
            lineHeight: 1.4,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}>
            {notif.body}
          </div>
        )}
        <div style={{ fontSize: '10.5px', color: '#94a3b8', marginTop: '4px' }}>
          {fmtDateTime(notif.created_at)}
        </div>
      </div>
      <button
        onClick={onDelete}
        title="Eliminar"
        style={{
          background: 'transparent', border: 'none', color: '#cbd5e1',
          cursor: 'pointer', padding: '4px', alignSelf: 'flex-start',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#dc2626'}
        onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}
      >
        <Trash2 size={11} />
      </button>
    </div>
  )
}

function iconFor(notif) {
  if (notif.kind === 'segregation_conflict') return ShieldAlert
  switch (notif.source_table) {
    case 'customer_orders':   return Package
    case 'production_orders': return Factory
    case 'qc_inspections':    return ClipboardCheck
    default:                  return Check
  }
}

const iconBtn = {
  background: 'transparent',
  border: 'none',
  color: '#64748b',
  cursor: 'pointer',
  padding: '4px',
  borderRadius: '4px',
  display: 'inline-flex',
  alignItems: 'center',
}
