import { createClient } from '@libsql/client'
import { defineRelations } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createCatalogItem, deleteCatalogItem, getCatalogSummary, getCatalogItemById, suggestCatalogItems, listCatalogItems, updateCatalogItem } from '../../server/utils/pos/catalog'
import type { CatalogItemInput, CatalogItemType } from '../../shared/types/pos'

const context = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../server/utils/turso', () => ({ useDb: () => context.db }))
vi.mock('../../server/utils/pos/schema', () => ({ ensurePosSchema: async () => {} }))

const base: CatalogItemInput = {
  name: 'Cable USB', sku: 'USB-1', type: 'product', category: 'Accessoires',
  brand: null, model: null, serviceKind: null, keywords: [], defaultPrice: 2000, vatRate: 8.1, isActive: true
}
const repair: CatalogItemInput = { ...base, name: 'Remplacement ecran iPhone', sku: 'REP-1', type: 'repair', category: 'iPhone', brand: 'Apple', model: 'iPhone' }

describe('catalog summary preserves each tab total without loading its rows', () => {
  let client: ReturnType<typeof createClient>
  let queries: string[]
  let repairId: number

  beforeEach(async () => {
    client = createClient({ url: 'file::memory:' })
    await client.execute(`CREATE TABLE catalog_items (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, sku TEXT UNIQUE, type TEXT NOT NULL, category TEXT NOT NULL,
      brand TEXT, model TEXT, service_kind TEXT, keywords_json TEXT, mobilesentrix_json TEXT,
      default_price INTEGER NOT NULL, vat_rate REAL NOT NULL, is_active INTEGER NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    )`)
    queries = []
    context.db = drizzle({ client, relations: defineRelations(schema), logger: { logQuery: query => queries.push(query) } })
    await createCatalogItem(base)
    repairId = (await createCatalogItem(repair)).id
    await createCatalogItem({ ...base, name: 'Diagnostic', sku: 'DIAG-1', type: 'service', category: 'Diagnostic' })
    queries.splice(0)
  })

  afterEach(() => client.close())

  it('returns all three nonzero counts using one grouped query', async () => {
    expect(await getCatalogSummary()).toEqual({ product: 1, repair: 1, service: 1 })
    expect(queries).toHaveLength(1)
    expect(queries[0]).toContain('group by "catalog_items"."type"')
    expect(queries[0]).not.toContain('order by')
  })

  it('uses the same independent search, category and active filters as each tab', async () => {
    await createCatalogItem({ ...base, name: 'Cable reserve', sku: 'USB-2', isActive: false })
    await createCatalogItem({
      ...base, name: 'Transfert de donnees', sku: 'DATA-1', type: 'service', category: 'Autre', isActive: false,
      mobileSentrix: { status: 'matched', sku: '000123', productId: null, url: null, note: null }
    })
    const filters = {
      product: { search: 'cable', category: 'Accessoires', activeOnly: true },
      repair: { search: 'ECRAN iPHONE', category: 'iPhone' },
      service: { search: '000123', category: 'Autre', activeOnly: false }
    }
    const summary = await getCatalogSummary(filters)
    expect(summary).toEqual({ product: 1, repair: 1, service: 1 })
    for (const type of ['product', 'repair', 'service'] as CatalogItemType[]) {
      expect(summary[type]).toBe((await listCatalogItems({ ...filters[type], type, pageSize: 1 })).total)
    }
    expect(await getCatalogSummary({ ...filters, repair: { search: 'absent' } })).toEqual({ product: 1, repair: 0, service: 1 })
  })

  it('groups legacy product categories consistently in reads, filters, search and counts', async () => {
    for (const [index, category] of ['Audio', 'Charge', 'Protection'].entries()) {
      const item = await createCatalogItem({ ...base, sku: `LEGACY-${index}`, name: `Legacy ${index}` })
      // Simulate persisted records from before categories became fixed.
      await client.execute({ sql: 'UPDATE catalog_items SET category = ? WHERE id = ?', args: [category, item.id] })
      expect((await getCatalogItemById(item.id)).category).toBe('Accessoires')
    }
    const filter = { type: 'product' as const, category: 'Accessoires' }
    const list = await listCatalogItems({ ...filter, pageSize: 2 })
    expect(list.total).toBe(4)
    expect(list.items.every(item => item.category === 'Accessoires')).toBe(true)
    expect((await listCatalogItems({ ...filter, page: 2, pageSize: 2 })).items).toHaveLength(2)
    expect((await suggestCatalogItems(filter)).items).toHaveLength(4)
    expect((await listCatalogItems({ search: 'accessoires' })).total).toBe(4)
    expect(await getCatalogSummary({ product: filter })).toEqual({ product: 4, repair: 1, service: 1 })
    await client.execute({ sql: 'UPDATE catalog_items SET category = ? WHERE id = ?', args: ['Audio', repairId] })
    expect((await getCatalogItemById(repairId)).category).toBe('Audio')
    expect((await listCatalogItems({ category: 'Accessoires' })).total).toBe(4)
  })

  it('reflects moved and deleted items in both affected type counts', async () => {
    await updateCatalogItem(repairId, { ...repair, type: 'product' })
    expect(await getCatalogSummary()).toEqual({ product: 2, repair: 0, service: 1 })
    await deleteCatalogItem(repairId)
    expect(await getCatalogSummary()).toEqual({ product: 1, repair: 0, service: 1 })
  })
})
