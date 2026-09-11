import type { CatalogItemRecord } from '~~/shared/types/pos'
import type { CatalogSuggestionsResponse } from '~~/shared/types/lookups'

type UseCatalogItemSearchOptions = {
  minSearchLength?: number
  pageSize?: number
  filterItem?: (item: CatalogItemRecord) => boolean
}

export function useCatalogItemSearch(options: UseCatalogItemSearchOptions = {}) {
  const searchInput = ref<{ inputRef?: HTMLInputElement } | null>(null)

  async function focusSearch() {
    await nextTick()
    searchInput.value?.inputRef?.focus({ preventScroll: true })
  }

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
  let suppressNextSearchOpen = false

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

    if (suppressNextSearchOpen) {
      suppressNextSearchOpen = false
      return
    }

    if (value.trim()) {
      openSearchPanel()
      return
    }

    cancelSearchClose()
  })

  watch(debouncedSearch, async (value, _previous, onCleanup) => {
    const query = value.trim()
    const requestId = ++remoteSearchRequestId
    const controller = new AbortController()
    onCleanup(() => controller.abort())

    if (query.length < minSearchLength) {
      remoteItems.value = []
      remoteSearchPending.value = false
      return
    }

    remoteSearchPending.value = true

    try {
      const items = await searchCatalogItems(query, controller.signal)

      if (requestId !== remoteSearchRequestId) {
        return
      }

      remoteItems.value = items
    } catch (error) {
      if (!controller.signal.aborted) throw error
    } finally {
      if (requestId === remoteSearchRequestId) {
        remoteSearchPending.value = false
      }
    }
  })

  async function searchCatalogItems(query: string, signal?: AbortSignal) {
    const response = await $fetch<CatalogSuggestionsResponse>('/api/catalog-items/suggestions', {
      query: {
        search: query,
        activeOnly: true,
        pageSize
      },
      signal
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

  function setSearchValue(value: string, options: { open?: boolean } = {}) {
    const shouldKeepClosed = options.open === false

    if (shouldKeepClosed && value !== search.value) {
      suppressNextSearchOpen = true
    }

    search.value = value

    if (shouldKeepClosed) {
      closeSearchPanel()
    }
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
    searchInput,
    focusSearch,
    search,
    searchOpen,
    highlightedItemIndex,
    remoteSearchPending,
    searchPanelItems,
    shouldShowSearchPanel,
    minSearchLength,
    searchCatalogItems,
    setSearchValue,
    openSearchPanel,
    closeSearchPanel,
    scheduleSearchClose,
    cancelSearchClose,
    highlightNextResult,
    highlightPreviousResult,
    resetSearch
  }
}
