import QRCode from 'qrcode'
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage
} from 'pdf-lib'
import { documentStatusLabels, documentTypeLabels, paymentMethodLabels } from '~~/shared/constants/pos'
import type { DocumentDetail } from '~~/shared/types/pos'
import type { CompanySettingsRecord } from '~~/shared/types/settings'
import { formatCurrency, formatDate, formatDateTime, isPayableDocumentType } from '~~/shared/utils/pos'
import { buildSwissQrBill } from '~~/shared/utils/qr-bill'

const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const PAGE_MARGIN = 40
const CONTENT_WIDTH = PAGE_WIDTH - (PAGE_MARGIN * 2)
const FONT_SIZE = 10
const SMALL_FONT_SIZE = 9
const LINE_HEIGHT = 14

const COLORS = {
  text: rgb(0.15, 0.17, 0.21),
  muted: rgb(0.4, 0.45, 0.53),
  border: rgb(0.84, 0.87, 0.91),
  surface: rgb(0.96, 0.97, 0.98),
  strongSurface: rgb(0.93, 0.95, 0.97)
}

type PdfContext = {
  pdfDoc: PDFDocument
  regularFont: PDFFont
  boldFont: PDFFont
  page: PDFPage
  cursorY: number
}

type TextStyle = {
  font?: PDFFont
  size?: number
  color?: ReturnType<typeof rgb>
  lineHeight?: number
}

function createPage(pdfDoc: PDFDocument) {
  return pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
}

function addPage(context: PdfContext) {
  context.page = createPage(context.pdfDoc)
  context.cursorY = PAGE_HEIGHT - PAGE_MARGIN
}

function ensureSpace(context: PdfContext, requiredHeight: number) {
  if (context.cursorY - requiredHeight < PAGE_MARGIN) {
    addPage(context)
  }
}

function drawRule(context: PdfContext) {
  context.page.drawLine({
    start: { x: PAGE_MARGIN, y: context.cursorY },
    end: { x: PAGE_WIDTH - PAGE_MARGIN, y: context.cursorY },
    thickness: 1,
    color: COLORS.border
  })
  context.cursorY -= 12
}

function toWrappedLines(
  font: PDFFont,
  text: string,
  fontSize: number,
  maxWidth: number
) {
  const paragraphs = text.split(/\r?\n/)
  const wrapped: string[] = []

  for (const paragraph of paragraphs) {
    const normalizedParagraph = paragraph.trim()

    if (!normalizedParagraph) {
      wrapped.push('')
      continue
    }

    const words = normalizedParagraph.split(/\s+/)
    let currentLine = ''

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word

      if (font.widthOfTextAtSize(candidate, fontSize) <= maxWidth) {
        currentLine = candidate
        continue
      }

      if (currentLine) {
        wrapped.push(currentLine)
        currentLine = word
        continue
      }

      let segment = ''

      for (const character of word) {
        const nextSegment = `${segment}${character}`

        if (font.widthOfTextAtSize(nextSegment, fontSize) <= maxWidth || !segment) {
          segment = nextSegment
          continue
        }

        wrapped.push(segment)
        segment = character
      }

      currentLine = segment
    }

    if (currentLine) {
      wrapped.push(currentLine)
    }
  }

  return wrapped.length ? wrapped : ['']
}

function drawTextBlock(
  context: PdfContext,
  text: string,
  x: number,
  topY: number,
  maxWidth: number,
  style: TextStyle = {}
) {
  const font = style.font || context.regularFont
  const size = style.size || FONT_SIZE
  const color = style.color || COLORS.text
  const lineHeight = style.lineHeight || Math.max(size + 3, LINE_HEIGHT)
  const lines = toWrappedLines(font, text, size, maxWidth)

  lines.forEach((line, index) => {
    context.page.drawText(line, {
      x,
      y: topY - size - (index * lineHeight),
      font,
      size,
      color
    })
  })

  return topY - (lines.length * lineHeight)
}

