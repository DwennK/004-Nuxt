import { computed, effectScope, nextTick, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { refDebounced } from '@vueuse/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useGlobalSearch } from '../../app/composables/useGlobalSearch'
import { useCatalogItemSearch } from '../../app/composables/useCatalogItemSearch'
import type { CatalogItemRecord } from '../../shared/types/pos'

const scopes: ReturnType<typeof effectScope>[] = []

beforeEach(() => {
  vi.useFakeTimers()
  for (const [name, value] of Object.entries({ computed, nextTick, onScopeDispose, ref, shallowRef, watch, refDebounced })) {
    vi.stubGlobal(name, value)
  }
})

afterEach(() => {
  scopes.splice(0).forEach(scope => scope.stop())
  vi.useRealTimers()
})

function inScope<T>(factory: () => T): T {
  const scope = effectScope()
  scopes.push(scope)
  return scope.run(factory)!
}

describe('search requests without list aggregates', () => {
  it('debounces global lookup and never queries for fewer than two characters', async () => {
    const response = { query: 'iphone', customers: { items: [] }, tickets: { items: [] }, documents: { items: [] }, catalogItems: { items: [] } }
    const fetcher = vi.fn().mockResolvedValue(response)
    vi.stubGlobal('$fetch', fetcher)
    const search = ref('')
    const lookup = inScope(() => useGlobalSearch(search, 8))
    search.value = 'i'
    await vi.advanceTimersByTimeAsync(250)
    expect(fetcher).not.toHaveBeenCalled()
    search.value = 'iphone'
    await vi.advanceTimersByTimeAsync(199)
    expect(fetcher).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(fetcher).toHaveBeenCalledWith('/api/search', expect.objectContaining({ query: { q: 'iphone', limit: 8 }, signal: expect.any(AbortSignal) }))
    expect(lookup.results.value).toEqual(response)
    search.value = ''
    await vi.advanceTimersByTimeAsync(200)
    expect(lookup.results.value).toBeNull()
    expect(fetcher).toHaveBeenCalledOnce()
  })

  it('cancels obsolete catalog suggestions and preserves the latest result and loading state', async () => {
    const requests: Array<{ signal: AbortSignal, resolve: (response: { items: CatalogItemRecord[] }) => void }> = []
    const fetcher = vi.fn((_url: string, options: { signal: AbortSignal }) => new Promise<{ items: CatalogItemRecord[] }>((resolve, reject) => {
      requests.push({ signal: options.signal, resolve })
      options.signal.addEventListener('abort', () => reject(new DOMException('Cancelled', 'AbortError')))
    }))
    vi.stubGlobal('$fetch', fetcher)
    const lookup = inScope(() => useCatalogItemSearch())
    lookup.setSearchValue('iphone')
    await vi.advanceTimersByTimeAsync(200)
    lookup.setSearchValue('ipad')
    await vi.advanceTimersByTimeAsync(200)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher).toHaveBeenLastCalledWith('/api/catalog-items/suggestions', expect.objectContaining({ query: { search: 'ipad', activeOnly: true, pageSize: 25 } }))
    expect(requests[0]!.signal.aborted).toBe(true)
    expect(requests[1]!.signal.aborted).toBe(false)
    expect(lookup.remoteSearchPending.value).toBe(true)
    const item = { id: 2, name: 'iPad' } as CatalogItemRecord
    requests[1]!.resolve({ items: [item] })
    await vi.advanceTimersByTimeAsync(0)
    expect(lookup.searchPanelItems.value).toEqual([item])
    expect(lookup.remoteSearchPending.value).toBe(false)
    lookup.resetSearch()
    await vi.advanceTimersByTimeAsync(200)
    expect(lookup.searchPanelItems.value).toEqual([])
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('keeps explicit barcode lookup on the suggestions endpoint with its item filter', async () => {
    const first = { id: 1, name: 'Article' } as CatalogItemRecord
    const second = { id: 2, name: 'Service' } as CatalogItemRecord
    const fetcher = vi.fn().mockResolvedValue({ items: [first, second] })
    vi.stubGlobal('$fetch', fetcher)
    const lookup = inScope(() => useCatalogItemSearch({ filterItem: item => item.id === 1, pageSize: 12 }))
    expect(await lookup.searchCatalogItems('7612345678900')).toEqual([first])
    expect(fetcher).toHaveBeenCalledWith('/api/catalog-items/suggestions', { query: { search: '7612345678900', activeOnly: true, pageSize: 12 }, signal: undefined })
  })
})
