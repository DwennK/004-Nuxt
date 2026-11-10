import { describe, expect, it } from 'vitest'
import { projectReportsLeaders } from '../../server/utils/pos/reports'

describe('report ranking candidates', () => {
  it('includes the volume leader even when it is outside the eight largest monetary totals', () => {
    const customers = Array.from({ length: 20 }, (_, i) => ({ customerId: i, customerName: `Client ${i}`, total: 20000 - i * 1000, documentCount: i === 19 ? 100 : 1 }))
    const items = customers.map(row => ({ label: `Article ${row.customerId}`, category: null, total: row.total, quantity: row.documentCount }))
    const leaders = projectReportsLeaders(customers, items)
    expect(leaders.topCustomers.slice(0, 8).map(row => row.customerId)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect([...leaders.topCustomers].sort((a, b) => b.documentCount - a.documentCount)[0]?.customerId).toBe(19)
    expect([...leaders.topItems].sort((a, b) => b.quantity - a.quantity)[0]?.label).toBe('Article 19')
    expect(new Set(leaders.topCustomers.map(row => row.customerId)).size).toBe(leaders.topCustomers.length)
    expect(leaders.topCustomers.length).toBeLessThanOrEqual(16)
    expect(leaders.topItems.length).toBeLessThanOrEqual(16)
  })
})
