// Export PDF: Acta de Revisión por la Dirección (ISO 9001 — 9.3).
// Documento oficial con entradas (9.3.2), salidas (9.3.3) y acciones derivadas.

import { supabase } from '../supabaseClient'
import {
  newDoc, drawHeader, drawFooter, sectionTitle, paragraph, table,
  newPageIfNeeded, PAGE, COLORS,
} from './pdfHelpers'

export async function exportManagementReview(org, reviewId) {
  const [{ data: rev }, { data: actions }] = await Promise.all([
    supabase.from('management_review').select('*').eq('id', reviewId).maybeSingle(),
    supabase.from('management_review_actions').select('*').eq('review_id', reviewId).order('due_date', { ascending: true }),
  ])
  if (!rev) throw new Error('Revisión no encontrada')

  const doc = newDoc()
  const code = `REV-${(rev.id || '').slice(0, 8).toUpperCase()}`

  drawHeader(doc, { org, docTitle: 'Acta de Revisión por la Dirección', subtitle: `ISO 9001:2015 — 9.3 · ${code}` })

  let y = 32
  doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(...COLORS.text)
  doc.text(`Revisión ${rev.review_type || ''} — ${fmtDate(rev.review_date)}`, PAGE.margin, y); y += 8

  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...COLORS.muted)
  doc.text(`Estado: ${rev.status || '—'} · Generado el ${new Date().toLocaleString()}`, PAGE.margin, y); y += 8

  // ─── 1. Datos generales ───
  y = sectionTitle(doc, '1. Datos generales', y)
  const attendees = Array.isArray(rev.attendees) && rev.attendees.length
    ? rev.attendees.map(a => `${a.name}${a.role ? ' (' + a.role + ')' : ''}`).join(', ')
    : '—'
  y = table(doc, {
    startY: y, head: [['Campo', 'Valor']],
    body: [
      ['Tipo', rev.review_type || '—'],
      ['Fecha revisión', fmtDate(rev.review_date)],
      ['Período', `${fmtDate(rev.period_start)} → ${fmtDate(rev.period_end)}`],
      ['Presidente', rev.chairperson || '—'],
      ['Asistentes', attendees],
    ],
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } },
  })

  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...COLORS.text)
  doc.text('Agenda:', PAGE.margin, y); y += 5
  y = paragraph(doc, rev.agenda || '—', y)

  // ─── 2. Entradas (9.3.2) ───
  y = newPageIfNeeded(doc, y, 80)
  y = sectionTitle(doc, '2. Entradas — ISO 9001 9.3.2', y)
  y = table(doc, {
    startY: y, head: [['Aspecto', 'Análisis']],
    body: [
      ['Estado acciones previas', rev.inputs_previous_actions || '—'],
      ['Cambios contexto', rev.inputs_changes || '—'],
      ['Desempeño SGC', rev.inputs_performance || '—'],
      ['Cumplimiento objetivos', rev.inputs_objectives || '—'],
      ['Resultados auditorías', rev.inputs_audit_results || '—'],
      ['No conformidades', rev.inputs_nonconformities || '—'],
      ['Desempeño proveedores', rev.inputs_supplier_performance || '—'],
      ['Retroalimentación clientes', rev.inputs_customer_feedback || '—'],
      ['Adecuación de recursos', rev.inputs_resources || '—'],
      ['Eficacia de riesgos', rev.inputs_risks || '—'],
    ],
    columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' } },
  })

  // ─── 3. Salidas (9.3.3) ───
  y = newPageIfNeeded(doc, y, 50)
  y = sectionTitle(doc, '3. Salidas — ISO 9001 9.3.3', y)
  y = table(doc, {
    startY: y, head: [['Aspecto', 'Decisión / Acción']],
    body: [
      ['Oportunidades de mejora', rev.outputs_improvement_opportunities || '—'],
      ['Cambios necesarios al SGC', rev.outputs_changes_needed || '—'],
      ['Necesidades de recursos', rev.outputs_resource_needs || '—'],
    ],
    columnStyles: { 0: { cellWidth: 60, fontStyle: 'bold' } },
  })

  // ─── 4. Acciones derivadas ───
  y = newPageIfNeeded(doc, y, 50)
  y = sectionTitle(doc, `4. Acciones derivadas (${(actions || []).length})`, y)
  if (!actions?.length) {
    y = paragraph(doc, 'Sin acciones derivadas registradas.', y, { color: COLORS.muted })
  } else {
    y = table(doc, {
      startY: y,
      head: [['Acción', 'Responsable', 'Vencimiento', 'Prioridad', 'Estado']],
      body: actions.map(a => [
        (a.description || '').slice(0, 80),
        a.responsible || '—',
        fmtDate(a.due_date),
        a.priority || '—',
        a.status || '—',
      ]),
    })
  }

  // ─── 5. Historial ───
  y = newPageIfNeeded(doc, y, 40)
  y = sectionTitle(doc, '5. Historial de cambios', y)
  y = renderChangeLog(doc, y, rev.change_log)

  drawFooter(doc, { context: `${org?.name || ''} · ${code} · ISO 9001:2015 — 9.3` })
  return doc
}

function fmtDate(d) { return d ? new Date(d).toLocaleDateString() : '—' }

const REVIEW_AUDIT_ALLOWLIST = new Set([
  'review_type', 'status', 'review_date', 'period_start', 'period_end', 'chairperson',
])

function renderChangeLog(doc, y, log) {
  const entries = safeSortChangeLog(log)
  if (!entries.length) return paragraph(doc, 'Sin historial registrado.', y, { color: COLORS.muted })
  const rows = []
  entries.forEach(e => {
    const when = e.at ? new Date(e.at).toLocaleString() : '—'
    const changes = Array.isArray(e.changes) ? e.changes : []
    if (changes.some(c => c.field === 'created')) {
      rows.push([when, 'Creación', 'Registro inicial'])
    } else {
      let redacted = 0
      changes.forEach(c => {
        if (REVIEW_AUDIT_ALLOWLIST.has(c.field)) {
          rows.push([when, humanize(c.field), `${fmtVal(c.from)} → ${fmtVal(c.to)}`])
        } else { redacted++ }
      })
      if (redacted > 0) rows.push([when, 'Otros campos', `${redacted} cambio${redacted === 1 ? '' : 's'} en campos descriptivos (omitidos)`])
    }
  })
  return table(doc, {
    startY: y, head: [['Fecha', 'Campo', 'Cambio']], body: rows,
    columnStyles: { 0: { cellWidth: 38 }, 1: { cellWidth: 40, fontStyle: 'bold' } },
  })
}
function safeSortChangeLog(log) {
  if (!Array.isArray(log)) return []
  return [...log].sort((a, b) => {
    const ta = a?.at ? new Date(a.at).getTime() : 0
    const tb = b?.at ? new Date(b.at).getTime() : 0
    if (!isFinite(ta) && !isFinite(tb)) return 0
    if (!isFinite(ta)) return 1
    if (!isFinite(tb)) return -1
    return tb - ta
  })
}
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
function humanize(field) {
  if (!field) return '—'
  return field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
