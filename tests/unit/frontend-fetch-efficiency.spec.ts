import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as vue from 'vue'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))
const nuxtRoot = dirname(createRequire(import.meta.url).resolve('nuxt/package.json'))
const scopes: vue.EffectScope[] = []

type FetchCall = { url: string, query: Record<string, unknown>, aborted: boolean }
type FetchOptions = { query: Record<string, unknown>, signal: AbortSignal }
type NuxtFetch = (url: string, options: Record<string, unknown>) => unknown

function evaluate(source: string, environment: Record<string, unknown>, result: string) {
  const entries = Object.entries(environment).filter(([key]) => /^[a-zA-Z_$][\w$]*$/.test(key))
  return new Function(...entries.map(([key]) => key), `${source}\nreturn ${result}`)(...entries.map(([, value]) => value))
}

function loadNuxtSource(path: string, environment: Record<string, unknown>, result: string) {
  const source = readFileSync(join(nuxtRoot, path), 'utf8')
    .replace(/^import .*;\n/gm, '')
    .replace(/^export \{.*\};?$/gm, '')
    .replaceAll('import.meta.client', 'true')
    .replaceAll('import.meta.server', 'false')
    .replaceAll('import.meta.dev', 'false')
    .replaceAll('import.meta.prerender', 'false')
  return evaluate(source, environment, result)
}

function pageScript(path: string) {
  return readFileSync(join(projectRoot, path), 'utf8').split('<script setup lang="ts">')[1]!.split('</script>')[0]!
}

function pageStatements(path: string, include: (text: string) => boolean) {
  const source = ts.createSourceFile(path, pageScript(path), ts.ScriptTarget.Latest, true)
  return source.statements.map(statement => statement.getText(source)).filter(include).join('\n')
}

async function settle() {
  for (let index = 0; index < 12; index++) await vue.nextTick()
}

// Run the installed Nuxt implementation and the page's actual query/watch code.
// Only the Nuxt app context and network transport are fake: no HTTP or DB access.
async function runtime() {
  const scope = vue.effectScope()
  scopes.push(scope)
  const calls: FetchCall[] = []
  let holdRequests = false
  const releases: Array<() => void> = []
  const nuxtApp = {
    _asyncData: {}, _asyncDataPromises: {},
    payload: { data: {}, _errors: {}, serverRendered: false },
    static: { data: {} }, isHydrating: false, hook: () => () => {}
  }
  const hash = await import(pathToFileURL(join(nuxtRoot, 'dist/app/utils/hash.js')).href)
  const environment: Record<string, unknown> = {
    ...vue, ...hash,
    useNuxtApp: () => nuxtApp,
    asyncDataDefaults: { deep: false },
    granularCachedData: true, pendingWhenIdle: false, purgeCachedData: true,
    tracingChannelNuxt: false,
    defineKeyedFunctionFactory: ({ factory }: { factory: unknown }) => ({ __nuxt_factory: factory }),
    createError: (error: unknown) => error,
    dataDiagnostics: {}
  }
  environment.debounceTick = loadNuxtSource('dist/app/utils/debounce-tick.js', environment, 'debounceTick')
  environment.useAsyncData = loadNuxtSource('dist/app/composables/asyncData.js', environment, 'useAsyncData')
  const useFetch = loadNuxtSource('dist/app/composables/fetch.js', {
    ...environment,
    alwaysRunFetchOnKeyChange: false,
    fetchDefaults: {},
    isPlainObject: (value: unknown) => Object.prototype.toString.call(value) === '[object Object]',
    $fetch: async (url: string, options: FetchOptions) => {
      const call = { url, query: JSON.parse(JSON.stringify(options.query)), aborted: false }
      calls.push(call)
      options.signal.addEventListener('abort', () => {
        call.aborted = true
      })
      if (holdRequests) {
        await new Promise<void>((resolve) => {
          releases.push(resolve)
        })
      }
      return url === '/api/catalog-items/summary'
        ? { product: 1, repair: 1, service: 1 }
        : { items: [], range: call.query }
    }
  }, 'useFetch') as NuxtFetch
  return {
    calls,
    holdRequests() { holdRequests = true },
    releaseRequests() {
      holdRequests = false
      releases.splice(0).forEach(resolve => resolve())
    },
    async setup<T>(source: string, globals: Record<string, unknown>, result = '{}'): Promise<T> {
      const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ESNext } }).outputText
      const env = {
        ...vue,
        useFetch: (...args: Parameters<NuxtFetch>) => scope.run(() => useFetch(...args)),
        watch: (...args: Parameters<typeof vue.watch>) => scope.run(() => vue.watch(...args)),
        ...globals
      }
      return evaluate(`return (async () => { ${compiled}\nreturn ${result} })()`, env, 'undefined') as Promise<T>
    }
  }
}

