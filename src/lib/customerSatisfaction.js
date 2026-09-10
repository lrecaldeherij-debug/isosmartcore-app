// =============================================================================
// Definiciones compartidas de la encuesta de satisfacción del cliente (9.1.2).
//
// Viven acá y no dentro de CustomerVoice.jsx porque PublicSurvey.jsx las
// necesita para renderizar el formulario público, y ese componente se carga
// SIN sesión — no puede arrastrar módulos que dependan de useOrg ni del
// design system completo.
//
// Mantener sincronizado con:
//   · columnas score_<key> de customer_satisfaction_surveys
//   · las claves que espera la RPC submit_customer_satisfaction
// =============================================================================

// Las 6 dimensiones que se puntúan de 1 a 5.
export const DIMENSIONS = [
  {
    key: 'quality',
    label: 'Calidad del producto/servicio',
    hint: '¿Cumplió las especificaciones acordadas?',
    publicQuestion: 'La calidad del trabajo entregado cumplió lo acordado.',
  },
  {
    key: 'delivery',
    label: 'Cumplimiento de plazos',
    hint: '¿Se entregó en la fecha comprometida?',
    publicQuestion: 'Se cumplieron los plazos de entrega comprometidos.',
  },
  {
    key: 'communication',
    label: 'Comunicación y atención',
    hint: '¿Fue clara, oportuna y accesible?',
    publicQuestion: 'La comunicación durante el trabajo fue clara y oportuna.',
  },
  {
    key: 'value',
    label: 'Relación precio / valor',
    hint: '¿El precio se corresponde con lo recibido?',
    publicQuestion: 'El precio se corresponde con el valor recibido.',
  },
  {
    key: 'responsiveness',
    label: 'Respuesta ante problemas',
    hint: '¿Reaccionamos rápido cuando algo falló?',
    publicQuestion: 'Cuando surgió algún inconveniente, la respuesta fue rápida.',
  },
  {
    key: 'technical',
    label: 'Competencia técnica',
    hint: '¿El equipo demostró dominio técnico?',
    publicQuestion: 'El equipo demostró dominio técnico en su trabajo.',
  },
]

// Etiquetas de la escala, para el formulario público.
export const SCALE_LABELS = {
  5: 'Totalmente de acuerdo',
  4: 'De acuerdo',
  3: 'Neutral',
  2: 'En desacuerdo',
  1: 'Totalmente en desacuerdo',
}

// Valor de survey_type que marca una campaña como encuesta de satisfacción.
// 'climate' sigue siendo el default histórico para las de clima laboral.
export const SATISFACTION_SURVEY_TYPE = 'customer_satisfaction'

export function isSatisfactionSurvey(surveyType) {
  return surveyType === SATISFACTION_SURVEY_TYPE
}

// ─── Cálculos ────────────────────────────────────────────────────────────────

// NPS = %promotores − %detractores.
// Promotor 9-10 · Pasivo 7-8 · Detractor 0-6.
export function calcNps(rows) {
  const withNps = rows.filter(r => r.nps_score !== null && r.nps_score !== undefined)
  if (withNps.length === 0) return null
  const promoters = withNps.filter(r => r.nps_score >= 9).length
  const detractors = withNps.filter(r => r.nps_score <= 6).length
  return Math.round(((promoters - detractors) / withNps.length) * 1000) / 10
}

export function npsCategory(score) {
  if (score === null || score === undefined) return null
  if (score >= 9) return { key: 'promoter', label: 'Promotor' }
  if (score >= 7) return { key: 'passive', label: 'Pasivo' }
  return { key: 'detractor', label: 'Detractor' }
}

export function avgOf(rows, field) {
  const vals = rows.map(r => r[field]).filter(v => v !== null && v !== undefined)
  if (!vals.length) return null
  return Math.round((vals.reduce((a, b) => a + Number(b), 0) / vals.length) * 100) / 100
}

// Compara la primera mitad del período contra la segunda. El auditor no
// pregunta "¿cuánto sacaron?", pregunta "¿mejoró o empeoró?".
export function trendOf(rows) {
  const scored = rows
    .filter(r => r.overall_score !== null && r.overall_score !== undefined)
    .sort((a, b) => new Date(a.survey_date) - new Date(b.survey_date))
  if (scored.length < 4) return null
  const mid = Math.floor(scored.length / 2)
  const a = avgOf(scored.slice(0, mid), 'overall_score')
  const b = avgOf(scored.slice(mid), 'overall_score')
  if (a === null || b === null) return null
  return Math.round((b - a) * 100) / 100
}
