import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { paymentMethodLabels, paymentMethods, paymentStatusLabels } from '~~/shared/constants/pos'
import type { PaymentListItem, PaymentRecord } from '~~/shared/types/pos'
import type { CompanySettingsRecord } from '~~/shared/types/settings'
import { summarizePaymentExport } from '~~/shared/utils/payment-export'
import { formatCurrency, formatDate, formatDateTime } from '~~/shared/utils/pos'

type ExportFilters = {
  search?: string
  method?: PaymentRecord['method']
  status?: PaymentRecord['status']
  dateFrom?: string
  dateTo?: string
  documentId?: number
  customerId?: number
}

// A4 landscape keeps the customer, document and money columns readable.
const WIDTH = 841.89
const HEIGHT = 595.28
const MARGIN = 36
const INK = rgb(0.12, 0.16, 0.19)
const MUTED = rgb(0.38, 0.42, 0.45)
const GREEN = rgb(0.08, 0.36, 0.26)
const PALE = rgb(0.95, 0.97, 0.96)
const COLUMNS = [36, 145, 240, 477, 595, 713, WIDTH - MARGIN]

export async function generatePaymentsPdf(payments: PaymentListItem[], company: Pick<CompanySettingsRecord, 'name'>, filters: ExportFilters = {}) {
  const pdf = await PDFDocument.create()
  pdf.setTitle('Journal des paiements')
  const regular = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const supported = new Set(regular.getCharacterSet())
  const clean = (value: string) => Array.from(value.replace(/[\u00a0\u202f]/g, ' '))
    .map(char => supported.has(char.codePointAt(0)!) ? char : '?').join('')
  let page = pdf.addPage([WIDTH, HEIGHT])
  let y = HEIGHT - MARGIN

  function text(value: string, x: number, top: number, size = 9, strong = false, right = false) {
    const font = strong ? bold : regular
    const content = clean(value)
    page.drawText(content, { x: right ? x - font.widthOfTextAtSize(content, size) : x, y: top - size, size, font, color: strong ? GREEN : INK })
  }

  function wrap(value: string, width: number, size = 9) {
    const lines: string[] = []
    let line = ''
    for (const word of clean(value).split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word
      if (regular.widthOfTextAtSize(candidate, size) <= width) {
        line = candidate
        continue
      }
      if (line) lines.push(line)
      line = ''
      for (const char of word) {
        if (regular.widthOfTextAtSize(line + char, size) > width && line) {
          lines.push(line)
          line = ''
        }
        line += char
      }
    }
    lines.push(line)
    return lines
  }

  function paragraph(value: string, size = 9) {
    for (const line of wrap(value, WIDTH - 2 * MARGIN, size)) {
      text(line, MARGIN, y, size)
      y -= size + 5
    }
  }

  function tableHeader() {
    page.drawRectangle({ x: MARGIN, y: y - 24, width: WIDTH - 2 * MARGIN, height: 24, color: PALE })
    ;['Date du mouvement', 'Document', 'Client', 'Mode', 'Statut / mouvement', 'Montant CHF'].forEach((label, index) => {
      text(label, index === 5 ? COLUMNS[6]! - 6 : COLUMNS[index]! + 6, y - 7, 8, true, index === 5)
    })
    y -= 24
  }

  const period = filters.dateFrom || filters.dateTo
    ? `Période : ${filters.dateFrom ? formatDate(filters.dateFrom) : 'début'} au ${filters.dateTo ? formatDate(filters.dateTo) : 'sans limite'}`
    : 'Période : toutes les dates'
  paragraph(company.name, 11)
  text('Journal des paiements', MARGIN, y - 3, 22, true)
  y -= 36
  paragraph(`${period} · ${payments.length} mouvement(s) · Europe/Zurich`)
  const filterLabels = [
    filters.search ? `Recherche : ${filters.search}` : '',
    filters.method ? `Mode : ${paymentMethodLabels[filters.method]}` : '',
    filters.status ? `Statut : ${paymentStatusLabels[filters.status]}` : '',
    filters.documentId ? `Document ID : ${filters.documentId}` : '',
    filters.customerId ? `Client ID : ${filters.customerId}` : ''
  ].filter(Boolean)
  if (filterLabels.length) paragraph(filterLabels.join(' · '))
  y -= 10

  const summary = summarizePaymentExport(payments)
  const cards = [
    ['Encaissements', summary.received],
    ['Remboursements', summary.refunded],
    ['Net encaissé', summary.net],
    ['En attente (hors net)', summary.pending]
  ] as const
  const cardWidth = (WIDTH - 2 * MARGIN) / cards.length
  cards.forEach(([label, amount], index) => {
    const x = MARGIN + index * cardWidth
    text(label, x, y, 9)
    text(formatCurrency(amount), x, y - 17, 17, true)
  })
  y -= 51
  paragraph(`Net par mode : ${paymentMethods.map(method => `${paymentMethodLabels[method]} : ${formatCurrency(summary.byMethod[method])}`).join(' / ')}`)
  paragraph(`Le net inclut uniquement les mouvements effectués. ${summary.excludedCount} mouvement(s) en attente, annulé(s) ou anciennement remboursé(s) exclu(s).`, 8)
  y -= 12
  tableHeader()

  if (!payments.length) {
    y -= 14
    paragraph('Aucun paiement ne correspond aux filtres sélectionnés.')
  }
  for (const payment of payments) {
    const values = [
      formatDateTime(payment.paidAt),
      payment.documentNumber,
      payment.customerName || 'Passage comptoir',
      paymentMethodLabels[payment.method],
      payment.status === 'paid' ? payment.amount < 0 ? 'Remboursement' : 'Encaissé' : paymentStatusLabels[payment.status],
      formatCurrency(payment.amount)
    ]
    const cells = values.map((value, index) => wrap(value, COLUMNS[index + 1]! - COLUMNS[index]! - 12))
    const height = Math.max(...cells.map(lines => lines.length)) * 12 + 6
    if (y - height < MARGIN + 22) {
      page = pdf.addPage([WIDTH, HEIGHT])
      y = HEIGHT - MARGIN
      text('Journal des paiements · suite', MARGIN, y, 12, true)
      y -= 26
      tableHeader()
    }
    cells.forEach((lines, index) => {
      lines.forEach((line, lineIndex) => text(line, index === 5 ? COLUMNS[6]! - 6 : COLUMNS[index]! + 6, y - 3 - lineIndex * 12, 9, index === 5, index === 5))
    })
    y -= height
    page.drawLine({ start: { x: MARGIN, y }, end: { x: WIDTH - MARGIN, y }, color: PALE, thickness: 0.8 })
  }

  const pages = pdf.getPages()
  const generatedAt = formatDateTime(new Date())
  pages.forEach((current, index) => {
    current.drawText(`Édité le ${generatedAt} · Montants en CHF`, { x: MARGIN, y: 22, font: regular, size: 8, color: MUTED })
    current.drawText(`${index + 1} / ${pages.length}`, { x: WIDTH - MARGIN - 34, y: 22, font: regular, size: 8, color: MUTED })
  })
  return pdf.save()
}
