// Nivel de riesgo único para toda la app (6.1, Tablero, Análisis de datos,
// Plan estratégico).
//
// Probabilidad e impacto se cargan de 1 a 10, así que score = P × I va de 1 a
// 100. Los umbrales anteriores (Alto ≥ 15, Crítico ≥ 20) eran de una matriz 5×5
// (máx. 25): un riesgo "posible × medio" (5 × 5 = 25) salía Crítico y casi toda
// la matriz quedaba en rojo. Además cada módulo usaba un corte distinto.
//
// Cortes equivalentes a los cuadrantes de una 10×10:
//   Crítico ≥ 64 (8×8)   Alto ≥ 36 (6×6)   Medio ≥ 16 (4×4)   Bajo < 16
export const RISK_THRESHOLDS = { critical: 64, high: 36, medium: 16 }

const LEVELS = {
  critical: { key: 'critical', label: 'Crítico', color: '#991b1b' },
  high:     { key: 'high',     label: 'Alto',    color: '#dc2626' },
  medium:   { key: 'medium',   label: 'Medio',   color: '#f59e0b' },
  low:      { key: 'low',      label: 'Bajo',    color: '#86efac' },
  none:     { key: 'none',     label: '—',       color: '#f1f5f9' },
}

export function riskLevel(score) {
  const s = Number(score) || 0
  if (s <= 0) return LEVELS.none
  if (s >= RISK_THRESHOLDS.critical) return LEVELS.critical
  if (s >= RISK_THRESHOLDS.high) return LEVELS.high
  if (s >= RISK_THRESHOLDS.medium) return LEVELS.medium
  return LEVELS.low
}

/** Alto o crítico: requiere tratamiento prioritario. */
export const isHighRisk = (score) => (Number(score) || 0) >= RISK_THRESHOLDS.high

/** Medio o superior: debería tener un control definido. */
export const needsControl = (score) => (Number(score) || 0) >= RISK_THRESHOLDS.medium

export const RISK_LEGEND = [
  { ...LEVELS.low,      range: `1-${RISK_THRESHOLDS.medium - 1}` },
  { ...LEVELS.medium,   range: `${RISK_THRESHOLDS.medium}-${RISK_THRESHOLDS.high - 1}` },
  { ...LEVELS.high,     range: `${RISK_THRESHOLDS.high}-${RISK_THRESHOLDS.critical - 1}` },
  { ...LEVELS.critical, range: `≥${RISK_THRESHOLDS.critical}` },
]
