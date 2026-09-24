import { describe, expect, it, vi } from 'vitest'
import { documentTypes } from '../../shared/constants/pos'
import { buildDocumentA4PrintModel } from '../../shared/utils/document-print'
import { printCompany, printDocument, printPayment } from '../fixtures/document-print'

describe('canonical A4 PDF layout', () => {
  it('keeps payment references below the creditor address and lookup QR in the header', async () => {
    const { PDFPage } = await import('pdf-lib')
    const { generateDocumentPdf } = await import('../../server/utils/documents/pdf')
    const text = vi.spyOn(PDFPage.prototype, 'drawText')
    const rectangles = vi.spyOn(PDFPage.prototype, 'drawRectangle')
    await generateDocumentPdf(printDocument(), printCompany(), 'https://pos.example.test')

    expect(text.mock.calls.some(([value]) => value === 'Ouvrir le document')).toBe(false)
    const lookup = rectangles.mock.calls.find(([box]) => Math.abs((box?.width || 0) - 32.5 * 72 / 25.4) < 0.01)?.[0]
    expect(lookup).toBeDefined()
    expect(lookup!.x).toBeGreaterThan(300)
    expect(lookup!.y).toBeGreaterThan(700)

    const creditor = text.mock.calls.filter(([value]) => value === 'Compte / Payable à').at(-1)?.[1]
    const creditorLocation = text.mock.calls.find(([value, options]) => value === '2000 Neuchâtel' && options?.x === creditor?.x)?.[1]
    const reference = text.mock.calls.find(([value]) => value === 'Référence')?.[1]
    expect(creditorLocation).toBeDefined()
    expect(reference).toBeDefined()
    expect(reference!.y).toBeLessThan(creditorLocation!.y! - 7)
  })

  it('renders amounts over CHF 1,000 and preserves all lines across pages', async () => {
    const { PDFDocument, PDFPage } = await import('pdf-lib')
    const { generateDocumentPdf } = await import('../../server/utils/documents/pdf')
    const text = vi.spyOn(PDFPage.prototype, 'drawText')
    const document = printDocument({ total: 6500000, subtotal: 6012951, taxAmount: 487049 })
    document.lines = Array.from({ length: 65 }, (_, index) => ({
      ...document.lines[0]!, id: index + 1, label: `Prestation ${index + 1}`, unitPrice: 100000, lineTotal: 100000
    }))
    const pdf = await PDFDocument.load(await generateDocumentPdf(document, printCompany(), 'https://pos.example.test'))
    expect(pdf.getPageCount()).toBeGreaterThan(1)
    for (const line of document.lines) expect(text.mock.calls.some(([value]) => value === line.label)).toBe(true)
    expect(text.mock.calls.some(([value]) => value === '65 000.00 CHF')).toBe(true)
  })
})

describe('printed customer identity', () => {
  it.each(documentTypes)('prints the customer phone after the postal address on %s documents', (type) => {
    const document = printDocument({ type })
    document.customer.phone = '+41 79 123 45 67'

    const model = buildDocumentA4PrintModel(document, printCompany())

    expect(model.windowLines).toEqual(['Camille Exemple', 'Rue du Test 8', '2000 Neuchâtel', '+41 79 123 45 67'])
  })

  it('keeps phone and email as fallback without duplicating the phone when the postal address is missing', () => {
    const document = printDocument()
    Object.assign(document.customer, {
      addressLine1: null, addressLine2: null, postalCode: null, city: null,
      phone: '+41 79 123 45 67', email: 'camille@example.test'
    })

    const model = buildDocumentA4PrintModel(document, printCompany())

    expect(model.windowLines).toEqual(['Camille Exemple', '+41 79 123 45 67', 'camille@example.test'])
  })

  it('prints the company and its contact before the postal address', () => {
    const document = printDocument()
    Object.assign(document.customer, {
      firstName: 'Gregory', lastName: 'Bersac', companyName: 'Les Brasseurs',
      displayName: 'Les Brasseurs', addressLine1: 'Faubourg du Lac 1'
    })

    const model = buildDocumentA4PrintModel(document, printCompany())

    expect(model.customerContactName).toBe('Gregory Bersac')
    expect(model.windowLines).toEqual(['Les Brasseurs', 'Gregory Bersac', 'Faubourg du Lac 1', '2000 Neuchâtel'])
  })

  it('prints a private customer name only once', () => {
    const model = buildDocumentA4PrintModel(printDocument(), printCompany())

    expect(model.customerContactName).toBeNull()
    expect(model.windowLines).toEqual(['Camille Exemple', 'Rue du Test 8', '2000 Neuchâtel'])
  })

  it.each([
    { firstName: '', lastName: '' },
    { firstName: ' Les ', lastName: ' BRASSEURS ' }
  ])('omits empty or duplicate company contacts: %j', (name) => {
    const document = printDocument()
    Object.assign(document.customer, name, { companyName: 'Les Brasseurs', displayName: 'Les Brasseurs' })

    const model = buildDocumentA4PrintModel(document, printCompany())

    expect(model.customerContactName).toBeNull()
    expect(model.windowLines).toEqual(['Les Brasseurs', 'Rue du Test 8', '2000 Neuchâtel'])
  })
})

