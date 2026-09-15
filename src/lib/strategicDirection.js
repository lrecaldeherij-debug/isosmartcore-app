// Misión y visión viven en la única columna company_profile.strategic_direction
// con el formato:
//
//   Misión: ...
//
//   Visión: ...
//
// Así no hace falta migración y los que ya leen strategic_direction (IA de
// onboarding, FODA, snapshot del auditor) reciben ambas etiquetadas.
// Un texto sin etiquetas (cargado antes de este cambio, o desde el onboarding)
// se trata como "legado" y se muestra entero en Misión.

const MISSION_RE = /^\s*misi[oó]n\s*:\s*/i
const VISION_SPLIT_RE = /\n\s*visi[oó]n\s*:\s*/i
const VISION_ONLY_RE = /^\s*visi[oó]n\s*:\s*/i

export function parseStrategicDirection(text) {
  const raw = (text || '').trim()
  if (!raw) return { mission: '', vision: '', legacy: false }

  if (MISSION_RE.test(raw)) {
    const body = raw.replace(MISSION_RE, '')
    const split = body.split(VISION_SPLIT_RE)
    return {
      mission: split[0].trim(),
      vision: split.slice(1).join('\n').trim(),
      legacy: false,
    }
  }
  if (VISION_ONLY_RE.test(raw)) {
    return { mission: '', vision: raw.replace(VISION_ONLY_RE, '').trim(), legacy: false }
  }
  return { mission: raw, vision: '', legacy: true }
}

export function composeStrategicDirection({ mission, vision }) {
  const parts = []
  if (mission?.trim()) parts.push(`Misión: ${mission.trim()}`)
  if (vision?.trim()) parts.push(`Visión: ${vision.trim()}`)
  return parts.join('\n\n')
}
