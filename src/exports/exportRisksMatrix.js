// Export PDF: Matriz de Riesgos y Oportunidades (ISO 9001 — 6.1)
// Tabla con criticidad inicial vs. residual y semáforo según prob × impacto.
//
// Columnas reales de risk_matrix: process_area, probability_initial,
// probability_residual. Antes pedía process_name / prob_initial: la consulta
// fallaba (orden por columna inexistente) y el PDF salía sin filas.

import { supabase } from '../supabaseClient'
import { newDoc, drawHeader, drawFooter, sectionTitle, table, COLORS } from './pdfHelpers'
import { riskLevel } from '../lib/riskLevel'

const LEVEL_COLORS = {
  critical: COLORS.danger,
  high: COLORS.danger,
  medium: [217, 119, 6],
  low: COLORS.success,
  none: COLORS.muted,
}

const sev = (p, i) => {
  const level = riskLevel((Number(p) || 0) * (Number(i) || 0))
  return { label: level.label, color: LEVEL_COLORS[level.key] }
}

export async function exportRisksMatrix(org) {
  let query = supabase
    .from('risk_matrix')
    .select('*')
    .order('process_area', { ascending: true })
    .order('score_initial', { ascending: false })
  if (org?.id) query = query.eq('org_id', org.id)
  const { data: risks, error } = await query
  if (error) throw new Error('No se pudo leer la matriz de riesgos: ' + error.message)

  const doc = newDoc({ orientation: 'landscape' })
  drawHeader(doc, {
    org,
    docTitle: 'Matriz de Riesgos y Oportunidades',
    subtitle: 'ISO 9001:2015 — Cláusula 6.1',
  })

  let y = sectionTitle(doc, 'Riesgos y oportunidades identificados', 30)

  table(doc, {
    startY: y,
    head: [[
      'Proceso', 'Tipo', 'Riesgo / Oportunidad', 'P', 'I', 'Inicial',
      'Control / Tratamiento', 'Responsable', 'P res.', 'I res.', 'Residual', 'Estado'
    ]],
    body: (risks || []).map(r => {
      const ini = sev(r.probability_initial, r.impact_initial)
      const res = sev(r.probability_residual, r.impact_residual)
      return [
        r.process_area || '',
        r.type || 'Riesgo',
        r.risk_description || '',
        r.probability_initial ?? '',
        r.impact_initial ?? '',
        ini.label,
        [r.treatment_strategy, r.control_measure].filter(Boolean).join(': '),
        r.responsible || r.owner || '',
        r.probability_residual || '',
        r.impact_residual || '',
        r.probability_residual && r.impact_residual ? res.label : '—',
        r.status || '',
      ]
    }),
    columnStyles: {
      0: { cellWidth: 26 },
      1: { cellWidth: 16 },
      2: { cellWidth: 48 },
      3: { cellWidth: 8, halign: 'center' },
      4: { cellWidth: 8, halign: 'center' },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 48 },
      7: { cellWidth: 24 },
      8: { cellWidth: 11, halign: 'center' },
      9: { cellWidth: 11, halign: 'center' },
      10: { cellWidth: 14, halign: 'center' },
      11: { cellWidth: 18 },
    },
  })

  drawFooter(doc, { context: `Matriz de Riesgos — ${org?.name || ''} · Escala P e I 1-10 · Bajo <16 · Medio 16-35 · Alto 36-63 · Crítico ≥64` })
  doc.save(`matriz-riesgos-${slug(org?.name)}-${stamp()}.pdf`)
}

const slug = (s = '') => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'org'
const stamp = () => new Date().toISOString().slice(0, 10)
