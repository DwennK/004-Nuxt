import { describe, expect, it } from 'vitest'
import { moneyToCents, normalizeShopifyOrder } from '../../server/utils/shopify/model'
import { money, orderFixture, unpaidOrder } from '../fixtures/shopify'

describe('Shopify monetary reconciliation', () => {
  it('keeps CHF totals, actual VAT and a reference line', () => {
    const result = normalizeShopifyOrder(orderFixture())
    expect(result.totals).toMatchObject({ total: 10810, taxAmount: 810, subtotal: 10000 })
    expect(result.lines.at(-1)).toMatchObject({ unitPrice: 0, label: 'Commande Shopify #1001' })
    expect(result.payments[0]).toMatchObject({ amount: 10810, paidAt: '2026-08-20T10:00:00Z' })
  })

  it('includes all allocated discounts, shipping and free products', () => {
    const order = unpaidOrder()
    order.lineItems[0]!.originalTotalSet = money('118.10')
    order.lineItems[0]!.discountAllocations = [{ allocatedAmountSet: money('10.00') }]
    order.lineItems.push({ ...order.lineItems[0]!, id: 'free', name: 'Cadeau', originalTotalSet: money('0'), discountAllocations: [], taxLines: [] })
    order.shippingLines = [{ id: 'shipping', title: 'Poste', isRemoved: false, discountedPriceSet: money('10.81'), taxLines: [{ rate: 0.081, priceSet: money('0.81') }] }]
    order.currentTotalPriceSet = order.totalOutstandingSet = money('118.91')
    order.currentTotalTaxSet = money('8.91')
    const result = normalizeShopifyOrder(order)
    expect(result.totals.total).toBe(11891)
    expect(result.lines.some(l => l.label.startsWith('Cadeau') && l.unitPrice === 0)).toBe(true)
  })

  it('adds tax to tax-exclusive prices exactly once', () => {
    const order = orderFixture()
    order.taxesIncluded = false
    order.lineItems[0]!.originalTotalSet = money('100')
    expect(normalizeShopifyOrder(order).totals.total).toBe(10810)
  })

  it('splits indivisible unit prices and never invents VAT', () => {
    const order = unpaidOrder()
    Object.assign(order.lineItems[0]!, { quantity: 3, currentQuantity: 3, originalTotalSet: money('10'), taxLines: [] })
    order.currentTotalPriceSet = order.totalOutstandingSet = money('10')
    order.currentTotalTaxSet = money('0')
    const result = normalizeShopifyOrder(order)
    expect(result.lines.slice(0, 2)).toMatchObject([{ quantity: 2, unitPrice: 333, vatRate: 0 }, { quantity: 1, unitPrice: 334, vatRate: 0 }])
    expect(result.totals.total).toBe(1000)
  })

  it('ignores authorizations and failed attempts, and supports partial captures', () => {
    const order = orderFixture()
    order.transactions.push({ ...order.transactions[0]!, id: 'auth', kind: 'AUTHORIZATION' }, { ...order.transactions[0]!, id: 'failed', status: 'FAILURE' })
    order.transactions[0]!.kind = 'CAPTURE'
    order.transactions[0]!.amountSet = money('50')
    order.totalReceivedSet = money('50')
    order.totalOutstandingSet = money('58.10')
    order.displayFinancialStatus = 'PARTIALLY_PAID'
    order.transactionsCount.count = 3
    expect(normalizeShopifyOrder(order).payments).toHaveLength(1)
  })

  it.each(['1e3', 'NaN', '', '1.001', '9007199254740991'])('rejects malformed or unrepresentable money %s', (value) => {
    expect(() => moneyToCents(value)).toThrow()
  })

  it.each(['refunded', 'cancelled', 'gift_card', 'store_credit', 'fees', 'currency', 'truncated', 'total', 'vat', 'excess'])('blocks unsupported/inconsistent order: %s', (condition) => {
    const order = orderFixture()
    if (condition === 'refunded') order.totalRefundedSet = money('1')
    if (condition === 'cancelled') order.cancelledAt = order.createdAt
    if (condition === 'gift_card' || condition === 'store_credit') order.transactions[0]!.gateway = condition
    if (condition === 'fees') order.currentTotalAdditionalFeesSet = money('1')
    if (condition === 'currency') order.presentmentCurrencyCode = 'EUR'
    if (condition === 'truncated') order.transactionsCount.count = 2
    if (condition === 'total') order.currentTotalPriceSet = money('108.11')
    if (condition === 'vat') order.currentTotalTaxSet = money('8.11')
    if (condition === 'excess') order.transactions[0]!.amountSet = money('200')
    expect(() => normalizeShopifyOrder(order)).toThrow()
  })
})
