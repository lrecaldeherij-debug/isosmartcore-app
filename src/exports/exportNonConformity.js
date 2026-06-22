// Export PDF: Reporte individual de No Conformidad.
// Documento auditable que se entrega a certificadores ISO 9001 / clientes /
// reguladores. Incluye: identificación, vínculos, 5 porqués, tratamiento,
// verificación de eficacia y timeline completa de cambios (auditoría).
//
// El timeline es lo que da valor de "documento auditable": prueba quién hizo
// qué y cuándo en todo el ciclo de vida de la NC.

import { supabase } from '../supabaseClient'
import {
  newDoc, drawHeader, drawFooter, sectionTitle, paragraph, table,
  newPageIfNeeded, PAGE, COLORS,
} from './pdfHelpers'

export async function exportNonConformity(org, ncId) {
  const [
    { data: nc },
    { data: processes },
    { data: audits },
    { data: risks },
  ] = await Promise.all([
    supabase.from('non_conformities').select('*').eq('id', ncId).maybeSingle(),
    supabase.from('processes').select('id, name'),
    supabase.from('internal_audits').select('id, audit_process'),
    supabase.from('risk_matrix').select('id, risk_description'),
  ])

  if (!nc) throw new Error('No conformidad no encontrada')

  const procMap = Object.fromEntries((processes || []).map(p => [p.id, p.name]))
  const auditMap = Object.fromEntries((audits || []).map(a => [a.id, a.audit_process]))
  const riskMap = Object.fromEntries((risks || []).map(r => [r.id, r.risk_description]))

  const doc = newDoc()
  const code = nc.code || `NC-${(nc.id || '').slice(0, 8).toUpperCase()}`

  // ─── PORTADA / HEADER ───
  drawHeader(doc, { org, docTitle: 'Reporte de No Conformidad', subtitle: `ISO 9001:2015 — 10.2 · ${code}` })

  let y = 32
  doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(...COLORS.text)
  doc.text(code, PAGE.margin, y)
  y += 8

  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...COLORS.muted)
  doc.text(`Generado el ${new Date().toLocaleString()}`, PAGE.margin, y)
  y += 6

  // Badges de tipo / severidad / estado
  const statusColor = pickStatusColor(nc.status)
  y = drawPills(doc, y, [
    { label: nc.type || '—', bg: COLORS.primary },
    { label: nc.severity || '—', bg: [220, 38, 38] },
    { label: nc.status || '—', bg: statusColor },
  ])
  y += 4

  // ─── 1. Identificación ───
  y = sectionTitle(doc, '1. Identificación del hallazgo', y)
  y = paragraph(doc, nc.description || '—', y, { fontSize: 11 })
  y += 2
  y = table(doc, {
    startY: y,
    head: [['Campo', 'Valor']],
    body: [
      ['Origen', nc.source || '—'],
      ['Detectado por', nc.detected_by || '—'],
      ['Fecha detección', fmtDate(nc.detection_date)],
      ['Fecha límite', fmtDate(nc.due_date)],
      ['Cliente afectado', nc.customer_name || '—'],
      ['Recurrente', nc.is_recurrent ? 'Sí' : 'No'],
    ],
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } },
  })

  // ─── 2. Vínculos ───
  y = newPageIfNeeded(doc, y, 40)
  y = sectionTitle(doc, '2. Vínculos cross-module', y)
  const vincRows = []
  if (nc.process_id) vincRows.push(['Proceso', procMap[nc.process_id] || nc.process_id])
  if (nc.audit_id) vincRows.push(['Auditoría', auditMap[nc.audit_id] || nc.audit_id])
  if (nc.risk_id) vincRows.push(['Riesgo origen', riskMap[nc.risk_id] || nc.risk_id])
  if (nc.supplier_id) vincRows.push(['Proveedor', String(nc.supplier_id).slice(0, 12) + '…'])
  if (!vincRows.length) vincRows.push(['—', 'Sin vínculos cross-module'])
  y = table(doc, {
    startY: y, head: [['Vínculo', 'Referencia']], body: vincRows,
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } },
  })

  // ─── 3. Análisis 5 Porqués ───
  y = newPageIfNeeded(doc, y, 60)
  y = sectionTitle(doc, '3. Análisis de Causa Raíz (5 Porqués)', y)
  const whys = Array.isArray(nc.five_whys) ? nc.five_whys.filter(w => w?.why || w?.answer) : []
  if (whys.length) {
    y = table(doc, {
      startY: y,
      head: [['#', '¿Por qué?', 'Respuesta']],
      body: whys.map((w, i) => [`${i + 1}`, w.why || '—', w.answer || '—']),
      columnStyles: { 0: { cellWidth: 10, halign: 'center' }, 1: { cellWidth: 60 } },
    })
  } else {
    y = paragraph(doc, 'Sin análisis de 5 porqués registrado.', y, { color: COLORS.muted })
  }
  y += 2
  y = newPageIfNeeded(doc, y, 30)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...COLORS.text)
  doc.text('Causa raíz consolidada:', PAGE.margin, y); y += 5
  y = paragraph(doc, nc.root_cause || '—', y)

  // ─── 4. Tratamiento ───
  y = newPageIfNeeded(doc, y, 70)
  y = sectionTitle(doc, '4. Tratamiento (corrección + acción correctiva)', y)

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...COLORS.danger)
  doc.text('Corrección inmediata (contener YA):', PAGE.margin, y); y += 5
  y = paragraph(doc, nc.correction || '—', y)
  y += 2

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...COLORS.success)
  doc.text('Acción correctiva (eliminar causa raíz):', PAGE.margin, y); y += 5
  y = paragraph(doc, nc.action_plan || '—', y)
  y += 4

  y = table(doc, {
    startY: y,
    head: [['Campo', 'Valor']],
    body: [
      ['Responsable', nc.responsible || '—'],
      ['Costo de impacto', nc.cost_impact ? `${Number(nc.cost_impact).toLocaleString()} ${nc.currency || ''}` : '—'],
      ['URL evidencia', nc.evidence_url || '—'],
    ],
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } },
  })

  // ─── 5. Verificación de eficacia ───
  y = newPageIfNeeded(doc, y, 40)
  y = sectionTitle(doc, '5. Verificación de eficacia post-cierre', y)
  y = table(doc, {
    startY: y,
    head: [['Campo', 'Valor']],
    body: [
      ['Fecha verificación', fmtDate(nc.effectiveness_check_date)],
      ['Resultado', nc.effectiveness_result || 'Pendiente'],
      ['Evaluador', nc.effectiveness_evaluator || '—'],
      ['Notas', nc.effectiveness_notes || '—'],
      ['Fecha de cierre', fmtDate(nc.closure_date)],
      ['Cerrado por', nc.closed_by || '—'],
    ],
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } },
  })

  // ─── 6. Historial de cambios (auditoría) ───
  y = newPageIfNeeded(doc, y, 40)
  y = sectionTitle(doc, '6. Historial de cambios (auditoría)', y)
  // Allowlist de campos a mostrar — los demás cambios se cuentan pero el detalle se omite
  // para no leakear PII histórica (ej: customer_name que se editó por GDPR).
  const NC_AUDIT_ALLOWLIST = new Set([
    'status', 'severity', 'type', 'source', 'detection_date', 'closure_date',
    'due_date', 'responsible', 'effectiveness_result', 'effectiveness_check_date',
    'effectiveness_evaluator', 'is_recurrent',
  ])
  const entries = safeSortChangeLog(nc.change_log)
  if (!entries.length) {
    y = paragraph(doc, 'Sin historial registrado.', y, { color: COLORS.muted })
  } else {
    const rows = []
    entries.forEach(e => {
      const when = e.at ? new Date(e.at).toLocaleString() : '—'
      const changes = Array.isArray(e.changes) ? e.changes : []
      if (changes.some(c => c.field === 'created')) {
        rows.push([when, 'Creación', 'Registro inicial'])
      } else {
        let redactedCount = 0
        changes.forEach(c => {
          if (NC_AUDIT_ALLOWLIST.has(c.field)) {
            rows.push([when, humanize(c.field), `${fmtVal(c.from)} → ${fmtVal(c.to)}`])
          } else {
            redactedCount++
          }
        })
        if (redactedCount > 0) {
          rows.push([when, 'Otros campos', `${redactedCount} cambio${redactedCount === 1 ? '' : 's'} en campos descriptivos (omitidos)`])
        }
      }
    })
    y = table(doc, {
      startY: y,
      head: [['Fecha', 'Campo', 'Cambio']],
      body: rows,
      columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 40, fontStyle: 'bold' } },
    })
  }

  drawFooter(doc, { context: `${org?.name || ''} · ${code} · ISO 9001:2015 — 10.2` })
  return doc
}

