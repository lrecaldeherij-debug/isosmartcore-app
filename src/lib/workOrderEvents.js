// =============================================================================
// API layer para eventos + adjuntos de work_orders (timeline operativo).
//
// Uso desde componentes:
//   import { addEvent, fetchTimeline, uploadAttachment, EVENT_TYPES } from './lib/workOrderEvents'
//   await addEvent({ sourceTable: 'customer_orders', sourceId, eventType: 'approved', notes: 'OK' })
//   const events = await fetchTimeline({ sourceTable, sourceId })
// =============================================================================

import { supabase } from '../supabaseClient'

const BUCKET = 'documents'

// Etiquetas visibles + tipos permitidos por cada tabla operativa.
// Cada evento tiene: label, color, allowedFor[]. El componente Timeline usa
// esto para filtrar el <select> segun el modulo actual.
export const EVENT_TYPES = {
  created:              { label: 'Creado',                color: '#64748b', allowedFor: ['customer_orders', 'production_orders', 'qc_inspections'] },
  approved:             { label: 'Aprobado por calidad',  color: '#16a34a', allowedFor: ['customer_orders'] },
  rejected:             { label: 'Rechazado',             color: '#dc2626', allowedFor: ['customer_orders', 'qc_inspections'] },
  in_production:        { label: 'En producción',         color: '#2563eb', allowedFor: ['customer_orders', 'production_orders'] },
  paused:               { label: 'Producción pausada',    color: '#f59e0b', allowedFor: ['production_orders'] },
  resumed:              { label: 'Producción retomada',   color: '#2563eb', allowedFor: ['production_orders'] },
  released:             { label: 'Liberado por QC',       color: '#16a34a', allowedFor: ['qc_inspections'] },
  conditional_release:  { label: 'Liberación condicional', color: '#f59e0b', allowedFor: ['qc_inspections'] },
  delivered:            { label: 'Entregado al cliente',  color: '#7c3aed', allowedFor: ['customer_orders'] },
  cancelled:            { label: 'Cancelado',             color: '#991b1b', allowedFor: ['customer_orders', 'production_orders'] },
  comment:              { label: 'Comentario',            color: '#0891b2', allowedFor: ['customer_orders', 'production_orders', 'qc_inspections'] },
}

export function eventTypesForTable(sourceTable) {
  return Object.entries(EVENT_TYPES)
    .filter(([, meta]) => meta.allowedFor.includes(sourceTable))
    .map(([key, meta]) => ({ key, ...meta }))
}

// Eventos "de decision" que cuentan para segregacion de funciones (ISO 5.3/7.1.2).
// Comentarios y pausas de produccion no afectan.
export const DECISION_EVENT_TYPES = new Set([
  'created', 'approved', 'released', 'conditional_release', 'delivered', 'rejected',
])

// ─── Timeline: lectura ───

export async function fetchTimeline({ sourceTable, sourceId }) {
  const { data, error } = await supabase
    .from('work_order_events')
    .select('id, event_type, performed_by, performed_by_name, performed_by_role, notes, same_person, signature_hash, created_at')
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .order('created_at', { ascending: true })
  if (error) throw error
  const events = data || []
  if (events.length === 0) return []
  const { data: att } = await supabase
    .from('work_order_attachments')
    .select('id, event_id, kind, storage_path, external_url, filename, mime_type, size_bytes')
    .in('event_id', events.map(e => e.id))
  const byEvent = new Map()
  for (const a of att || []) {
    if (!byEvent.has(a.event_id)) byEvent.set(a.event_id, [])
    byEvent.get(a.event_id).push(a)
  }
  return events.map(e => ({ ...e, attachments: byEvent.get(e.id) || [] }))
}

