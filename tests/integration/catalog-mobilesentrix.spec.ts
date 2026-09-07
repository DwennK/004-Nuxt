import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient } from '@libsql/client'
import { defineRelations } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createCatalogItem, getCatalogItemById, listCatalogItems, updateCatalogItem } from '../../server/utils/pos/catalog'
import { catalogItemInputSchema } from '../../shared/validation/pos'
import { applyReport, fingerprint } from '../../scripts/mobilesentrix/catalog.mjs'
import type { CatalogItemInput } from '../../shared/types/pos'

const context = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../server/utils/turso', () => ({ useDb: () => context.db }))
vi.mock('../../server/utils/pos/schema', () => ({ ensurePosSchema: async () => {} }))

const reference = { status: 'matched' as const, sku: '000123', productId: '10', url: 'https://www.mobilesentrix.eu/battery', note: null }
const input: CatalogItemInput = { name: 'Batterie iPhone 13', sku: 'SERV-13-BATTERY', type: 'repair', category: 'iPhone', brand: 'Apple', model: 'iPhone 13', serviceKind: 'Remplacement batterie', keywords: [], defaultPrice: 9900, vatRate: 8.1, isActive: true }

describe('catalogue supplier references and additive migration', () => {
  let client: ReturnType<typeof createClient>
  let directory: string
  beforeEach(async () => {
    directory = mkdtempSync(join(tmpdir(), 'pos-ms-'))
    client = createClient({ url: `file:${join(directory, 'catalog.db')}` })
    await client.execute(`CREATE TABLE catalog_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sku TEXT UNIQUE,
      type TEXT NOT NULL, category TEXT NOT NULL, brand TEXT, model TEXT, service_kind TEXT,
      keywords_json TEXT, default_price INTEGER NOT NULL, vat_rate REAL NOT NULL,
      is_active INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`)
    await client.execute(readFileSync(new URL('../../drizzle/20260907145502_catalog_mobilesentrix_europe/migration.sql', import.meta.url), 'utf8'))
    context.db = drizzle({ client, relations: defineRelations(schema) })
  })
  afterEach(() => {
    client.close()
    rmSync(directory, { recursive: true, force: true })
  })

  it('keeps internal SKUs, permits shared supplier SKUs and searches them', async () => {
    const first = await createCatalogItem({ ...input, mobileSentrix: reference })
    await createCatalogItem({ ...input, sku: 'SERV-OTHER', mobileSentrix: reference })
    expect(first).toMatchObject({ sku: input.sku, defaultPrice: 9900, mobileSentrix: { sku: '000123', source: 'manual' } })
    expect((await listCatalogItems({ search: '000123' })).total).toBe(2)
  })

  it('preserves omitted associations on legacy writes and keeps manual removal', async () => {
    const first = await createCatalogItem({ ...input, mobileSentrix: reference })
    const legacy = catalogItemInputSchema.parse(input)
    expect(legacy).not.toHaveProperty('mobileSentrix')
    await updateCatalogItem(first.id, { ...legacy, name: 'Nouveau libellé' })
    expect((await getCatalogItemById(first.id)).mobileSentrix?.sku).toBe('000123')
    await updateCatalogItem(first.id, { ...input, mobileSentrix: null })
    expect((await getCatalogItemById(first.id)).mobileSentrix).toMatchObject({ status: 'unlinked', source: 'manual', sku: null })
  })

  it('does not accept a forged API provenance from the form', async () => {
    const first = await createCatalogItem({ ...input, mobileSentrix: { ...reference, source: 'api', verifiedAt: new Date().toISOString() } })
    expect(first.mobileSentrix).toMatchObject({ source: 'manual', verifiedAt: null })
  })

  it('rejects foreign or unsafe links and ambiguous states containing a SKU', () => {
    for (const url of ['h', 'not-a-url', 'https://evil.test/part', 'https://www.mobilesentrix.eu.evil.test/part', 'https://user@www.mobilesentrix.eu/part', 'javascript:alert(1)']) {
      expect(catalogItemInputSchema.safeParse({ ...input, mobileSentrix: { ...reference, url } }).success).toBe(false)
    }
    expect(catalogItemInputSchema.safeParse({ ...input, mobileSentrix: { ...reference, status: 'variant_required' } }).success).toBe(false)
  })

  async function makeReport() {
    const first = await createCatalogItem(input)
    const row = (await client.execute('SELECT * FROM catalog_items')).rows[0]!
    return {
      version: 1, rulesVersion: 3, origin: 'https://www.mobilesentrix.com', generatedAt: '2026-09-07T12:00:00.000Z',
      entries: [{ id: first.id, beforeHash: fingerprint(row), status: 'matched', reference: { sku: '000123', productId: '10', url: reference.url }, note: 'Confirmé Europe' }]
    }
  }

  it('applies only association fields and is idempotent', async () => {
    const report = await makeReport()
    expect(await applyReport(client, report, report)).toEqual({ changed: 1, unchanged: 0 })
    expect(await applyReport(client, report, report)).toEqual({ changed: 0, unchanged: 1 })
    const refreshed = { ...report, generatedAt: '2026-09-08T12:00:00.000Z' }
    expect(await applyReport(client, refreshed, refreshed)).toEqual({ changed: 0, unchanged: 1 })
    expect(await getCatalogItemById(report.entries[0]!.id)).toMatchObject({ sku: input.sku, defaultPrice: 9900, vatRate: 8.1, mobileSentrix: { source: 'api', sku: '000123' } })
  })

  it('refuses concurrent changes and fresh API failures', async () => {
    const report = await makeReport()
    await expect(applyReport(client, report, { entries: [{ ...report.entries[0], status: 'blocked' }] })).rejects.toThrow('non confirmée')
    await updateCatalogItem(report.entries[0]!.id, { ...input, name: 'Modification parallèle' })
    await expect(applyReport(client, report, report)).rejects.toThrow('modifiée depuis')
    expect((await getCatalogItemById(report.entries[0]!.id)).mobileSentrix).toBeNull()
  })

  it('rolls back earlier rows if a later row conflicts', async () => {
    const report = await makeReport()
    const second = await createCatalogItem({ ...input, sku: 'SERV-SECOND' })
    const row = (await client.execute({ sql: 'SELECT * FROM catalog_items WHERE id = ?', args: [second.id] })).rows[0]!
    report.entries.push({ ...report.entries[0]!, id: second.id, beforeHash: fingerprint(row) })
    await updateCatalogItem(second.id, { ...input, sku: 'SERV-SECOND', mobileSentrix: null })
    await expect(applyReport(client, report, report)).rejects.toThrow('modifiée depuis')
    expect((await getCatalogItemById(report.entries[0]!.id)).mobileSentrix).toBeNull()
    expect((await getCatalogItemById(second.id)).mobileSentrix?.source).toBe('manual')
  })
})
