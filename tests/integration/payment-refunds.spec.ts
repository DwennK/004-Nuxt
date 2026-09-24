import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { defineRelations, eq, sql } from 'drizzle-orm'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import type { PosDatabase } from '../../server/utils/turso'
import { importTables } from '../fixtures/shopify'
import { createDossierTables, testDossierContext } from '../fixtures/dossiers'
import { refundPayment, voidPayment } from '../../server/utils/pos/payment-corrections'
import { getDocumentSettlement, settlementCtes } from '../../server/utils/pos/document-settlement'
import { getEndOfDaySummary, getReportsLeaders, getReportsOverview } from '../../server/utils/pos/reports'
import { deletePayment, updatePaymentRecord } from '../../server/utils/pos/payments'

const database = vi.hoisted(() => ({ db: null as PosDatabase | null }))
vi.mock('../../server/utils/turso', () => ({ useDb: () => database.db }))
vi.mock('../../server/utils/pos/schema', () => ({ ensurePosSchema: async () => {} }))

const receiptDate = '2026-09-11T10:00:00.000Z'
const refundDate = '2026-09-11T12:00:00.000Z'
const input = { amount: 3900, method: 'cash' as const, paidAt: refundDate, reason: 'Retour accepté', effect: 'commercial' as const }

describe('signed payment ledger and commercial reductions', () => {
  let directory: string
  let client: ReturnType<typeof createClient>
  let db: PosDatabase
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'pos-refund-'))
  })
  afterAll(async () => {
    await rm(directory, { recursive: true, force: true })
  })
  beforeEach(async () => {
    client = createClient({ url: `file:${join(directory, crypto.randomUUID() + '.db')}` })
    db = drizzle({ client, relations: defineRelations(schema) })
    database.db = db
    vi.stubGlobal('createError', (value: object) => Object.assign(new Error(), value))
    await client.batch(importTables, 'write')
    await client.execute(`CREATE TABLE tickets (id INTEGER PRIMARY KEY, customer_id INTEGER, status TEXT, opened_at TEXT, closed_at TEXT)`)
    await client.execute(`CREATE TABLE ticket_events (id INTEGER PRIMARY KEY, ticket_id INTEGER, kind TEXT, label TEXT, note TEXT, metadata_json TEXT, occurred_at TEXT, created_at TEXT)`)
    await client.execute(`CREATE TABLE catalog_items (id INTEGER PRIMARY KEY, name TEXT)`)
    await createDossierTables(client)
    const migration = await readFile(new URL('../../drizzle/20260924131419_payment_refund_ledger/migration.sql', import.meta.url), 'utf8')
    // Fixture tables already expose the additive columns; execute the actual
    // production constraints, credit table and ledger view unchanged.
    for (const statement of migration.split('--> statement-breakpoint').filter(s => s.trim() && !s.trim().startsWith('ALTER TABLE'))) await client.executeMultiple(statement)
    await client.execute(`INSERT INTO customers (id, first_name, last_name, phone, email, created_at, updated_at) VALUES (1, 'Test', 'Client', '', '', '${receiptDate}', '${receiptDate}')`)
    await client.execute(`INSERT INTO documents (id, document_number, type, status, customer_id, issued_at, subtotal, tax_amount, total, created_at, updated_at) VALUES (1, 'FA-1', 'invoice', 'paid', 1, '${receiptDate}', 3900, 0, 3900, '${receiptDate}', '${receiptDate}')`)
    await client.execute(`INSERT INTO document_lines (document_id, label, quantity, unit_price, vat_rate, line_total, category_hint) VALUES (1, 'Service', 1, 3900, 0, 3900, 'repair')`)
    await client.execute(`INSERT INTO payments (id, document_id, customer_id, method, status, amount, paid_at, created_at, updated_at) VALUES (1, 1, 1, 'cash', 'paid', 3900, '${receiptDate}', '${receiptDate}', '${receiptDate}')`)
  })
  afterEach(() => client.close())
  const context = () => testDossierContext(db, { kind: 'payment', id: 1 })
  async function refund(value = input, key = crypto.randomUUID()) {
    return refundPayment(1, value, key, '1 · Test', await context())
  }
  async function settlement() {
    const [doc] = await db.select().from(schema.documents).where(eq(schema.documents.id, 1))
    return getDocumentSettlement(db, doc!)
  }
  it('keeps +39 and -39 and settles the commercially reduced invoice without a new receivable', async () => {
    const result = await refund()
    expect(result).toMatchObject({ amount: -3900, kind: 'refund', originalPaymentId: 1, status: 'paid', recordedBy: '1 · Test' })
    expect((await client.execute('SELECT amount, status FROM payments WHERE id=1')).rows[0]).toEqual({ amount: 3900, status: 'paid' })
    expect((await client.execute('SELECT sum(amount) AS net FROM payment_movements')).rows[0]?.net).toBe(0)
    expect(await settlement()).toMatchObject({ paidAmount: 0, balanceDue: 0 })
    const rows = await db.all(sql`WITH ${settlementCtes()} SELECT balance_due, settlement_status FROM settled_documents WHERE id=1`)
    expect(rows[0]).toMatchObject({ balance_due: 0, settlement_status: 'paid' })
    const daily = await getEndOfDaySummary('2026-09-11')
    expect(daily.totalPaid).toBe(0)
    expect(daily.payments.map(p => p.amount)).toEqual([-3900, 3900])
    expect(daily.unpaidDocuments).toEqual([])
    expect(daily.turnoverByCategory.reduce((sum, row) => sum + row.total, 0)).toBe(0)
    expect(daily.totalsByMethod).toContainEqual({ method: 'cash', total: 0, transactionCount: 2 })
  })
  it('supports partial refunds and rejects cumulative excess without writing anything', async () => {
    await refund({ ...input, amount: 1000 })
    expect(await settlement()).toMatchObject({ paidAmount: 2900, balanceDue: 0 })
    await expect(refund({ ...input, amount: 2901 })).rejects.toMatchObject({ data: { code: 'REFUND_EXCEEDS_PAYMENT' } })
    await refund({ ...input, amount: 2900 })
    expect((await client.execute('SELECT credited_total FROM documents WHERE id=1')).rows[0]?.credited_total).toBe(3900)
    expect((await client.execute('SELECT count(*) AS n FROM payments')).rows[0]?.n).toBe(3)
  })
  it('replays one refund and its credit after a lost response and rejects a changed payload', async () => {
    const key = 'lost-response-refund'
    const result = await refund(input, key)
    expect((await refund(input, key)).id).toBe(result.id)
    await expect(refund({ ...input, amount: 1000 }, key)).rejects.toMatchObject({ statusCode: 409 })
    expect((await client.execute('SELECT count(*) AS n FROM document_credits')).rows[0]?.n).toBe(1)
  })
  it('dates the refund independently', async () => {
    await refund({ ...input, paidAt: '2026-09-12T10:00:00.000Z', method: 'cash' })
    expect((await getEndOfDaySummary('2026-09-11')).totalPaid).toBe(3900)
    expect((await getEndOfDaySummary('2026-09-12')).totalPaid).toBe(-3900)
  })
  it('records the outgoing method even when it differs from the incoming method', async () => {
    await refundPayment(1, { ...input, method: 'card_twint' }, 'refund-other-method', 'Test', await context())
    const daily = await getEndOfDaySummary('2026-09-11')
    expect(daily.totalPaid).toBe(0)
    expect(daily.totalsByMethod).toContainEqual({ method: 'cash', total: 3900, transactionCount: 1 })
    expect(daily.totalsByMethod).toContainEqual({ method: 'card_twint', total: -3900, transactionCount: 1 })
  })
  it('subtracts partial commercial reductions from category and customer totals without losing cents', async () => {
    await client.execute('DELETE FROM document_lines')
    await client.execute(`INSERT INTO document_lines (document_id, label, quantity, unit_price, vat_rate, line_total, category_hint) VALUES (1,'First',1,1300,0,1300,'repair'),(1,'Second',1,2600,0,2600,'repair')`)
    await refund({ ...input, amount: 1001 })
    const daily = await getEndOfDaySummary('2026-09-11')
    expect(daily.turnoverByCategory.reduce((sum, row) => sum + row.total, 0)).toBe(2899)
    const leaders = await getReportsLeaders('2026-09-11', '2026-09-11')
    expect(leaders.topCustomers[0]?.total).toBe(2899)
    expect(leaders.topItems.reduce((sum, row) => sum + row.total, 0)).toBe(2899)
    expect((await getReportsOverview('2026-09-11')).kpis.totalPaid).toBe(2899)
  })
  it('serializes competing refunds and never allows more than the original receipt', async () => {
    const proof = await context()
    const results = await Promise.allSettled([
      refundPayment(1, { ...input, amount: 3000 }, 'concurrent-refund-a', 'Test', proof),
      refundPayment(1, { ...input, amount: 3000 }, 'concurrent-refund-b', 'Test', proof)
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect((await client.execute('SELECT sum(amount) AS net FROM payment_movements')).rows[0]?.net).toBe(900)
    expect((await client.execute('SELECT credited_total FROM documents WHERE id=1')).rows[0]?.credited_total).toBe(3000)
  })
  it('keeps the amount due when only the settlement is corrected', async () => {
    await refundPayment(1, { ...input, effect: 'payment_correction' }, 'correction-only', 'Test', await context())
    expect(await settlement()).toMatchObject({ paidAmount: 0, balanceDue: 3900 })
    expect((await client.execute('SELECT count(*) AS n FROM document_credits')).rows[0]?.n).toBe(0)
  })
  it('voids an erroneous entry without inventing a cash outflow and retains its reason', async () => {
    const value = await voidPayment(1, { reason: 'Saisie en double' }, 'void-receipt', 'Test', await context())
    expect(value).toMatchObject({ amount: 3900, status: 'cancelled', voidReason: 'Saisie en double' })
    expect((await client.execute('SELECT count(*) AS n FROM payment_movements')).rows[0]?.n).toBe(0)
    expect(await settlement()).toMatchObject({ balanceDue: 3900 })
    await expect(deletePayment(1, await context())).rejects.toMatchObject({ data: { code: 'PAYMENT_IMMUTABLE' } })
  })
  it('protects the refund and original against editing, deletion and cancellation', async () => {
    await refund({ ...input, amount: 1000 })
    await expect(voidPayment(1, { reason: 'Erreur' }, 'void-with-refund', 'Test', await context())).rejects.toMatchObject({ data: { code: 'PAYMENT_HAS_REFUNDS' } })
    await expect(updatePaymentRecord(1, { customerId: 1, documentId: 1, method: 'cash', status: 'paid', amount: 3900, paidAt: receiptDate, notes: null }, await context())).rejects.toMatchObject({ data: { code: 'PAYMENT_IMMUTABLE' } })
    await expect(client.execute('DELETE FROM payments WHERE id=2')).rejects.toThrow()
    await expect(client.execute('UPDATE payments SET amount=4000 WHERE id=1')).rejects.toThrow()
    await expect(client.execute('DELETE FROM document_credits')).rejects.toThrow()
  })
  it('rolls back the refund, credit and idempotency receipt together on failure', async () => {
    await client.execute(`CREATE TRIGGER fail_credit BEFORE INSERT ON document_credits BEGIN SELECT RAISE(ABORT, 'test failure'); END`)
    await expect(refund()).rejects.toThrow()
    expect((await client.execute('SELECT count(*) AS n FROM payments')).rows[0]?.n).toBe(1)
    expect((await client.execute('SELECT count(*) AS n FROM document_imports')).rows[0]?.n).toBe(0)
    expect((await client.execute('SELECT credited_total FROM documents WHERE id=1')).rows[0]?.credited_total).toBe(0)
  })
  it('rejects missing dossier ownership and dates before the receipt', async () => {
    await expect(refundPayment(1, input, 'without-proof', 'Test')).rejects.toMatchObject({ statusCode: 428 })
    await expect(refund({ ...input, paidAt: '2026-09-10T10:00:00.000Z' })).rejects.toMatchObject({ data: { code: 'REFUND_DATE_INVALID' } })
  })
  it('keeps inherited deposits on their source document and credits the current invoice', async () => {
    await client.execute(`INSERT INTO tickets (id, customer_id, status, opened_at) VALUES (1,1,'diagnosis','${receiptDate}')`)
    await client.execute(`UPDATE documents SET ticket_id=1 WHERE id=1`)
    await client.execute(`INSERT INTO documents (id, document_number, type, status, customer_id, ticket_id, issued_at, subtotal, tax_amount, total, created_at, updated_at) VALUES (2,'CO-1','customer_order','paid',1,1,'${receiptDate}',3900,0,3900,'${receiptDate}','${receiptDate}')`)
    await client.execute('UPDATE payments SET document_id=2 WHERE id=1')
    await refund()
    expect((await client.execute('SELECT document_id FROM payments WHERE kind=\'refund\'')).rows[0]?.document_id).toBe(2)
    expect((await client.execute('SELECT document_id FROM document_credits')).rows[0]?.document_id).toBe(1)
    expect(await settlement()).toMatchObject({ paidAmount: 0, balanceDue: 0 })
  })
  it('enforces signs and refund caps for direct SQL writes too', async () => {
    await expect(client.execute(`INSERT INTO payments (document_id, kind, amount, status, method, paid_at, created_at, updated_at) VALUES (1,'receipt',-1,'paid','cash','${refundDate}','${refundDate}','${refundDate}')`)).rejects.toThrow()
    await expect(client.execute(`INSERT INTO payments (document_id, customer_id, kind, original_payment_id, amount, status, method, paid_at, created_at, updated_at) VALUES (1,1,'refund',1,-3901,'paid','cash','${refundDate}','${refundDate}','${refundDate}')`)).rejects.toThrow()
  })
})
