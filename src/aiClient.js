// Cliente IA para IsoSmartCore.
// Las llamadas pasan por una Edge Function de Supabase para que la API key del
// proveedor de IA viva sólo en el servidor (nunca en el bundle del cliente).
//
// Firma pública:  consultarIA(prompt, systemContext?) → Promise<string>
// Si hay error, devuelve un JSON serializado con la forma { error: "..." } para
// preservar el contrato que esperan los componentes existentes.

import { supabase } from './supabaseClient'

export async function consultarIA(prompt, systemContext = '') {
  try {
    const { data, error } = await supabase.functions.invoke('gemini-proxy', {
      body: { prompt, systemContext },
    })

    if (error) {
      console.warn('Error invocando el proxy IA:', error)
      return JSON.stringify({
        error: `❌ Error de IA: ${error.message || 'fallo al invocar la función'}`,
      })
    }

    if (data?.error) {
      return JSON.stringify({ error: `❌ ${data.error}` })
    }

    if (typeof data?.text === 'string') {
      return data.text
    }

    return JSON.stringify({ error: '❌ Respuesta vacía del proxy IA.' })
  } catch (e) {
    console.warn('Excepción en consultarIA:', e)
    return JSON.stringify({ error: `❌ Error de red: ${e.message}` })
  }
}
