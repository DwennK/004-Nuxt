import { describe, expect, it } from 'vitest'
import {
  calculateCommercialTotals,
  calculateIncludedVatAmount
} from '../../shared/domain/commercial/money'

describe('commercial money kernel', () => {
  it('calculates TTC totals in integer cents for mixed VAT rates', () => {
    const totals = calculateCommercialTotals([{
      label: 'Réparation',
      quantity: 2,
      unitPrice: 5_000,
      vatRate: 8.1
    }, {
      label: 'Hors TVA',
      quantity: 1,
      unitPrice: 1_000,
      vatRate: 0
    }])

    expect(totals.total).toBe(11_000)
    expect(totals.taxAmount).toBe(749)
    expect(totals.subtotal).toBe(10_251)
    expect(totals.lines[0]).toMatchObject({
      label: 'Réparation',
      lineTotal: 10_000,
      subtotal: 9_251,
      taxAmount: 749
    })
  })

  it('preserves negative VAT for TTC discount lines', () => {
    const totals = calculateCommercialTotals([{
      quantity: 1,
      unitPrice: -1_081,
      vatRate: 8.1
    }])

    expect(totals).toMatchObject({
      subtotal: -1_000,
      taxAmount: -81,
      total: -1_081
    })
    expect(calculateIncludedVatAmount(-1_081, 8.1)).toBe(-81)
  })

  it('does not trust a caller-provided line total', () => {
    const totals = calculateCommercialTotals([{
      quantity: 3,
      unitPrice: 199,
      vatRate: 8.1,
      lineTotal: 1
    }])

    expect(totals.lines[0]?.lineTotal).toBe(597)
    expect(totals.total).toBe(597)
  })
})
