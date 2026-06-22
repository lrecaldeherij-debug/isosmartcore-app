// Helpers compartidos por todos los exports PDF: setup del documento, header,
// footer con paginación, sello de aprobación.
//
// Todos los exports devuelven la instancia jsPDF para que el caller decida
// si abrirla en una pestaña nueva (preview) o llamar a doc.save() para descargar.

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export const PAGE = { width: 210, height: 297, margin: 15 }
export const COLORS = {
  primary: [37, 99, 235],   // azul
  text: [33, 37, 41],
  muted: [108, 117, 125],
  border: [222, 226, 230],
  success: [22, 163, 74],
  danger: [220, 38, 38],
}

export function newDoc({ orientation = 'portrait' } = {}) {
  const doc = new jsPDF({ orientation, unit: 'mm', format: 'a4' })
  // Slot para que newPageIfNeeded y autoTable redibujen el header en page 2+
  doc.__headerCfg = null
  return doc
}

export function drawHeader(doc, cfg) {
  const { org, docTitle, subtitle } = cfg
  doc.__headerCfg = cfg
  const W = doc.internal.pageSize.getWidth()

  doc.setFillColor(...COLORS.primary)
  doc.rect(0, 0, W, 22, 'F')

  doc.setTextColor(255)
  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('ISO SmartCore', PAGE.margin, 10)

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.text(org?.name || '', PAGE.margin, 16)

  const maxRightWidth = W / 2 - PAGE.margin
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text(truncateText(doc, docTitle, maxRightWidth, 11), W - PAGE.margin, 11, { align: 'right' })
  if (subtitle) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.text(truncateText(doc, subtitle, maxRightWidth, 9), W - PAGE.margin, 17, { align: 'right' })
  }

  // reset
  doc.setTextColor(...COLORS.text)
}

function truncateText(doc, text, maxWidth, fontSize) {
  if (!text) return ''
  doc.setFontSize(fontSize)
  if (doc.getTextWidth(text) <= maxWidth) return text
  let s = String(text)
  while (s.length > 4 && doc.getTextWidth(s + '…') > maxWidth) s = s.slice(0, -1)
  return s + '…'
}

export function drawFooter(doc, { generated_at = new Date(), context = '' } = {}) {
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()
  const pages = doc.getNumberOfPages()

  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setDrawColor(...COLORS.border)
    doc.line(PAGE.margin, H - 12, W - PAGE.margin, H - 12)
    doc.setFontSize(8)
    doc.setTextColor(...COLORS.muted)

    const left = context || `Generado por ISO SmartCore — ${generated_at.toLocaleString()}`
    doc.text(left, PAGE.margin, H - 7)
    doc.text(`Página ${i} de ${pages}`, W - PAGE.margin, H - 7, { align: 'right' })

    doc.setTextColor(...COLORS.text)
  }
}

export function drawApprovalStamp(doc, { x, y, label, approver, date, hash }) {
  doc.setDrawColor(...COLORS.success)
  doc.setLineWidth(0.5)
  doc.roundedRect(x, y, 80, 28, 2, 2)
  doc.setTextColor(...COLORS.success)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text(label || 'APROBADO', x + 40, y + 6, { align: 'center' })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(...COLORS.text)
  doc.text(`Por: ${approver || '—'}`, x + 3, y + 13)
  doc.text(`Fecha: ${date ? new Date(date).toLocaleDateString() : '—'}`, x + 3, y + 18)
  if (hash) {
    doc.setFontSize(6.5)
    doc.setTextColor(...COLORS.muted)
    doc.text(`hash: ${hash.substring(0, 20)}…`, x + 3, y + 24)
  }
  doc.setLineWidth(0.2)
}

export function sectionTitle(doc, text, y) {
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...COLORS.primary)
  doc.text(text, PAGE.margin, y)
  doc.setDrawColor(...COLORS.primary)
  doc.line(PAGE.margin, y + 1.5, PAGE.margin + 40, y + 1.5)
  doc.setTextColor(...COLORS.text)
  doc.setFont('helvetica', 'normal')
  return y + 8
}

export function paragraph(doc, text, y, opts = {}) {
  const { fontSize = 10, maxWidth = PAGE.width - 2 * PAGE.margin, color = COLORS.text } = opts
  doc.setFontSize(fontSize)
  doc.setTextColor(...color)
  doc.setFont('helvetica', 'normal')
  const H = doc.internal.pageSize.getHeight()
  const lineHeight = fontSize * 0.4
  const lines = doc.splitTextToSize(text || '—', maxWidth)
  let curY = y
  for (const line of lines) {
    if (curY + lineHeight > H - 20) {
      curY = newPageIfNeeded(doc, H, 40) // fuerza nueva página + redibuja header
    }
    doc.text(line, PAGE.margin, curY)
    curY += lineHeight
  }
  return curY + 2
}

export function table(doc, { startY, head, body, columnStyles }) {
  autoTable(doc, {
    startY,
    head,
    body,
    margin: { left: PAGE.margin, right: PAGE.margin, top: 30, bottom: 18 },
    styles: { fontSize: 8.5, cellPadding: 2, textColor: COLORS.text, lineColor: COLORS.border },
    headStyles: { fillColor: COLORS.primary, textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 250] },
    columnStyles,
    // Redibuja el header del documento en cada página que autoTable agregue
    didDrawPage: () => {
      if (doc.__headerCfg) drawHeader(doc, doc.__headerCfg)
    },
  })
  return doc.lastAutoTable.finalY + 5
}

export function newPageIfNeeded(doc, currentY, needed = 40) {
  const H = doc.internal.pageSize.getHeight()
  if (currentY + needed > H - 20) {
    doc.addPage()
    // Redibujamos el header en cada página nueva
    if (doc.__headerCfg) drawHeader(doc, doc.__headerCfg)
    return 30
  }
  return currentY
}
