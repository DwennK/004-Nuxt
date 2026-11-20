import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { defineRelations } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import type { PosDatabase } from '../../server/utils/turso'
import { classifyReportPayments, updatePaymentClassification } from '../../server/utils/pos/payment-classifications'
import { summarizePaymentCategories } from '../../shared/utils/payment-categories'
import { importTables } from '../fixtures/shopify'
import { getEndOfDaySummary, getReportsCategories, getReportsOverview, getReportsLeaders } from '../../server/utils/pos/reports'

const database = vi.hoisted(() => ({ db: null as PosDatabase | null }))
vi.mock('../../server/utils/turso', () => ({ useDb: () => database.db }))
vi.mock('../../server/utils/pos/schema', () => ({ ensurePosSchema: async () => {} }))

describe('cashflow classification independent of commercial documents', () => {
  let client: ReturnType<typeof createClient>
  let db: PosDatabase
  const payment = { id: 1, documentId: 1, amount: 13001 }
  beforeEach(async () => {
    client = createClient({ url: 'file::memory:' })
    db = drizzle({ client, relations: defineRelations(schema) })
    database.db = db
    await client.batch(importTables, 'write')
    await client.execute('CREATE TABLE document_credits (id INTEGER PRIMARY KEY, document_id INTEGER, amount INTEGER, created_at TEXT)')
    await client.execute('CREATE TABLE tickets (id INTEGER PRIMARY KEY, status TEXT, opened_at TEXT, closed_at TEXT)')
    await client.execute('CREATE TABLE catalog_items (id INTEGER PRIMARY KEY, name TEXT)')
    await client.execute('INSERT INTO customers (id,name,phone,email,created_at,updated_at) VALUES (1,\'Client test\',\'\',\'\',\'2026-11-02\',\'2026-11-02\')')
    await client.execute('INSERT INTO documents (id,document_number,type,status,customer_id,issued_at,subtotal,tax_amount,total,created_at,updated_at) VALUES (1,\'CO-1\',\'customer_order\',\'issued\',1,\'2026-11-02\',30000,0,30000,\'2026-11-02\',\'2026-11-02\')')
    await client.execute('INSERT INTO document_lines (document_id,label,quantity,unit_price,vat_rate,line_total,category_hint) VALUES (1,\'Prestation\',1,30000,0,30000,\'repair\')')
    await client.execute('INSERT INTO payments (id,document_id,method,status,amount,paid_at,created_at,updated_at) VALUES (1,1,\'cash\',\'paid\',13001,\'2026-11-02\',\'2026-11-02\',\'2026-11-02\')')
  })
  afterEach(() => client.close())
  const read = () => classifyReportPayments(db, [payment])
  const save = (allocations: Parameters<typeof updatePaymentClassification>[1]['allocations'], revision = 0) => updatePaymentClassification(1, { allocations, expectedRevision: revision, expectedAmount: 13001 }, 42)

  it('merges legacy manual shares once and preserves the signed refund and automatic categories', async () => {
    const migration = readFileSync(new URL('../../drizzle/20261118152633_device_sale_categories/migration.sql', import.meta.url), 'utf8')
    await client.execute('CREATE TABLE ticket_lines (category_hint TEXT)')
    await client.execute('UPDATE document_lines SET category_hint = \'ecommerce\'')
    await client.execute('INSERT INTO ticket_lines VALUES (\'ecommerce\')')
    await client.execute('UPDATE payments SET amount = -13001 WHERE id = 1')
    const allocations = [{ category: 'device', amount: 5000 }, { category: 'ecommerce', amount: 7000 }, { category: 'other', amount: 1001 }]
    await client.execute({ sql: 'INSERT INTO payment_classifications VALUES (1, ?, 3, ?, 42)', args: [JSON.stringify(allocations), '2026-11-02'] })
    await client.executeMultiple(migration)
    await client.executeMultiple(migration)
    const daily = await getEndOfDaySummary('2026-11-02')
    expect(daily.payments[0]).toMatchObject({
      amount: -13001,
      classification: { revision: 4, source: 'manual', allocations: [{ category: 'device_refurbished', amount: 12000 }, { category: 'other', amount: 1001 }] }
    })
    expect((await client.execute('SELECT category_hint FROM ticket_lines')).rows[0]?.category_hint).toBe('device_refurbished')
    await client.execute('DELETE FROM payment_classifications')
    expect((await getEndOfDaySummary('2026-11-02')).payments[0]?.classification.allocations).toEqual([{ category: 'device_refurbished', amount: 13001 }])
  })

  it('updates daily and overview categories after a manual deposit classification, without changing commercial values', async () => {
    const before = await getReportsOverview('2026-11-02')
    expect(before.paymentCategories).toEqual([{ category: 'repair', total: 13001 }])
    expect(before.turnoverByCategory).toEqual([])
    await save([{ category: 'device_new', amount: 10000 }, { category: 'other', amount: 3001 }])
    const daily = await getEndOfDaySummary('2026-11-02')
    const overview = await getReportsOverview('2026-11-02')
    expect(overview.paymentCategories).toEqual(summarizePaymentCategories(daily.payments))
    expect(overview.paymentCategories).toEqual([{ category: 'device_new', total: 10000 }, { category: 'other', total: 3001 }])
    expect(overview.kpis.totalPaid).toBe(13001)
    expect(overview.turnoverByCategory).toEqual(before.turnoverByCategory)
    await save([], 1)
    expect((await getReportsOverview('2026-11-02')).paymentCategories).toEqual([{ category: null, total: 13001 }])
    await save(null, 2)
    expect((await getReportsOverview('2026-11-02')).paymentCategories).toEqual(before.paymentCategories)
  })

  it('reconciles overview categories with all seven daily ledgers, including refunds and uncategorized cash', async () => {
    await save([{ category: 'device_new', amount: 13001 }])
    await client.execute(`INSERT INTO payments (id,document_id,method,status,amount,paid_at,created_at,updated_at) VALUES
      (2,1,'card_twint','paid',-3001,'2026-11-03T10:00:00.000Z','2026-11-03','2026-11-03'),
      (3,1,'cash','pending',90000,'2026-11-03T10:00:00.000Z','2026-11-03','2026-11-03'),
      (4,1,'cash','cancelled',90000,'2026-11-03T10:00:00.000Z','2026-11-03','2026-11-03'),
      (5,1,'shopify','paid',2000,'2026-11-04T10:00:00.000Z','2026-11-04','2026-11-04')`)
    await updatePaymentClassification(5, { allocations: [], expectedRevision: 0, expectedAmount: 2000 }, 42)
    const days = await Promise.all(Array.from({ length: 7 }, (_, i) => getEndOfDaySummary(`2026-11-0${i + 1}`)))
    const overview = await getReportsOverview('2026-11-07')
    expect(overview.paymentCategories).toEqual(summarizePaymentCategories(days.flatMap(day => day.payments)))
    expect(overview.paymentCategories).toEqual([{ category: 'device_new', total: 13001 }, { category: 'repair', total: -3001 }, { category: null, total: 2000 }])
    expect(overview.paymentCategories.reduce((sum, row) => sum + row.total, 0)).toBe(overview.kpis.totalPaid)
    expect(overview.kpis.totalPaid).toBe(12000)
    expect((await getReportsOverview('2026-11-01')).paymentCategories).toEqual([])
  })

  it('keeps uncategorized and negative commercial lines in the full net total and resolves blank company names', async () => {
    await client.execute('UPDATE customers SET company_name = \'   \' WHERE id = 1')
    await client.execute('UPDATE documents SET type = \'invoice\', total = 13001, credited_total = 1001 WHERE id = 1')
    await client.execute('UPDATE document_lines SET line_total = 14001, category_hint = NULL WHERE document_id = 1')
    await client.execute('INSERT INTO document_lines (document_id,label,quantity,unit_price,vat_rate,line_total,category_hint) VALUES (1,\'Réduction\',1,-1000,0,-1000,\'repair\')')
    await client.execute('INSERT INTO document_credits VALUES (1,1,1001,\'2026-11-02T10:00:00Z\')')
    const daily = await getEndOfDaySummary('2026-11-02')
    const overview = await getReportsOverview('2026-11-02')
    expect(daily.turnoverByCategory).toHaveLength(2)
    expect(daily.turnoverByCategory.find(row => row.category === null)?.total).toBeGreaterThan(12000)
    expect(daily.turnoverByCategory.find(row => row.category === 'repair')?.total).toBeLessThan(0)
    expect(daily.turnoverByCategory.reduce((sum, row) => sum + row.total, 0)).toBe(12000)
    expect(overview.turnoverByCategory.reduce((sum, row) => sum + row.total, 0)).toBe(12000)
    expect(overview.turnoverByCategory.find(row => row.category === null)?.label).toBe('Sans catégorie')
    const leaders = await getReportsLeaders('2026-11-02', '2026-11-02')
    expect(leaders.topCustomers[0]).toMatchObject({ customerName: 'Client test', total: 12000 })
  })

  it('categorizes only the deposit amount, without requiring a settled invoice', async () => {
    const rows = await read()
    expect(rows[0]?.classification).toEqual({ allocations: [{ category: 'repair', amount: 13001 }], source: 'automatic', revision: 0 })
    expect(summarizePaymentCategories(rows)).toEqual([{ category: 'repair', total: 13001 }])
  })

  it('applies the category range to payments, invoices and ticket events at Swiss day boundaries', async () => {
    await client.execute(`UPDATE documents SET type = 'invoice', issued_at = '2026-11-01T23:00:00Z' WHERE id = 1`)
    await client.execute(`UPDATE payments SET paid_at = '2026-11-01T23:00:00Z' WHERE id = 1`)
    await client.execute(`INSERT INTO tickets VALUES
      (1, 'closed', '2026-11-01T22:59:59Z', '2026-11-01T23:00:00Z'),
      (2, 'closed', '2026-11-30T22:59:59Z', '2026-11-30T23:00:00Z')`)

    const categories = await getReportsCategories('2026-11-02', '2026-11-30')
    expect(categories.paymentCategories).toEqual([{ category: 'repair', total: 13001 }])
    expect(categories.turnoverByCategory).toMatchObject([{ category: 'repair', total: 30000 }])
    expect(categories.ticketInterval).toBe('day')
    expect(categories.ticketFlow).toHaveLength(29)
    expect(categories.ticketFlow[0]).toMatchObject({ date: '2026-11-02', opened: 0, closed: 1 })
    expect(categories.ticketFlow.at(-1)).toMatchObject({ date: '2026-11-30', opened: 1, closed: 0 })

    const longerRange = await getReportsCategories('2026-12-31', '2026-11-02')
    expect(longerRange.ticketInterval).toBe('month')
    expect(longerRange.ticketFlow).toMatchObject([
      { date: '2026-11', opened: 1, closed: 1 },
      { date: '2026-12', opened: 0, closed: 1 }
    ])
  })

  it.each([null, 'unknown'])('leaves incomplete or invalid categories (%s) uncategorized', async (category) => {
    await client.execute({ sql: 'INSERT INTO document_lines (document_id,label,quantity,unit_price,vat_rate,line_total,category_hint) VALUES (1,\'Autre ligne\',1,1000,0,1000,?)', args: [category] })
    expect((await read())[0]?.classification.allocations).toEqual([])
    expect(summarizePaymentCategories(await read())).toEqual([{ category: null, total: 13001 }])
  })

  async function setMixedLines() {
    await client.execute('UPDATE document_lines SET unit_price = 10900, line_total = 10900 WHERE document_id = 1')
    await client.execute('INSERT INTO document_lines (document_id,label,quantity,unit_price,vat_rate,line_total,category_hint) VALUES (1,\'Verre trempé\',1,2500,8.1,2500,\'accessory\')')
    await client.execute('UPDATE documents SET subtotal = 12396, tax_amount = 1004, total = 13400 WHERE id = 1')
  }

  it('automatically splits the 134 CHF receipt in daily and overview reports without writing metadata', async () => {
    await setMixedLines()
    await client.execute('UPDATE payments SET amount = 13400 WHERE id = 1')
    const daily = await getEndOfDaySummary('2026-11-02')
    const overview = await getReportsOverview('2026-11-02')
    expect(daily.payments[0]?.classification).toEqual({
      source: 'automatic', revision: 0,
      allocations: [{ category: 'repair', amount: 10900 }, { category: 'accessory', amount: 2500 }]
    })
    expect(overview.paymentCategories).toEqual([{ category: 'repair', total: 10900 }, { category: 'accessory', total: 2500 }])
    expect(summarizePaymentCategories(daily.payments)).toEqual(overview.paymentCategories)
    expect(overview.kpis.totalPaid).toBe(13400)
    expect((await client.execute('SELECT * FROM payment_classifications')).rows).toEqual([])
  })

  it.each([
    [6700, 5450, 1250],
    [13001, 10575, 2426],
    [-6700, 5450, 1250],
    [-13001, 10575, 2426],
    [1, 1, 0]
  ])('prorates a mixed payment of %i cents and conserves its signed total', async (amount, repair, accessory) => {
    await setMixedLines()
    const rows = await classifyReportPayments(db, [{ ...payment, amount }])
    expect(rows[0]?.classification.allocations).toEqual([
      { category: 'repair', amount: repair }, { category: 'accessory', amount: accessory }
    ].filter(part => part.amount > 0))
    expect(summarizePaymentCategories(rows).reduce((sum, item) => sum + item.total, 0)).toBe(amount)
  })

  it('groups repeated categories using TTC line totals including quantities and discounts', async () => {
    await setMixedLines()
    await client.execute('INSERT INTO document_lines (document_id,label,quantity,unit_price,vat_rate,line_total,category_hint) VALUES (1,\'Câbles\',2,1000,8.1,2000,\'accessory\'), (1,\'Remise écran\',1,-900,8.1,-900,\'repair\')')
    const rows = await classifyReportPayments(db, [{ ...payment, amount: 14500 }])
    expect(rows[0]?.classification.allocations).toEqual([{ category: 'repair', amount: 10000 }, { category: 'accessory', amount: 4500 }])
  })

  it('resolves equal remainders deterministically and drops zero category totals', async () => {
    await setMixedLines()
    await client.execute('UPDATE document_lines SET line_total = 1 WHERE document_id = 1')
    await client.execute('INSERT INTO document_lines (document_id,label,quantity,unit_price,vat_rate,line_total,category_hint) VALUES (1,\'Offert\',1,0,0,0,\'service\')')
    const rows = await classifyReportPayments(db, [{ ...payment, amount: 3 }])
    expect(rows[0]?.classification.allocations).toEqual([{ category: 'repair', amount: 2 }, { category: 'accessory', amount: 1 }])
  })

  it.each(['negative category', 'zero total', 'no lines', 'zero payment'])('keeps %s unallocated without inventing weights', async (scenario) => {
    await setMixedLines()
    if (scenario === 'negative category') await client.execute('UPDATE document_lines SET line_total = -2500 WHERE category_hint = \'accessory\'')
    if (scenario === 'zero total') await client.execute('UPDATE document_lines SET line_total = 0')
    if (scenario === 'no lines') await client.execute('DELETE FROM document_lines')
    const rows = await classifyReportPayments(db, [{ ...payment, amount: scenario === 'zero payment' ? 0 : payment.amount }])
    expect(rows[0]?.classification.allocations).toEqual([])
    expect(summarizePaymentCategories(rows).reduce((sum, item) => sum + item.total, 0)).toBe(rows[0]?.amount)
  })

  it('preserves manual choices on mixed documents and recalculates current lines when reset', async () => {
    await setMixedLines()
    await save([{ category: 'device_new', amount: 13001 }])
    expect((await read())[0]?.classification.allocations).toEqual([{ category: 'device_new', amount: 13001 }])
    await save([], 1)
    expect((await read())[0]?.classification).toMatchObject({ source: 'manual', allocations: [] })
    await save(null, 2)
    expect((await read())[0]?.classification).toMatchObject({ source: 'automatic', allocations: [{ category: 'repair', amount: 10575 }, { category: 'accessory', amount: 2426 }] })
    await client.execute('UPDATE document_lines SET category_hint = \'service\' WHERE category_hint = \'accessory\'')
    expect((await read())[0]?.classification.allocations).toEqual([{ category: 'repair', amount: 10575 }, { category: 'service', amount: 2426 }])
  })

  it('persists a split and an explicit uncategorized choice, then restores the suggestion', async () => {
    const ledger = (await client.execute('SELECT * FROM payments')).rows
    const lines = (await client.execute('SELECT * FROM document_lines')).rows
    await save([{ category: 'repair', amount: 10000 }, { category: 'accessory', amount: 3001 }])
    expect(summarizePaymentCategories(await read())).toEqual([{ category: 'repair', total: 10000 }, { category: 'accessory', total: 3001 }])
    expect((await client.execute('SELECT updated_by, revision FROM payment_classifications')).rows[0]).toEqual({ updated_by: 42, revision: 1 })
    await save([], 1)
    expect((await read())[0]?.classification).toEqual({ allocations: [], source: 'manual', revision: 2 })
    await save(null, 2)
    expect((await read())[0]?.classification).toMatchObject({ source: 'automatic', revision: 3, allocations: [{ category: 'repair', amount: 13001 }] })
    expect((await client.execute('SELECT * FROM payments')).rows).toEqual(ledger)
    expect((await client.execute('SELECT * FROM document_lines')).rows).toEqual(lines)
  })

  it('subtracts split refunds exactly, including cents and uncategorized movements', async () => {
    await client.execute('INSERT INTO payments (id,document_id,method,status,amount,kind,original_payment_id,paid_at,created_at,updated_at) VALUES (2,1,\'cash\',\'paid\',-3001,\'refund\',1,\'2026-11-02\',\'2026-11-02\',\'2026-11-02\')')
    await updatePaymentClassification(2, { allocations: [{ category: 'repair', amount: 1000 }, { category: 'accessory', amount: 2001 }], expectedRevision: 0, expectedAmount: -3001 }, 42)
    const rows = await classifyReportPayments(db, [payment, { id: 2, documentId: 1, amount: -3001 }])
    expect(summarizePaymentCategories(rows)).toEqual([{ category: 'repair', total: 12001 }, { category: 'accessory', total: -2001 }])
    expect(summarizePaymentCategories(rows).reduce((sum, item) => sum + item.total, 0)).toBe(10000)
    await save([])
    expect(summarizePaymentCategories(await classifyReportPayments(db, [payment, { id: 2, documentId: 1, amount: -3001 }])).reduce((sum, item) => sum + item.total, 0)).toBe(10000)
  })

  it('rejects totals off by one cent and stale writes without losing the existing choice', async () => {
    await expect(save([{ category: 'other', amount: 13000 }])).rejects.toMatchObject({ statusCode: 400 })
    await save([{ category: 'device_new', amount: 13001 }])
    await expect(save([])).rejects.toMatchObject({ statusCode: 409 })
    await expect(updatePaymentClassification(1, { allocations: [], expectedRevision: 1, expectedAmount: 9999 }, 42)).rejects.toMatchObject({ statusCode: 409 })
    expect((await read())[0]?.classification.allocations).toEqual([{ category: 'device_new', amount: 13001 }])
    await client.execute('UPDATE payments SET status=\'cancelled\' WHERE id=1')
    await expect(save([], 1)).rejects.toMatchObject({ statusCode: 409 })
  })

  it('rejects malformed categories, duplicates, fractional cents and negative allocations', async () => {
    for (const allocations of [
      [{ category: 'unknown', amount: 13001 }],
      [{ category: 'repair', amount: 13000 }, { category: 'repair', amount: 1 }],
      [{ category: 'repair', amount: 13001.5 }],
      [{ category: 'repair', amount: -1 }]
    ]) {
      await expect(save(allocations as Parameters<typeof save>[0])).rejects.toThrow()
    }
    expect((await read())[0]?.classification.revision).toBe(0)
  })

  it('keeps cashflow totals correct if an external writer changes a classified amount', async () => {
    await save([{ category: 'device_new', amount: 13001 }])
    const rows = await classifyReportPayments(db, [{ ...payment, amount: 8000 }])
    expect(summarizePaymentCategories(rows)).toEqual([{ category: null, total: 8000 }])
  })

  it('enforces the migration foreign key and removes metadata with the payment', async () => {
    await save([])
    await client.execute('DELETE FROM payments WHERE id=1')
    expect((await client.execute('SELECT * FROM payment_classifications')).rows).toEqual([])
    await expect(client.execute('INSERT INTO payment_classifications (payment_id,updated_at,updated_by) VALUES (999,\'2026-11-02\',42)')).rejects.toThrow()
  })
})
