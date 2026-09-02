import { createClient } from '@libsql/client'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

describe('editing recorded financial data', () => {
  let client: ReturnType<typeof createClient>
  let databaseUrl: string
  let temporaryDirectory: string
  let updateDocumentRecord: typeof import('../../server/utils/pos/documents').updateDocumentRecord
  let updatePaymentRecord: typeof import('../../server/utils/pos/payments').updatePaymentRecord
  let createPaymentRecord: typeof import('../../server/utils/pos/payments').createPaymentRecord
  let markDocumentAsPaid: typeof import('../../server/utils/pos/documents').markDocumentAsPaid
  let createAndPayDocumentRecord: typeof import('../../server/utils/pos/documents').createAndPayDocumentRecord

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'pos-financial-editing-'))
    databaseUrl = `file:${join(temporaryDirectory, 'financial.db')}`
    client = createClient({ url: databaseUrl })

    await client.batch([
      `CREATE TABLE document_imports (id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL, source TEXT NOT NULL, external_id TEXT NOT NULL, external_number TEXT NOT NULL, created_at TEXT NOT NULL)`,
      'CREATE UNIQUE INDEX document_imports_source_external_id_idx ON document_imports(source, external_id)',
      'CREATE TABLE number_sequences (scope TEXT PRIMARY KEY, last_value INTEGER NOT NULL)',
      `CREATE TABLE ticket_events (
        id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL, kind TEXT NOT NULL, label TEXT NOT NULL,
        note TEXT, metadata_json TEXT, occurred_at TEXT NOT NULL, created_at TEXT NOT NULL
      )`,
      `CREATE TABLE customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        company_name TEXT,
        phone TEXT NOT NULL,
        email TEXT NOT NULL,
        address_line_1 TEXT,
        address_line_2 TEXT,
        postal_code TEXT,
        city TEXT,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_number TEXT NOT NULL,
        customer_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        status TEXT NOT NULL,
        brand TEXT,
        model TEXT,
        serial_number TEXT,
        imei TEXT,
        access_code TEXT,
        sim_code TEXT,
        issue_description TEXT NOT NULL,
        internal_notes TEXT,
        opened_at TEXT NOT NULL,
        closed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
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
      `CREATE TABLE document_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER NOT NULL,
        catalog_item_id INTEGER,
        label TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL,
        vat_rate REAL NOT NULL,
        line_total INTEGER NOT NULL,
        category_hint TEXT
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
        updated_at TEXT NOT NULL
      )`
    ], 'write')

    ;({ updateDocumentRecord, markDocumentAsPaid, createAndPayDocumentRecord } = await import('../../server/utils/pos/documents'))
    ;({ updatePaymentRecord, createPaymentRecord } = await import('../../server/utils/pos/payments'))
  })

  beforeEach(async () => {
    vi.stubEnv('TURSO_URL', databaseUrl)
    vi.stubEnv('TURSO_TOKEN', 'local-test-token')
    vi.stubGlobal('useRuntimeConfig', () => ({
      posAllowRuntimeSchemaBootstrap: false,
      tursoUrl: databaseUrl,
      tursoToken: 'local-test-token'
    }))
    vi.stubGlobal('createError', (input: {
      statusCode: number
      statusMessage: string
      data?: unknown
    }) => Object.assign(new Error(input.statusMessage), input))

    const now = '2026-08-20T12:00:00.000Z'
    await client.batch([
      'DELETE FROM document_imports',
      'DELETE FROM ticket_events',
      'DELETE FROM number_sequences',
      'DELETE FROM payments',
      'DELETE FROM document_lines',
      'DELETE FROM documents',
      'DELETE FROM tickets',
      'DELETE FROM customers',
      {
        sql: `INSERT INTO customers (
          id, first_name, last_name, company_name, phone, email,
          address_line_1, address_line_2, postal_code, city, notes, created_at, updated_at
        ) VALUES (1, 'Ada', 'Lovelace', NULL, '0220000000', 'ada@example.test', NULL, NULL, '1200', 'Genève', NULL, ?, ?)`,
        args: [now, now]
      },
      {
        sql: `INSERT INTO documents (
          id, document_number, type, status, customer_id, ticket_id, issued_at,
          subtotal, tax_amount, total, notes, created_at, updated_at
        ) VALUES (1, 'FA-TEST', 'invoice', 'paid', 1, NULL, ?, 12500, 0, 12500, NULL, ?, ?)`,
        args: [now, now, now]
      },
      {
        sql: `INSERT INTO document_lines (
          id, document_id, catalog_item_id, label, quantity, unit_price, vat_rate, line_total, category_hint
        ) VALUES (1, 1, NULL, 'Réparation', 1, 12500, 0, 12500, 'repair')`,
        args: []
      },
      {
        sql: `INSERT INTO payments (
          id, customer_id, document_id, method, status, amount, paid_at, notes, created_at, updated_at
        ) VALUES (1, 1, 1, 'cash', 'paid', 12500, ?, NULL, ?, ?)`,
        args: [now, now, now]
      }
    ], 'write')
  })

  afterAll(async () => {
    client.close()
    await rm(temporaryDirectory, { recursive: true, force: true })
  })

  const paymentInput = { method: 'cash' as const, paidAt: '2026-08-20T12:30:00.000Z', notes: ' Encaissement ' }

  async function prepareUnpaidTicketDocument() {
    await client.batch([
      'DELETE FROM payments',
      `UPDATE documents SET status = 'issued', ticket_id = 7 WHERE id = 1`,
      `INSERT INTO tickets (id, ticket_number, customer_id, type, status, issue_description, opened_at, created_at, updated_at)
       VALUES (7, 'TIC-7', 1, 'repair', 'in_progress', 'Réparation', '2026-08-20', '2026-08-20', '2026-08-20')`
    ], 'write')
  }

  function recordThrough(path: 'payment' | 'mark-paid', amount: number, key: string) {
    return path === 'payment'
      ? createPaymentRecord({ ...paymentInput, customerId: 1, documentId: 1, status: 'paid', amount }, key)
      : markDocumentAsPaid(1, { ...paymentInput, amount }, key)
  }

  it.each(['payment', 'mark-paid'] as const)('%s shares partial/full payment rules and records each event once', async (path) => {
    await prepareUnpaidTicketDocument()
    await recordThrough(path, 2500, 'partial-payment-key')
    await recordThrough(path, 2500, 'partial-payment-key')
    expect((await client.execute('SELECT status FROM documents WHERE id = 1')).rows[0]?.status).toBe('issued')
    expect((await client.execute('SELECT COUNT(*) AS n FROM ticket_events')).rows[0]?.n).toBe(1)

    await recordThrough(path, 10000, 'remaining-payment-key')
    expect((await client.execute('SELECT status FROM documents WHERE id = 1')).rows[0]?.status).toBe('paid')
    expect((await client.execute('SELECT SUM(amount) AS total FROM payments')).rows[0]?.total).toBe(12500)
    expect((await client.execute('SELECT COUNT(*) AS n FROM ticket_events')).rows[0]?.n).toBe(2)
  })

  it.each(['payment', 'mark-paid'] as const)('%s rejects overpayment and cancelled documents with the same policy codes', async (path) => {
    await prepareUnpaidTicketDocument()
    await expect(recordThrough(path, 12501, 'overpayment-key')).rejects.toMatchObject({
      statusCode: 400, data: { code: 'PAYMENT_EXCEEDS_BALANCE' }
    })
    await client.execute(`UPDATE documents SET status = 'cancelled' WHERE id = 1`)
    await expect(recordThrough(path, 100, 'cancelled-key')).rejects.toMatchObject({
      statusCode: 409, data: { code: 'DOCUMENT_CANCELLED' }
    })
    expect((await client.execute('SELECT COUNT(*) AS n FROM document_imports')).rows[0]?.n).toBe(0)
  })

  it('resolves the omitted amount to the remaining balance inside the transaction', async () => {
    await prepareUnpaidTicketDocument()
    await recordThrough('payment', 2500, 'partial-payment-key')
    const document = await markDocumentAsPaid(1, paymentInput, 'pay-remaining-key')
    expect(document.status).toBe('paid')
    expect(document.payments.map(payment => payment.amount).sort((a, b) => a - b)).toEqual([2500, 10000])
  })

  it('creates a sale and payment atomically and replays the original result', async () => {
    const input = {
      type: 'invoice' as const, customerId: 1, issuedAt: paymentInput.paidAt,
      lines: [{ label: 'Article', quantity: 1, unitPrice: 10810, vatRate: 8.1 }]
    }
    const sale = await createAndPayDocumentRecord(input, paymentInput, 'sale-payment-key')
    const replay = await createAndPayDocumentRecord(input, paymentInput, 'sale-payment-key')
    expect(replay.id).toBe(sale.id)
    expect(sale).toMatchObject({ status: 'paid', total: 10810 })
    expect(sale.payments).toHaveLength(1)
    expect(sale.payments[0]).toMatchObject({ amount: 10810, notes: 'Encaissement' })
  })

  it('rolls back payment, status and receipt if the ticket event cannot be recorded', async () => {
    await prepareUnpaidTicketDocument()
    await client.execute(`CREATE TRIGGER fail_payment_event BEFORE INSERT ON ticket_events BEGIN SELECT RAISE(ABORT, 'event unavailable'); END`)
    try {
      await expect(recordThrough('mark-paid', 12500, 'rollback-payment-key')).rejects.toMatchObject({
        cause: { message: expect.stringContaining('event unavailable') }
      })
      expect((await client.execute('SELECT COUNT(*) AS n FROM payments')).rows[0]?.n).toBe(0)
      expect((await client.execute('SELECT COUNT(*) AS n FROM document_imports')).rows[0]?.n).toBe(0)
      expect((await client.execute('SELECT status FROM documents WHERE id = 1')).rows[0]?.status).toBe('issued')
    } finally {
      await client.execute('DROP TRIGGER fail_payment_event')
    }
  })

  it('checks competing payments against the serialized remaining balance', async () => {
    await prepareUnpaidTicketDocument()
    const results = await Promise.allSettled([
      recordThrough('payment', 10000, 'competing-payment-a'),
      recordThrough('mark-paid', 10000, 'competing-payment-b')
    ])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.find(result => result.status === 'rejected')).toMatchObject({
      reason: { data: { code: 'PAYMENT_EXCEEDS_BALANCE' } }
    })
    expect((await client.execute('SELECT SUM(amount) AS total FROM payments')).rows[0]?.total).toBe(10000)
  })

  it('edits a paid invoice and its recorded payment while deriving the balance status', async () => {
    const expanded = await updateDocumentRecord(1, {
      type: 'invoice',
      status: 'paid',
      customerId: 1,
      ticketId: null,
      issuedAt: '2026-08-20T12:00:00.000Z',
      notes: 'Facture corrigée',
      lines: [{
        catalogItemId: null,
        label: 'Réparation complétée',
        quantity: 1,
        unitPrice: 15000,
        vatRate: 0,
        categoryHint: 'repair'
      }]
    })

    expect(expanded).toMatchObject({ total: 15000, status: 'issued', notes: 'Facture corrigée' })

    const payment = await updatePaymentRecord(1, {
      customerId: 1,
      documentId: 1,
      method: 'bank_transfer',
      status: 'paid',
      amount: 15000,
      paidAt: '2026-08-20T13:00:00.000Z',
      notes: 'Référence bancaire corrigée'
    })
    const document = await client.execute('SELECT status, total FROM documents WHERE id = 1')

    expect(payment).toMatchObject({
      method: 'bank_transfer',
      status: 'paid',
      amount: 15000,
      notes: 'Référence bancaire corrigée'
    })
    expect(document.rows[0]).toMatchObject({ status: 'paid', total: 15000 })
  })

  it('rejects reducing an invoice below the already recorded amount', async () => {
    await expect(updateDocumentRecord(1, {
      type: 'invoice',
      status: 'paid',
      customerId: 1,
      ticketId: null,
      issuedAt: '2026-08-20T12:00:00.000Z',
      notes: null,
      lines: [{
        catalogItemId: null,
        label: 'Montant invalide',
        quantity: 1,
        unitPrice: 12000,
        vatRate: 0,
        categoryHint: 'repair'
      }]
    })).rejects.toMatchObject({
      statusCode: 409,
      data: { code: 'DOCUMENT_TOTAL_BELOW_PAID', paidTotal: 12500 }
    })
  })

  it('edits paid payment details without treating a refund as a simple rewrite', async () => {
    await expect(updatePaymentRecord(1, {
      customerId: 1,
      documentId: 1,
      method: 'card_twint',
      status: 'refunded',
      amount: 12500,
      paidAt: '2026-08-20T12:30:00.000Z',
      notes: 'Tentative de remboursement'
    })).rejects.toMatchObject({
      statusCode: 400,
      data: { code: 'PAYMENT_CORRECTION_FLOW_REQUIRED' }
    })

    await expect(updatePaymentRecord(1, {
      customerId: 1,
      documentId: 1,
      method: 'card_twint',
      status: 'paid',
      amount: 12500,
      paidAt: '2026-08-20T12:30:00.000Z',
      notes: 'Mode corrigé'
    })).resolves.toMatchObject({ method: 'card_twint', notes: 'Mode corrigé' })
  })
})
