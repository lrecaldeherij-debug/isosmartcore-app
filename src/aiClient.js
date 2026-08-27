// Cliente IA para IsoSmartCore.
// Las llamadas pasan por una Edge Function de Supabase para que la API key del
// proveedor de IA viva sólo en el servidor (nunca en el bundle del cliente).
//
// Firma pública:  consultarIA(prompt, systemContext?) → Promise<string>
// Si hay error, devuelve un JSON serializado con la forma { error: "..." } para
// preservar el contrato que esperan los componentes existentes.
//
// Todo el `prompt` pasa por sanitizeUserPrompt() para neutralizar prompt
// injection y envolverlo en delimitadores. El `systemContext` viene del
// código, no del user — no se sanitiza.

import { supabase } from './supabaseClient'
import { sanitizeUserPrompt } from './lib/sanitizePrompt'

export async function consultarIA(prompt, systemContext = '') {
  const { sanitized, warnings, wasModified } = sanitizeUserPrompt(prompt)

  // Loguear solo cuando el sanitizer modificó algo, para no ensuciar la
  // consola. En un futuro esto puede ir a telemetría agregada.
  if (wasModified && warnings.length > 0) {
    console.info('[aiClient] sanitizer applied:', warnings.join(', '))
  }

  try {
    const { data, error } = await supabase.functions.invoke('gemini-proxy', {
      body: { prompt: sanitized, systemContext },
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
