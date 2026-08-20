import { createClient } from '@libsql/client'
import { defineRelations } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import type { PosDatabase } from '../../server/utils/turso'
import {
  readCounterOverview,
  readHomeOverview
} from '../../server/utils/pos/read-models'

const relations = defineRelations(schema)

describe('batched POS read models', () => {
  let client: ReturnType<typeof createClient>
  let db: PosDatabase

  beforeEach(async () => {
    client = createClient({ url: 'file::memory:' })
    db = drizzle({ client, relations })

    await client.batch([
      `CREATE TABLE customers (
        id INTEGER PRIMARY KEY,
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
        id INTEGER PRIMARY KEY,
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
        id INTEGER PRIMARY KEY,
        document_number TEXT NOT NULL,
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
      `CREATE TABLE payments (
        id INTEGER PRIMARY KEY,
        customer_id INTEGER,
        document_id INTEGER NOT NULL,
        method TEXT NOT NULL,
        status TEXT NOT NULL,
        amount INTEGER NOT NULL,
        paid_at TEXT NOT NULL,
        notes TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE catalog_items (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL
      )`,
      `CREATE TABLE document_lines (
        id INTEGER PRIMARY KEY,
        document_id INTEGER NOT NULL,
        catalog_item_id INTEGER,
        label TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL,
        vat_rate REAL NOT NULL,
        line_total INTEGER NOT NULL,
        category_hint TEXT
      )`,
      `CREATE TABLE ticket_events (
        id INTEGER PRIMARY KEY,
        ticket_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        label TEXT NOT NULL,
        note TEXT,
        metadata_json TEXT,
        occurred_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `INSERT INTO customers VALUES
        (1, 'Ada', 'Lovelace', NULL, '1', 'ada@example.test', NULL, NULL, NULL, NULL, NULL, '2026-08-01T00:00:00.000Z', '2026-08-01T00:00:00.000Z')`,
      `INSERT INTO tickets VALUES
        (1, 'TIC-1', 1, 'repair', 'ready_for_pickup', 'Apple', 'iPhone', 'SER-1', 'IMEI-1', '1234', '5678', 'Écran', 'Note interne', '2026-08-20T08:00:00.000Z', NULL, '2026-08-20T08:00:00.000Z', '2020-01-01T00:00:00.000Z'),
        (2, 'TIC-2', 1, 'repair', 'diagnosis', NULL, NULL, NULL, NULL, NULL, NULL, 'Diagnostic', NULL, '2026-08-19T08:00:00.000Z', NULL, '2026-08-19T08:00:00.000Z', '2026-08-19T08:00:00.000Z'),
        (3, 'TIC-3', 1, 'repair', 'awaiting_customer_approval', NULL, NULL, NULL, NULL, NULL, NULL, 'Accord', NULL, '2026-08-18T08:00:00.000Z', NULL, '2026-08-18T08:00:00.000Z', '2026-08-18T08:00:00.000Z'),
        (4, 'TIC-4', 1, 'repair', 'waiting_parts', NULL, NULL, NULL, NULL, NULL, NULL, 'Pièce', NULL, '2026-08-17T08:00:00.000Z', NULL, '2026-08-17T08:00:00.000Z', '2026-08-17T08:00:00.000Z'),
        (5, 'TIC-5', 1, 'repair', 'closed', NULL, NULL, NULL, NULL, NULL, NULL, 'Clos', NULL, '2026-08-20T09:00:00.000Z', '2026-08-20T11:00:00.000Z', '2026-08-20T09:00:00.000Z', '2026-08-20T11:00:00.000Z')`,
      `INSERT INTO documents VALUES
        (1, 'FAC-1', 'invoice', 'paid', 1, 1, '2026-08-20T09:00:00.000Z', 9250, 750, 10000, NULL, '2026-08-20T09:00:00.000Z', '2026-08-20T09:00:00.000Z'),
        (2, 'CMD-2', 'customer_order', 'issued', 1, 2, '2026-08-20T08:00:00.000Z', 4625, 375, 5000, NULL, '2026-08-20T08:00:00.000Z', '2026-08-20T08:00:00.000Z'),
        (3, 'FAC-3', 'invoice', 'issued', 1, 3, '2026-08-19T08:00:00.000Z', 6475, 525, 7000, NULL, '2026-08-19T08:00:00.000Z', '2026-08-19T08:00:00.000Z')`,
      `INSERT INTO payments VALUES
        (1, 1, 1, 'cash', 'paid', 10000, '2026-08-20T10:00:00.000Z', NULL, '2026-08-20T10:00:00.000Z', '2026-08-20T10:00:00.000Z'),
        (2, 1, 2, 'card_twint', 'paid', 2000, '2026-08-20T10:30:00.000Z', NULL, '2026-08-20T10:30:00.000Z', '2026-08-20T10:30:00.000Z'),
        (3, 1, 3, 'cash', 'pending', 5000, '2026-08-20T11:00:00.000Z', NULL, '2026-08-20T11:00:00.000Z', '2026-08-20T11:00:00.000Z')`,
      `INSERT INTO catalog_items VALUES (1, 'Réparation écran')`,
      `INSERT INTO document_lines VALUES
        (1, 1, 1, 'Réparation écran', 1, 8000, 8.1, 8000, 'repair'),
        (2, 1, NULL, 'Coque', 1, 2000, 8.1, 2000, 'accessory')`,
      `INSERT INTO ticket_events VALUES
        (1, 1, 'ticket_created', 'Ticket créé', NULL, NULL, '2026-08-20T08:00:00.000Z', '2026-08-20T08:00:00.000Z'),
        (2, 1, 'ticket_status_changed', 'Statut', NULL, '{"nextStatus":"ready_for_pickup"}', '2026-08-20T09:00:00.000Z', '2026-08-20T09:00:00.000Z'),
        (3, 1, 'document_created', 'Facture créée', NULL, '{"documentId":1,"documentNumber":"FAC-1","documentType":"invoice"}', '2026-08-20T09:30:00.000Z', '2026-08-20T09:30:00.000Z')`
    ], 'write')
  })

  afterEach(() => {
    client.close()
  })

  it('loads the counter payload through one nine-statement database batch', async () => {
    const batchSpy = vi.spyOn(client, 'batch')
    const observer = vi.fn()
    const result = await readCounterOverview(db, '2026-08-20', observer)

    expect(batchSpy).toHaveBeenCalledOnce()
    expect(batchSpy.mock.calls[0]?.[0]).toHaveLength(9)
    expect(observer).toHaveBeenCalledWith(expect.objectContaining({
      readModel: 'counter-overview',
      databaseCalls: 1,
      statementCount: 9,
      outcome: 'success'
    }))
    expect(result.readyTickets).toMatchObject({
      page: 1,
      pageSize: 6,
      total: 1,
      summary: { openCount: 1, readyCount: 1, staleCount: 1 }
    })
    expect(result.readyTickets.items[0]).toMatchObject({
      ticketNumber: 'TIC-1',
      accessCode: '1234',
      simCode: '5678',
      internalNotes: 'Note interne',
      customerName: 'Ada Lovelace',
      documentCount: 1
    })
    expect(result.diagnosisTickets.total).toBe(1)
    expect(result.approvalTickets.total).toBe(1)
    expect(result.waitingPartsTickets.total).toBe(1)
    expect(result.dueDocuments.items.map(item => item.documentNumber)).toEqual(['FAC-3', 'CMD-2'])
    expect(result.dueDocuments.summary).toEqual({ paidCount: 0, totalBalanceDue: 10000 })
    expect(result.reportsOverview.kpis).toMatchObject({ totalPaid: 12000, paidToday: 12000, openTickets: 4 })
    expect(result.reportsOverview.topCustomers).toEqual([expect.objectContaining({
      customerName: 'Ada Lovelace',
      total: 10000,
      documentCount: 1
    })])
  })

  it('loads the home payload through one six-statement batch without private ticket fields', async () => {
    const batchSpy = vi.spyOn(client, 'batch')
    const observer = vi.fn()
    const result = await readHomeOverview(db, '2026-08-20', observer)

    expect(batchSpy).toHaveBeenCalledOnce()
    expect(batchSpy.mock.calls[0]?.[0]).toHaveLength(6)
    expect(observer).toHaveBeenCalledWith(expect.objectContaining({
      readModel: 'home-overview',
      databaseCalls: 1,
      statementCount: 6,
      outcome: 'success'
    }))
    expect(result.summary).toEqual({
      totalPaid: 12000,
      totalBalanceDue: 10000,
      dueDocumentCount: 2,
      openTicketCount: 4,
      openedToday: 2,
      readyForPickupCount: 1
    })
    expect(result.cashbox.latestPaymentAt).toBe('2026-08-20T10:30:00.000Z')
    expect(result.cashbox.methods).toEqual([
      { method: 'cash', total: 10000, transactionCount: 1 },
      { method: 'card_twint', total: 2000, transactionCount: 1 }
    ])
    expect(result.readyTickets).toEqual([expect.objectContaining({ ticketNumber: 'TIC-1' })])
    expect(result.readyTickets[0]).not.toHaveProperty('accessCode')
    expect(result.readyTickets[0]).not.toHaveProperty('simCode')
    expect(result.dueDocuments.map(item => item.documentNumber)).toEqual(['FAC-3', 'CMD-2'])
    expect(result.activity).toHaveLength(5)
  })

  it('keeps empty queue and financial summaries stable', async () => {
    await client.batch([
      'DELETE FROM ticket_events',
      'DELETE FROM document_lines',
      'DELETE FROM payments',
      'DELETE FROM documents',
      'DELETE FROM tickets'
    ], 'write')
    const batchSpy = vi.spyOn(client, 'batch')
    const counter = await readCounterOverview(db, '2026-08-20', vi.fn())

    expect(batchSpy).toHaveBeenCalledOnce()
    expect(counter.readyTickets).toMatchObject({
      items: [],
      total: 0,
      summary: { openCount: 0, readyCount: 0, staleCount: 0 }
    })
    expect(counter.dueDocuments).toMatchObject({
      items: [],
      total: 0,
      summary: { paidCount: 0, totalBalanceDue: 0 }
    })
    expect(counter.reportsOverview.kpis).toMatchObject({ totalPaid: 0, paidToday: 0, openTickets: 0 })

    batchSpy.mockClear()
    const home = await readHomeOverview(db, '2026-08-20', vi.fn())

    expect(batchSpy).toHaveBeenCalledOnce()
    expect(home.summary).toEqual({
      totalPaid: 0,
      totalBalanceDue: 0,
      dueDocumentCount: 0,
      openTicketCount: 0,
      openedToday: 0,
      readyForPickupCount: 0
    })
    expect(home.cashbox).toEqual({ totalPaid: 0, latestPaymentAt: null, methods: [] })
    expect(home.activity).toEqual([])
  })
})
