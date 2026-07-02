import QRCodeCore from 'qrcode/lib/core/qrcode.js'
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage
} from 'pdf-lib'
import { documentStatusLabels } from '~~/shared/constants/pos'
import type { DocumentDetail } from '~~/shared/types/pos'
import type { CompanySettingsRecord } from '~~/shared/types/settings'
import { buildDocumentA4PrintModel } from '~~/shared/utils/document-print'
import { calculateIncludedVatAmount, formatCurrency, formatDate } from '~~/shared/utils/pos'
import type { SwissQrAddress } from '~~/shared/utils/qr-bill'

const MM = 72 / 25.4

const PAGE_WIDTH = 210 * MM
const PAGE_HEIGHT = 297 * MM
const OUTER_MARGIN = 7 * MM
const SECTION_PADDING_X = 5.8 * MM
const SECTION_LEFT = OUTER_MARGIN + SECTION_PADDING_X
const SECTION_RIGHT = PAGE_WIDTH - OUTER_MARGIN - SECTION_PADDING_X
const SECTION_WIDTH = SECTION_RIGHT - SECTION_LEFT
const SHEET_LEFT = OUTER_MARGIN
const SHEET_RIGHT = PAGE_WIDTH - OUTER_MARGIN
const TOP_START = PAGE_HEIGHT - OUTER_MARGIN
const BOTTOM_LIMIT = OUTER_MARGIN
const SWISS_WINDOW_LEFT = 20 * MM
const SWISS_WINDOW_TOP = 45 * MM
const SWISS_WINDOW_WIDTH = 100 * MM
const SWISS_WINDOW_HEIGHT = 45 * MM
const SWISS_REFERENCE_LEFT = SWISS_WINDOW_LEFT
const SWISS_WINDOW_RIGHT_INSET = 14.2 * MM

const FONT_BODY = 8
const FONT_SMALL = 7
const FONT_LABEL = 6.2
const FONT_KICKER = 6
const FONT_COMPANY = 14
const FONT_NUMBER = 11.5
const FONT_TOTAL = 10

const COLORS = {
  text: hexToRgb('#334155'),
  strong: hexToRgb('#0f172a'),
  muted: hexToRgb('#607393'),
  border: hexToRgb('#dbe4f0'),
  dark: hexToRgb('#111827'),
  tableHead: hexToRgb('#18233b'),
  tableHeadText: rgb(1, 1, 1),
  primary: hexToRgb('#0f9f6e'),
  totalsBg: hexToRgb('#f8fafc'),
  logoBorder: hexToRgb('#d9e1ed'),
  white: rgb(1, 1, 1)
}

type PdfContext = {
  pdfDoc: PDFDocument
  page: PDFPage
  regularFont: PDFFont
  boldFont: PDFFont
  cursorY: number
}

type TextStyle = {
  font?: PDFFont
  size?: number
  color?: ReturnType<typeof rgb>
  lineHeight?: number
}

type QrCodeMatrix = {
  modules: {
    size: number
    data: ArrayLike<boolean>
  }
}

function hexToRgb(hex: string) {
  const normalized = hex.replace('#', '')
  const value = Number.parseInt(normalized, 16)

  return rgb(
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255
  )
}

function createPage(pdfDoc: PDFDocument) {
  return pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT])
}

function addPage(context: PdfContext) {
  context.page = createPage(context.pdfDoc)
  context.cursorY = TOP_START
}

function ensureSpace(context: PdfContext, height: number) {
  if (context.cursorY - height < BOTTOM_LIMIT) {
    addPage(context)
  }
}

