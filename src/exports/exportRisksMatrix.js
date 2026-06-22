// Export PDF: Matriz de Riesgos y Oportunidades (ISO 9001 — 6.1)
// Tabla con criticidad inicial vs. residual y semáforo según prob × impacto.

import { supabase } from '../supabaseClient'
import { newDoc, drawHeader, drawFooter, sectionTitle, table, COLORS } from './pdfHelpers'

const sev = (p, i) => {
  const v = (Number(p) || 0) * (Number(i) || 0)
  if (v >= 56) return { label: 'Alto', color: COLORS.danger }
  if (v >= 21) return { label: 'Medio', color: [217, 119, 6] }
  if (v > 0)   return { label: 'Bajo', color: COLORS.success }
  return { label: '—', color: COLORS.muted }
}

export async function exportRisksMatrix(org) {
  const { data: risks } = await supabase
    .from('risk_matrix')
    .select('*')
    .order('process_name', { ascending: true })

  const doc = newDoc({ orientation: 'landscape' })
  drawHeader(doc, {
    org,
    docTitle: 'Matriz de Riesgos y Oportunidades',
    subtitle: 'ISO 9001:2015 — Cláusula 6.1',
  })

  let y = sectionTitle(doc, 'Riesgos identificados', 30)

  table(doc, {
    startY: y,
    head: [[
      'Proceso', 'Riesgo / Oportunidad', 'P', 'I', 'Inicial',
      'Control', 'Responsable', 'P res.', 'I res.', 'Residual', 'Estado'
    ]],
    body: (risks || []).map(r => {
      const ini = sev(r.prob_initial, r.impact_initial)
      const res = sev(r.prob_residual, r.impact_residual)
      return [
        r.process_name || '',
        r.risk_description || '',
        r.prob_initial ?? '',
        r.impact_initial ?? '',
        ini.label,
        r.control_measure || '',
        r.responsible || '',
        r.prob_residual ?? '',
        r.impact_residual ?? '',
        res.label,
        r.status || '',
      ]
    }),
    columnStyles: {
      0: { cellWidth: 28 },
      1: { cellWidth: 50 },
      2: { cellWidth: 8, halign: 'center' },
      3: { cellWidth: 8, halign: 'center' },
      4: { cellWidth: 15, halign: 'center' },
      5: { cellWidth: 50 },
      6: { cellWidth: 25 },
      7: { cellWidth: 12, halign: 'center' },
      8: { cellWidth: 12, halign: 'center' },
      9: { cellWidth: 15, halign: 'center' },
      10: { cellWidth: 18 },
    },
  })

  drawFooter(doc, { context: `Matriz de Riesgos — ${org?.name || ''}` })
  doc.save(`matriz-riesgos-${slug(org?.name)}-${stamp()}.pdf`)
}

const slug = (s = '') => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'org'
const stamp = () => new Date().toISOString().slice(0, 10)
