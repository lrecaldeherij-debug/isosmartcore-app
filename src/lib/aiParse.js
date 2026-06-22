// =============================================================================
// Parser robusto para respuestas JSON de la IA.
//
// El bug histórico: priorizar siempre `[` sobre `{` rompe cuando la IA
// devuelve un objeto que contiene un array adentro (ej. { five_whys: [...] }).
// El parser arrancaba en el `[` interno y devolvía el array embebido como si
// fuera el resultado, haciendo que parseAiObject() devuelva null.
//
// Esta versión:
// - Limpia code fences de markdown ```json ... ```
// - Permite indicar `prefer: 'object' | 'array'` para casos en que sabemos qué esperamos
// - Si el primer hit no parsea, avanza y prueba el siguiente
// =============================================================================

function extractJsonAt(text, start) {
  if (start < 0 || start >= text.length) return null
  let depth = 0, inStr = false, esc = false
  const open = text[start]
  const close = open === '[' ? ']' : '}'
  for (let i = start; i < text.length; i++) {
    const c = text[i]
    if (esc) { esc = false; continue }
    if (c === '\\') { esc = true; continue }
    if (c === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)) } catch { return null }
      }
    }
  }
  return null
}

function firstIndex(text, ch, from = 0) {
  const i = text.indexOf(ch, from)
  return i === -1 ? Infinity : i
}

export function extractFirstJson(text, prefer) {
  if (!text) return null
  const cleaned = String(text).replace(/```(?:json)?\s*/gi, '').replace(/```/g, '')
  let pos = 0
  while (pos < cleaned.length) {
    const iObj = firstIndex(cleaned, '{', pos)
    const iArr = firstIndex(cleaned, '[', pos)
    if (iObj === Infinity && iArr === Infinity) return null
    let start
    if (prefer === 'object') start = iObj === Infinity ? iArr : iObj
    else if (prefer === 'array') start = iArr === Infinity ? iObj : iArr
    else start = Math.min(iObj, iArr)
    const parsed = extractJsonAt(cleaned, start)
    if (parsed !== null) return parsed
    pos = start + 1
  }
  return null
}

export function parseAiObject(raw) {
  const p = extractFirstJson(raw, 'object')
  if (p && typeof p === 'object' && !Array.isArray(p)) return p
  return null
}

export function parseAiArray(raw) {
  const p = extractFirstJson(raw, 'array')
  if (Array.isArray(p)) return p
  if (p && Array.isArray(p.items)) return p.items
  if (p && Array.isArray(p.patterns)) return p.patterns
  if (p && Array.isArray(p.results)) return p.results
  if (p && Array.isArray(p.data)) return p.data
  return []
}
