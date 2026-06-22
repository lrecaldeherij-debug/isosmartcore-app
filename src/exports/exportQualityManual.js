// Export PDF: Manual del SGC consolidado.
// Reúne: portada con sello, política de calidad, alcance, mapa de procesos,
// objetivos, contexto (FODA) y partes interesadas en un solo documento.
//
// Si la política o el alcance están "Aprobados" (en su versión documental),
// se imprime el sello con nombre del aprobador y hash truncado.

import { supabase } from '../supabaseClient'
import {
  newDoc, drawHeader, drawFooter, sectionTitle, paragraph, table,
  drawApprovalStamp, newPageIfNeeded, PAGE, COLORS,
} from './pdfHelpers'

export async function exportQualityManual(org) {
  const [
    { data: policy },
    { data: scope },
    { data: processes },
    { data: objectives },
    { data: foda },
    { data: stakeholders },
    { data: manualDoc },
    { data: members },
  ] = await Promise.all([
    supabase.from('quality_policy').select('*').limit(1).maybeSingle(),
    supabase.from('scope_declaration').select('*').limit(1).maybeSingle(),
    supabase.from('processes').select('*').order('name'),
    supabase.from('quality_objectives').select('*').order('created_at'),
    supabase.from('context_analysis').select('*').order('category'),
    supabase.from('stakeholders').select('*').order('name'),
    supabase.from('documents_versions').select('*')
      .eq('code', 'MAN-01').eq('status', 'Vigente').limit(1).maybeSingle(),
    supabase.from('user_profiles').select('user_id, full_name'),
  ])

  const memberMap = Object.fromEntries((members || []).map(m => [m.user_id, m]))
  const doc = newDoc()

  // ============= PORTADA =============
  drawHeader(doc, { org, docTitle: 'Manual del SGC', subtitle: 'ISO 9001:2015' })

  doc.setFontSize(28)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.text)
  doc.text('Manual del Sistema', PAGE.margin, 80)
  doc.text('de Gestión de Calidad', PAGE.margin, 92)

  doc.setFontSize(14)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...COLORS.muted)
  doc.text(org?.name || '', PAGE.margin, 108)

  doc.setFontSize(10)
  doc.text(`Generado el ${new Date().toLocaleDateString()}`, PAGE.margin, 116)

  if (manualDoc) {
    const approver = memberMap[manualDoc.approved_by]
    drawApprovalStamp(doc, {
      x: PAGE.margin,
      y: 200,
      label: `${manualDoc.code} v${manualDoc.version} — APROBADO`,
      approver: approver?.full_name,
      date: manualDoc.approved_at,
      hash: manualDoc.content_hash,
    })
  } else {
    doc.setFontSize(9)
    doc.setTextColor(...COLORS.danger)
    doc.text('Documento sin aprobación formal del Manual (MAN-01) en el sistema.', PAGE.margin, 200)
    doc.setTextColor(...COLORS.text)
  }

  // ============= 4.3 ALCANCE =============
  doc.addPage()
  drawHeader(doc, { org, docTitle: 'Manual del SGC', subtitle: '4.3 Alcance' })
  let y = sectionTitle(doc, '4.3 Alcance del Sistema de Gestión de Calidad', 30)

  if (scope) {
    y = paragraph(doc, scope.scope_statement || '—', y, { fontSize: 11 })
    y += 4
    y = sectionTitle(doc, 'Consideraciones (4.1 y 4.2)', y)
    y = paragraph(doc, scope.considerations_41_42 || '—', y)
    y += 3
    y = sectionTitle(doc, 'Procesos cubiertos', y)
    y = paragraph(doc, scope.processes_covered || '—', y)
    y += 3
    y = sectionTitle(doc, 'Productos y servicios', y)
    y = paragraph(doc, scope.products_services || '—', y)
    y += 3
    y = sectionTitle(doc, 'Ubicación geográfica', y)
    y = paragraph(doc, scope.geographic_location || '—', y)
    y += 3
    y = sectionTitle(doc, 'Exclusiones justificadas', y)
    y = paragraph(doc, scope.exclusions_83_etc || '—', y)
  } else {
    y = paragraph(doc, 'No se ha registrado la declaración de alcance.', y, { color: COLORS.danger })
  }

  // ============= 5.2 POLÍTICA =============
  doc.addPage()
  drawHeader(doc, { org, docTitle: 'Manual del SGC', subtitle: '5.2 Política de Calidad' })
  y = sectionTitle(doc, '5.2 Política de Calidad', 30)

  if (policy) {
    y = paragraph(doc, policy.final_policy_statement || '—', y, { fontSize: 11 })
  } else {
    y = paragraph(doc, 'No se ha registrado la política de calidad.', y, { color: COLORS.danger })
  }

  // ============= 4.4 PROCESOS =============
  doc.addPage()
  drawHeader(doc, { org, docTitle: 'Manual del SGC', subtitle: '4.4 Mapa de Procesos' })
  y = sectionTitle(doc, '4.4 Mapa de Procesos', 30)
  y = table(doc, {
    startY: y,
    head: [['Código', 'Proceso', 'Tipo', 'Objetivo', 'Responsable']],
    body: (processes || []).map(p => [p.code || '', p.name || '', p.process_type || '', p.objective || '', p.responsible_role || '']),
    columnStyles: { 0: { cellWidth: 22 }, 1: { cellWidth: 40 }, 2: { cellWidth: 22 }, 3: { cellWidth: 70 }, 4: { cellWidth: 30 } },
  })

  // ============= 4.1 CONTEXTO (FODA) =============
  doc.addPage()
  drawHeader(doc, { org, docTitle: 'Manual del SGC', subtitle: '4.1 Análisis de Contexto' })
  y = sectionTitle(doc, '4.1 Análisis de Contexto (FODA)', 30)
  y = table(doc, {
    startY: y,
    head: [['Tipo', 'Categoría', 'Factor', 'Descripción', 'Estrategia']],
    body: (foda || []).map(f => [f.type || '', f.category || '', f.factor || '', f.description || '', f.strategy || '']),
    columnStyles: { 0: { cellWidth: 18 }, 1: { cellWidth: 22 }, 2: { cellWidth: 35 }, 3: { cellWidth: 55 }, 4: { cellWidth: 55 } },
  })

  // ============= 4.2 PARTES INTERESADAS =============
  y = newPageIfNeeded(doc, y, 60)
  if (y < 35) drawHeader(doc, { org, docTitle: 'Manual del SGC', subtitle: '4.2 Partes Interesadas' })
  y = sectionTitle(doc, '4.2 Partes Interesadas', y)
  y = table(doc, {
    startY: y,
    head: [['Parte', 'Expectativas', 'Influencia', 'Frecuencia']],
    body: (stakeholders || []).map(s => [s.name || '', s.expectations || '', s.influence_level || '', s.follow_up_frequency || '']),
    columnStyles: { 0: { cellWidth: 35 }, 1: { cellWidth: 90 }, 2: { cellWidth: 25, halign: 'center' }, 3: { cellWidth: 30, halign: 'center' } },
  })

  // ============= 6.2 OBJETIVOS =============
  doc.addPage()
  drawHeader(doc, { org, docTitle: 'Manual del SGC', subtitle: '6.2 Objetivos de Calidad' })
  y = sectionTitle(doc, '6.2 Objetivos de Calidad', 30)
  y = table(doc, {
    startY: y,
    head: [['Objetivo', 'Indicador', 'Meta', 'Actual', 'Frecuencia', 'Responsable']],
    body: (objectives || []).map(o => [
      o.objective || '',
      o.indicator || '',
      `${o.target || ''} ${o.unit || ''}`.trim(),
      `${o.current || ''} ${o.unit || ''}`.trim(),
      o.frequency || '',
      o.responsible || '',
    ]),
    columnStyles: { 0: { cellWidth: 50 }, 1: { cellWidth: 45 }, 2: { cellWidth: 20, halign: 'center' }, 3: { cellWidth: 20, halign: 'center' }, 4: { cellWidth: 20 }, 5: { cellWidth: 25 } },
  })

  drawFooter(doc, { context: `Manual SGC — ${org?.name || ''}` })
  doc.save(`manual-sgc-${slug(org?.name)}-${stamp()}.pdf`)
}

const slug = (s = '') => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'org'
const stamp = () => new Date().toISOString().slice(0, 10)
