import { describe, expect, it } from 'vitest'
import { buildDocumentA4PrintModel } from '../../shared/utils/document-print'
import { printCompany, printDocument, printPayment } from '../fixtures/document-print'

describe('printed document payments', () => {
  it('lists all received payments chronologically and keeps the balance and QR amount consistent', () => {
    const document = printDocument({ payments: [
      printPayment({ id: 2, method: 'card_twint', amount: 3000 }),
      printPayment({ id: 1, amount: 2500, paidAt: '2026-09-01T12:00:00.000Z' }),
      ...(['pending', 'cancelled', 'refunded'] as const).map((status, index) => printPayment({ id: index + 3, status, amount: 9000 }))
    ] })
    const model = buildDocumentA4PrintModel(document, printCompany())

    expect(model.payments).toEqual([
      { id: 1, amount: 2500, label: 'Espèces', paidAt: '1 sept. 2026' },
      { id: 2, amount: 3000, label: 'Carte Bancaire / TWINT', paidAt: '8 sept. 2026' }
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

  it('does not present a quote as payable', () => {
    const model = buildDocumentA4PrintModel(printDocument({ type: 'quote' }), printCompany())
    expect(model.isPayableDocument).toBe(false)
    expect(model.balanceDue).toBe(0)
    expect(model.qrBill).toBeNull()
  })
})