function getLineHeight(size: number, override?: number) {
  return override || Math.max(size + 2.5, size * 1.24)
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number) {
  const paragraphs = text.split(/\r?\n/)
  const lines: string[] = []

  for (const paragraph of paragraphs) {
    const normalized = paragraph.trim()

    if (!normalized) {
      lines.push('')
      continue
    }

    const words = normalized.split(/\s+/)
    let current = ''

    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word

      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate
        continue
      }

      if (current) {
        lines.push(current)
        current = word
        continue
      }

      let segment = ''

      for (const character of word) {
        const next = `${segment}${character}`

        if (font.widthOfTextAtSize(next, size) <= maxWidth || !segment) {
          segment = next
          continue
        }

        lines.push(segment)
        segment = character
      }

      current = segment
    }

    if (current) {
      lines.push(current)
    }
  }

  return lines.length ? lines : ['']
}

function measureTextBlock(font: PDFFont, text: string, size: number, maxWidth: number, lineHeight?: number) {
  const resolvedLineHeight = getLineHeight(size, lineHeight)
  return wrapText(font, text, size, maxWidth).length * resolvedLineHeight
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
  const size = style.size || FONT_BODY
  const color = style.color || COLORS.text
  const lineHeight = getLineHeight(size, style.lineHeight)
  const lines = wrapText(font, text, size, maxWidth)

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
  baselineY: number,
  style: TextStyle = {}
) {
  const font = style.font || context.regularFont
  const size = style.size || FONT_BODY
  const color = style.color || COLORS.text
  const width = font.widthOfTextAtSize(text, size)

  context.page.drawText(text, {
    x: rightX - width,
    y: baselineY,
    font,
    size,
    color
  })
}