// ─── Segregacion de funciones: pre-check ───
//
// Devuelve { isConflict: bool, previousEvent: {...}|null } — el UI decide si
// muestra warning modal antes de escribir. El trigger BD calcula el flag real
// (fuente unica de verdad); esto es solo para UX.
export async function checkSegregation({ sourceTable, sourceId, eventType }) {
  if (!DECISION_EVENT_TYPES.has(eventType)) return { isConflict: false, previousEvent: null }
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { isConflict: false, previousEvent: null }
  const { data } = await supabase
    .from('work_order_events')
    .select('event_type, performed_by_name, performed_by_role, created_at')
    .eq('source_table', sourceTable)
    .eq('source_id', sourceId)
    .eq('performed_by', user.id)
    .in('event_type', Array.from(DECISION_EVENT_TYPES))
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return { isConflict: !!data, previousEvent: data || null }
}

// ─── Eventos: escritura ───

export async function addEvent({ sourceTable, sourceId, eventType, notes = null }) {
  // Snapshot del user actual + nombre y rol (para que quede en el historial
  // aunque el user despues cambie de rol o se elimine).
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Sesión expirada')

  let performedByName = null
  let performedByRole = null
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('full_name, role')
    .eq('user_id', user.id)
    .maybeSingle()
  if (profile) {
    performedByName = profile.full_name
    performedByRole = profile.role
  }

  const { data, error } = await supabase
    .from('work_order_events')
    .insert({
      source_table: sourceTable,
      source_id: sourceId,
      event_type: eventType,
      performed_by: user.id,
      performed_by_name: performedByName,
      performed_by_role: performedByRole,
      notes,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function deleteEvent(eventId) {
  // Los adjuntos se borran por CASCADE. Los archivos en Storage quedan
  // huerfanos — los limpiamos aca.
  const { data: attachments } = await supabase
    .from('work_order_attachments')
    .select('storage_path')
    .eq('event_id', eventId)
    .eq('kind', 'file')
  const paths = (attachments || []).map(a => a.storage_path).filter(Boolean)
  if (paths.length > 0) {
    await supabase.storage.from(BUCKET).remove(paths)
  }
  const { error } = await supabase.from('work_order_events').delete().eq('id', eventId)
  if (error) throw error
}

// ─── Adjuntos: subida ───

export async function uploadAttachment({ orgId, eventId, file }) {
  if (!file) throw new Error('Archivo requerido')
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase()
  const uuid = crypto.randomUUID()
  const path = `${orgId}/work-orders/${eventId}/${uuid}.${ext}`

  const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || 'application/octet-stream',
  })
  if (upErr) throw upErr

  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('work_order_attachments')
    .insert({
      event_id: eventId,
      kind: 'file',
      storage_path: path,
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
      uploaded_by: user?.id,
    })
    .select('id')
    .single()
  if (error) {
    // Rollback: si falla el insert, borrar el archivo subido
    await supabase.storage.from(BUCKET).remove([path])
    throw error
  }
  return data.id
}

export async function addLink({ eventId, url, filename = null }) {
  if (!url) throw new Error('URL requerida')
  try { new URL(url) } catch { throw new Error('URL inválida') }
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('work_order_attachments')
    .insert({
      event_id: eventId,
      kind: 'link',
      external_url: url,
      filename: filename || url,
      uploaded_by: user?.id,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function deleteAttachment(attachment) {
  if (attachment.kind === 'file' && attachment.storage_path) {
    await supabase.storage.from(BUCKET).remove([attachment.storage_path])
  }
  const { error } = await supabase.from('work_order_attachments').delete().eq('id', attachment.id)
  if (error) throw error
}

// ─── Firma digital: verificacion ───
//
// El backend ya calculo signature_hash al hacer INSERT (BEFORE INSERT trigger).
// Esta RPC recalcula con los datos actuales y compara. Si difiere → alguien
// modifico el evento por fuera del flujo (SQL directo, restore, etc.).
// Devuelve { ok, signed, valid, stored_hash, recalc_hash, ... }.
export async function verifyEventSignature(eventId) {
  const { data, error } = await supabase.rpc('verify_event_signature', { p_event_id: eventId })
  if (error) throw error
  return data
}

export async function signedUrlFor(storagePath, ttlSeconds = 60) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, ttlSeconds)
  if (error) throw error
  return data.signedUrl
}

// ─── Helpers de formato ───

export function fmtSize(bytes) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function fmtDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('es-EC', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
