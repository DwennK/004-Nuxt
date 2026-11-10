import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { defineRelations } from 'drizzle-orm'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { importTables } from '../fixtures/shopify'
import { commercialReportRange, getCommercialReport } from '../../server/utils/pos/commercial-reports'
import { getEndOfDaySummary, getReportsLeaders, getReportsOverview } from '../../server/utils/pos/reports'
import type { PosDatabase } from '../../server/utils/turso'

const database = vi.hoisted(() => ({ db: null as PosDatabase | null }))
vi.mock('../../server/utils/turso', () => ({ useDb: () => database.db }))
vi.mock('../../server/utils/pos/schema', () => ({ ensurePosSchema: async () => {} }))

describe('commercial reporting by issue date and credit recording date', () => {
  let client: ReturnType<typeof createClient>
  let db: PosDatabase
  beforeEach(async () => {
    client = createClient({ url: 'file::memory:' })
    db = drizzle({ client, relations: defineRelations(schema) })
    database.db = db
    await client.batch(importTables, 'write')
    await client.batch([
      'CREATE TABLE document_credits (id INTEGER PRIMARY KEY, document_id INTEGER, amount INTEGER, created_at TEXT)',
      'CREATE TABLE tickets (id INTEGER PRIMARY KEY, status TEXT, opened_at TEXT, closed_at TEXT)',
      'INSERT INTO customers (id,name,phone,email,created_at,updated_at) VALUES (1,\'Client test\',\'\',\'\',\'2026-01-01\',\'2026-01-01\')'
    ], 'write')
  })
  afterEach(() => client.close())

  async function invoice(id: number, issuedAt: string, total = 17500, status = 'issued', type = 'invoice') {
    await client.execute({ sql: 'INSERT INTO documents (id,document_number,type,status,customer_id,issued_at,total,subtotal,tax_amount,created_at,updated_at) VALUES (?,?,?, ?,1,?,?,?,0,?,?)', args: [id, `FA-${id}`, type, status, issuedAt, total, total, issuedAt, issuedAt] })
  }
  async function line(document: number, label: string, amount: number, category: string | null) {
    await client.execute({ sql: 'INSERT INTO document_lines (document_id,label,quantity,unit_price,vat_rate,line_total,category_hint) VALUES (?,?,1,?,0,?,?)', args: [document, label, amount, amount, category] })
  }
  async function credit(id: number, document: number, amount: number, createdAt: string) {
    await client.execute({ sql: 'INSERT INTO document_credits VALUES (?,?,?,?)', args: [id, document, amount, createdAt] })
    await client.execute({ sql: 'UPDATE documents SET credited_total = credited_total + ? WHERE id = ?', args: [amount, document] })
  }
  const report = (date: string, period: 'day' | 'month' | 'year' = 'day') => getCommercialReport(db, date, period)

  it('counts one unpaid invoice with two lines and two categories once, independently of instalments', async () => {
    await invoice(1, '2026-01-31T10:00:00Z')
    await line(1, 'Réparation écran', 15000, 'repair')
    await line(1, 'Verre trempé', 2500, 'accessory')
    const january = await report('2026-01-31', 'month')
    expect(january.totals).toEqual({ invoicedTotal: 17500, creditTotal: 0, total: 17500, invoiceCount: 1, creditCount: 0 })
    expect(january.categories).toEqual([
      { category: 'repair', invoicedTotal: 15000, creditTotal: 0, total: 15000 },
      { category: 'accessory', invoicedTotal: 2500, creditTotal: 0, total: 2500 }
    ])
    await client.execute(`INSERT INTO payments (document_id,method,status,amount,paid_at,created_at,updated_at) VALUES
      (1,'cash','paid',5000,'2026-02-01T10:00:00Z','2026-02-01','2026-02-01'),
      (1,'cash','paid',12500,'2026-03-01T10:00:00Z','2026-03-01','2026-03-01')`)
    await client.execute('UPDATE documents SET status = \'paid\' WHERE id = 1')
    expect(await report('2026-01-31', 'month')).toEqual(january)
    expect((await report('2026-02-01', 'month')).totals.total).toBe(0)
    expect((await report('2026-03-01', 'month')).totals.invoiceCount).toBe(0)
    expect((await report('2026-01-31', 'year')).totals).toEqual(january.totals)
    expect((await getEndOfDaySummary('2026-02-01')).totalPaid).toBe(5000)
    expect((await getEndOfDaySummary('2026-02-01')).turnoverByCategory).toEqual([])
    expect((await getReportsOverview('2026-02-07')).turnoverByCategory).toEqual([])
    expect((await getReportsLeaders('2026-01-01', '2026-01-31')).topCustomers[0]).toMatchObject({ total: 17500, documentCount: 1 })
    expect((await getReportsLeaders('2026-02-01', '2026-03-31')).topItems).toEqual([])
  })

  it('excludes quotes, orders, drafts and cancelled invoices even with payments', async () => {
    await invoice(1, '2026-01-10', 100, 'draft')
    await invoice(2, '2026-01-10', 200, 'cancelled')
    await invoice(3, '2026-01-10', 300, 'paid', 'quote')
    await invoice(4, '2026-01-10', 400, 'paid', 'customer_order')
    await invoice(5, '2026-01-10', 500, 'issued')
    await invoice(6, '2026-01-10', 600, 'paid')
    expect((await report('2026-01-10')).totals).toMatchObject({ invoiceCount: 2, total: 1100 })
    expect((await report('2026-01-10')).categories).toEqual([{ category: null, invoicedTotal: 1100, creditTotal: 0, total: 1100 }])
  })

  it('records a later credit once without rewriting January or counting the invoice in February', async () => {
    await invoice(1, '2026-01-10', 17500)
    await line(1, 'Écran', 15000, 'repair')
    await line(1, 'Verre', 2500, 'accessory')
    const before = await report('2026-01-10', 'month')
    await credit(1, 1, 1750, '2026-02-05T12:00:00Z')
    expect(await report('2026-01-10', 'month')).toEqual(before)
    const february = await report('2026-02-05', 'month')
    expect(february.totals).toEqual({ invoiceCount: 0, creditCount: 1, invoicedTotal: 0, creditTotal: 1750, total: -1750 })
    expect(february.categories.map(row => row.total).sort((a, b) => a - b)).toEqual([-1500, -250])
    const year = await report('2026-01-10', 'year')
    expect(year.totals.total).toBe(15750)
    expect(year.buckets.reduce((sum, bucket) => sum + bucket.total, 0)).toBe(year.totals.total)
    const leaders = await getReportsLeaders('2026-02-01', '2026-02-28')
    expect(leaders.topCustomers[0]).toMatchObject({ total: -1750, documentCount: 0 })
    expect(leaders.topItems.reduce((sum, row) => sum + row.quantity, 0)).toBe(0)
  })

  it.each([
    [3, [1, 1, 1], [1, 1, 1]],
    [10001, [15001, -5000], [3333, 3333, 3335]]
  ])('conserves every cent and reverses every category after repeated credits of %i', async (total, lines, credits) => {
    await invoice(1, '2026-01-10', total)
    for (let i = 0; i < lines.length; i++) await line(1, `Ligne ${i}`, lines[i]!, ['repair', 'accessory', null][i]!)
    for (let i = 0; i < credits.length; i++) await credit(i + 1, 1, credits[i]!, `2026-0${i + 2}-10T10:00:00Z`)
    const months = await Promise.all([1, 2, 3, 4].map(month => report(`2026-0${month}-10`, 'month')))
    const year = await report('2026-01-01', 'year')
    for (const month of months) expect(month.categories.reduce((sum, row) => sum + row.total, 0)).toBe(month.totals.total)
    expect(months.reduce((sum, month) => sum + month.totals.total, 0)).toBe(0)
    expect(year.categories.every(row => row.total === 0)).toBe(true)
    expect(year.totals).toMatchObject({ total: 0, invoiceCount: 1, creditCount: 3 })
  })

  it('uses Swiss boundaries, accepts UTC timestamps with and without milliseconds and respects offsets', async () => {
    await invoice(1, '2026-01-31T22:59:59Z', 100)
    await invoice(2, '2026-01-31T23:00:00.000Z', 200)
    await invoice(3, '2026-02-01T00:00:00+01:00', 300)
    expect((await report('2026-01-31')).totals.total).toBe(100)
    expect((await report('2026-02-01')).totals.total).toBe(500)
    await invoice(4, '2026-03-28T23:00:00Z', 400)
    await invoice(5, '2026-03-29T21:59:59.999Z', 500)
    await invoice(6, '2026-03-29T22:00:00Z', 600)
    expect((await report('2026-03-29')).totals.total).toBe(900)
    expect((await report('2026-03-30')).totals.total).toBe(600)
    expect(commercialReportRange('2024-02-17', 'month')).toEqual({ startDate: '2024-02-01', endDate: '2024-02-29' })
    expect((await report('2024-02-17', 'month')).buckets).toHaveLength(29)
  })

  it('reconciles a full month to its daily reports, including a credit-only day', async () => {
    await invoice(1, '2026-11-01T10:00:00Z', 17500)
    await invoice(2, '2026-11-10T10:00:00Z', 20000)
    await credit(1, 1, 1750, '2026-11-20T10:00:00Z')
    const month = await report('2026-11-10', 'month')
    const days = await Promise.all(month.buckets.map(bucket => report(bucket.date)))
    expect(days.reduce((sum, day) => sum + day.totals.total, 0)).toBe(month.totals.total)
    expect(days.reduce((sum, day) => sum + day.totals.invoiceCount, 0)).toBe(2)
    expect(month.totals.total).toBe(35750)
    expect((await report('2026-11-10', 'year')).totals).toEqual(month.totals)
  })

  it('keeps a December invoice in its year and a January reduction in the following year', async () => {
    await invoice(1, '2026-12-31T22:59:59Z', 10001)
    await line(1, 'Article', 10001, 'accessory')
    await credit(1, 1, 10001, '2026-12-31T23:00:00Z')
    expect((await report('2026-12-31', 'year')).totals).toMatchObject({ total: 10001, invoiceCount: 1, creditCount: 0 })
    expect((await report('2027-01-01', 'year')).totals).toMatchObject({ total: -10001, invoiceCount: 0, creditCount: 1 })
    expect((await getReportsLeaders('2027-01-01', '2026-01-01')).totalCommercial).toBe(0)
  })

  it('exposes an inconsistent line total as uncategorized instead of losing invoice value', async () => {
    await invoice(1, '2026-01-01', 10000)
    await line(1, 'Ligne historique', 9000, 'repair')
    const result = await report('2026-01-01')
    expect(result.categories).toContainEqual({ category: null, invoicedTotal: 1000, creditTotal: 0, total: 1000 })
    expect(result.categories.reduce((sum, row) => sum + row.total, 0)).toBe(result.totals.total)
  })
})
