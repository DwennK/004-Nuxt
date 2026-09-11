import type { SortingState } from '@tanstack/table-core'
import type { SmartphoneListResponse } from '~~/shared/types/smartphone-list'

export function useSmartphoneList<T extends { id: number }>(options: {
  key: string
  endpoint: string
  filters: Ref<Record<string, string>>
  matches: (item: T) => boolean
}) {
  // Capture Nuxt's request-scoped fetch in setup so SSR forwards the incoming
  // session to these authenticated API routes, just as useFetch does.
  const requestFetch = useRequestFetch()
  const pagination = ref({ pageIndex: 0, pageSize: 10 })
  const sorting = ref<SortingState>([])
  const rowSelection = ref<Record<string, boolean>>({})
  const selectedRecords = shallowRef<Record<number, T>>({})
  const total = ref(0)
  let lastQuery = ''
  let lastFilters = ''

  watch([options.filters, sorting], () => {
    pagination.value.pageIndex = 0
  }, { flush: 'sync' })

  const query = computed(() => ({
    ...options.filters.value,
    page: pagination.value.pageIndex + 1,
    pageSize: pagination.value.pageSize,
    sort: sorting.value.length ? sorting.value[0]!.desc ? 'desc' : 'asc' : 'default'
  }))

  const result = useAsyncData(options.key, async (_nuxtApp, { signal }) => {
    const nextQuery = JSON.stringify(query.value)
    const nextFilters = JSON.stringify(options.filters.value)
    const requestedIds = Object.keys(rowSelection.value).filter(id => rowSelection.value[id]).map(Number)
    // Paging/sorting the same result does not need to recount it. An explicit
    // refresh after a mutation does, as does every change of filters.
    const includeTotal = !lastQuery || lastFilters !== nextFilters || lastQuery === nextQuery
    const response = await requestFetch<SmartphoneListResponse<T>>(options.endpoint, {
      query: { ...query.value, includeTotal, selectedIds: requestedIds.join(',') },
      signal
    })
    lastQuery = nextQuery
    lastFilters = nextFilters

    const refreshed = new Map(response.selectedItems.map(item => [item.id, item]))
    const missing = new Set(requestedIds.filter(id => !refreshed.has(id)))
    rowSelection.value = Object.fromEntries(Object.entries(rowSelection.value)
      .filter(([id]) => !missing.has(Number(id))))
    const records = { ...selectedRecords.value }
    for (const item of response.selectedItems) records[item.id] = item
    selectedRecords.value = Object.fromEntries(Object.entries(records)
      .filter(([id]) => rowSelection.value[id]))

    return response
  }, { lazy: true, watch: [query], deep: false })

  watch(result.data, (response) => {
    if (response?.total !== undefined) total.value = response.total
    if (response && lastQuery && response.page !== pagination.value.pageIndex + 1) {
      pagination.value.pageIndex = response.page - 1
    }
  }, { immediate: true, flush: 'sync' })

  watch([rowSelection, result.data], () => {
    const records = { ...selectedRecords.value }
    for (const item of result.data.value?.items || []) {
      if (rowSelection.value[String(item.id)]) records[item.id] = item
    }
    selectedRecords.value = Object.fromEntries(Object.entries(records)
      .filter(([id]) => rowSelection.value[id]))
  }, { deep: true, flush: 'sync' })

  const selectedIds = computed(() => Object.values(selectedRecords.value)
    .filter(options.matches).map(item => item.id))

  return { ...result, pagination, sorting, rowSelection, selectedIds, total }
}
