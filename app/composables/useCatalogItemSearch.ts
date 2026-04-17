import type { CatalogItemListResponse, CatalogItemRecord } from '~~/shared/types/pos'

type UseCatalogItemSearchOptions = {
  minSearchLength?: number
  pageSize?: number
  filterItem?: (item: CatalogItemRecord) => boolean
}

export function useCatalogItemSearch(options: UseCatalogItemSearchOptions = {}) {
  const search = ref('')
  const debouncedSearch = refDebounced(search, 200)
  const searchOpen = ref(false)
  const highlightedItemIndex = ref(0)
  const remoteItems = ref<CatalogItemRecord[]>([])
  const remoteSearchPending = ref(false)
  const minSearchLength = options.minSearchLength ?? 2
  const pageSize = options.pageSize ?? 25
  const filterItem = options.filterItem ?? (() => true)
  let remoteSearchRequestId = 0
  let searchCloseTimeout: ReturnType<typeof setTimeout> | null = null

  const searchPanelItems = computed(() => {
    return search.value.trim().length >= minSearchLength ? remoteItems.value : []
  })

  const shouldShowSearchPanel = computed(() => {
    return searchOpen.value && search.value.trim().length > 0
  })

  watch(searchPanelItems, (items) => {
    if (!items.length) {
      highlightedItemIndex.value = 0
      return
    }

    if (highlightedItemIndex.value >= items.length) {
      highlightedItemIndex.value = 0
    }
  })

  watch(search, (value) => {
    highlightedItemIndex.value = 0

    if (value.trim()) {
      openSearchPanel()
      return
    }

    cancelSearchClose()
  })

  watch(debouncedSearch, async (value) => {
    const query = value.trim()

    if (query.length < minSearchLength) {
      remoteItems.value = []
      remoteSearchPending.value = false
      return
    }

    const requestId = ++remoteSearchRequestId
    remoteSearchPending.value = true

    try {
      const items = await searchCatalogItems(query)

      if (requestId !== remoteSearchRequestId) {
        return
      }

      remoteItems.value = items
    } finally {
      if (requestId === remoteSearchRequestId) {
        remoteSearchPending.value = false
      }
    }
  })

  async function searchCatalogItems(query: string) {
    const response = await $fetch<CatalogItemListResponse>('/api/catalog-items', {
      query: {
        search: query,
        activeOnly: true,
        pageSize
      }
    })

    return response.items.filter(filterItem)
  }

  function openSearchPanel() {
    cancelSearchClose()
    searchOpen.value = true
  }

  function closeSearchPanel() {
    cancelSearchClose()
    searchOpen.value = false
    highlightedItemIndex.value = 0
  }

  function scheduleSearchClose() {
    cancelSearchClose()
    searchCloseTimeout = setTimeout(() => {
      searchOpen.value = false
      highlightedItemIndex.value = 0
    }, 120)
  }

  function cancelSearchClose() {
    if (searchCloseTimeout) {
      clearTimeout(searchCloseTimeout)
      searchCloseTimeout = null
    }
  }

  function highlightNextResult() {
    if (!searchPanelItems.value.length) {
      return
    }

    highlightedItemIndex.value = (highlightedItemIndex.value + 1) % searchPanelItems.value.length
  }

  function highlightPreviousResult() {
    if (!searchPanelItems.value.length) {
      return
    }

    highlightedItemIndex.value = highlightedItemIndex.value <= 0
      ? searchPanelItems.value.length - 1
      : highlightedItemIndex.value - 1
  }

  function resetSearch() {
    search.value = ''
    remoteItems.value = []
    closeSearchPanel()
  }

  return {
    search,
    searchOpen,
    highlightedItemIndex,
    remoteSearchPending,
    searchPanelItems,
    shouldShowSearchPanel,
    minSearchLength,
    searchCatalogItems,
    openSearchPanel,
    closeSearchPanel,
    scheduleSearchClose,
    cancelSearchClose,
    highlightNextResult,
    highlightPreviousResult,
    resetSearch
  }
}