afterEach(async () => {
  scopes.splice(0).forEach(scope => scope.stop())
  await settle()
})

describe('frontend query execution budget', () => {
  it.each([
    ['documents', 'query'], ['customers', 'query'], ['dossiers', 'query'], ['payments', 'paymentQuery']
  ])('requests only the final filter and first page for %s', async (name, queryName) => {
    const app = await runtime()
    const search = vue.ref('')
    const pagination = vue.ref({ pageIndex: 2, pageSize: 50 })
    const source = pageStatements(`app/pages/${name}/index.vue`, text =>
      text.startsWith(`const ${queryName} =`)
      || (text.startsWith('const ') && text.includes('await useFetch<'))
      || (text.startsWith('watch(') && (text.includes('pagination.value.pageIndex = 0') || text.includes('refresh()')))
    )
    await app.setup(source, {
      debouncedSearch: search, search, pagination,
      typeFilter: vue.ref('all'), statusFilter: vue.ref('all'), methodFilter: vue.ref('all'), paymentStateFilter: vue.ref('all'),
      dateFrom: vue.ref(''), dateTo: vue.ref(''), sorting: vue.ref([]),
      route: { query: {} }, router: { replace: () => {} }
    })
    await settle()
    app.calls.splice(0)
    search.value = 'martin'
    await settle()
    expect(app.calls).toHaveLength(1)
    expect(app.calls[0]!.query).toMatchObject({ page: 1, pageSize: 50, [name === 'documents' || name === 'dossiers' ? 'q' : 'search']: 'martin' })
    expect(app.calls[0]!.aborted).toBe(false)
  })

  it('requests only the final payment date range and resets pagination once', async () => {
    const app = await runtime()
    const from = vue.ref('2026-09-01')
    const to = vue.ref('2026-09-11')
    const source = pageStatements('app/pages/payments/index.vue', text =>
      text.startsWith('const paymentQuery =')
      || (text.startsWith('const ') && text.includes('await useFetch<'))
      || (text.startsWith('watch(') && (text.includes('pagination.value.pageIndex = 0') || text.includes('refresh()')))
    )
    await app.setup(source, {
      debouncedSearch: vue.ref(''), pagination: vue.ref({ pageIndex: 2, pageSize: 50 }),
      statusFilter: vue.ref('all'), methodFilter: vue.ref('all'), dateFrom: from, dateTo: to, sorting: vue.ref([])
    })
    await settle()
    app.calls.splice(0)
    from.value = '2026-08-01'
    to.value = '2026-08-31'
    await settle()
    expect(app.calls).toHaveLength(1)
    expect(app.calls[0]!.query).toMatchObject({ dateFrom: '2026-08-01', dateTo: '2026-08-31', page: 1 })
  })

  it('replaces an obsolete search even while its previous request is still pending', async () => {
    const app = await runtime()
    const search = vue.ref('')
    const source = pageStatements('app/pages/customers/index.vue', text =>
      text.startsWith('const query =')
      || (text.startsWith('const ') && text.includes('await useFetch<'))
      || (text.startsWith('watch(') && (text.includes('pagination.value.pageIndex = 0') || text.includes('refresh()')))
    )
    await app.setup(source, { debouncedSearch: search, pagination: vue.ref({ pageIndex: 0, pageSize: 50 }) })
    await settle()
    app.calls.splice(0)
    app.holdRequests()
    search.value = 'mar'
    await settle()
    search.value = 'martin'
    await settle()
    app.releaseRequests()
    expect(app.calls).toHaveLength(2)
    expect(app.calls[0]!.aborted).toBe(true)
    expect(app.calls[1]!.query.search).toBe('martin')
  })

  it('loads report leaders only when visible and executes one request per date change', async () => {
    const app = await runtime()
    const source = pageScript('app/pages/reports/index.vue').split('function shiftIsoDate')[1]!.split('function formatRangeDate')[0]!
    const state = await app.setup<{ date: vue.Ref<string>, selectedTab: vue.Ref<string>, leadersStartDate: vue.Ref<string>, leadersEndDate: vue.Ref<string> }>(
      `function shiftIsoDate${source}`, { toDateInputValue: () => '2026-09-11' }, '{ date, selectedTab, leadersStartDate, leadersEndDate }'
    )
    await settle()
    expect(app.calls.map(call => call.url)).toEqual(['/api/reports/overview'])
    expect(app.calls[0]!.query.includeLeaders).toBe(false)
    app.calls.splice(0)
    state.date.value = '2026-09-10'
    await settle()
    expect(app.calls).toHaveLength(1)
    app.calls.splice(0)
    state.selectedTab.value = 'customers'
    await settle()
    expect(app.calls.map(call => call.url)).toEqual(['/api/reports/leaders'])
    app.calls.splice(0)
    state.selectedTab.value = 'items'
    await settle()
    expect(app.calls).toHaveLength(0)
    state.leadersStartDate.value = '2026-08-01'
    state.leadersEndDate.value = '2026-08-31'
    await settle()
    expect(app.calls).toHaveLength(1)
    expect(app.calls[0]!.query).toEqual({ startDate: '2026-08-01', endDate: '2026-08-31' })
  })

  it('loads only the visible catalog type and refreshes moved items when their tabs are opened', async () => {
    const app = await runtime()
    const page = pageScript('app/pages/catalog/index.vue')
    const source = page.slice(page.indexOf('const activeView ='), page.indexOf('const articleItems ='))
      + pageStatements('app/pages/catalog/index.vue', text => text.startsWith('function getViewType(') || (text.startsWith('watch(') && text.includes('Pagination.value.pageIndex = 0')))
    const state = await app.setup<{ activeView: vue.Ref<string>, articleSearch: vue.Ref<string>, articlePagination: vue.Ref<{ pageIndex: number }>, catalogSummary: vue.Ref<{ product: number, repair: number, service: number }>, refreshChangedTypes: (types: string[]) => Promise<void> }>(source, {
      ALL_CATEGORIES: '__all__', clearSaveError: () => {}, refDebounced: (value: unknown) => value
    }, '{ activeView, articleSearch, articlePagination, catalogSummary, refreshChangedTypes }')
    await settle()
    expect(app.calls.map(call => call.url)).toEqual(['/api/catalog-items', '/api/catalog-items/summary'])
    expect(app.calls[0]!.query.type).toBe('product')
    expect(state.catalogSummary.value).toEqual({ product: 1, repair: 1, service: 1 })
    app.calls.splice(0)
    state.activeView.value = 'repairs'
    await settle()
    expect(app.calls.map(call => call.query.type)).toEqual(['repair'])
    app.calls.splice(0)
    await state.refreshChangedTypes(['product', 'repair'])
    await settle()
    expect(app.calls.map(call => call.url)).toEqual(['/api/catalog-items/summary', '/api/catalog-items'])
    expect(app.calls[1]!.query.type).toBe('repair')
    app.calls.splice(0)
    state.activeView.value = 'articles'
    await settle()
    expect(app.calls.map(call => call.query.type)).toEqual(['product'])
    app.calls.splice(0)
    state.articlePagination.value.pageIndex = 2
    await settle()
    expect(app.calls.map(call => call.url)).toEqual(['/api/catalog-items'])
    app.calls.splice(0)
    state.articleSearch.value = 'iphone'
    await settle()
    expect(app.calls).toHaveLength(2)
    expect(app.calls.find(call => call.url === '/api/catalog-items')!.query).toMatchObject({ type: 'product', search: 'iphone', page: 1 })
    expect(app.calls.find(call => call.url === '/api/catalog-items/summary')!.query).toEqual({ productSearch: 'iphone' })
  })
})
