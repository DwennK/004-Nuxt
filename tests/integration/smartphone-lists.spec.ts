import { createClient } from '@libsql/client'
import { createTable, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel } from '@tanstack/table-core'
import type { ColumnDef } from '@tanstack/table-core'
import { defineRelations } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import { listSmartphoneStocks, listSmartphoneStocksPage } from '../../server/utils/smartphone-stocks'
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
    context.queries = []
    context.db = drizzle({
      client,
      relations: defineRelations(schema),
      logger: { logQuery: query => context.queries.push(query) }
    })
  })

  afterEach(() => client.close())

  it('keeps stock status, literal substring, Unicode and natural sorting identical across pages', async () => {
    const all = await listSmartphoneStocks()
    for (const sold of ['all', 'available', 'sold'] as const) {
      for (const search of ['', 'IPHONE', 'Él', '%_', '  ', 'Item']) {
        for (const sort of ['default', 'asc', 'desc'] as const) {
          const query = stockQuery({ sold, search, sort, pageSize: 3 })
          const first = previousTableResult(all, 'model', 'sold', sold === 'all' ? undefined : sold === 'sold', query)
          for (let page = 1; page <= Math.max(1, Math.ceil(first.total / query.pageSize)); page++) {
            const expected = previousTableResult(all, 'model', 'sold', sold === 'all' ? undefined : sold === 'sold', { ...query, page })
            const actual = await listSmartphoneStocksPage({ ...query, page })
            expect({ items: actual.items, total: actual.total }).toEqual(expected)
          }
        }
      }
    }
  })

  it('keeps reservation statuses, date order, stable ties and sorted pages identical', async () => {
    const all = await listSmartphoneReservations()
    for (const status of ['pending', 'contacted', 'sold', 'all'] as const) {
      for (const search of ['', 'iPhone', 'é', '%_', 'Item']) {
        for (const sort of ['default', 'asc', 'desc'] as const) {
          const query = reservationQuery({ status, search, sort, pageSize: 3 })
          const expected = previousTableResult(all, 'name', 'status', status === 'all' ? undefined : status, query)
          const actual = await listSmartphoneReservationsPage(query)
          expect({ items: actual.items, total: actual.total }).toEqual(expected)
        }
      }
    }
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
