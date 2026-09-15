// Tipos de proceso del mapa (4.4). La IA, los seeds o datos viejos traen
// variantes ("Estrategico", "Apoyo", "Misional", "Clave", "Strategic") que no
// coincidían con los filtros exactos: el proceso desaparecía de las tarjetas y
// de los contadores, o se reclasificaba como Operativo sin avisar.
export const PROCESS_TYPES = ['Estratégico', 'Operativo', 'Soporte']

export function normalizeProcessType(value, fallback = null) {
  const v = String(value || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (!v) return fallback
  if (/^(estrateg|direcci|gerenc|strateg|management)/.test(v)) return 'Estratégico'
  if (/^(operativ|operaci|misional|clave|core|realizaci|operat|product)/.test(v)) return 'Operativo'
  if (/^(soporte|apoyo|support)/.test(v)) return 'Soporte'
  return fallback
}
