import { readFileSync } from 'node:fs'
import { smartphoneStockSchema, updateSmartphoneStockSchema } from '../../shared/validation/smartphones'
import { createClient } from '@libsql/client'
import { createTable, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel } from '@tanstack/table-core'
import type { ColumnDef } from '@tanstack/table-core'
import { defineRelations } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { createSmartphoneStock, updateSmartphoneStock, listSmartphoneStocks, listSmartphoneStocksPage } from '../../server/utils/smartphone-stocks'
import { listSmartphoneReservations, listSmartphoneReservationsPage } from '../../server/utils/smartphone-reservations'
import { smartphoneListQuerySchema } from '../../server/utils/smartphone-list'
import { buildSmartphoneReservationsCsv, parseSmartphoneReservationsCsv } from '../../server/utils/smartphone-reservations-csv'
import type { SmartphoneListQuery, SmartphoneReservationListQuery, SmartphoneStockListQuery } from '../../shared/types/smartphone-list'

const context = vi.hoisted(() => ({ db: null as unknown, queries: [] as string[] }))
vi.mock('../../server/utils/turso', () => ({ useDb: () => context.db }))

function stockQuery(overrides: Partial<SmartphoneStockListQuery> = {}): SmartphoneStockListQuery {
  return { page: 1, pageSize: 10, search: '', sort: 'default', includeTotal: true, selectedIds: [], sold: 'all', ...overrides }
}

function reservationQuery(overrides: Partial<SmartphoneReservationListQuery> = {}): SmartphoneReservationListQuery {
  return { ...stockQuery(), status: 'pending', ...overrides }
}

