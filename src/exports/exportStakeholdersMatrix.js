// Export PDF: Matriz de Partes Interesadas (ISO 9001 — 4.2)

import { supabase } from '../supabaseClient'
import { newDoc, drawHeader, drawFooter, sectionTitle, table } from './pdfHelpers'

export async function exportStakeholdersMatrix(org) {
  const { data: items } = await supabase
    .from('stakeholders')
    .select('*')
    .order('name', { ascending: true })

  const doc = newDoc({ orientation: 'landscape' })
  drawHeader(doc, {
    org,
    docTitle: 'Matriz de Partes Interesadas',
    subtitle: 'ISO 9001:2015 — Cláusula 4.2',
  })

  const y = sectionTitle(doc, 'Necesidades y expectativas', 30)

  table(doc, {
    startY: y,
    head: [[
      'Parte interesada', 'Expectativas / necesidades', 'Influencia',
      'Requisito SGC', 'Planificación en el SGC', 'Método de evaluación',
      'Responsable', 'Frecuencia', 'Estado'
    ]],
    body: (items || []).map(s => [
      s.name || '',
      s.expectations || '',
      s.influence_level || '',
      s.is_sgc_requirement ? 'Sí' : 'No',
      s.planning_in_sgc || '',
      s.evaluation_method || '',
      s.responsible || '',
      s.follow_up_frequency || '',
      s.status || '',
    ]),
    columnStyles: {
      0: { cellWidth: 30 },
      1: { cellWidth: 55 },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 45 },
      5: { cellWidth: 40 },
      6: { cellWidth: 25 },
      7: { cellWidth: 18, halign: 'center' },
      8: { cellWidth: 18 },
    },
  })

  drawFooter(doc, { context: `Matriz de Partes Interesadas — ${org?.name || ''}` })
  doc.save(`partes-interesadas-${slug(org?.name)}-${stamp()}.pdf`)
}

const slug = (s = '') => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'org'
const stamp = () => new Date().toISOString().slice(0, 10)
