import { createDossierTables, testDossierContext } from '../fixtures/dossiers'
import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { createError } from 'h3'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { persistShopifyOrder, persistShopifyPaymentSync as syncPayments, getShopifyProvenance } from '../../server/utils/shopify/import'
import type { PosDatabase } from '../../server/utils/turso'
import * as turso from '../../server/utils/turso'
import { getEndOfDaySummary, getReportsOverview } from '../../server/utils/pos/reports'
import { commercialLineInputSchema } from '../../shared/validation/pos'
import { importTables, money, orderFixture, unpaidOrder } from '../fixtures/shopify'

const persistShopifyPaymentSync: typeof syncPayments = async (domain, order, id, db) => syncPayments(domain, order, id, db, await testDossierContext(db!, { kind: 'document', id }))

describe('Shopify atomic invoice and payment import', () => {
  let client: ReturnType<typeof createClient>
  let db: PosDatabase
  let directory: string
  const domain = 'test-pos.myshopify.com'
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pos-shopify-'))
    client = createClient({ url: `file:${join(directory, 'shopify.db')}` })
    db = drizzle({ client }) as unknown as PosDatabase
    await client.batch(importTables, 'write')
    await createDossierTables(client)
    vi.stubGlobal('useRuntimeConfig', () => ({ posAllowRuntimeSchemaBootstrap: false }))
    vi.stubGlobal('createError', createError)
    vi.spyOn(turso, 'useDb').mockReturnValue(db)
  })
  afterEach(async () => {
    client.close()
    await rm(directory, { recursive: true, force: true })
  })
  async function count(table: string) {
    return Number((await client.execute(`SELECT count(*) AS n FROM ${table}`)).rows[0]!.n)
  }

  it('persists one invoice, customer and historical payment on repeated import', async () => {
    const first = await persistShopifyOrder(domain, orderFixture(), db)
    const second = await persistShopifyOrder(domain, orderFixture(), db)
    expect(second).toMatchObject({ documentId: first.documentId, alreadyImported: true, paymentsAdded: 0 })
    expect(await count('documents')).toBe(1)
    expect(await count('customers')).toBe(1)
    expect(await count('payments')).toBe(1)
    expect((await client.execute('SELECT status FROM documents')).rows[0]!.status).toBe('paid')
    expect((await client.execute('SELECT method, paid_at FROM payments')).rows[0]).toMatchObject({ method: 'shopify', paid_at: '2026-08-20T10:00:00Z' })
    expect(await getShopifyProvenance(first.documentId, db)).toMatchObject({ domain, orderName: '#1001' })
    const lines = (await client.execute('SELECT category_hint FROM document_lines')).rows
    expect(lines).toHaveLength(2)
    expect(lines.every(line => line.category_hint === 'ecommerce')).toBe(true)
  })

  it('includes imported ecommerce totals in daily and overview reports on the historical payment date', async () => {
    await client.batch([
      'CREATE TABLE tickets (id INTEGER PRIMARY KEY, status TEXT, opened_at TEXT, closed_at TEXT)',
      'CREATE TABLE catalog_items (id INTEGER PRIMARY KEY, name TEXT)'
    ], 'write')
    await persistShopifyOrder(domain, orderFixture(), db)
    const daily = await getEndOfDaySummary('2026-08-20')
    expect(daily.totalPaid).toBe(10810)
    expect(daily.turnoverByCategory).toEqual([{ category: 'ecommerce', total: 10810 }])
    const overview = await getReportsOverview('2026-08-20')
    expect(overview.turnoverByCategory).toEqual([{ category: 'ecommerce', label: 'Ecommerce', total: 10810 }])
    expect(overview.topItems.every(item => item.category === 'ecommerce')).toBe(true)
    expect((await getEndOfDaySummary('2026-08-21')).turnoverByCategory).toEqual([])
  })

  it('categorizes split prices, discounted products, shipping and reference lines without changing totals', async () => {
    const order = unpaidOrder()
    Object.assign(order.lineItems[0]!, {
      quantity: 3, currentQuantity: 3, originalTotalSet: money('12'),
      discountAllocations: [{ allocatedAmountSet: money('2') }], taxLines: []
    })
    order.shippingLines = [{ id: 'shipping', title: 'Poste', isRemoved: false, discountedPriceSet: money('10.81'), taxLines: [{ rate: 0.081, priceSet: money('0.81') }] }]
    order.currentTotalPriceSet = order.totalOutstandingSet = money('20.81')
    order.currentTotalTaxSet = money('0.81')
    await persistShopifyOrder(domain, order, db)
    const lines = (await client.execute('SELECT * FROM document_lines ORDER BY id')).rows
    expect(lines).toHaveLength(4)
    expect(lines.every(line => line.category_hint === 'ecommerce')).toBe(true)
    expect(lines.map(line => Number(line.line_total))).toEqual([666, 334, 1081, 0])
    expect((await client.execute('SELECT total, tax_amount FROM documents')).rows[0]).toMatchObject({ total: 2081, tax_amount: 81 })
    for (const line of lines) {
      expect(commercialLineInputSchema.parse({ label: line.label, quantity: line.quantity, unitPrice: line.unit_price, vatRate: line.vat_rate, categoryHint: line.category_hint }).categoryHint).toBe('ecommerce')
    }
    expect(await count('payments')).toBe(0)
  })

  it('reuses a unique customer email without overwriting it', async () => {
    await persistShopifyOrder(domain, orderFixture(), db)
    const order = orderFixture()
    order.id = 'gid://shopify/Order/2'
    order.name = '#1002'
    order.email = 'ADA@EXAMPLE.TEST'
    order.billingAddress!.firstName = 'Changed'
    order.transactions[0]!.id = 'gid://shopify/OrderTransaction/2'
    await persistShopifyOrder(domain, order, db)
    expect(await count('customers')).toBe(1)
    expect((await client.execute('SELECT first_name FROM customers')).rows[0]!.first_name).toBe('Ada')
  })

  it('rolls back all rows and numbering when payment insertion fails', async () => {
    await client.execute('CREATE TRIGGER fail_payment BEFORE INSERT ON payments BEGIN SELECT RAISE(ABORT, \'forced payment failure\'); END')
    await expect(persistShopifyOrder(domain, orderFixture(), db)).rejects.toThrow()
    for (const table of ['customers', 'documents', 'document_lines', 'payments', 'document_imports', 'number_sequences']) expect(await count(table)).toBe(0)
  })

  it('adds later partial and final captures once, without changing invoice lines', async () => {
    const first = await persistShopifyOrder(domain, unpaidOrder(), db)
    const partial = orderFixture()
    partial.transactions[0]!.amountSet = money('50')
    partial.totalReceivedSet = money('50')
    partial.totalOutstandingSet = money('58.10')
    partial.displayFinancialStatus = 'PARTIALLY_PAID'
    expect((await persistShopifyPaymentSync(domain, partial, first.documentId, db)).paymentsAdded).toBe(1)
    expect((await client.execute('SELECT status FROM documents')).rows[0]!.status).toBe('issued')
    partial.transactions.push({ ...partial.transactions[0]!, id: 'gid://shopify/OrderTransaction/2', amountSet: money('58.10') })
    partial.transactionsCount.count = 2
    partial.totalReceivedSet = money('108.10')
    partial.totalOutstandingSet = money('0')
    partial.displayFinancialStatus = 'PAID'
    expect((await persistShopifyPaymentSync(domain, partial, first.documentId, db)).paymentsAdded).toBe(1)
    expect((await persistShopifyPaymentSync(domain, partial, first.documentId, db)).paymentsAdded).toBe(0)
    expect(await count('payments')).toBe(2)
    expect(await count('document_lines')).toBe(2)
    expect((await client.execute('SELECT status FROM documents')).rows[0]!.status).toBe('paid')
    expect((await client.execute('SELECT DISTINCT category_hint FROM document_lines')).rows).toEqual([{ category_hint: 'ecommerce' }])
  })

  it.each(['line', 'payment', 'manual', 'shop', 'remote'])('refuses sync after conflict: %s', async (conflict) => {
    const result = await persistShopifyOrder(domain, orderFixture(), db)
    const order = orderFixture()
    if (conflict === 'line') await client.execute('UPDATE document_lines SET label = \'Edited\'')
    if (conflict === 'payment') await client.execute('UPDATE payments SET method = \'cash\'')
    if (conflict === 'manual') await client.execute('INSERT INTO payments (document_id, method, status, amount, paid_at, created_at, updated_at) VALUES (1, \'cash\', \'paid\', 1, \'today\', \'today\', \'today\')')
    if (conflict === 'remote') order.lineItems[0]!.name = 'Changed remotely'
    await expect(persistShopifyPaymentSync(conflict === 'shop' ? 'other.myshopify.com' : domain, order, result.documentId, db)).rejects.toMatchObject({ statusCode: 409 })
    expect(await count('payments')).toBe(conflict === 'manual' ? 2 : 1)
  })

  it('isolates identical external identifiers by shop', async () => {
    await persistShopifyOrder(domain, orderFixture(), db)
    await persistShopifyOrder('another.myshopify.com', orderFixture(), db)
    expect(await count('documents')).toBe(2)
    expect(await count('payments')).toBe(2)
  })

  it('handles concurrent retries without creating duplicate financial records', async () => {
    const outcomes = await Promise.allSettled([persistShopifyOrder(domain, orderFixture(), db), persistShopifyOrder(domain, orderFixture(), db)])
    expect(outcomes.some(r => r.status === 'fulfilled')).toBe(true)
    expect(await count('documents')).toBe(1)
    expect(await count('payments')).toBe(1)
    expect((await persistShopifyOrder(domain, orderFixture(), db)).alreadyImported).toBe(true)
  })
})
