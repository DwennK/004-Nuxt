import { computed, createSSRApp, effectScope, h, nextTick, onServerPrefetch, ref, shallowRef, watch } from 'vue'
import { renderToString } from '@vue/server-renderer'
import type { EffectScope, Ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSmartphoneList } from '../../app/composables/useSmartphoneList'
import type { SmartphoneListResponse } from '../../shared/types/smartphone-list'

type Item = { id: number, sold: boolean }
type Query = { page: number, pageSize: number, sold: string, selectedIds: string, includeTotal: boolean }

describe('smartphone selection while pages are fetched independently', () => {
  let scope: EffectScope
  let records: Item[]
  let calls: Query[]
  let refresh: () => Promise<void>

  beforeEach(() => {
    scope = effectScope()
    records = Array.from({ length: 24 }, (_, index) => ({ id: index + 1, sold: index % 2 === 1 }))
    calls = []
    for (const [name, value] of Object.entries({ computed, ref, shallowRef, watch })) vi.stubGlobal(name, value)
    const authenticatedFetch = vi.fn(async (_endpoint: string, { query }: { query: Query }) => {
      calls.push({ ...query })
      const matching = records.filter(item => query.sold === 'all' || item.sold === (query.sold === 'sold'))
      const selectedIds = query.selectedIds.split(',').filter(Boolean).map(Number)
      return {
        items: matching.slice((query.page - 1) * query.pageSize, query.page * query.pageSize),
        selectedItems: records.filter(item => selectedIds.includes(item.id)),
        total: query.includeTotal ? matching.length : undefined,
        page: query.page,
        pageSize: query.pageSize
      }
    })
    vi.stubGlobal('useRequestFetch', vi.fn(() => authenticatedFetch))
    vi.stubGlobal('$fetch', vi.fn(async () => {
      throw new Error('A global SSR fetch loses the incoming authenticated session')
    }))
    vi.stubGlobal('useAsyncData', (_key: string, handler: (app: undefined, options: { signal: AbortSignal }) => Promise<SmartphoneListResponse<Item>>, options: { watch: Ref<unknown>[] }) => {
      const data = shallowRef<SmartphoneListResponse<Item>>()
      refresh = async () => {
        data.value = await handler(undefined, { signal: new AbortController().signal })
      }
      watch(options.watch, refresh)
      return { data, status: ref('success'), refresh }
    })
  })

  afterEach(() => scope.stop())

  function createList() {
    const filters = ref({ search: '', sold: 'all' })
    const list = scope.run(() => useSmartphoneList<Item>({
      key: 'test', endpoint: '/test', filters,
      matches: item => filters.value.sold === 'all' || item.sold === (filters.value.sold === 'sold')
    }))!
    return { filters, list }
  }

  async function settle() {
    await nextTick()
    await nextTick()
  }

  it('captures the request-scoped fetch during setup and uses it for authenticated initial loads and refreshes', async () => {
    const { list } = createList()
    expect(useRequestFetch).toHaveBeenCalledTimes(1)
    await refresh()
    await settle()
    expect(list.data.value?.items).toHaveLength(10)
    expect(list.total.value).toBe(24)
    await refresh()
    expect(useRequestFetch).toHaveBeenCalledTimes(1)
    expect($fetch).not.toHaveBeenCalled()
  })

  it('renders the resolved total and pagination on the server before client hydration', async () => {
    vi.stubGlobal('useAsyncData', (_key: string, handler: (app: undefined, options: { signal: AbortSignal }) => Promise<SmartphoneListResponse<Item>>) => {
      const data = shallowRef<SmartphoneListResponse<Item>>()
      onServerPrefetch(async () => {
        data.value = await handler(undefined, { signal: new AbortController().signal })
      })
      return { data, status: ref('success') }
    })
    const app = createSSRApp({
      setup() {
        const list = useSmartphoneList<Item>({
          key: 'ssr-test', endpoint: '/test', filters: ref({ search: '', sold: 'all' }), matches: () => true
        })
        return () => h('div', [
          h('span', `${list.selectedIds.value.length} sur ${list.total.value}`),
          h('nav', `${Math.ceil(list.total.value / list.pagination.value.pageSize)} pages`)
        ])
      }
    })

    const html = await renderToString(app)
    expect(html).toBe('<div><span>0 sur 24</span><nav>3 pages</nav></div>')
  })

  it('retains selections across pages and hides only selections outside the active filter', async () => {
    const { filters, list } = createList()
    await refresh()
    list.rowSelection.value = { 1: true, 2: true }
    expect(list.selectedIds.value).toEqual([1, 2])
    expect(calls).toHaveLength(1)
    list.pagination.value.pageIndex = 1
    await settle()
    expect(calls.at(-1)).toMatchObject({ page: 2, includeTotal: false, selectedIds: '1,2' })
    list.rowSelection.value = { ...list.rowSelection.value, 11: true }
    expect(list.selectedIds.value).toEqual([1, 2, 11])
    filters.value = { search: '', sold: 'sold' }
    await settle()
    expect(list.pagination.value.pageIndex).toBe(0)
    expect(calls).toHaveLength(3)
    expect(calls.at(-1)).toMatchObject({ page: 1, includeTotal: true })
    expect(list.selectedIds.value).toEqual([2])
    filters.value = { search: '', sold: 'all' }
    await settle()
    expect(list.selectedIds.value).toEqual([1, 2, 11])
  })

  it('reconciles deleted or changed selected rows on a mutation refresh without reselecting other IDs', async () => {
    const { filters, list } = createList()
    await refresh()
    list.rowSelection.value = { 1: true, 2: true }
    records = records.filter(item => item.id !== 1).map(item => item.id === 2 ? { ...item, sold: false } : item)
    await refresh()
    await settle()
    expect(list.selectedIds.value).toEqual([2])
    expect(list.rowSelection.value).toEqual({ 2: true })
    expect(list.total.value).toBe(23)
    expect(calls.at(-1)?.includeTotal).toBe(true)
    filters.value = { search: '', sold: 'sold' }
    await settle()
    expect(list.selectedIds.value).toEqual([])
  })
})
