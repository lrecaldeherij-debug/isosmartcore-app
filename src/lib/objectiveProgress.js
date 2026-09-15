// Avance y cumplimiento de objetivos de calidad (6.2 / 9.1.3), único para
// Objetivos, Tablero y Análisis de datos.
//
// Antes cada módulo calculaba distinto y todos asumían "más es mejor":
//   - "Reducir NC a 2/mes" sin línea base, con 5 actuales → 100% cumplido
//   - Meta 0 ("cero accidentes") → siempre 0%
//   - Análisis de datos contaba cumplido si current >= target

const LOWER_UNITS = new Set(['NC/mes', 'ppm'])
const LOWER_TEXT = /\b(reduc|disminu|minimiz|bajar|baja[rn]?\b|menos|evitar|cero|elimin)/i

/**
 * true si el objetivo busca bajar el valor. Con línea base se deduce de la
 * dirección baseline → target; sin ella, por unidad o redacción.
 */
export function isLowerBetter(o) {
  const baseline = toNum(o?.baseline_value)
  const target = toNum(o?.target)
  if (baseline != null && target != null && baseline !== target) return target < baseline
  if (LOWER_UNITS.has(o?.unit)) return true
  const text = `${o?.name || ''} ${o?.objective || ''} ${o?.indicator || ''}`
  return LOWER_TEXT.test(text)
}

function toNum(v) {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Avance 0-100, o null si no hay meta o valor actual. */
export function objectiveProgress(o, currentOverride) {
  const target = toNum(o?.target)
  const current = toNum(currentOverride !== undefined ? currentOverride : o?.current)
  if (target == null || current == null) return null
  const baseline = toNum(o?.baseline_value)
  const lower = isLowerBetter(o)

  if (baseline != null && baseline !== target) {
    const p = ((current - baseline) / (target - baseline)) * 100
    return clamp(p)
  }
  if (lower) {
    if (current <= target) return 100
    // Sin línea base: avance proporcional a lo cerca que está de la meta
    return target === 0 ? 0 : clamp((target / current) * 100)
  }
  if (target === 0) return current >= 0 ? 100 : 0
  return clamp((current / target) * 100)
}

/** Meta alcanzada según la dirección del objetivo. */
export function objectiveMet(o, currentOverride) {
  const target = toNum(o?.target)
  const current = toNum(currentOverride !== undefined ? currentOverride : o?.current)
  if (target == null || current == null) return false
  return isLowerBetter(o) ? current <= target : current >= target
}

function clamp(p) {
  return Math.max(0, Math.min(100, Math.round(p)))
}