function drawRightAlignedText(
  context: PdfContext,
  text: string,
  rightX: number,
  y: number,
  style: TextStyle = {}
) {
  const font = style.font || context.regularFont
  const size = style.size || FONT_SIZE
  const color = style.color || COLORS.text
  const width = font.widthOfTextAtSize(text, size)

  context.page.drawText(text, {
    x: rightX - width,
    y,
    font,
    size,
    color
  })
}

async function embedDataUrlImage(pdfDoc: PDFDocument, dataUrl: string | null | undefined) {
  if (!dataUrl) {
    return null
  }

  const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg));base64,(.+)$/)

  if (!match) {
    return null
  }

  const mimeType = match[1]
  const data = match[2]

  if (!mimeType || !data) {
    return null
  }

  const bytes = Uint8Array.from(atob(data), character => character.charCodeAt(0))

  if (mimeType === 'image/png') {
    return pdfDoc.embedPng(bytes)
  }

  return pdfDoc.embedJpg(bytes)
}

function drawImageWithinBox(
  page: PDFPage,
  image: PDFImage,
  left: number,
  bottom: number,
  maxWidth: number,
  maxHeight: number
) {
  const scale = Math.min(maxWidth / image.width, maxHeight / image.height, 1)

  page.drawImage(image, {
    x: left,
    y: bottom,
    width: image.width * scale,
    height: image.height * scale
  })

  return {
    width: image.width * scale,
    height: image.height * scale
  }
}

function getCompanyLines(company: CompanySettingsRecord) {
  return [
    company.name,
    company.address,
    [company.postalCode, company.city].filter(Boolean).join(' ').trim() || null,
    company.phone,
    company.email,
    company.website
  ].filter(Boolean) as string[]
}

function getCustomerLines(document: DocumentDetail) {
  return [
    document.customer.displayName,
    document.customer.addressLine1,
    document.customer.addressLine2,
    [document.customer.postalCode, document.customer.city].filter(Boolean).join(' ').trim() || null,
    document.customer.phone,
    document.customer.email
  ].filter(Boolean) as string[]
}

function getLatestPaidSummary(document: DocumentDetail) {
  const latestPaid = [...document.payments]
    .filter(payment => payment.status === 'paid')
    .sort((left, right) => new Date(right.paidAt).getTime() - new Date(left.paidAt).getTime())[0]

  if (!latestPaid) {
    return null
  }

  return {
    method: paymentMethodLabels[latestPaid.method],
    paidAt: formatDateTime(latestPaid.paidAt),
    reference: latestPaid.reference
  }
}

function drawSectionLabel(context: PdfContext, label: string, x: number, topY: number, width: number) {
  return drawTextBlock(context, label, x, topY, width, {
    font: context.boldFont,
    size: SMALL_FONT_SIZE,
    color: COLORS.muted,
    lineHeight: 11
  })
}

function drawHeader(context: PdfContext, document: DocumentDetail, company: CompanySettingsRecord, logoImage: PDFImage | null) {
  const headerHeight = 110
  ensureSpace(context, headerHeight)

  const topY = context.cursorY
  const leftX = PAGE_MARGIN
  const rightX = PAGE_MARGIN + (CONTENT_WIDTH / 2)

  let leftStartY = topY

  if (logoImage) {
    const { height } = drawImageWithinBox(context.page, logoImage, leftX, topY - 56, 120, 42)
    leftStartY = Math.max(topY - height - 6, topY - 46)
  }

  let companyBottomY = drawTextBlock(context, company.name, leftX, leftStartY, 240, {
    font: context.boldFont,
    size: 18,
    lineHeight: 21
  })

  const companyMeta = getCompanyLines(company).slice(1).join('\n')

  if (companyMeta) {
    companyBottomY = drawTextBlock(context, companyMeta, leftX, companyBottomY - 4, 240, {
      size: SMALL_FONT_SIZE,
      color: COLORS.muted,
      lineHeight: 12
    })
  }

  drawTextBlock(context, documentTypeLabels[document.type], rightX, topY, CONTENT_WIDTH / 2, {
    font: context.boldFont,
    size: 18,
    lineHeight: 20
  })
  drawTextBlock(context, document.documentNumber, rightX, topY - 24, CONTENT_WIDTH / 2, {
    font: context.boldFont,
    size: 14,
    lineHeight: 16
  })

  drawTextBlock(context, [
    `Émis le ${formatDate(document.issuedAt)}`,
    `Statut ${documentStatusLabels[document.status]}`,
    document.ticket ? `Ticket ${document.ticket.ticketNumber}` : null
  ].filter(Boolean).join('\n'), rightX, topY - 48, CONTENT_WIDTH / 2, {
    size: SMALL_FONT_SIZE,
    color: COLORS.muted,
    lineHeight: 12
  })

  context.cursorY = Math.min(companyBottomY, topY - 84) - 12
  drawRule(context)
}

