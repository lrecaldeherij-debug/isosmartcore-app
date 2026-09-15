// Normalización de categorías FODA compartida (módulo Contexto 4.1, importador
// de documentos y personalizador IA del onboarding).
//
// La categoría define el tipo: Fortaleza/Debilidad = Interno,
// Oportunidad/Amenaza = Externo. La IA y los documentos importados a veces
// devuelven plurales, minúsculas, sin tilde o en inglés; sin normalizar, esos
// factores caían todos en "Fortaleza" o desaparecían de la matriz.

export const SWOT_TYPE = {
  Fortaleza: 'Interno',
  Debilidad: 'Interno',
  Oportunidad: 'Externo',
  Amenaza: 'Externo',
}

const CATEGORY_ALIASES = {
  fortaleza: 'Fortaleza', fortalezas: 'Fortaleza', strength: 'Fortaleza', strengths: 'Fortaleza', f: 'Fortaleza',
  debilidad: 'Debilidad', debilidades: 'Debilidad', weakness: 'Debilidad', weaknesses: 'Debilidad', d: 'Debilidad',
  oportunidad: 'Oportunidad', oportunidades: 'Oportunidad', opportunity: 'Oportunidad', opportunities: 'Oportunidad', o: 'Oportunidad',
  amenaza: 'Amenaza', amenazas: 'Amenaza', threat: 'Amenaza', threats: 'Amenaza', a: 'Amenaza',
}

export function normalizeSwotCategory(value) {
  const key = String(value || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  return CATEGORY_ALIASES[key] || null
}

const LEVEL_ALIASES = {
  alto: 'Alto', alta: 'Alto', high: 'Alto',
  medio: 'Medio', media: 'Medio', medium: 'Medio',
  bajo: 'Bajo', baja: 'Bajo', low: 'Bajo',
}

export function normalizeLevel(value) {
  return LEVEL_ALIASES[String(value || '').trim().toLowerCase()] || 'Medio'
}
