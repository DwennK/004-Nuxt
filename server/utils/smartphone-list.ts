import { createTable, getCoreRowModel, getFilteredRowModel, getSortedRowModel } from '@tanstack/table-core'
import { z } from 'zod'
import { foldSearchText } from '~~/shared/utils/search'
import type { SmartphoneListQuery } from '~~/shared/types/smartphone-list'

export const smartphoneListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(10),
  search: z.string().default(''),
  sort: z.enum(['default', 'asc', 'desc']).default('default'),
  includeTotal: z.enum(['true', 'false']).default('true').transform(value => value === 'true'),
  selectedIds: z.string().regex(/^(?:\d+(?:,\d+)*)?$/).default('')
    .transform(value => [...new Set(value.split(',').filter(Boolean).map(Number))])
    .pipe(z.array(z.number().int().positive().safe()))
})

export function smartphoneListPage(total: number, query: SmartphoneListQuery) {
  return Math.min(query.page, Math.max(1, Math.ceil(total / query.pageSize)))
}

/**
 * Use accent-insensitive substring search and preserve the table's natural
 * sorting. SQLite LOWER/NOCASE does not provide equivalent Unicode semantics.
 * Only IDs and the searched/sorted label are read for this optional path; the
 * default list uses indexed SQL pagination without loading these candidates.
 */
export function filterAndSortSmartphoneCandidates<T extends { id: number, label: string }>(
  candidates: T[], query: SmartphoneListQuery
): T[] {
  const table = createTable({
    data: candidates,
    columns: [{
      accessorKey: 'label',
      filterFn: (row, columnId, value: string) => foldSearchText(row.getValue<string>(columnId)).includes(foldSearchText(value))
    }],
    state: {
      columnFilters: query.search ? [{ id: 'label', value: query.search }] : [],
      sorting: query.sort === 'default' ? [] : [{ id: 'label', desc: query.sort === 'desc' }]
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    onStateChange: () => {},
    renderFallbackValue: null
  })

  return table.getRowModel().rows.map(row => row.original)
}