function drawParties(context: PdfContext, document: DocumentDetail, company: CompanySettingsRecord) {
  const blockHeight = 88
  ensureSpace(context, blockHeight)

  const leftX = PAGE_MARGIN
  const rightX = PAGE_MARGIN + (CONTENT_WIDTH / 2) + 12
  const blockWidth = (CONTENT_WIDTH / 2) - 12
  const topY = context.cursorY

  context.page.drawRectangle({
    x: leftX,
    y: topY - 76,
    width: blockWidth,
    height: 76,
    color: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1
  })
  context.page.drawRectangle({
    x: rightX,
    y: topY - 76,
    width: blockWidth,
    height: 76,
    color: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1
  })

  drawSectionLabel(context, 'Société', leftX + 12, topY - 10, blockWidth - 24)
  drawTextBlock(context, getCompanyLines(company).join('\n'), leftX + 12, topY - 26, blockWidth - 24, {
    size: SMALL_FONT_SIZE,
    lineHeight: 12
  })

  drawSectionLabel(context, 'Client', rightX + 12, topY - 10, blockWidth - 24)
  drawTextBlock(context, getCustomerLines(document).join('\n'), rightX + 12, topY - 26, blockWidth - 24, {
    size: SMALL_FONT_SIZE,
    lineHeight: 12
  })

  context.cursorY -= 92
}

function drawPaymentSummary(context: PdfContext, document: DocumentDetail) {
  const summary = getLatestPaidSummary(document)

  if (!summary) {
    return
  }

  ensureSpace(context, 44)

  const topY = context.cursorY
  context.page.drawRectangle({
    x: PAGE_MARGIN,
    y: topY - 34,
    width: CONTENT_WIDTH,
    height: 34,
    color: COLORS.strongSurface,
    borderColor: COLORS.border,
    borderWidth: 1
  })

  drawTextBlock(context, `Dernier paiement · ${summary.method} · ${summary.paidAt}`, PAGE_MARGIN + 12, topY - 7, CONTENT_WIDTH - 24, {
    font: context.boldFont,
    size: SMALL_FONT_SIZE,
    lineHeight: 12
  })

  if (summary.reference) {
    drawTextBlock(context, `Référence ${summary.reference}`, PAGE_MARGIN + 12, topY - 21, CONTENT_WIDTH - 24, {
      size: SMALL_FONT_SIZE,
      color: COLORS.muted,
      lineHeight: 12
    })
  }

  context.cursorY -= 46
}

function drawTableHeader(context: PdfContext) {
  ensureSpace(context, 26)

  const topY = context.cursorY
  const xDesc = PAGE_MARGIN
  const xQty = PAGE_MARGIN + 290
  const xVat = PAGE_MARGIN + 340
  const xUnit = PAGE_MARGIN + 395
  const xTotal = PAGE_WIDTH - PAGE_MARGIN

  context.page.drawRectangle({
    x: PAGE_MARGIN,
    y: topY - 18,
    width: CONTENT_WIDTH,
    height: 18,
    color: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1
  })

  drawTextBlock(context, 'Description', xDesc + 8, topY - 4, 220, {
    font: context.boldFont,
    size: SMALL_FONT_SIZE,
    lineHeight: 10
  })
  drawRightAlignedText(context, 'Qté', xQty + 30, topY - 13, {
    font: context.boldFont,
    size: SMALL_FONT_SIZE
  })
  drawRightAlignedText(context, 'TVA', xVat + 30, topY - 13, {
    font: context.boldFont,
    size: SMALL_FONT_SIZE
  })
  drawRightAlignedText(context, 'PU', xUnit + 65, topY - 13, {
    font: context.boldFont,
    size: SMALL_FONT_SIZE
  })
  drawRightAlignedText(context, 'Total', xTotal - 8, topY - 13, {
    font: context.boldFont,
    size: SMALL_FONT_SIZE
  })

  context.cursorY -= 24
}

