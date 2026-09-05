// =============================================================================
// API layer para notifications in-app.
//
// La tabla `notifications` se llena via trigger BD cuando alguien inserta un
// evento en work_order_events. El frontend solo lee y marca como leido.
//
// Uso:
//   import { fetchNotifications, markAsRead, unreadCount } from './lib/notifications'
//   const notifs = await fetchNotifications({ limit: 20 })
//   await markAsRead(notif.id)
// =============================================================================

import { supabase } from '../supabaseClient'

const DEFAULT_LIMIT = 30

export async function fetchNotifications({ limit = DEFAULT_LIMIT, unreadOnly = false } = {}) {
  let q = supabase
    .from('notifications')
    .select('id, kind, source_table, source_id, event_id, title, body, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (unreadOnly) q = q.is('read_at', null)
  const { data, error } = await q
  if (error) throw error
  return data || []
}

export async function unreadCount() {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
  if (error) throw error
  return count || 0
}

export async function markAsRead(id) {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null)  // idempotente: no toca si ya estaba leida
  if (error) throw error
}

export async function markAllAsRead() {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
  if (error) throw error
}

export async function deleteNotification(id) {
  const { error } = await supabase
    .from('notifications')
    .delete()
    .eq('id', id)
  if (error) throw error
}

// Mapeo de kind → vista del router. El header lo usa cuando el user clickea
// una notif para navegar al modulo correcto.
const KIND_TO_VIEW = {
  work_order_event: {
    customer_orders:    'ventas',
    production_orders:  'produccion',
    qc_inspections:     'liberacion',
  },
  segregation_conflict: {
    _default: 'segregacion',
  },
}

export function viewForNotification(notif) {
  const table = notif.source_table
  const map = KIND_TO_VIEW[notif.kind]
  if (!map) return null
  return map[table] || map._default || null
}