describe('printed document payments', () => {
  it('lists all received payments chronologically and keeps the balance and QR amount consistent', () => {
    const document = printDocument({ payments: [
      printPayment({ id: 2, method: 'card_twint', amount: 3000 }),
      printPayment({ id: 1, amount: 2500, paidAt: '2026-09-01T12:00:00.000Z' }),
      ...(['pending', 'cancelled', 'refunded'] as const).map((status, index) => printPayment({ id: index + 3, status, amount: 9000 }))
    ] })
    const model = buildDocumentA4PrintModel(document, printCompany())

    expect(model.payments).toEqual([
      { id: 1, amount: 2500, label: 'Espèces', paidAt: '01/09/2026' },
      { id: 2, amount: 3000, label: 'Carte Bancaire / TWINT', paidAt: '08/09/2026' }
    ])
    expect(document.payments[0]?.id).toBe(2)
    expect(model.paidAmount).toBe(5500)
    expect(model.balanceDue).toBe(4500)
    expect(model.qrBill?.amount).toBe('45.00')
    expect(model.referenceLines.join(' ')).not.toContain('Dernier paiement')
  })

  it('shows the full balance before the first payment', () => {
    const model = buildDocumentA4PrintModel(printDocument(), printCompany())
    expect(model.payments).toEqual([])
    expect(model.paidAmount).toBe(0)
    expect(model.balanceDue).toBe(10000)
    expect(model.qrBill?.amount).toBe('100.00')
  })

  it('keeps every instalment on a settled invoice and removes the payment QR', () => {
    const model = buildDocumentA4PrintModel(printDocument({
      payments: [printPayment(), printPayment({ id: 2, method: 'bank_transfer', amount: 7500 })]
    }), printCompany())
    expect(model.payments).toHaveLength(2)
    expect(model.paidAmount).toBe(10000)
    expect(model.balanceDue).toBe(0)
    expect(model.qrBill).toBeNull()
  })

  it('presents the remaining balance on a payable quote', () => {
    const model = buildDocumentA4PrintModel(printDocument({ type: 'quote' }), printCompany())
    expect(model.isPayableDocument).toBe(true)
    expect(model.balanceDue).toBe(10000)
    expect(model.qrBill).toBeNull()
  })
  it('generates a paginated SAV PDF without requiring commercial lines or a payment QR', async () => {
    const { generateDocumentPdf } = await import('../../server/utils/documents/pdf')
    const { PDFDocument } = await import('pdf-lib')
    const document = printDocument({
      type: 'sav', documentNumber: 'SAV-1', subtotal: 0, taxAmount: 0, total: 0, lines: [],
      sav: {
        sourceDocumentId: null, repair: 'Écran', reason: 'Tactile intermittent',
        status: 'ready', coverage: 'warranty', receivedAt: '2026-09-17T10:00:00.000Z', deliveredAt: null,
        diagnosis: 'Connecteur défectueux', work: 'Contrôle du tactile et de l’affichage. '.repeat(150)
      }
    })
    const bytes = await generateDocumentPdf(document, printCompany(), 'https://pos.example.test')
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getTitle()).toBe('SAV-1')
    expect(pdf.getPageCount()).toBeGreaterThan(1)
  })
})