function drawDocumentLines(context: PdfContext, document: DocumentDetail) {
  drawTableHeader(context)

  const xDesc = PAGE_MARGIN + 8
  const xQty = PAGE_MARGIN + 320
  const xVat = PAGE_MARGIN + 370
  const xUnit = PAGE_MARGIN + 460
  const xTotal = PAGE_WIDTH - PAGE_MARGIN - 8

  for (const line of document.lines) {
    const descriptionLines = toWrappedLines(context.regularFont, line.label, FONT_SIZE, 265)
    const rowHeight = Math.max(22, (descriptionLines.length * 12) + 10)
    ensureSpace(context, rowHeight + 12)

    if (context.cursorY < PAGE_MARGIN + rowHeight + 20) {
      addPage(context)
      drawTableHeader(context)
    }

    const topY = context.cursorY

    context.page.drawLine({
      start: { x: PAGE_MARGIN, y: topY },
      end: { x: PAGE_WIDTH - PAGE_MARGIN, y: topY },
      thickness: 1,
      color: COLORS.border
    })

    drawTextBlock(context, descriptionLines.join('\n'), xDesc, topY - 6, 265, {
      size: FONT_SIZE,
      lineHeight: 12
    })

    drawRightAlignedText(context, String(line.quantity), xQty, topY - 16, { size: FONT_SIZE })
    drawRightAlignedText(context, `${line.vatRate.toFixed(1)}%`, xVat, topY - 16, { size: FONT_SIZE })
    drawRightAlignedText(context, formatCurrency(line.unitPrice), xUnit, topY - 16, { size: FONT_SIZE })
    drawRightAlignedText(context, formatCurrency(line.lineTotal), xTotal, topY - 16, {
      font: context.boldFont,
      size: FONT_SIZE
    })

    context.cursorY -= rowHeight
  }

  context.page.drawLine({
    start: { x: PAGE_MARGIN, y: context.cursorY },
    end: { x: PAGE_WIDTH - PAGE_MARGIN, y: context.cursorY },
    thickness: 1,
    color: COLORS.border
  })
  context.cursorY -= 14
}

function drawSummary(context: PdfContext, document: DocumentDetail, company: CompanySettingsRecord) {
  const hasNotes = Boolean(document.notes || company.paymentTerms)
  const blockHeight = hasNotes ? 118 : 82
  ensureSpace(context, blockHeight)

  const leftX = PAGE_MARGIN
  const leftWidth = 280
  const rightX = PAGE_WIDTH - PAGE_MARGIN - 160
  const topY = context.cursorY

  if (hasNotes) {
    drawSectionLabel(context, 'Notes', leftX, topY, leftWidth)
    drawTextBlock(
      context,
      [document.notes, company.paymentTerms].filter(Boolean).join('\n\n'),
      leftX,
      topY - 14,
      leftWidth,
      {
        size: SMALL_FONT_SIZE,
        color: COLORS.muted,
        lineHeight: 12
      }
    )
  }

  const totalRows = [
    ['Sous-total', formatCurrency(document.subtotal)],
    ['TVA', formatCurrency(document.taxAmount)],
    ['Total TTC', formatCurrency(document.total)]
  ] as const

  let offset = 0

  for (const [label, value] of totalRows) {
    const y = topY - 16 - offset
    drawTextBlock(context, label, rightX, y + 6, 80, { size: SMALL_FONT_SIZE, color: COLORS.muted })
    drawRightAlignedText(context, value, PAGE_WIDTH - PAGE_MARGIN, y - 3, {
      font: label === 'Total TTC' ? context.boldFont : context.regularFont,
      size: label === 'Total TTC' ? 13 : FONT_SIZE
    })
    offset += label === 'Total TTC' ? 26 : 18
  }

  if (isPayableDocumentType(document.type)) {
    const paidAmount = document.payments
      .filter(payment => payment.status === 'paid')
      .reduce((total, payment) => total + payment.amount, 0)
    const balanceDue = Math.max(document.total - paidAmount, 0)

    drawTextBlock(context, 'Encaissé', rightX, topY - 72, 80, { size: SMALL_FONT_SIZE, color: COLORS.muted })
    drawRightAlignedText(context, formatCurrency(paidAmount), PAGE_WIDTH - PAGE_MARGIN, topY - 81, { size: FONT_SIZE })
    drawTextBlock(context, 'Restant', rightX, topY - 90, 80, { size: SMALL_FONT_SIZE, color: COLORS.muted })
    drawRightAlignedText(context, formatCurrency(balanceDue), PAGE_WIDTH - PAGE_MARGIN, topY - 99, {
      font: context.boldFont,
      size: FONT_SIZE
    })
  }

  context.cursorY -= blockHeight
}

