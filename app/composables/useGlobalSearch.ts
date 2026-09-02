import type { GlobalSearchResponse } from '~~/shared/types/pos'

export function useGlobalSearch(search: Ref<string>, limit = 5) {
  const minimumSearchLength = 2
  const debouncedSearch = refDebounced(search, 200)
  const results = shallowRef<GlobalSearchResponse | null>(null)
  const loading = ref(false)
  const failed = ref(false)
  let requestSequence = 0

  const searchTerm = computed(() => debouncedSearch.value.trim())
  const canSearch = computed(() => searchTerm.value.length >= minimumSearchLength)

  watch(searchTerm, async (query) => {
    const requestId = ++requestSequence

    if (query.length < minimumSearchLength) {
      results.value = null
      loading.value = false
      failed.value = false
      return
    }

    loading.value = true
    failed.value = false

    try {
      const response = await $fetch<GlobalSearchResponse>('/api/search', {
        query: { q: query, limit }
      })

      if (requestId === requestSequence) {
        results.value = response
      }
    } catch {
      if (requestId === requestSequence) {
        results.value = null
        failed.value = true
      }
    } finally {
      if (requestId === requestSequence) {
        loading.value = false
      }
    }
  })

  onScopeDispose(() => {
    requestSequence += 1
  })

  return {
    minimumSearchLength,
    searchTerm,
    canSearch,
    results,
    loading,
    failed
  }
}
