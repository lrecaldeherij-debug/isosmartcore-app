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

/**
 * Clampea un campo numérico devuelto por Gemini al rango [min, max]. Uso:
 *   const parsed = JSON.parse(text)
 *   parsed.probability = clampNumeric(parsed.probability, 1, 5)
 *
 * Cierra finding #26 del audit: la validación de la respuesta IA era
 * shape-only (validaba que existiera el campo pero no el rango). Un usuario
 * podía por injection hacer que Gemini devolviera probability:15 y romper
 * la matriz de riesgo.
 */
export function clampNumeric(value, min, max, fallback = null) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback ?? min
  if (n < min) return min
  if (n > max) return max
  return Math.round(n)  // enteros para escalas ordinales (1-5)
}

/**
 * Trunca un string a maxLen caracteres. Útil para respuestas de Gemini que
 * a veces se pasan del cap declarado en el prompt.
 */
export function clampString(value, maxLen) {
  if (typeof value !== 'string') return ''
  if (value.length <= maxLen) return value
  return value.slice(0, maxLen).trim()
}

export async function consultarIA(prompt, systemContext = '', options = {}) {
  const { sanitized, warnings, wasModified } = sanitizeUserPrompt(prompt)

  // Loguear solo cuando el sanitizer modificó algo, para no ensuciar la
  // consola. En un futuro esto puede ir a telemetría agregada.
  if (wasModified && warnings.length > 0) {
    console.info('[aiClient] sanitizer applied:', warnings.join(', '))
  }

  try {
    // options.expectJson=false permite recibir texto libre (default es true =
    // Gemini fuerza JSON puro via responseMimeType). Los consumers actuales
    // esperan JSON, asi que backward-compat con default true.
    const body = { prompt: sanitized, systemContext }
    if (options.expectJson === false) body.expect_json = false
    const { data, error } = await supabase.functions.invoke('gemini-proxy', {
      body,
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
