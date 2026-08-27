// =============================================================================
// Helper: indexar / desindexar filas en rag_chunks después de cada mutación
// en las tablas fuente del RAG (risk_matrix, non_conformities, documents_versions).
//
// Diseño fire-and-forget: NO bloquea la UI. Loguea errores a consola pero no
// muestra toast al user — el copilot puede quedar 1 pregunta atrasado hasta
// que el próximo cambio dispare la actualización. Peor caso: el user tiene
// que ir al panel /admin y darle a "Reindexar todo".
//
// Uso típico:
//   const { error } = await supabase.from('risk_matrix').insert([payload]).select().single()
//   if (!error) indexRow('risk_matrix', inserted.id)
//
// Para delete:
//   await supabase.from('risk_matrix').delete().eq('id', x)
//   deindexRow('risk_matrix', x)
// =============================================================================

import { supabase } from '../supabaseClient'

const ALLOWED = new Set(['risk_matrix', 'non_conformities', 'documents_versions'])

/**
 * Reindexar una fila (útil después de insert o update).
 * @param {string} sourceTable
 * @param {string} sourceId - UUID de la fila
 */
export function indexRow(sourceTable, sourceId) {
  if (!ALLOWED.has(sourceTable) || !sourceId) return
  // Fire-and-forget. Sin await intencional.
  supabase.functions.invoke('embed-and-index', {
    body: { source_table: sourceTable, source_id: sourceId },
  }).then(({ data, error }) => {
    if (error) {
      console.warn(`[ragIndex] ${sourceTable}/${sourceId} falló:`, error.message)
      return
    }
    if (data?.indexed === false) {
      // "empty_content" o "unchanged" — no es error, solo info.
      console.debug(`[ragIndex] ${sourceTable}/${sourceId}: ${data.reason}`)
    }
  }).catch(err => {
    console.warn(`[ragIndex] ${sourceTable}/${sourceId} excepción:`, err.message)
  })
}

/**
 * Borrar el chunk asociado (útil después de delete).
 * @param {string} sourceTable
 * @param {string} sourceId
 */
export function deindexRow(sourceTable, sourceId) {
  if (!ALLOWED.has(sourceTable) || !sourceId) return
  supabase.functions.invoke('embed-and-index', {
    body: { source_table: sourceTable, source_id: sourceId, operation: 'delete' },
  }).then(({ error }) => {
    if (error) console.warn(`[ragIndex/delete] ${sourceTable}/${sourceId} falló:`, error.message)
  }).catch(err => {
    console.warn(`[ragIndex/delete] ${sourceTable}/${sourceId} excepción:`, err.message)
  })
}
