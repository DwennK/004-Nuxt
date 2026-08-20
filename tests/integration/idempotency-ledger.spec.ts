import { createClient } from '@libsql/client'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { documents, payments } from '../../server/db/schema'
import {
  assertDocumentDeletionAllowed,
  assertTicketDocumentCreationAllowed
} from '../../server/utils/pos/documents'
import {
  runIdempotentDocumentOperation
} from '../../server/utils/idempotency'
import type { PosDatabase } from '../../server/utils/turso'

describe('idempotent financial mutation ledger', () => {
  let client: ReturnType<typeof createClient>
  let database: PosDatabase
  let temporaryDirectory: string

  beforeEach(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'pos-idempotency-'))
    client = createClient({ url: `file:${join(temporaryDirectory, 'ledger.db')}` })
    await client.batch([
      `CREATE TABLE documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_number TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        customer_id INTEGER NOT NULL,
        ticket_id INTEGER,
        issued_at TEXT NOT NULL,
        subtotal INTEGER NOT NULL,
        tax_amount INTEGER NOT NULL,
        total INTEGER NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE tickets (
        id INTEGER PRIMARY KEY,
        status TEXT NOT NULL,
        customer_id INTEGER NOT NULL
      )`,
      `CREATE TABLE payments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        document_id INTEGER NOT NULL,
        method TEXT NOT NULL,
        status TEXT NOT NULL,
        amount INTEGER NOT NULL,
        paid_at TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE document_imports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        source TEXT NOT NULL,
        external_id TEXT NOT NULL,
        external_number TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      )`,
      'CREATE UNIQUE INDEX document_imports_source_external_id_idx ON document_imports(source, external_id)'
    ], 'write')
    database = drizzle({ client }) as unknown as PosDatabase
  })

  afterEach(async () => {
    client.close()
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  async function performSale(key: string, amount: number, options?: { failAfterWrite?: boolean }) {
    return runIdempotentDocumentOperation({
      database,
      source: 'api_sale_create_and_pay',
      key,
      payload: { amount, method: 'cash' },
      async execute(tx) {
        const now = '2026-08-20T12:00:00.000Z'
        const [document] = await tx.insert(documents).values({
          documentNumber: `FA-${amount}`,
          type: 'invoice',
          status: 'issued',
          customerId: 1,
          ticketId: null,
          issuedAt: now,
          subtotal: amount,
          taxAmount: 0,
          total: amount,
          notes: null,
          createdAt: now,
          updatedAt: now
        }).returning()

        const [payment] = await tx.insert(payments).values({
          customerId: 1,
          documentId: document!.id,
          method: 'cash',
          status: 'paid',
          amount,
          paidAt: now,
          notes: null,
          createdAt: now,
          updatedAt: now
        }).returning()

        if (options?.failAfterWrite) {
          throw new Error('forced rollback')
        }

        return {
          value: document!.id,
          documentId: document!.id,
          resourceId: payment!.id
        }
      },
      async replay(tx, receipt) {
        const [document] = await tx.select({ id: documents.id })
          .from(documents)
          .where(eq(documents.id, receipt.documentId))
          .limit(1)

        return document!.id
      }
    })
  }

  it('returns the first result and creates one document and payment on replay', async () => {
    const first = await performSale('sale-key-0001', 2500)
    const replay = await performSale('sale-key-0001', 2500)
    const documentCount = await client.execute('SELECT COUNT(*) AS count FROM documents')
    const paymentCount = await client.execute('SELECT COUNT(*) AS count FROM payments')

    expect(first).toEqual({ value: 1, replayed: false })
    expect(replay).toEqual({ value: 1, replayed: true })
    expect(Number(documentCount.rows[0]?.count)).toBe(1)
    expect(Number(paymentCount.rows[0]?.count)).toBe(1)
  })

  it('rejects reuse of a key with a different payload', async () => {
    await performSale('sale-key-0002', 2500)

    await expect(performSale('sale-key-0002', 2600)).rejects.toMatchObject({
      statusCode: 409,
      data: { code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' }
    })
  })

  it('rolls back the business writes and receipt together', async () => {
    await expect(performSale('sale-key-rollback', 2700, { failAfterWrite: true }))
      .rejects.toThrow('forced rollback')

    const documentCount = await client.execute('SELECT COUNT(*) AS count FROM documents')
    const paymentCount = await client.execute('SELECT COUNT(*) AS count FROM payments')
    const receiptCount = await client.execute('SELECT COUNT(*) AS count FROM document_imports')

    expect(Number(documentCount.rows[0]?.count)).toBe(0)
    expect(Number(paymentCount.rows[0]?.count)).toBe(0)
    expect(Number(receiptCount.rows[0]?.count)).toBe(0)

    await expect(performSale('sale-key-rollback', 2700)).resolves.toEqual({
      value: 1,
      replayed: false
    })
  })

  it('serializes concurrent retries to one financial mutation', async () => {
    const results = await Promise.all([
      performSale('sale-key-concurrent', 2800),
      performSale('sale-key-concurrent', 2800)
    ])
    const documentCount = await client.execute('SELECT COUNT(*) AS count FROM documents')
    const paymentCount = await client.execute('SELECT COUNT(*) AS count FROM payments')

    expect(results.map(result => result.replayed).sort()).toEqual([false, true])
    expect(Number(documentCount.rows[0]?.count)).toBe(1)
    expect(Number(paymentCount.rows[0]?.count)).toBe(1)
  })

  it('rechecks one-document-per-type eligibility inside the serialized transaction', async () => {
    await client.execute(`INSERT INTO tickets (id, status, customer_id) VALUES (7, 'in_progress', 1)`)

    async function performTicketInvoice(key: string) {
      return runIdempotentDocumentOperation({
        database,
        source: 'api_document_create',
        key,
        payload: { ticketId: 7, documentType: 'invoice' },
        async execute(tx) {
          await assertTicketDocumentCreationAllowed(tx, {
            ticketId: 7,
            documentType: 'invoice',
            customerId: 1
          })
          const now = '2026-08-20T12:00:00.000Z'
          const [document] = await tx.insert(documents).values({
            documentNumber: `FA-${key}`,
            type: 'invoice',
            status: 'issued',
            customerId: 1,
            ticketId: 7,
            issuedAt: now,
            subtotal: 1000,
            taxAmount: 0,
            total: 1000,
            notes: null,
            createdAt: now,
            updatedAt: now
          }).returning()

          return {
            value: document!.id,
            documentId: document!.id,
            resourceId: document!.id
          }
        },
        async replay(tx, receipt) {
          const [document] = await tx.select({ id: documents.id })
            .from(documents)
            .where(eq(documents.id, receipt.documentId))
            .limit(1)

          return document!.id
        }
      })
    }

    const results = await Promise.allSettled([
      performTicketInvoice('ticket-invoice-key-a'),
      performTicketInvoice('ticket-invoice-key-b')
    ])
    const documentCount = await client.execute(`SELECT COUNT(*) AS count FROM documents WHERE ticket_id = 7 AND type = 'invoice'`)

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({
      reason: {
        statusCode: 409,
        data: { code: 'TICKET_DOCUMENT_ALREADY_EXISTS' }
      }
    })
    expect(Number(documentCount.rows[0]?.count)).toBe(1)

    const successfulKey = results[0]?.status === 'fulfilled'
      ? 'ticket-invoice-key-a'
      : 'ticket-invoice-key-b'
    await expect(performTicketInvoice(successfulKey)).resolves.toMatchObject({
      replayed: true
    })
  })

  it('rejects a document whose customer does not own the ticket', async () => {
    await client.execute(`INSERT INTO tickets (id, status, customer_id) VALUES (8, 'new', 1)`)

    await expect(database.transaction(tx => assertTicketDocumentCreationAllowed(tx, {
      ticketId: 8,
      documentType: 'quote',
      customerId: 2
    }))).rejects.toMatchObject({
      statusCode: 409,
      data: { code: 'TICKET_DOCUMENT_CUSTOMER_MISMATCH' }
    })
  })

  it('keeps a receipt and its replayable document protected from hard deletion', async () => {
    const created = await performSale('sale-key-delete-protected', 2900)

    await expect(database.transaction(tx => assertDocumentDeletionAllowed(tx, created.value)))
      .rejects.toMatchObject({
        statusCode: 409,
        data: { code: 'DOCUMENT_IDEMPOTENCY_PROTECTED' }
      })
    await expect(performSale('sale-key-delete-protected', 2900)).resolves.toEqual({
      value: created.value,
      replayed: true
    })
  })
})
