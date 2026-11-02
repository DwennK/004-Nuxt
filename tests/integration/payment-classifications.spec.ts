import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { defineRelations } from 'drizzle-orm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import type { PosDatabase } from '../../server/utils/turso'
import { classifyReportPayments, updatePaymentClassification } from '../../server/utils/pos/payment-classifications'
import { summarizePaymentCategories } from '../../shared/utils/payment-categories'
import { importTables } from '../fixtures/shopify'

const database = vi.hoisted(() => ({ db: null as PosDatabase | null }))
vi.mock('../../server/utils/turso', () => ({ useDb: () => database.db }))

describe('cashflow classification independent of commercial documents', () => {
  let client: ReturnType<typeof createClient>
  let db: PosDatabase
  const payment = { id: 1, documentId: 1, amount: 13001 }
  beforeEach(async () => {
    client = createClient({ url: 'file::memory:' })
    db = drizzle({ client, relations: defineRelations(schema) })
    database.db = db
    await client.batch(importTables, 'write')
    await client.execute('INSERT INTO customers (id,name,phone,email,created_at,updated_at) VALUES (1,\'Client test\',\'\',\'\',\'2026-11-02\',\'2026-11-02\')')
    await client.execute('INSERT INTO documents (id,document_number,type,status,customer_id,issued_at,subtotal,tax_amount,total,created_at,updated_at) VALUES (1,\'CO-1\',\'customer_order\',\'issued\',1,\'2026-11-02\',30000,0,30000,\'2026-11-02\',\'2026-11-02\')')
    await client.execute('INSERT INTO document_lines (document_id,label,quantity,unit_price,vat_rate,line_total,category_hint) VALUES (1,\'Prestation\',1,30000,0,30000,\'repair\')')
    await client.execute('INSERT INTO payments (id,document_id,method,status,amount,paid_at,created_at,updated_at) VALUES (1,1,\'cash\',\'paid\',13001,\'2026-11-02\',\'2026-11-02\',\'2026-11-02\')')
  })
  afterEach(() => client.close())
  const read = () => classifyReportPayments(db, [payment])
  const save = (allocations: Parameters<typeof updatePaymentClassification>[1]['allocations'], revision = 0) => updatePaymentClassification(1, { allocations, expectedRevision: revision, expectedAmount: 13001 }, 42)

  it('categorizes only the deposit amount, without requiring a settled invoice', async () => {
    const rows = await read()
    expect(rows[0]?.classification).toEqual({ allocations: [{ category: 'repair', amount: 13001 }], source: 'automatic', revision: 0 })
    expect(summarizePaymentCategories(rows)).toEqual([{ category: 'repair', total: 13001 }])
  })

  it.each(['accessory', null])('leaves mixed or incomplete documents (%s) uncategorized', async (category) => {
    await client.execute({ sql: 'INSERT INTO document_lines (document_id,label,quantity,unit_price,vat_rate,line_total,category_hint) VALUES (1,\'Autre ligne\',1,1000,0,1000,?)', args: [category] })
    expect((await read())[0]?.classification.allocations).toEqual([])
    expect(summarizePaymentCategories(await read())).toEqual([{ category: null, total: 13001 }])
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
    await save([{ category: 'device', amount: 13001 }])
    await expect(save([])).rejects.toMatchObject({ statusCode: 409 })
    await expect(updatePaymentClassification(1, { allocations: [], expectedRevision: 1, expectedAmount: 9999 }, 42)).rejects.toMatchObject({ statusCode: 409 })
    expect((await read())[0]?.classification.allocations).toEqual([{ category: 'device', amount: 13001 }])
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
    await save([{ category: 'device', amount: 13001 }])
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
