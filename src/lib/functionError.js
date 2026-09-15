// Mensaje legible de un error de supabase.functions.invoke().
//
// Con respuestas 4xx/5xx supabase-js pone un mensaje genérico ("Edge Function
// returned a non-2xx status code") y deja el cuerpo real en error.context (un
// Response). Ahí viene la causa concreta que hay que mostrar al usuario.
export async function readFunctionError(error, fallback = 'Error inesperado') {
  if (!error) return null
  try {
    const body = await error.context?.clone?.().json?.()
    if (typeof body?.error === 'string' && body.error) return body.error
  } catch { /* cuerpo no JSON */ }
  if (error.name === 'FunctionsFetchError') {
    return 'No se pudo contactar al servidor. Revisá tu conexión e intentá de nuevo.'
  }
  return error.message || fallback
}
