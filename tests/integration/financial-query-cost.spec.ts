import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { defineRelations, sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { SQLiteDialect } from 'drizzle-orm/sqlite-core'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { settlementCtes } from '../../server/utils/pos/document-settlement'
import { paidReportCtes, getReportsOverview, getReportsLeaders, getEndOfDaySummary } from '../../server/utils/pos/reports'
import { listDocuments } from '../../server/utils/pos/documents'
import { parseSchemaContract } from '../../scripts/db/_schema-contract.mjs'
import { schemaPath } from '../../scripts/db/_shared.mjs'

const database = vi.hoisted(() => ({ db: null as ReturnType<typeof drizzle> | null }))
vi.mock('../../server/utils/turso', () => ({ useDb: () => database.db }))
vi.mock('../../server/utils/pos/schema', () => ({ ensurePosSchema: async () => {} }))

const day = '2026-09-11T10:00:00.000Z'
type Doc = { id: number, type: string, status: string, customer: number, ticket: number | null, total: number }
type Pay = { id: number, document: number, amount: number, status: string, paidAt?: string }

// Deliberately independent of SQL: the invoice inherits its own customer's order
// receipts, while every receipt remains attached to the original document.
function oracle(doc: Doc, docs: Doc[], pays: Pay[]) {
  const related = docs.filter(other => doc.ticket != null && other.ticket === doc.ticket && other.customer === doc.customer)
  const active = doc.status !== 'cancelled' && ['customer_order', 'invoice'].includes(doc.type)
    && (doc.type === 'invoice' || doc.ticket == null || !related.some(other => other.type === 'invoice' && other.status !== 'cancelled'))
  const receipts = new Set([doc.id, ...(doc.type === 'invoice' ? related.filter(other => other.type === 'customer_order').map(other => other.id) : [])])
  const paid = pays.filter(pay => pay.status === 'paid' && receipts.has(pay.document)).reduce((total, pay) => total + pay.amount, 0)
  return {
    id: doc.id, paid_amount: paid, balance_due: active ? Math.max(doc.total - paid, 0) : 0,
    settlement_status: active && doc.total > 0 && paid >= doc.total ? 'paid' : active && doc.status === 'paid' ? 'issued' : doc.status
  }
}

describe('financial query equivalence and bounded query plans', () => {
  const client = createClient({ url: 'file::memory:' })
  const db = drizzle({ client, relations: defineRelations(schema) })
  const dialect = new SQLiteDialect()
  let docs: Doc[]
  let pays: Pay[]

  beforeAll(async () => {
    database.db = db
    const contract = parseSchemaContract(readFileSync(schemaPath, 'utf8'), schemaPath)
    for (const [name, table] of Object.entries(contract) as [string, { columns: { name: string, type: string, primaryKey: boolean }[] }][]) {
      await client.execute(`CREATE TABLE "${name}" (${table.columns.map(column => `"${column.name}" ${column.type}${column.primaryKey ? ' PRIMARY KEY' : ''}`).join(', ')})`)
    }
    const migration = readFileSync(new URL('../../drizzle/20260911095852_query_read_indexes/migration.sql', import.meta.url), 'utf8')
    await client.batch(migration.split('--> statement-breakpoint').filter(Boolean), 'write')
  })
  afterAll(() => client.close())

  async function insertDocs(rows: Doc[]) {
    await client.batch(rows.map(doc => ({
      sql: `INSERT INTO documents (id, document_number, type, status, customer_id, ticket_id, total, subtotal, tax_amount, issued_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
      args: [doc.id, `DOC-${doc.id}`, doc.type, doc.status, doc.customer, doc.ticket, doc.total, doc.total, day, day, day]
    })), 'write')
  }
  async function insertPays(rows: Pay[]) {
    await client.batch(rows.map(pay => ({
      sql: `INSERT INTO payments (id, document_id, amount, status, paid_at, method) VALUES (?, ?, ?, ?, ?, 'cash')`,
      args: [pay.id, pay.document, pay.amount, pay.status, pay.paidAt || day]
    })), 'write')
  }
  beforeEach(async () => {
    await client.batch(['DELETE FROM documents', 'DELETE FROM payments', 'DELETE FROM customers', 'DELETE FROM tickets', 'DELETE FROM document_lines'], 'write')
    await client.batch([
      'INSERT INTO customers (id, first_name, last_name, company_name) VALUES (1, \'Ada\', \'Alpha\', \'\'), (2, \'Bob\', \'Beta\', NULL)',
      `INSERT INTO tickets (id, ticket_number, customer_id, status, opened_at) VALUES (10, 'DOS-10', 1, 'diagnosis', '${day}'), (20, 'DOS-20', 1, 'diagnosis', '${day}')`
    ], 'write')
    docs = [
      { id: 1, type: 'quote', status: 'issued', customer: 1, ticket: 10, total: 1000 },
      { id: 2, type: 'customer_order', status: 'cancelled', customer: 1, ticket: 10, total: 1000 },
      { id: 3, type: 'invoice', status: 'issued', customer: 1, ticket: 10, total: 1000 },
      { id: 4, type: 'customer_order', status: 'issued', customer: 2, ticket: 10, total: 2000 },
      { id: 5, type: 'invoice', status: 'issued', customer: 2, ticket: 10, total: 2000 },
      { id: 6, type: 'invoice', status: 'paid', customer: 1, ticket: null, total: 500 },
      { id: 7, type: 'customer_order', status: 'draft', customer: 1, ticket: 20, total: 700 },
      { id: 8, type: 'invoice', status: 'cancelled', customer: 1, ticket: 20, total: 700 },
      { id: 9, type: 'invoice', status: 'paid', customer: 1, ticket: null, total: 0 },
      { id: 10, type: 'customer_order', status: 'issued', customer: 1, ticket: null, total: 250 }
    ]
    pays = [
      { id: 1, document: 2, amount: 400, status: 'paid' },
      { id: 2, document: 3, amount: 600, status: 'paid' },
      { id: 3, document: 3, amount: 9999, status: 'pending' },
      { id: 4, document: 4, amount: 100, status: 'paid' },
      { id: 5, document: 5, amount: 9999, status: 'cancelled' },
      { id: 6, document: 7, amount: 200, status: 'paid' },
      { id: 7, document: 10, amount: 300, status: 'paid' }
    ]
    await insertDocs(docs)
    await insertPays(pays)
  })

  it('matches independent settlement rules, including cancelled orders, mixed customers and stale statuses', async () => {
    const actual = await db.all(sql`WITH ${settlementCtes()}
      SELECT id, paid_amount, balance_due, settlement_status FROM settled_documents ORDER BY id`)
    expect(actual).toEqual(docs.map(doc => oracle(doc, docs, pays)))
    const candidate = await db.all(sql`WITH ${settlementCtes(sql`SELECT * FROM documents WHERE id IN (3, 4, 7)`)}
      SELECT id, paid_amount, balance_due, settlement_status FROM settled_documents ORDER BY id`)
    expect(candidate).toEqual(docs.filter(doc => [3, 4, 7].includes(doc.id)).map(doc => oracle(doc, docs, pays)))
  })

  it('keeps complete summaries when the selected page is empty and preserves due/search ordering', async () => {
    const all = await listDocuments({ pageSize: 3 })
    expect(all.total).toBe(docs.length)
    expect(all.summary.totalBalanceDue).toBe(docs.map(doc => oracle(doc, docs, pays)).reduce((sum, row) => sum + row.balance_due, 0))
    expect(all.items.map(row => row.id)).toEqual([10, 9, 8])
    const beyond = await listDocuments({ page: 100, pageSize: 3 })
    expect(beyond.items).toEqual([])
    expect(beyond.summary).toEqual(all.summary)
    expect(beyond.total).toBe(all.total)
    const due = await listDocuments({ paymentState: 'due', sortBy: 'balanceDue' })
    expect(due.items.map(row => row.id)).toEqual([5, 7, 6])
    const search = await listDocuments({ q: 'DOS-10', paymentState: 'due' })
    expect(search.items.map(row => row.id)).toEqual([5])
    expect((await listDocuments({ q: 'nobody' })).total).toBe(0)
    expect((await listDocuments({ status: 'paid' })).items.map(row => row.id)).toEqual([10, 3])
  })

  it('counts period receipts once for currently paid invoices, even when their deposit order is cancelled', async () => {
    await client.execute({ sql: 'UPDATE payments SET paid_at = ? WHERE id = 1', args: ['2025-01-01T10:00:00.000Z'] })
    const rows = await db.all(sql`WITH ${paidReportCtes('2026-09-10T22:00:00.000Z', '2026-09-11T21:59:59.999Z')}
      SELECT id, period_paid_amount, period_paid_at FROM report_paid_documents`)
    expect(rows).toEqual([{ id: 3, period_paid_amount: 600, period_paid_at: day }])
    const daily = await getEndOfDaySummary('2026-09-11')
    expect(daily.totalPaid).toBe(1200)
    expect(daily.paidDocuments).toEqual([expect.objectContaining({ id: 3, paidAmountToday: 600 })])
    const leaders = await getReportsLeaders('2026-09-11', '2026-09-11')
    expect(leaders.totalPaid).toBe(1200)
    expect(leaders.topCustomers).toEqual([expect.objectContaining({ customerId: 1, total: 1000, documentCount: 1 })])
  })

  it('preserves all chart periods while optionally skipping unused leader aggregation', async () => {
    const extra: Pay[] = [
      { id: 20, document: 6, amount: 10, status: 'paid', paidAt: '2025-12-31T22:59:59.999Z' },
      { id: 21, document: 6, amount: 20, status: 'paid', paidAt: '2025-12-31T23:00:00.000Z' },
      { id: 22, document: 6, amount: 30, status: 'paid', paidAt: '2026-01-01T00:00:00.000Z' }
    ]
    await insertPays(extra)
    const full = await getReportsOverview('2026-09-11')
    const lean = await getReportsOverview('2026-09-11', { includeLeaders: false })
    expect(lean).toEqual({ ...full, topCustomers: [], topItems: [] })
    expect(full.topCustomers).toHaveLength(1)
    expect(full.paymentPeriods.find(period => period.key === 'month')?.buckets.reduce((sum, row) => sum + row.total, 0)).toBe(1630)
    expect(full.paymentPeriods.find(period => period.key === 'years')?.buckets.reduce((sum, row) => sum + row.total, 0)).toBe(1660)
  })

  it.each([100, 2000])('materializes payments once and uses indexed receipt lookups with %s additional operations', async (size) => {
    const addedDocs: Doc[] = []
    const addedPays: Pay[] = []
    for (let i = 0; i < size; i++) {
      const id = 100 + i * 2
      addedDocs.push({ id, type: 'customer_order', status: 'issued', customer: 1, ticket: id, total: 1000 },
        { id: id + 1, type: 'invoice', status: 'issued', customer: 1, ticket: id, total: 1000 })
      addedPays.push({ id, document: id, amount: 200, status: 'paid' }, { id: id + 1, document: id + 1, amount: 800, status: 'paid' })
    }
    await insertDocs(addedDocs)
    await insertPays(addedPays)
    await client.execute('ANALYZE')
    const query = sql`WITH ${settlementCtes()} SELECT id, paid_amount, balance_due, settlement_status FROM settled_documents ${sql.raw(`/* fixture operations: ${size} */`)}`
    const compiled = dialect.sqlToQuery(query)
    const plan = (await client.execute({ sql: `EXPLAIN QUERY PLAN ${compiled.sql}`, args: compiled.params })).rows.map(row => String(row.detail)).join('\n')
    expect(plan.match(/MATERIALIZE settlement_payment_totals/g)).toHaveLength(1)
    expect(plan).toMatch(/SEARCH p USING COVERING INDEX payments_document_settlement_idx \(document_id=\? AND status=\?\)/)
    expect(plan).not.toMatch(/SCAN p\b/)
    expect(plan).toContain('documents_settlement_scope_idx')
    const rows = await db.all<{ id: number, paid_amount: number, balance_due: number, settlement_status: string }>(query)
    expect(rows).toHaveLength(docs.length + size * 2)
    expect(rows.filter(row => row.id >= 100 && row.id % 2 === 1).every(row => row.paid_amount === 1000 && row.balance_due === 0 && row.settlement_status === 'paid')).toBe(true)
    // libSQL exposes deterministic SQLite VM counters for prepared statements.
    // This is an execution-work budget, not a flaky elapsed-time threshold or a
    // claim that VM steps equal Turso's billable row reads.
    const counters = await client.execute({
      sql: 'SELECT nstep, nscan, run FROM sqlite_stmt WHERE sql = ?', args: [compiled.sql]
    })
    expect(counters.rows).toHaveLength(1)
    const executions = Number(counters.rows[0]!.run)
    const count = docs.length + size * 2
    expect(Number(counters.rows[0]!.nstep) / executions).toBeLessThan(count * 1000)
    expect(Number(counters.rows[0]!.nscan) / executions).toBeLessThan(count * 20)
  })
})