async function drawQrSection(context: PdfContext, document: DocumentDetail, company: CompanySettingsRecord) {
  const qrBill = buildSwissQrBill(document, company)

  if (!qrBill) {
    return
  }

  const qrDataUrl = await QRCode.toDataURL(qrBill.payload, {
    errorCorrectionLevel: 'M',
    margin: 0,
    width: 180
  })
  const qrImage = await embedDataUrlImage(context.pdfDoc, qrDataUrl)

  if (!qrImage) {
    return
  }

  ensureSpace(context, 170)

  const topY = context.cursorY
  context.page.drawRectangle({
    x: PAGE_MARGIN,
    y: topY - 158,
    width: CONTENT_WIDTH,
    height: 158,
    color: COLORS.surface,
    borderColor: COLORS.border,
    borderWidth: 1
  })

  drawSectionLabel(context, 'Paiement QR', PAGE_MARGIN + 14, topY - 12, CONTENT_WIDTH - 28)
  drawImageWithinBox(context.page, qrImage, PAGE_MARGIN + 14, topY - 142, 132, 132)

  const infoX = PAGE_MARGIN + 164
  const infoWidth = CONTENT_WIDTH - 178
  drawTextBlock(context, [
    `Compte ${qrBill.account}`,
    `Montant ${qrBill.amount ? `${qrBill.amount} ${qrBill.currency}` : formatCurrency(document.total)}`,
    `Référence ${qrBill.displayReference}`,
    `Créancier ${company.name}`,
    qrBill.debtor ? `Débiteur ${document.customer.displayName}` : null
  ].filter(Boolean).join('\n'), infoX, topY - 22, infoWidth, {
    size: SMALL_FONT_SIZE,
    lineHeight: 13
  })

  context.cursorY -= 172
}

function drawFooter(context: PdfContext, company: CompanySettingsRecord) {
  const footerLines = [
    company.footerNotes,
    [company.phone, company.email, company.website].filter(Boolean).join(' · ') || null
  ].filter(Boolean) as string[]

  if (!footerLines.length) {
    return
  }

  ensureSpace(context, 48)
  drawRule(context)
  drawTextBlock(context, footerLines.join('\n'), PAGE_MARGIN, context.cursorY, CONTENT_WIDTH, {
    size: SMALL_FONT_SIZE,
    color: COLORS.muted,
    lineHeight: 12
  })
}

export async function generateDocumentPdf(document: DocumentDetail, company: CompanySettingsRecord) {
  const pdfDoc = await PDFDocument.create()
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const logoImage = await embedDataUrlImage(pdfDoc, company.logoDataUrl)
  const context: PdfContext = {
    pdfDoc,
    regularFont,
    boldFont,
    page: createPage(pdfDoc),
    cursorY: PAGE_HEIGHT - PAGE_MARGIN
  }

  drawHeader(context, document, company, logoImage)
  drawParties(context, document, company)
  drawPaymentSummary(context, document)
  drawDocumentLines(context, document)
  drawSummary(context, document, company)
  await drawQrSection(context, document, company)
  drawFooter(context, company)

  return pdfDoc.save()
}
