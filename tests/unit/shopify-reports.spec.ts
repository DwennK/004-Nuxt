import { describe, expect, it } from 'vitest'
import { projectReportsOverview } from '../../server/utils/pos/reports'

describe('Shopify payment reporting', () => {
  it('includes Shopify in totals and every period without assigning it to cash or Stripe', () => {
    const result = projectReportsOverview({
      date: '2026-08-20',
      weeklyPaymentRows: [{ method: 'shopify', amount: 10810, paidAt: '2026-08-19T10:00:00Z' }],
      monthlyPaymentRows: [{ method: 'shopify', total: 10810, bucket: '2026-08' }],
      yearlyPaymentRows: [{ method: 'shopify', total: 10810, bucket: '2026' }],
      openTicketCount: 0, openedRows: [], closedRows: [], topCustomers: [], topItems: [], turnoverRows: []
    })
    expect(result.kpis).toMatchObject({ totalPaid: 10810, paidToday: 0 })
    expect(result.paymentsByDay.find(d => d.date === '2026-08-19')).toMatchObject({ shopify: 10810, cash: 0, stripe: 0 })
    for (const period of result.paymentPeriods) expect(period.buckets.reduce((sum, b) => sum + b.shopify, 0)).toBe(10810)
  })
})