function previousTableResult<T extends { id: number }>(
  data: T[], field: string, stateField: string, stateValue: unknown, query: SmartphoneListQuery
) {
  const table = createTable({
    data,
    columns: [{ accessorKey: field }, { accessorKey: stateField, filterFn: 'equals' }] as ColumnDef<T>[],
    state: {
      columnFilters: [
        ...(query.search ? [{ id: field, value: query.search }] : []),
        ...(stateValue === undefined ? [] : [{ id: stateField, value: stateValue }])
      ],
      sorting: query.sort === 'default' ? [] : [{ id: field, desc: query.sort === 'desc' }],
      pagination: { pageIndex: query.page - 1, pageSize: query.pageSize }
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onStateChange: () => {},
    renderFallbackValue: null
  })
  return { items: table.getRowModel().rows.map(row => row.original), total: table.getFilteredRowModel().rows.length }
}

describe('smartphone lists use server pages without changing table results', () => {
  let client: ReturnType<typeof createClient>

  beforeEach(async () => {
    client = createClient({ url: 'file::memory:' })
    vi.stubGlobal('useRuntimeConfig', () => ({ posAllowRuntimeSchemaBootstrap: false }))
    await client.batch([
      `CREATE TABLE smartphone_stocks (
        id INTEGER PRIMARY KEY, model TEXT NOT NULL, imei TEXT, sku TEXT,
        capacity TEXT NOT NULL, stocked_at TEXT NOT NULL, sold INTEGER NOT NULL
      )`,
      `CREATE INDEX smartphone_stocks_sold_id_idx ON smartphone_stocks(sold, id)`,
      `CREATE TABLE smartphone_reservation_requests (
        id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL, model TEXT NOT NULL,
        storage TEXT NOT NULL, requested_at TEXT NOT NULL, status TEXT NOT NULL, notes TEXT
      )`,
      `CREATE INDEX smartphone_reservation_requests_status_requested_at_id_idx
        ON smartphone_reservation_requests(status, requested_at, id)`,
      `CREATE INDEX smartphone_reservation_requests_requested_at_id_idx
        ON smartphone_reservation_requests(requested_at, id)`
    ], 'write')
    const labels = ['iPhone 2', 'iPhone 10', 'IPHONE 1', 'Élodie', 'éLODIE', '  Text  ', '100%_literal', 'Item 001', 'Item 1', 'Samsung A54', 'Galaxy S9', 'Galaxy S23']
    await client.batch(Array.from({ length: 72 }, (_, index) => {
      const id = index + 1
      const label = labels[index % labels.length]!
      return [{
        sql: 'INSERT INTO smartphone_stocks VALUES (?, ?, ?, ?, ?, ?, ?)',
        args: [id, label, index % 3 ? String(356789012345670 + id) : null, index % 4 ? `SKU-${id}` : null, '128 Go', '2026-09-01', index % 2]
      }, {
        sql: 'INSERT INTO smartphone_reservation_requests VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        args: [id, label, '0791234567', `Model ${id}`, '128 Go', `2026-09-${String(1 + index % 20).padStart(2, '0')}`, ['pending', 'contacted', 'sold'][index % 3]!, index % 4 ? `Note ${id}` : null]
      }]
    }).flat(), 'write')
    await client.executeMultiple(readFileSync(new URL('../../drizzle/20260924150245_smartphone_stock_supplier/migration.sql', import.meta.url), 'utf8'))
    context.queries = []
    context.db = drizzle({
      client,
      relations: defineRelations(schema),
      logger: { logQuery: query => context.queries.push(query) }
    })
  })

  afterEach(() => client.close())

  it('adds the supplier without changing legacy records, then persists creation and editing', async () => {
    const legacy = (await listSmartphoneStocks())[0]!
    expect(legacy).toMatchObject({ supplier: '', sku: '', sold: false })
    for (const supplier of ['MobileSentrix', 'Recommerce'] as const) {
      const created = await createSmartphoneStock(smartphoneStockSchema.parse({
        model: 'iPhone 15', imei: '', capacity: '128 Go', supplier, stockedAt: '2026-09-24'
      }))
      expect(created).toMatchObject({ supplier, sku: '', sold: false })
      expect((await listSmartphoneStocks()).find(item => item.id === created.id)?.supplier).toBe(supplier)
    }

    const existing = (await listSmartphoneStocks()).find(item => item.sku && item.sold)!
    const edited = await updateSmartphoneStock(updateSmartphoneStockSchema.parse({
      id: existing.id, model: 'iPhone 16', imei: '356 789 012 345 679',
      capacity: '256 Go', supplier: 'Recommerce', stockedAt: '2026-09-24'
    }))
    expect(edited).toMatchObject({
      model: 'iPhone 16', imei: '356789012345679', supplier: 'Recommerce',
      sku: existing.sku, sold: existing.sold
    })
    const editedAgain = await updateSmartphoneStock(updateSmartphoneStockSchema.parse({
      id: edited.id, model: edited.model, imei: edited.imei, capacity: edited.capacity, stockedAt: edited.stockedAt
    }))
    expect(editedAgain).toEqual(edited)
    expect(smartphoneStockSchema.safeParse({ ...edited, supplier: 'Unknown' }).success).toBe(false)
  })

  it('keeps stock status, literal substring, Unicode and natural sorting identical across pages', async () => {
    const all = await listSmartphoneStocks()
    for (const sold of ['all', 'available', 'sold'] as const) {
      for (const search of ['', 'IPHONE', 'Él', '%_', '  ', 'Item']) {
        for (const sort of ['default', 'asc', 'desc'] as const) {
          const query = stockQuery({ sold, search, sort, pageSize: 3 })
          const ordered = sort === 'default'
            ? [...all].sort((a, b) => b.stockedAt.localeCompare(a.stockedAt) || b.id - a.id)
            : all
          const first = previousTableResult(ordered, 'model', 'sold', sold === 'all' ? undefined : sold === 'sold', query)
          for (let page = 1; page <= Math.max(1, Math.ceil(first.total / query.pageSize)); page++) {
            const expected = previousTableResult(ordered, 'model', 'sold', sold === 'all' ? undefined : sold === 'sold', { ...query, page })
            const actual = await listSmartphoneStocksPage({ ...query, page })
            expect({ items: actual.items, total: actual.total }).toEqual(expected)
          }
        }
      }
    }
  })

  it('shows newest stock entries first across pages and searches, breaking date ties by newest ID', async () => {
    await client.execute('DELETE FROM smartphone_stocks')
    await client.batch([
      { sql: 'INSERT INTO smartphone_stocks (id, model, capacity, stocked_at, sold) VALUES (?, ?, ?, ?, ?)', args: [1, 'iPhone 13', '128 Go', '2026-09-25', 0] },
      { sql: 'INSERT INTO smartphone_stocks (id, model, capacity, stocked_at, sold) VALUES (?, ?, ?, ?, ?)', args: [2, 'iPhone 13', '256 Go', '2026-09-23', 0] },
      { sql: 'INSERT INTO smartphone_stocks (id, model, capacity, stocked_at, sold) VALUES (?, ?, ?, ?, ?)', args: [3, 'iPhone 13', '512 Go', '2026-09-25', 0] },
      { sql: 'INSERT INTO smartphone_stocks (id, model, capacity, stocked_at, sold) VALUES (?, ?, ?, ?, ?)', args: [4, 'iPhone 13', '128 Go', '2026-09-24', 0] }
    ], 'write')

    for (const search of ['', 'iPhone']) {
      const first = await listSmartphoneStocksPage(stockQuery({ search, pageSize: 2 }))
      const second = await listSmartphoneStocksPage(stockQuery({ search, pageSize: 2, page: 2, includeTotal: false }))
      expect(first.items.map(item => item.id)).toEqual([3, 1])
      expect(second.items.map(item => item.id)).toEqual([4, 2])
      expect(first.total).toBe(4)
    }
  })

  it('keeps reservation statuses, date order, stable ties and sorted pages identical', async () => {
    const all = await listSmartphoneReservations()
    for (const status of ['pending', 'contacted', 'sold', 'all'] as const) {
      for (const search of ['', 'iPhone', '%_', 'Item']) {
        for (const sort of ['default', 'asc', 'desc'] as const) {
          const query = reservationQuery({ status, search, sort, pageSize: 3 })
          const expected = previousTableResult(all, 'name', 'status', status === 'all' ? undefined : status, query)
          const actual = await listSmartphoneReservationsPage(query)
          expect({ items: actual.items, total: actual.total }).toEqual(expected)
        }
      }
    }
  })

  it.each(['Elodie', 'ÉLODIE', 'élodie', 'E\u0301lodie'])('matches accented labels in both smartphone lists for %s', async (search) => {
    const stocks = await listSmartphoneStocksPage(stockQuery({ search, pageSize: 100 }))
    const reservations = await listSmartphoneReservationsPage(reservationQuery({ search, status: 'all', pageSize: 100 }))
    expect(stocks.total).toBe(12)
    expect(reservations.total).toBe(12)
    expect(stocks.items.map(item => item.id).sort()).toEqual(reservations.items.map(item => item.id).sort())
  })

  it('finds an unaccented reservation when the query contains accents', async () => {
    await client.execute('UPDATE smartphone_reservation_requests SET name = ? WHERE id = 1', ['Theodore'])
    const result = await listSmartphoneReservationsPage(reservationQuery({ search: 'Théodore', status: 'all' }))
    expect(result.items.map(item => item.id)).toEqual([1])
    expect(result.total).toBe(1)
  })

  it('fetches only the next page and skips recounting unchanged filters', async () => {
    const stocks = await listSmartphoneStocksPage(stockQuery({ sold: 'available', page: 2, includeTotal: false }))
    expect(stocks.items).toHaveLength(10)
    expect(stocks.total).toBeUndefined()
    expect(context.queries).toHaveLength(1)
    expect(context.queries[0]).toMatch(/where .*sold.*order by .*id.*limit \? offset \?/)
    context.queries = []
    const reservations = await listSmartphoneReservationsPage(reservationQuery({ page: 2, includeTotal: false }))
    expect(reservations.items).toHaveLength(10)
    expect(reservations.total).toBeUndefined()
    expect(context.queries).toHaveLength(1)
    expect(context.queries[0]).toMatch(/where .*status.*order by .*requested_at.*id.*limit \? offset \?/)
  })

  it('refreshes selected records from other pages and filters using their stable IDs', async () => {
    await client.execute('UPDATE smartphone_stocks SET sold = 1, model = ? WHERE id = 1', ['Updated'])
    await client.execute('DELETE FROM smartphone_stocks WHERE id = 2')
    const result = await listSmartphoneStocksPage(stockQuery({ sold: 'available', selectedIds: [1, 2, 71] }))
    expect(result.items.some(item => item.id === 1)).toBe(false)
    expect(result.selectedItems.map(item => item.id)).toEqual([1, 71])
    expect(result.selectedItems[0]).toMatchObject({ id: 1, model: 'Updated', sold: true })
    const reservations = await listSmartphoneReservationsPage(reservationQuery({ selectedIds: [1, 2, 72, 999] }))
    expect(reservations.selectedItems.map(item => item.id)).toEqual([1, 2, 72])
  })

  it('clamps the last page after deletion and keeps legacy lists and CSV export complete', async () => {
    const page = await listSmartphoneReservationsPage(reservationQuery({ page: 99 }))
    expect(page.page).toBe(3)
    expect(page.total).toBe(24)
    expect(page.items).toHaveLength(4)
    const all = await listSmartphoneReservations()
    expect(all).toHaveLength(72)
    const csv = buildSmartphoneReservationsCsv(all)
    expect(parseSmartphoneReservationsCsv(csv)).toHaveLength(72)
    expect(await listSmartphoneStocks()).toHaveLength(72)
  })

  it('validates bounded page sizes and safe selected IDs without altering literal search', () => {
    expect(smartphoneListQuerySchema.parse({ search: ' %_ ', selectedIds: '1,2,1' })).toMatchObject({ search: ' %_ ', selectedIds: [1, 2] })
    for (const input of [{ page: 0 }, { pageSize: 101 }, { selectedIds: '1 OR 1=1' }, { selectedIds: '9007199254740993' }]) {
      expect(smartphoneListQuerySchema.safeParse(input).success).toBe(false)
    }
  })
})
