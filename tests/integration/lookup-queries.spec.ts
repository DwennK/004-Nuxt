import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { defineRelations, eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import type { PosDatabase } from '../../server/utils/turso'
import { listCustomers, suggestCustomers } from '../../server/utils/pos/customers'
import { listCatalogItems, suggestCatalogItems } from '../../server/utils/pos/catalog'
import { listTickets, mapTicket, suggestTickets, updateTicket } from '../../server/utils/pos/tickets'
import { listDocuments } from '../../server/utils/pos/documents'
import { suggestDocuments } from '../../server/utils/pos/document-lookups'
import { testDossierContext } from '../fixtures/dossiers'

const context = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../server/utils/turso', () => ({ useDb: () => context.db }))
vi.mock('../../server/utils/pos/schema', () => ({ ensurePosSchema: async () => {} }))

const timestamp = '2026-09-11T08:00:00.000Z'

describe('POS suggestions preserve search results without financial aggregation', () => {
  let client: ReturnType<typeof createClient>
  let db: PosDatabase
  let queries: string[]
  let directory: string

  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'pos-lookups-'))
    client = createClient({ url: `file:${join(directory, 'test.sqlite')}` })
    await client.executeMultiple(`
      CREATE TABLE customers (
        id INTEGER PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL, company_name TEXT,
        phone TEXT NOT NULL, email TEXT NOT NULL, address_line_1 TEXT, address_line_2 TEXT, postal_code TEXT,
        city TEXT, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE tickets (
        id INTEGER PRIMARY KEY, ticket_number TEXT NOT NULL UNIQUE, customer_id INTEGER NOT NULL, type TEXT NOT NULL,
        status TEXT NOT NULL, brand TEXT, model TEXT, serial_number TEXT, imei TEXT, access_code TEXT, sim_code TEXT,
        issue_description TEXT NOT NULL, internal_notes TEXT, opened_at TEXT NOT NULL, closed_at TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE documents (
        id INTEGER PRIMARY KEY, document_number TEXT NOT NULL UNIQUE, type TEXT NOT NULL, status TEXT NOT NULL,
        customer_id INTEGER NOT NULL, ticket_id INTEGER, issued_at TEXT NOT NULL, subtotal INTEGER NOT NULL,
        tax_amount INTEGER NOT NULL, total INTEGER NOT NULL, notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE payments (
        id INTEGER PRIMARY KEY, customer_id INTEGER, document_id INTEGER NOT NULL, method TEXT NOT NULL, status TEXT NOT NULL,
        amount INTEGER NOT NULL, paid_at TEXT NOT NULL, notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE catalog_items (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, sku TEXT UNIQUE, type TEXT NOT NULL, category TEXT NOT NULL,
        brand TEXT, model TEXT, service_kind TEXT, keywords_json TEXT, mobilesentrix_json TEXT,
        default_price INTEGER NOT NULL, vat_rate REAL NOT NULL, is_active INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL, updated_at TEXT DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
      CREATE TABLE ticket_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT, ticket_id INTEGER NOT NULL, catalog_item_id INTEGER, label TEXT NOT NULL,
        quantity INTEGER NOT NULL, unit_price INTEGER NOT NULL, vat_rate REAL NOT NULL, line_total INTEGER NOT NULL, category_hint TEXT
      );
      CREATE INDEX documents_ticket_id_idx ON documents(ticket_id);
      CREATE INDEX payments_document_id_idx ON payments(document_id);
    `)
    await client.executeMultiple(readFileSync(new URL('../../drizzle/20260907224739_dossier_edit_sessions/migration.sql', import.meta.url), 'utf8'))
    queries = []
    db = drizzle({ client, relations: defineRelations(schema), logger: { logQuery: query => queries.push(query) } })
    context.db = db
    await db.insert(schema.customers).values([
      { id: 1, firstName: 'Ada', lastName: 'Lovelace', companyName: null, phone: '0790001234', email: 'ada@example.test' },
      { id: 2, firstName: 'Grace', lastName: 'Hopper', companyName: 'Ada atelier', phone: '0792223344', email: 'grace@example.test' },
      { id: 3, firstName: 'Ada', lastName: '', companyName: '', phone: '0791112233', email: 'ada-other@example.test' },
      { id: 4, firstName: 'Marc', lastName: 'Zada', companyName: 'TIC-Services', phone: '0796667788', email: 'marc@example.test' }
    ])
    await db.insert(schema.tickets).values(Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      ticketNumber: index === 0 ? 'TIC-12' : index === 1 ? 'DOS-120' : `DOS-${index + 1}`,
      customerId: (index % 4) + 1,
      type: 'repair' as const,
      status: index === 2 ? 'closed' as const : 'diagnosis' as const,
      brand: index % 2 ? 'Samsung' : 'Apple',
      model: index % 2 ? 'Galaxy' : 'iPhone SE',
      serialNumber: index === 0 ? 'EXACT-12' : `SERIAL-${index}`,
      imei: index === 0 ? '356789012345670' : null,
      issueDescription: index % 2 ? 'Batterie' : 'Écran cassé',
      openedAt: index < 2 ? timestamp : '2026-09-10T08:00:00.000Z'
    })))
    await db.insert(schema.documents).values(Array.from({ length: 20 }, (_, index) => ({
      id: index + 1,
      documentNumber: index === 0 ? 'FAC-12' : index === 1 ? 'FAC-120' : `FAC-${index + 200}`,
      customerId: (index % 4) + 1,
      ticketId: index < 12 ? index + 1 : null,
      type: index % 3 ? 'invoice' as const : 'customer_order' as const,
      status: index === 3 ? 'cancelled' as const : 'issued' as const,
      issuedAt: index < 2 ? timestamp : '2026-09-10T08:00:00.000Z',
      subtotal: 9251, taxAmount: 749, total: 10000
    })))
    await db.insert(schema.payments).values([
      { documentId: 1, customerId: 1, method: 'cash', status: 'paid', amount: 4000, paidAt: timestamp },
      { documentId: 2, customerId: 2, method: 'card_twint', status: 'paid', amount: 10000, paidAt: timestamp }
    ])
    await db.insert(schema.catalogItems).values(Array.from({ length: 36 }, (_, index) => ({
      id: index + 1,
      name: index < 2 ? 'Remplacement écran iPhone SE' : `Remplacement écran iPhone ${index}`,
      sku: `SERV-${index}-SCREEN`,
      type: index === 35 ? 'product' as const : 'repair' as const,
      category: 'Écrans',
      brand: 'Apple',
      model: index < 2 ? 'iPhone SE' : `iPhone ${index}`,
      serviceKind: 'Remplacement écran',
      keywordsJson: JSON.stringify(['ecran', 'screen']),
      mobileSentrixJson: index === 34 ? JSON.stringify({ status: 'matched', sku: '000123', productId: '10', url: 'https://www.mobilesentrix.eu/item', note: null }) : null,
      defaultPrice: 9900, vatRate: 8.1, isActive: index !== 0
    })))
    queries.length = 0
  })

  afterEach(() => {
    client.close()
    rmSync(directory, { recursive: true, force: true })
  })

  it.each(['ad', ' ADA ', 'example', '0790001234', 'TIC-', '%', '_', 'absent'])('keeps customer items and ranking for %s', async (search) => {
    const expected = await listCustomers({ search, pageSize: 2 })
    const suggestions = await suggestCustomers({ search, pageSize: 2 })
    expect(suggestions).toEqual({ items: expected.items })
    expect(expected.total).toBeGreaterThanOrEqual(suggestions.items.length)
  })

  it.each(['iPhone SE ecran', 'SE écran iPhone', 'ecran se', '000123', 'SERV-35-SCREEN', 'ip', '%', 'absent'])('keeps catalogue tokens, supplier references and ranking for %s', async (search) => {
    const filters = { search, activeOnly: true, pageSize: 25 }
    expect(await suggestCatalogItems(filters)).toEqual({ items: (await listCatalogItems(filters)).items })
  })

  it('preserves category/type filters and puts descriptive SE matches before SERV references', async () => {
    const result = await suggestCatalogItems({ search: 'SE écran iPhone', activeOnly: true, type: 'repair', category: 'Écrans', pageSize: 2 })
    expect(result.items.map(item => item.id)).toEqual([2, 11])
    expect(await suggestCatalogItems({ search: 'iphone', type: 'service' })).toEqual({ items: [] })
    expect(await suggestCatalogItems({ search: 'iphone', category: 'Batteries' })).toEqual({ items: [] })
  })

  it.each(['tic-12', 'DOS-12', '12', 'ada', 'TIC-', 'EXACT-12', '356789012345670', '0790001234', 'ip', '%', '_', 'absent'])('keeps dossier IDs, visible fields and ranking for %s', async (q) => {
    const expected = await listTickets({ q, pageSize: 3 })
    const suggestions = await suggestTickets({ q, pageSize: 3 })
    expect(suggestions.items).toEqual(expected.items.map(({ id, ticketNumber, type, status, brand, model, serialNumber, imei, customerName }) => ({
      id, ticketNumber, type, status, brand, model, serialNumber, imei, customerName
    })))
  })

  it.each(['tic-12', 'DOS-12', '12', 'FAC-12', 'ada', 'TIC-', 'fa', '%', '_', 'absent'])('keeps document IDs, visible fields and ranking for %s', async (q) => {
    const expected = await listDocuments({ q, pageSize: 3 })
    const suggestions = await suggestDocuments({ q, pageSize: 3 })
    expect(suggestions.items).toEqual(expected.items.map(({ id, documentNumber, total, customerName, ticketNumber }) => ({
      id, documentNumber, total, customerName, ticketNumber
    })))
  })

  it('resolves exact and legacy references before prefix matches', async () => {
    expect((await suggestTickets({ q: 'DOS-12', pageSize: 2 })).items.map(item => item.id)).toEqual([1, 12])
    expect((await suggestDocuments({ q: 'FAC-12', pageSize: 2 })).items.map(item => item.id)).toEqual([1, 2])
    expect((await suggestCustomers({ search: 'ada', pageSize: 2 })).items.map(item => item.id)).toEqual([3, 2])
  })

  it('executes exactly four bounded SELECTs without counts, payment access or settlement for global suggestions', async () => {
    await Promise.all([
      suggestCustomers({ search: 'ad', pageSize: 5 }),
      suggestTickets({ q: 'ad', pageSize: 5 }),
      suggestDocuments({ q: 'ad', pageSize: 5 }),
      suggestCatalogItems({ search: 'ip', activeOnly: true, pageSize: 5 })
    ])
    expect(queries).toHaveLength(4)
    for (const query of queries) {
      expect(query).toMatch(/^select /i)
      expect(query).toMatch(/ limit \?/i)
      expect(query).not.toMatch(/\b(count|sum)\s*\(|"payments"|settlement_|\bgroup by\b/i)
    }
  })

  it('does not rewrite identical ticket lines when changing only the header', async () => {
    const line = { catalogItemId: null, label: 'Rabais', quantity: 1, unitPrice: -500, vatRate: 8.1, lineTotal: -500, categoryHint: 'repair' as const }
    await db.insert(schema.ticketLines).values({ id: 42, ticketId: 1, ...line })
    const dossier = await testDossierContext(db, { kind: 'ticket', id: 1 })
    const [current] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, 1))
    queries.length = 0
    await updateTicket(1, { ...mapTicket(current!), internalNotes: 'Nouvelle note', lines: [line] }, dossier)
    expect(queries.filter(query => /^(delete from|insert into) "ticket_lines"/i.test(query))).toEqual([])
    expect(await db.select().from(schema.ticketLines).where(eq(schema.ticketLines.ticketId, 1))).toEqual([{ id: 42, ticketId: 1, ...line }])
  })

  it('still replaces changed lines, preserving negative adjustments and positive quantities', async () => {
    await db.insert(schema.ticketLines).values({ id: 42, ticketId: 1, catalogItemId: null, label: 'Ancienne ligne', quantity: 1, unitPrice: 1000, vatRate: 8.1, lineTotal: 1000, categoryHint: null })
    const dossier = await testDossierContext(db, { kind: 'ticket', id: 1 })
    const [current] = await db.select().from(schema.tickets).where(eq(schema.tickets.id, 1))
    await updateTicket(1, { ...mapTicket(current!), lines: [
      { label: 'Écran', quantity: 2, unitPrice: 5000, vatRate: 8.1 },
      { label: 'Rabais', quantity: 1, unitPrice: -500, vatRate: 8.1 }
    ] }, dossier)
    const lines = await db.select().from(schema.ticketLines).where(eq(schema.ticketLines.ticketId, 1)).orderBy(schema.ticketLines.id)
    expect(lines).toMatchObject([
      { label: 'Écran', quantity: 2, unitPrice: 5000, lineTotal: 10000, vatRate: 8.1 },
      { label: 'Rabais', quantity: 1, unitPrice: -500, lineTotal: -500, vatRate: 8.1 }
    ])
  })
})
