// Export PDF: Reporte individual de Auditoría Interna (ISO 9001 — 9.2).
// Documento auditable que incluye programa, ejecución, hallazgos, conclusiones,
// NCs derivadas y timeline de cambios.

import { supabase } from '../supabaseClient'
import {
  newDoc, drawHeader, drawFooter, sectionTitle, paragraph, table,
  newPageIfNeeded, PAGE, COLORS,
} from './pdfHelpers'

export async function exportInternalAudit(org, auditId) {
  const [{ data: audit }, { data: ncs }] = await Promise.all([
    supabase.from('internal_audits').select('*').eq('id', auditId).maybeSingle(),
    supabase.from('non_conformities').select('id, description, status, severity, created_at, closure_date').eq('audit_id', auditId),
  ])
  if (!audit) throw new Error('Auditoría no encontrada')

  const doc = newDoc()
  const code = audit.code || `AUD-${(audit.id || '').slice(0, 8).toUpperCase()}`

  drawHeader(doc, { org, docTitle: 'Reporte de Auditoría Interna', subtitle: `ISO 9001:2015 — 9.2 · ${code}` })

  let y = 32
  doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(...COLORS.text)
  doc.text(audit.audit_process || code, PAGE.margin, y); y += 8

  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(...COLORS.muted)
  doc.text(`Generado el ${new Date().toLocaleString()}`, PAGE.margin, y); y += 8

  // ─── 1. Programa ───
  y = sectionTitle(doc, '1. Programa de auditoría', y)
  y = table(doc, {
    startY: y, head: [['Campo', 'Valor']],
    body: [
      ['Tipo', audit.audit_type || '—'],
      ['Estado', audit.status || '—'],
      ['Año', audit.year || '—'],
      ['Fecha planificada', fmtDate(audit.planned_date)],
      ['Fecha real', fmtDate(audit.actual_date)],
      ['Proceso auditado', audit.audit_process || '—'],
      ['Auditor líder', audit.lead_auditor || '—'],
      ['Equipo', Array.isArray(audit.audit_team) ? audit.audit_team.join(', ') : (audit.audit_team || '—')],
    ],
    columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } },
  })

  // ─── 2. Alcance y criterios ───
  y = newPageIfNeeded(doc, y, 40)
  y = sectionTitle(doc, '2. Alcance y criterios', y)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('Alcance:', PAGE.margin, y); y += 5
  y = paragraph(doc, audit.audit_scope || '—', y)
  y += 2
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('Criterios:', PAGE.margin, y); y += 5
  y = paragraph(doc, audit.audit_criteria || '—', y)

  // ─── 3. Resultados / observaciones ───
  y = newPageIfNeeded(doc, y, 40)
  y = sectionTitle(doc, '3. Resultados y observaciones', y)
  y = paragraph(doc, audit.audit_results || 'Sin observaciones registradas.', y)

  // ─── 4. Conclusiones y recomendaciones ───
  y = newPageIfNeeded(doc, y, 50)
  y = sectionTitle(doc, '4. Conclusiones', y)
  y = paragraph(doc, audit.conclusions || '—', y)
  y += 4
  y = newPageIfNeeded(doc, y, 30)
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10)
  doc.text('Recomendaciones:', PAGE.margin, y); y += 5
  y = paragraph(doc, audit.recommendations || '—', y)

  // ─── 5. NCs derivadas ───
  y = newPageIfNeeded(doc, y, 40)
  y = sectionTitle(doc, `5. No conformidades derivadas (${(ncs || []).length})`, y)
  if (!ncs?.length) {
    y = paragraph(doc, 'Sin NCs vinculadas a esta auditoría.', y, { color: COLORS.muted })
  } else {
    y = table(doc, {
      startY: y,
      head: [['Descripción', 'Severidad', 'Estado', 'Detectada', 'Cierre']],
      body: ncs.map(n => [
        (n.description || '').slice(0, 80),
        n.severity || '—', n.status || '—',
        fmtDate(n.created_at), fmtDate(n.closure_date),
      ]),
    })
  }

  // ─── 6. Historial ───
  y = newPageIfNeeded(doc, y, 40)
  y = sectionTitle(doc, '6. Historial de cambios', y)
  y = renderChangeLog(doc, y, audit.change_log)

  drawFooter(doc, { context: `${org?.name || ''} · ${code} · ISO 9001:2015 — 9.2` })
  return doc
}

function fmtDate(d) { return d ? new Date(d).toLocaleDateString() : '—' }

const AUDIT_AUDIT_ALLOWLIST = new Set([
  'audit_type', 'status', 'year', 'planned_date', 'actual_date',
  'audit_process', 'lead_auditor', 'findings_count',
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
        if (AUDIT_AUDIT_ALLOWLIST.has(c.field)) {
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