// ─── helpers locales ───
function fmtDate(d) { return d ? new Date(d).toLocaleDateString() : '—' }
function fmtVal(v) {
  if (v === null || v === undefined || v === '') return '—'
  if (Array.isArray(v) && v.length === 0) return '—'
  if (typeof v === 'object') {
    if (Object.keys(v).length === 0) return '—'
    try { return JSON.stringify(v).slice(0, 40) } catch { try { return String(v).slice(0, 40) } catch { return '(objeto)' } }
  }
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  try { return String(v).slice(0, 80) } catch { return '(valor)' }
}
function safeSortChangeLog(log) {
  if (!Array.isArray(log)) return []
  return [...log].sort((a, b) => {
    const ta = a?.at ? new Date(a.at).getTime() : 0
    const tb = b?.at ? new Date(b.at).getTime() : 0
    // Push entries con fechas inválidas/ausentes al final, las válidas más nuevas primero
    if (!isFinite(ta) && !isFinite(tb)) return 0
    if (!isFinite(ta)) return 1
    if (!isFinite(tb)) return -1
    return tb - ta
  })
}
function humanize(field) {
  if (!field) return '—'
  return field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function pickStatusColor(status) {
  if (status === 'Cerrada') return [22, 163, 74]
  if (status === 'En Verificación') return [14, 165, 233]
  if (status === 'Reabierta') return [220, 38, 38]
  return [245, 158, 11]
}
function drawPills(doc, y, pills) {
  let x = PAGE.margin
  pills.forEach(p => {
    const txt = String(p.label).toUpperCase()
    const w = doc.getTextWidth(txt) + 8
    doc.setFillColor(...p.bg)
    doc.roundedRect(x, y, w, 6, 1, 1, 'F')
    doc.setTextColor(255); doc.setFontSize(8.5); doc.setFont('helvetica', 'bold')
    doc.text(txt, x + 4, y + 4.2)
    x += w + 4
  })
  doc.setTextColor(...COLORS.text); doc.setFont('helvetica', 'normal')
  return y + 8
}