function drawHorizontalRule(context: PdfContext, y: number, color = COLORS.border, thickness = 0.6) {
  context.page.drawLine({
    start: { x: SHEET_LEFT, y },
    end: { x: SHEET_RIGHT, y },
    thickness,
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
  const encoded = match[2]

  if (!mimeType || !encoded) {
    return null
  }

  const bytes = Uint8Array.from(atob(encoded), character => character.charCodeAt(0))

  if (mimeType === 'image/png') {
    return contextSafeEmbedPng(pdfDoc, bytes)
  }

  return pdfDoc.embedJpg(bytes)
}

async function contextSafeEmbedPng(pdfDoc: PDFDocument, bytes: Uint8Array) {
  return pdfDoc.embedPng(bytes)
}

function drawImageCentered(page: PDFPage, image: PDFImage, boxX: number, boxY: number, boxWidth: number, boxHeight: number) {
  const scale = Math.min(boxWidth / image.width, boxHeight / image.height, 1)
  const width = image.width * scale
  const height = image.height * scale

  page.drawImage(image, {
    x: boxX + ((boxWidth - width) / 2),
    y: boxY + ((boxHeight - height) / 2),
    width,
    height
  })
}

function drawQrCode(page: PDFPage, payload: string, x: number, y: number, size: number) {
  const qrCode = QRCodeCore.create(payload, {
    errorCorrectionLevel: 'M'
  }) as QrCodeMatrix
  const modules = qrCode.modules
  const cellSize = size / modules.size

  page.drawRectangle({
    x,
    y,
    width: size,
    height: size,
    color: COLORS.white
  })

  for (let row = 0; row < modules.size; row++) {
    for (let column = 0; column < modules.size; column++) {
      if (!modules.data[(row * modules.size) + column]) {
        continue
      }

      page.drawRectangle({
        x: x + (column * cellSize),
        y: y + ((modules.size - row - 1) * cellSize),
        width: cellSize,
        height: cellSize,
        color: COLORS.dark
      })
    }
  }
}

function formatQrStreet(address: SwissQrAddress) {
  return [address.street, address.buildingNumber].filter(Boolean).join(' ')
}

function formatQrLocation(address: SwissQrAddress) {
  return [address.postalCode, address.city].filter(Boolean).join(' ')
}

function drawHeader(context: PdfContext, document: DocumentDetail, company: CompanySettingsRecord, logoImage: PDFImage | null) {
  const model = buildDocumentA4PrintModel(document, company)
  const topY = context.cursorY - (4.8 * MM)
  const rightColumnWidth = 49 * MM
  const headGap = 6 * MM
  const leftColumnWidth = SECTION_WIDTH - headGap - rightColumnWidth
  const logoBoxSize = 11.5 * MM
  const logoGap = 3 * MM
  const brandTextX = SECTION_LEFT + (logoImage ? logoBoxSize + logoGap : 0)
  const brandTextWidth = leftColumnWidth - (logoImage ? logoBoxSize + logoGap : 0)

  ensureSpace(context, 100 * MM)

  if (logoImage) {
    const logoBoxY = topY - logoBoxSize

    context.page.drawRectangle({
      x: SECTION_LEFT,
      y: logoBoxY,
      width: logoBoxSize,
      height: logoBoxSize,
      borderColor: COLORS.logoBorder,
      borderWidth: 0.6
    })

    drawImageCentered(context.page, logoImage, SECTION_LEFT, logoBoxY, logoBoxSize, logoBoxSize)
  }

  drawTextBlock(context, 'Document commercial', brandTextX, topY, brandTextWidth, {
    font: context.boldFont,
    size: FONT_KICKER,
    color: COLORS.muted,
    lineHeight: 8
  })

  const brandBottom = drawTextBlock(context, company.name, brandTextX, topY - 10, brandTextWidth, {
    font: context.boldFont,
    size: FONT_COMPANY,
    color: COLORS.strong,
    lineHeight: 15
  })

  const companyMeta = [...model.companyAddress, company.phone, company.email, company.website].filter(Boolean).join('\n')

  if (companyMeta) {
    drawTextBlock(context, companyMeta, brandTextX, brandBottom - 3, brandTextWidth, {
      size: FONT_SMALL,
      color: COLORS.text,
      lineHeight: 9
    })
  }

  drawRightAlignedText(context, model.documentTitle.toUpperCase(), SECTION_RIGHT, topY - FONT_KICKER, {
    font: context.boldFont,
    size: FONT_KICKER,
    color: COLORS.primary
  })
  drawRightAlignedText(context, document.documentNumber, SECTION_RIGHT, topY - 20, {
    font: context.boldFont,
    size: FONT_NUMBER,
    color: COLORS.strong
  })

  const metaLines = [
    `Émis le ${formatDate(document.issuedAt)}`,
    document.ticket ? `Réf. ticket ${document.ticket.ticketNumber}` : null,
    `Statut ${documentStatusLabels[document.status]}`
  ].filter(Boolean) as string[]

  let metaY = topY - 34
  metaLines.forEach((line) => {
    drawRightAlignedText(context, line, SECTION_RIGHT, metaY, {
      size: FONT_SMALL,
      color: COLORS.text
    })
    metaY -= 10
  })

  const windowTopY = PAGE_HEIGHT - SWISS_WINDOW_TOP
  const windowBottomY = PAGE_HEIGHT - SWISS_WINDOW_TOP - SWISS_WINDOW_HEIGHT
  const windowX = SECTION_RIGHT - SWISS_WINDOW_RIGHT_INSET - SWISS_WINDOW_WIDTH
  const windowContentTop = windowTopY - (10.8 * MM)
  const windowContentX = windowX + (6 * MM)
  const windowContentWidth = SWISS_WINDOW_WIDTH - (12 * MM)
  const referencesWidth = Math.max(windowX - (6 * MM) - SWISS_REFERENCE_LEFT, 36 * MM)

  drawTextBlock(context, 'Références', SWISS_REFERENCE_LEFT, windowTopY, referencesWidth, {
    font: context.boldFont,
    size: FONT_LABEL,
    color: COLORS.muted,
    lineHeight: 7.5
  })
  const referencesBottom = drawTextBlock(context, model.referenceLines.join('\n'), SWISS_REFERENCE_LEFT, windowTopY - 9, referencesWidth, {
    size: FONT_SMALL,
    color: COLORS.text,
    lineHeight: 8.8
  })

  let windowBottom = drawTextBlock(context, model.windowLines[0] || document.customer.displayName, windowContentX, windowContentTop, windowContentWidth, {
    font: context.boldFont,
    size: FONT_BODY,
    color: COLORS.strong,
    lineHeight: 10
  })

  if (model.windowLines.length > 1) {
    windowBottom = drawTextBlock(context, model.windowLines.slice(1).join('\n'), windowContentX, windowBottom - 2, windowContentWidth, {
      size: FONT_BODY,
      color: COLORS.text,
      lineHeight: 9.8
    })
  }

  const headerBottom = Math.min(referencesBottom, windowBottom, windowBottomY)
  const ruleY = headerBottom - (3.2 * MM)
  drawHorizontalRule(context, ruleY)
  context.cursorY = ruleY - (3 * MM)
}

function drawTableHeader(context: PdfContext) {
  const topY = context.cursorY
  const headerHeight = 7 * MM
  const columns = getTableColumns()

  context.page.drawRectangle({
    x: SECTION_LEFT,
    y: topY - headerHeight,
    width: SECTION_WIDTH,
    height: headerHeight,
    color: COLORS.tableHead
  })

  const textY = topY - (headerHeight / 2) - (FONT_LABEL / 2)
  drawTextBlock(context, 'Désignation', columns.description.left + (2 * MM), topY - 4, columns.description.width - (4 * MM), {
    font: context.boldFont,
    size: FONT_LABEL,
    color: COLORS.tableHeadText,
    lineHeight: 7
  })
  drawRightAlignedText(context, 'Qté', columns.quantity.right - (2 * MM), textY, {
    font: context.boldFont,
    size: FONT_LABEL,
    color: COLORS.tableHeadText
  })
  drawRightAlignedText(context, 'Prix TTC', columns.unitPrice.right - (2 * MM), textY, {
    font: context.boldFont,
    size: FONT_LABEL,
    color: COLORS.tableHeadText
  })
  drawRightAlignedText(context, 'TVA', columns.vat.right - (2 * MM), textY, {
    font: context.boldFont,
    size: FONT_LABEL,
    color: COLORS.tableHeadText
  })
  drawRightAlignedText(context, 'TVA CHF', columns.vatAmount.right - (2 * MM), textY, {
    font: context.boldFont,
    size: FONT_LABEL,
    color: COLORS.tableHeadText
  })
  drawRightAlignedText(context, 'Total TTC', columns.total.right - (2 * MM), textY, {
    font: context.boldFont,
    size: FONT_LABEL,
    color: COLORS.tableHeadText
  })

  context.cursorY -= headerHeight
}

function getTableColumns() {
  const descriptionWidth = SECTION_WIDTH * 0.42
  const quantityWidth = SECTION_WIDTH * 0.07
  const unitPriceWidth = SECTION_WIDTH * 0.15
  const vatWidth = SECTION_WIDTH * 0.08
  const vatAmountWidth = SECTION_WIDTH * 0.13
  const totalWidth = SECTION_WIDTH - descriptionWidth - quantityWidth - unitPriceWidth - vatWidth - vatAmountWidth

  const descriptionLeft = SECTION_LEFT
  const quantityLeft = descriptionLeft + descriptionWidth
  const unitPriceLeft = quantityLeft + quantityWidth
  const vatLeft = unitPriceLeft + unitPriceWidth
  const vatAmountLeft = vatLeft + vatWidth
  const totalLeft = vatAmountLeft + vatAmountWidth

  return {
    description: { left: descriptionLeft, width: descriptionWidth, right: descriptionLeft + descriptionWidth },
    quantity: { left: quantityLeft, width: quantityWidth, right: quantityLeft + quantityWidth },
    unitPrice: { left: unitPriceLeft, width: unitPriceWidth, right: unitPriceLeft + unitPriceWidth },
    vat: { left: vatLeft, width: vatWidth, right: vatLeft + vatWidth },
    vatAmount: { left: vatAmountLeft, width: vatAmountWidth, right: vatAmountLeft + vatAmountWidth },
    total: { left: totalLeft, width: totalWidth, right: totalLeft + totalWidth }
  }
}

function drawDocumentLines(context: PdfContext, document: DocumentDetail) {
  const columns = getTableColumns()

  drawTableHeader(context)

  for (const line of document.lines) {
    const descriptionWidth = columns.description.width - (4 * MM)
    const descriptionHeight = measureTextBlock(context.boldFont, line.label, FONT_BODY, descriptionWidth, 10)
    const rowHeight = Math.max((5.4 * MM), descriptionHeight + (3.4 * MM))

    if (context.cursorY - rowHeight < BOTTOM_LIMIT) {
      addPage(context)
      drawTableHeader(context)
    }

    const rowTop = context.cursorY
    const textTop = rowTop - (1.7 * MM)
    const numberBaseline = textTop - FONT_BODY

    drawTextBlock(context, line.label, columns.description.left + (2 * MM), textTop, descriptionWidth, {
      font: context.boldFont,
      size: FONT_BODY,
      color: COLORS.strong,
      lineHeight: 10
    })
    drawRightAlignedText(context, String(line.quantity), columns.quantity.right - (2 * MM), numberBaseline, {
      size: FONT_BODY,
      color: COLORS.text
    })
    drawRightAlignedText(context, formatCurrency(line.unitPrice), columns.unitPrice.right - (2 * MM), numberBaseline, {
      size: FONT_BODY,
      color: COLORS.text
    })
    drawRightAlignedText(context, `${line.vatRate}%`, columns.vat.right - (2 * MM), numberBaseline, {
      size: FONT_BODY,
      color: COLORS.text
    })
    drawRightAlignedText(context, formatCurrency(calculateIncludedVatAmount(line.lineTotal, line.vatRate)), columns.vatAmount.right - (2 * MM), numberBaseline, {
      size: FONT_BODY,
      color: COLORS.text
    })
    drawRightAlignedText(context, formatCurrency(line.lineTotal), columns.total.right - (2 * MM), numberBaseline, {
      font: context.boldFont,
      size: FONT_BODY,
      color: COLORS.strong
    })

    const rowBottom = rowTop - rowHeight
    context.page.drawLine({
      start: { x: SECTION_LEFT, y: rowBottom },
      end: { x: SECTION_RIGHT, y: rowBottom },
      thickness: 0.6,
      color: COLORS.border
    })

    context.cursorY = rowBottom
  }

  context.cursorY -= (3 * MM)
}

function measureSummaryHeight(context: PdfContext, model: ReturnType<typeof buildDocumentA4PrintModel>) {
  const notesWidth = SECTION_WIDTH - (4 * MM) - (54 * MM)
  const noteHeight = model.noteBlocks.reduce((total, block, index) => {
    const labelHeight = measureTextBlock(context.boldFont, block.label, FONT_LABEL, notesWidth, 7.5)
    const contentHeight = measureTextBlock(context.regularFont, block.content, FONT_SMALL, notesWidth, 9.5)
    return total + labelHeight + contentHeight + (index ? (2.2 * MM) : 0) + (1.2 * MM)
  }, 0)
  const totalRows = 3 + ((model.isPayableDocument && model.paidAmount > 0) ? 2 : 0)
  const totalsHeight = (2.2 * MM) + (totalRows * 11) + 16

  return Math.max(noteHeight, totalsHeight) + (3 * MM)
}

function drawSummary(context: PdfContext, document: DocumentDetail, company: CompanySettingsRecord) {
  const model = buildDocumentA4PrintModel(document, company)
  const totalsWidth = 54 * MM
  const gap = 4 * MM
  const notesWidth = SECTION_WIDTH - gap - totalsWidth
  const topY = context.cursorY
  const requiredHeight = measureSummaryHeight(context, model)

  ensureSpace(context, requiredHeight)

  let notesBottom = topY

  if (model.noteBlocks.length) {
    for (const [index, block] of model.noteBlocks.entries()) {
      const blockTop = index === 0 ? topY : notesBottom - (2.2 * MM)
      drawTextBlock(context, block.label, SECTION_LEFT, blockTop, notesWidth, {
        font: context.boldFont,
        size: FONT_LABEL,
        color: COLORS.muted,
        lineHeight: 7.5
      })
      notesBottom = drawTextBlock(context, block.content, SECTION_LEFT, blockTop - 9, notesWidth, {
        size: FONT_SMALL,
        color: COLORS.text,
        lineHeight: 9.5
      })
    }
  }

  const totalRows = [
    { label: 'Total HT', value: formatCurrency(document.subtotal), emphasized: false },
    { label: 'TVA', value: formatCurrency(document.taxAmount), emphasized: false },
    { label: 'Total TTC', value: formatCurrency(document.total), emphasized: true }
  ]

  if (model.isPayableDocument && model.paidAmount > 0) {
    totalRows.push(
      { label: 'Encaissé', value: formatCurrency(model.paidAmount), emphasized: false },
      { label: 'Reste', value: formatCurrency(model.balanceDue), emphasized: false }
    )
  }

  const boxX = SECTION_RIGHT - totalsWidth
  const boxY = topY - requiredHeight + (3 * MM)
  const boxHeight = requiredHeight - (3 * MM)

  context.page.drawRectangle({
    x: boxX,
    y: boxY,
    width: totalsWidth,
    height: boxHeight,
    borderColor: COLORS.dark,
    borderWidth: 0.6,
    color: COLORS.totalsBg
  })

  let rowY = topY - (2.8 * MM)

  totalRows.forEach((row, index) => {
    if (row.emphasized) {
      context.page.drawLine({
        start: { x: boxX + (2.6 * MM), y: rowY + 3 },
        end: { x: boxX + totalsWidth - (2.6 * MM), y: rowY + 3 },
        thickness: 0.5,
        color: COLORS.border
      })
      rowY -= 4
    }

    drawTextBlock(context, row.label, boxX + (2.6 * MM), rowY, totalsWidth / 2, {
      size: FONT_SMALL,
      color: COLORS.strong
    })
    drawRightAlignedText(context, row.value, boxX + totalsWidth - (2.6 * MM), rowY - FONT_SMALL, {
      font: row.emphasized ? context.boldFont : context.regularFont,
      size: row.emphasized ? FONT_TOTAL : FONT_BODY,
      color: COLORS.strong
    })

    rowY -= index === totalRows.length - 1 ? 10 : 12
  })

  const summaryBottom = Math.min(notesBottom || topY, boxY)
  context.cursorY = summaryBottom - (3 * MM)
}

async function drawQrSection(context: PdfContext, document: DocumentDetail, company: CompanySettingsRecord) {
  const model = buildDocumentA4PrintModel(document, company)

  if (!model.qrBill) {
    return false
  }

  ensureSpace(context, 110 * MM)

  const sectionTopLine = context.cursorY
  const topY = sectionTopLine - (3.2 * MM)
  const minHeight = 105 * MM
  const sectionBottom = topY - minHeight
  const receiptWidth = 62 * MM
  const paymentX = SECTION_LEFT + receiptWidth + (3.2 * MM)

  drawHorizontalRule(context, sectionTopLine, COLORS.dark, 0.6)
  context.page.drawLine({
    start: { x: SECTION_LEFT + receiptWidth, y: topY },
    end: { x: SECTION_LEFT + receiptWidth, y: sectionBottom },
    thickness: 0.6,
    color: COLORS.dark
  })

  drawTextBlock(context, 'Récépissé', SECTION_LEFT, topY, receiptWidth - (3.2 * MM), {
    font: context.boldFont,
    size: FONT_SMALL,
    color: COLORS.dark,
    lineHeight: 9
  })

  let receiptBottom = drawTextBlock(context, `Compte / Payable à\n${company.iban || ''}\n${model.qrBill.creditor.name}\n${formatQrStreet(model.qrBill.creditor)}\n${formatQrLocation(model.qrBill.creditor)}`, SECTION_LEFT, topY - 11, receiptWidth - (3.2 * MM), {
    size: FONT_SMALL,
    color: COLORS.text,
    lineHeight: 9
  })

  if (model.qrBill.debtor) {
    receiptBottom = drawTextBlock(context, `Payable par\n${model.qrBill.debtor.name}\n${formatQrStreet(model.qrBill.debtor)}\n${formatQrLocation(model.qrBill.debtor)}`, SECTION_LEFT, receiptBottom - 10, receiptWidth - (3.2 * MM), {
      size: FONT_SMALL,
      color: COLORS.text,
      lineHeight: 9
    })
  }

  drawTextBlock(context, 'Monnaie', SECTION_LEFT, receiptBottom - 12, 24 * MM, {
    font: context.boldFont,
    size: FONT_LABEL,
    color: COLORS.muted
  })
  drawTextBlock(context, 'Montant', SECTION_LEFT + (28 * MM), receiptBottom - 12, 24 * MM, {
    font: context.boldFont,
    size: FONT_LABEL,
    color: COLORS.muted
  })
  drawTextBlock(context, 'CHF', SECTION_LEFT, receiptBottom - 20, 24 * MM, {
    size: FONT_SMALL,
    color: COLORS.text
  })
  drawTextBlock(context, model.qrBill.amount, SECTION_LEFT + (28 * MM), receiptBottom - 20, 24 * MM, {
    size: FONT_SMALL,
    color: COLORS.text
  })

  drawTextBlock(context, 'Section paiement', paymentX, topY, SECTION_RIGHT - paymentX, {
    font: context.boldFont,
    size: FONT_SMALL,
    color: COLORS.dark,
    lineHeight: 9
  })

  const paymentHeadColumnWidth = ((SECTION_RIGHT - paymentX) - (3 * MM)) / 2
  drawTextBlock(context, `Compte / Payable à\n${company.iban || ''}\n${model.qrBill.creditor.name}\n${formatQrStreet(model.qrBill.creditor)}\n${formatQrLocation(model.qrBill.creditor)}`, paymentX + paymentHeadColumnWidth + (3 * MM), topY - 11, paymentHeadColumnWidth, {
    size: FONT_SMALL,
    color: COLORS.text,
    lineHeight: 9
  })

  const qrBoxSize = 46 * MM
  const qrY = topY - (30 * MM) - qrBoxSize
  drawQrCode(context.page, model.qrBill.payload, paymentX, qrY, qrBoxSize)

  const markSize = 7 * MM
  const markX = paymentX + (qrBoxSize / 2) - (markSize / 2)
  const markY = qrY + (qrBoxSize / 2) - (markSize / 2)

  context.page.drawRectangle({
    x: markX,
    y: markY,
    width: markSize,
    height: markSize,
    color: COLORS.white,
    borderColor: COLORS.dark,
    borderWidth: 0.6
  })
  context.page.drawRectangle({
    x: markX + (1.2 * MM),
    y: markY + (3 * MM),
    width: 4.6 * MM,
    height: 1 * MM,
    color: COLORS.dark
  })
  context.page.drawRectangle({
    x: markX + (3 * MM),
    y: markY + (1.2 * MM),
    width: 1 * MM,
    height: 4.6 * MM,
    color: COLORS.dark
  })

  const detailsX = paymentX + qrBoxSize + (4 * MM)
  const detailsWidth = SECTION_RIGHT - detailsX
  let detailsBottom = drawTextBlock(context, `Référence\n${model.qrBill.displayReference}`, detailsX, topY - 30, detailsWidth, {
    size: FONT_SMALL,
    color: COLORS.text,
    lineHeight: 9
  })
  detailsBottom = drawTextBlock(context, `Informations supplémentaires\n${model.qrBill.message}`, detailsX, detailsBottom - 10, detailsWidth, {
    size: FONT_SMALL,
    color: COLORS.text,
    lineHeight: 9
  })

  if (model.qrBill.debtor) {
    detailsBottom = drawTextBlock(context, `Payable par\n${model.qrBill.debtor.name}\n${formatQrStreet(model.qrBill.debtor)}\n${formatQrLocation(model.qrBill.debtor)}`, detailsX, detailsBottom - 10, detailsWidth, {
      size: FONT_SMALL,
      color: COLORS.text,
      lineHeight: 9
    })
  }

  drawTextBlock(context, 'Monnaie', detailsX, detailsBottom - 12, 24 * MM, {
    font: context.boldFont,
    size: FONT_LABEL,
    color: COLORS.muted
  })
  drawTextBlock(context, 'Montant', detailsX + (28 * MM), detailsBottom - 12, 24 * MM, {
    font: context.boldFont,
    size: FONT_LABEL,
    color: COLORS.muted
  })
  drawTextBlock(context, 'CHF', detailsX, detailsBottom - 20, 24 * MM, {
    size: FONT_SMALL,
    color: COLORS.text
  })
  drawTextBlock(context, model.qrBill.amount, detailsX + (28 * MM), detailsBottom - 20, 24 * MM, {
    size: FONT_SMALL,
    color: COLORS.text
  })

  context.cursorY = sectionBottom - (3 * MM)

  return true
}

function drawFooter(context: PdfContext, document: DocumentDetail, company: CompanySettingsRecord) {
  const model = buildDocumentA4PrintModel(document, company)

  if (!model.footerNote && !model.footerMeta.length) {
    return
  }

  const noteHeight = model.footerNote
    ? measureTextBlock(context.regularFont, model.footerNote, FONT_SMALL, SECTION_WIDTH, 9)
    : 0
  const metaHeight = model.footerMeta.length
    ? measureTextBlock(context.regularFont, model.footerMeta.join('   '), FONT_SMALL, SECTION_WIDTH, 9)
    : 0

  ensureSpace(context, noteHeight + metaHeight + (10 * MM))

  const topLine = context.cursorY
  drawHorizontalRule(context, topLine)

  let footerBottom = topLine - (2.4 * MM)

  if (model.footerNote) {
    footerBottom = drawTextBlock(context, model.footerNote, SECTION_LEFT, footerBottom, SECTION_WIDTH, {
      size: FONT_SMALL,
      color: COLORS.text,
      lineHeight: 9
    })
  }

  if (model.footerMeta.length) {
    footerBottom = drawTextBlock(context, model.footerMeta.join('   ·   '), SECTION_LEFT, footerBottom - 4, SECTION_WIDTH, {
      size: FONT_SMALL,
      color: COLORS.text,
      lineHeight: 9
    })
  }

  context.cursorY = footerBottom - (3 * MM)
}

export async function generateDocumentPdf(document: DocumentDetail, company: CompanySettingsRecord) {
  const pdfDoc = await PDFDocument.create()
  pdfDoc.setTitle(document.documentNumber)

  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const logoImage = await embedDataUrlImage(pdfDoc, company.logoDataUrl)
  const context: PdfContext = {
    pdfDoc,
    page: createPage(pdfDoc),
    regularFont,
    boldFont,
    cursorY: TOP_START
  }

  drawHeader(context, document, company, logoImage)
  drawDocumentLines(context, document)
  drawSummary(context, document, company)

  const renderedQr = await drawQrSection(context, document, company)

  if (!renderedQr) {
    drawFooter(context, document, company)
  }

  return pdfDoc.save()
}
