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

  beforeAll(async () => {
    temporaryDirectory = await mkdtemp(join(tmpdir(), 'pos-financial-editing-'))
    databaseUrl = `file:${join(temporaryDirectory, 'financial.db')}`
    client = createClient({ url: databaseUrl })

    await client.batch([
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

    ;({ updateDocumentRecord } = await import('../../server/utils/pos/documents'))
    ;({ updatePaymentRecord } = await import('../../server/utils/pos/payments'))
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
      'DELETE FROM payments',
      'DELETE FROM document_lines',
      'DELETE FROM documents',
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
