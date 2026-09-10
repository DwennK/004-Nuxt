<script setup lang="ts">
import type { MobileSentrixCategoriesResponse, MobileSentrixCategorySummary, MobileSentrixProductsResponse, MobileSentrixProductSummary, MobileSentrixSearchResponse } from '~~/shared/types/pos'
import { colorOptions, partOptions, qualityOptions, supplierFacts, supplierPageRange, supplierPrice, supplierProductKey, supplierQuery, supplierStock } from '~~/shared/utils/mobilesentrix-browser'

const props = defineProps<{ canUseApi: boolean, baseUrl: string }>()
type Mode = 'search' | 'devices' | 'categories' | 'favorites'
const mode = ref<Mode>('search')
const tabs = [
  { label: 'Recherche', value: 'search', icon: 'i-lucide-search' },
  { label: 'Appareils', value: 'devices', icon: 'i-lucide-smartphone' },
  { label: 'Catégories', value: 'categories', icon: 'i-lucide-list-tree' },
  { label: 'Favoris', value: 'favorites', icon: 'i-lucide-star' }
]
const filters = reactive({ text: '', model: '', part: 'all', quality: qualityOptions[0]!, color: 'all' })
const pageSize = ref(20)
const stock = ref('all')
const stockOptions = [{ label: 'Tout stock', value: 'all' }, { label: 'En stock', value: 'available' }, { label: 'Rupture', value: 'unavailable' }, { label: 'Non communiqué', value: 'unknown' }]
const { favorites, favoriteKeys, recent, storageWarning, toggleFavorite, remember, clearRecent } = useMobileSentrixLibrary()
const compared = ref<MobileSentrixProductSummary[]>([])
const comparedKeys = computed(() => compared.value.map(supplierProductKey))
const compareOpen = ref(false)
const compareFocus = usePosFocusReturn(compareOpen)
const selected = ref<MobileSentrixProductSummary | null>(null)
const detailsOpen = ref(false)
const toast = useToast()
const productTable = useTemplateRef('productTable')
const categories = ref<MobileSentrixCategorySummary[]>([])
const categoriesLoaded = ref(false)
const categoriesPending = ref(false)
const categoriesError = ref('')
const categoryId = ref('')
const categorySearch = ref('')
const categoryPath = computed(() => {
  const path: MobileSentrixCategorySummary[] = []
  let id = categoryId.value
  const seen = new Set<string>()
  while (id && !seen.has(id)) {
    seen.add(id)
    const category = categories.value.find(item => item.id === id)
    if (!category) break
    path.unshift(category)
    id = category.parentId || ''
  }
  return path
})
const visibleCategories = computed(() => {
  const q = categorySearch.value.trim().toLowerCase()
  if (q) return categories.value.filter(item => item.name.toLowerCase().includes(q))
  return categories.value.filter(item => categoryId.value ? item.parentId === categoryId.value : !item.parentId || !categories.value.some(parent => parent.id === item.parentId))
})
const categoryOptions = computed(() => [{ label: 'Choisir une catégorie', value: 'root' }, ...categories.value.map(item => ({ label: item.name, value: item.id }))])
interface Result { items: MobileSentrixProductSummary[], total: number | null, page: number, query: string, loaded: boolean }
const results = reactive<Record<Mode, Result>>({
  search: { items: [], total: null, page: 1, query: '', loaded: false },
  devices: { items: [], total: null, page: 1, query: '', loaded: false },
  categories: { items: [], total: null, page: 1, query: '', loaded: false },
  favorites: { items: [], total: null, page: 1, query: '', loaded: true }
})
const pending = reactive<Record<Mode, boolean>>({ search: false, devices: false, categories: false, favorites: false })
const errors = reactive<Record<Mode, string>>({ search: '', devices: '', categories: '', favorites: '' })
const requests: Record<Mode, number> = { search: 0, devices: 0, categories: 0, favorites: 0 }
const isLocal = computed(() => mode.value === 'categories' || mode.value === 'favorites')
const current = computed(() => results[mode.value])
const matchesStock = (item: MobileSentrixProductSummary) => stock.value === 'all' || (stock.value === 'available' ? item.inStock === true : stock.value === 'unavailable' ? item.inStock === false : item.inStock === null)
const sourceItems = computed(() => mode.value === 'favorites' ? favorites.value : current.value.items)
const filteredItems = computed(() => sourceItems.value.filter(matchesStock))
const shownItems = computed(() => isLocal.value ? filteredItems.value.slice((current.value.page - 1) * pageSize.value, current.value.page * pageSize.value) : filteredItems.value)
const total = computed(() => isLocal.value ? filteredItems.value.length : current.value.total)
const pageCount = computed(() => total.value === null ? null : Math.max(1, Math.ceil(total.value / pageSize.value)))
const canNext = computed(() => pageCount.value === null ? current.value.items.length === pageSize.value : current.value.page < pageCount.value)
const range = computed(() => supplierPageRange(current.value.page, pageSize.value, isLocal.value ? shownItems.value.length : current.value.items.length, total.value))
const emptyMessage = computed(() => !current.value.loaded ? mode.value === 'categories' ? 'Choisissez une catégorie pour afficher ses produits.' : 'Recherchez un modèle, une pièce ou un SKU.' : stock.value !== 'all' && !shownItems.value.length ? 'Aucune correspondance avec ce filtre de stock.' : mode.value === 'favorites' ? 'Ajoutez vos références avec l’étoile dans la liste.' : 'Aucun produit trouvé. Essayez une recherche plus large.')
const storeLabel = computed(() => {
  try {
    return new URL(props.baseUrl).hostname
  } catch {
    return 'MobileSentrix'
  }
})

function openProduct(product: MobileSentrixProductSummary) {
  selected.value = product
  detailsOpen.value = true
}
function toggleCompare(product: MobileSentrixProductSummary) {
  const key = supplierProductKey(product)
  if (comparedKeys.value.includes(key)) compared.value = compared.value.filter(item => supplierProductKey(item) !== key)
  else if (compared.value.length < 3) compared.value = [...compared.value, product]
  else toast.add({ title: 'Trois pièces maximum', description: 'Retirez une pièce du comparateur pour en ajouter une autre.', color: 'warning' })
}
async function loadCategories() {
  if (!props.canUseApi || categoriesPending.value) return
  categoriesPending.value = true
  categoriesError.value = ''
  try {
    const response = await $fetch<MobileSentrixCategoriesResponse>('/api/tools/mobilesentrix/categories')
    categories.value = response.items.filter(item => item.id)
    categoriesLoaded.value = true
  } catch {
    categoriesError.value = 'Catégories indisponibles. Réessayez.'
  } finally {
    categoriesPending.value = false
  }
}
async function load(target: Mode, page = 1, query = results[target].query) {
  if (target === 'favorites') {
    results.favorites.page = page
    return
  }
  if (!props.canUseApi) return
  if (target === 'search' && query.trim().length < 2) {
    errors.search = 'Saisissez au moins deux caractères ou choisissez un modèle et une pièce.'
    return
  }
  if (target === 'categories' && !query) return
  const token = ++requests[target]
  pending[target] = true
  errors[target] = ''
  try {
    if (target === 'search') {
      const response = await $fetch<MobileSentrixSearchResponse>('/api/tools/mobilesentrix/search', { query: { q: query, maxResults: pageSize.value, startIndex: (page - 1) * pageSize.value } })
      if (token !== requests[target]) return
      results.search = { items: response.items, total: response.totalItems, page, query, loaded: true }
      remember(query)
    } else {
      const response = await $fetch<MobileSentrixProductsResponse>('/api/tools/mobilesentrix/products', { query: { ...(target === 'devices' ? { deviceProducts: true } : { categoryId: query }), page, limit: pageSize.value } })
      if (token !== requests[target]) return
      results[target] = { items: response.items, total: response.totalItems, page: 1, query, loaded: true }
      if (target === 'devices') results.devices.page = page
    }
    if (mode.value === target) {
      await nextTick()
      productTable.value?.scrollToTop()
    }
  } catch {
    if (token === requests[target]) errors[target] = 'Le fournisseur n’a pas répondu. Les derniers résultats restent affichés ; réessayez.'
  } finally { if (token === requests[target]) pending[target] = false }
}
function search() {
  load('search', 1, supplierQuery(filters))
}
function recall(query: string) {
  Object.assign(filters, { text: query, model: '', part: 'all', quality: qualityOptions[0]!, color: 'all' })
  mode.value = 'search'
  load('search', 1, query)
}
function resetFilters() {
  Object.assign(filters, { text: '', model: '', part: 'all', quality: qualityOptions[0]!, color: 'all' })
  stock.value = 'all'
}
function chooseCategory(id: string) {
  if (id === 'root') id = ''
  categoryId.value = id
  categorySearch.value = ''
  requests.categories++
  pending.categories = false
  errors.categories = ''
  results.categories = { items: [], total: null, page: 1, query: id, loaded: false }
  if (id) load('categories', 1, id)
}
function changePage(page: number) {
  if (isLocal.value) {
    current.value.page = page
    productTable.value?.scrollToTop()
  } else load(mode.value, page)
}
watch(mode, (target) => {
  if (target === 'search' && results.search.query && !results.search.loaded && !pending.search) load('search')
  if (target === 'devices' && !results.devices.loaded && !pending.devices) load('devices')
  if (target === 'categories' && !categoriesLoaded.value) loadCategories()
})
watch(pageSize, () => {
  for (const target of ['search', 'devices'] as const) {
    requests[target]++
    pending[target] = false
    results[target].loaded = false
    results[target].items = []
    results[target].page = 1
    results[target].total = null
  }
  results.categories.page = 1
  results.favorites.page = 1
  if (!isLocal.value && (mode.value === 'devices' || current.value.query)) load(mode.value, 1)
})
watch(stock, () => {
  if (isLocal.value) current.value.page = 1
  productTable.value?.scrollToTop()
})
watch(() => filteredItems.value.length, () => {
  if (isLocal.value && pageCount.value && current.value.page > pageCount.value) current.value.page = pageCount.value
})
</script>

<template>
  <section class="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-lg border border-default bg-default" aria-label="Catalogue MobileSentrix">
    <div class="shrink-0 border-b border-default px-3 pt-2">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <UTabs
          v-model="mode"
          :items="tabs"
          :content="false"
          variant="link"
          class="min-w-0 max-w-full"
          :ui="{ list: 'overflow-x-auto', trigger: 'px-3', label: 'text-xs sm:text-sm' }"
        />
        <span class="pb-2 text-xs text-muted">{{ storeLabel }}</span>
      </div>
    </div>
    <div v-if="mode === 'search'" class="shrink-0 space-y-2 border-b border-default p-3">
      <form class="space-y-2" @submit.prevent="search">
        <div class="flex gap-2">
          <UInput
            v-model="filters.text"
            aria-label="Recherche produit ou SKU"
            placeholder="Rechercher une pièce, une référence…"
            icon="i-lucide-search"
            class="min-w-0 flex-1"
            :disabled="!canUseApi"
          />
          <UButton
            type="submit"
            label="Rechercher"
            icon="i-lucide-search"
            :loading="pending.search"
            :disabled="!canUseApi"
          />
        </div>
        <div class="grid grid-cols-2 gap-2 lg:grid-cols-[1.2fr_1fr_1.2fr_1fr_auto]">
          <UInput
            v-model="filters.model"
            aria-label="Modèle"
            placeholder="Modèle : iPhone 15…"
            class="w-full"
            :disabled="!canUseApi"
          />
          <USelect
            v-model="filters.part"
            :items="partOptions"
            aria-label="Type de pièce"
            class="w-full"
            :disabled="!canUseApi"
          />
          <USelect
            v-model="filters.quality"
            :items="qualityOptions"
            aria-label="Qualité"
            class="w-full"
            :disabled="!canUseApi"
          />
          <USelect
            v-model="filters.color"
            :items="colorOptions"
            aria-label="Couleur"
            class="w-full"
            :disabled="!canUseApi"
          />
          <UButton
            icon="i-lucide-filter-x"
            label="Effacer"
            color="neutral"
            variant="ghost"
            @click="resetFilters"
          />
        </div>
      </form>
      <div v-if="recent.length" class="flex items-center gap-2">
        <UIcon name="i-lucide-history" class="size-4 shrink-0 text-muted" />
        <div class="flex min-w-0 flex-1 gap-1 overflow-x-auto" aria-label="Recherches récentes">
          <UButton
            v-for="query in recent"
            :key="query"
            :label="query"
            :title="query"
            color="neutral"
            variant="soft"
            size="xs"
            class="max-w-52 shrink-0"
            :ui="{ label: 'truncate' }"
            :disabled="!canUseApi"
            @click="recall(query)"
          />
        </div>
        <UButton
          icon="i-lucide-x"
          aria-label="Effacer les recherches récentes"
          variant="ghost"
          color="neutral"
          size="xs"
          @click="clearRecent"
        />
      </div>
    </div>
    <div v-if="mode === 'categories'" class="flex shrink-0 flex-wrap items-center gap-2 border-b border-default p-3">
      <UButton
        label="Toutes les familles"
        variant="link"
        size="sm"
        @click="chooseCategory('')"
      />
      <template v-for="category in categoryPath" :key="category.id">
        <UIcon name="i-lucide-chevron-right" class="size-3 text-muted" /><UButton
          :label="category.name"
          variant="link"
          size="sm"
          @click="chooseCategory(category.id)"
        />
      </template>
      <p v-if="categoriesPending" role="status" class="text-sm text-muted lg:hidden">
        Chargement des catégories…
      </p>
      <div v-if="categoriesError" role="alert" class="text-sm text-error lg:hidden">
        {{ categoriesError }}<UButton label="Réessayer" variant="link" @click="loadCategories" />
      </div>
      <USelect
        :model-value="categoryId || 'root'"
        :items="categoryOptions"
        aria-label="Catégorie"
        class="w-full lg:hidden"
        @update:model-value="chooseCategory(String($event))"
      />
    </div>
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-default px-3 py-2">
      <p class="min-w-0 text-xs text-muted">
        <template v-if="mode === 'favorites'">
          {{ favorites.length }} favoris · valeurs enregistrées dans ce navigateur
        </template>
        <template v-else-if="mode === 'search' && current.loaded">
          Recherche : <strong>{{ current.query }}</strong>
        </template>
        <template v-else-if="mode === 'devices'">
          Téléphones d’occasion · prix et stock selon les données fournisseur
        </template>
        <template v-else>
          Choisissez une référence pour ouvrir sa fiche.
        </template>
      </p>
      <div class="flex items-center gap-2">
        <label for="ms-stock" class="text-xs text-muted">Stock{{ isLocal ? '' : ' de la page' }}</label>
        <USelect
          id="ms-stock"
          v-model="stock"
          :items="stockOptions"
          aria-label="Disponibilité"
          size="sm"
          class="w-40"
        />
      </div>
    </div>
    <UAlert
      v-if="storageWarning"
      :description="storageWarning"
      color="warning"
      variant="subtle"
      class="shrink-0"
    />
    <div v-if="errors[mode]" role="alert" class="flex shrink-0 items-center justify-between gap-2 border-b border-default p-3 text-sm text-error">
      <span>{{ errors[mode] }}</span><UButton
        label="Réessayer"
        color="neutral"
        variant="outline"
        size="sm"
        :loading="pending[mode]"
        @click="mode === 'search' ? search() : load(mode, current.page)"
      />
    </div>
    <div class="flex min-h-0 min-w-0 flex-1">
      <aside v-if="mode === 'categories'" class="hidden w-60 shrink-0 flex-col border-r border-default lg:flex" aria-label="Familles fournisseur">
        <UInput
          v-model="categorySearch"
          aria-label="Filtrer les catégories"
          placeholder="Filtrer les familles…"
          icon="i-lucide-search"
          class="m-2"
        />
        <div class="min-h-0 flex-1 overflow-y-auto p-2">
          <p v-if="categoriesPending" role="status" class="p-2 text-sm text-muted">
            Chargement des catégories…
          </p>
          <div v-else-if="categoriesError" role="alert" class="text-sm text-error">
            {{ categoriesError }}<UButton label="Réessayer" variant="link" @click="loadCategories" />
          </div>
          <template v-else>
            <UButton
              v-for="category in visibleCategories"
              :key="category.id"
              :label="category.name"
              :trailing-icon="categories.some(item => item.parentId === category.id) ? 'i-lucide-chevron-right' : undefined"
              color="neutral"
              variant="ghost"
              class="mb-1 w-full justify-between text-left"
              :ui="{ label: 'whitespace-normal' }"
              @click="chooseCategory(category.id)"
            />
            <p v-if="!visibleCategories.length" class="p-2 text-xs text-muted">
              {{ categorySearch ? 'Aucune catégorie trouvée.' : 'Aucune sous-catégorie fournie.' }}
            </p>
          </template>
        </div>
      </aside>
      <MobilesentrixProductTable
        ref="productTable"
        :items="shownItems"
        :loading="pending[mode]"
        :favorites="favoriteKeys"
        :compared="comparedKeys"
        :empty="emptyMessage"
        @open="openProduct"
        @favorite="toggleFavorite"
        @compare="toggleCompare"
      />
    </div>
    <div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-default px-3 py-2" aria-label="Pagination">
      <p role="status" class="text-xs tabular-nums text-muted">
        {{ range }}<span v-if="stock !== 'all' && !isLocal"> · {{ shownItems.length }} avec ce stock</span>
      </p>
      <div class="flex items-center gap-2">
        <USelect
          v-model="pageSize"
          :items="[{ label: '20 / page', value: 20 }, { label: '50 / page', value: 50 }]"
          aria-label="Résultats par page"
          size="sm"
          class="w-28"
        />
        <UButton
          icon="i-lucide-chevron-left"
          aria-label="Page précédente"
          size="sm"
          variant="outline"
          color="neutral"
          :disabled="current.page <= 1 || pending[mode]"
          @click="changePage(current.page - 1)"
        />
        <span class="text-xs tabular-nums">{{ current.page }}<template v-if="pageCount"> / {{ pageCount }}</template></span>
        <UButton
          icon="i-lucide-chevron-right"
          aria-label="Page suivante"
          size="sm"
          variant="outline"
          color="neutral"
          :disabled="!canNext || pending[mode] || !current.loaded"
          @click="changePage(current.page + 1)"
        />
      </div>
    </div>
    <div v-if="compared.length" class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-default bg-elevated px-3 py-2">
      <div class="flex min-w-0 flex-1 gap-1 overflow-x-auto">
        <UButton
          v-for="product in compared"
          :key="supplierProductKey(product)"
          :label="product.sku || product.name"
          :aria-label="`Retirer ${product.sku || product.name} du comparateur`"
          trailing-icon="i-lucide-x"
          size="xs"
          color="neutral"
          variant="outline"
          class="shrink-0"
          @click="toggleCompare(product)"
        />
      </div>
      <UButton
        :label="`Comparer (${compared.length}/3)`"
        icon="i-lucide-columns-3"
        size="sm"
        :disabled="compared.length < 2"
        @click="compareOpen = true"
      />
    </div>
  </section>
  <MobilesentrixProductDetails
    v-model:open="detailsOpen"
    :product="selected"
    :can-use-api="canUseApi"
    @compare="toggleCompare"
    @favorite="toggleFavorite"
  />
  <UModal
    v-model:open="compareOpen"
    title="Comparer les pièces"
    description="Comparez la qualité, le modèle, la couleur et le stock de la boutique source avant de choisir."
    :content="compareFocus"
    :ui="{ content: 'sm:max-w-5xl', body: 'overflow-x-auto p-3 sm:p-4' }"
  >
    <template #body>
      <table class="w-full min-w-[640px] table-fixed border-collapse text-sm">
        <thead>
          <tr>
            <th class="w-28 p-3 text-left">
              Critère
            </th><th v-for="product in compared" :key="supplierProductKey(product)" class="p-3 text-left align-top">
              <img
                v-if="product.imageUrl"
                :src="product.imageUrl"
                alt=""
                class="mb-3 h-24 w-full object-contain"
              ><p>{{ product.name }}</p><UButton
                :label="`Retirer ${product.sku || ''}`"
                icon="i-lucide-x"
                color="neutral"
                variant="link"
                size="xs"
                @click="toggleCompare(product)"
              />
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="field in ['SKU', 'Prix', 'Stock', 'Modèle', 'Qualité', 'Couleur', 'Cadre']" :key="field" class="border-t border-default">
            <th class="p-3 text-left text-muted">
              {{ field }}
            </th>
            <td v-for="product in compared" :key="supplierProductKey(product)" class="p-3 align-top">
              {{ field === 'SKU' ? product.sku || product.newSku || '—' : field === 'Prix' ? supplierPrice(product) : field === 'Stock' ? supplierStock(product) : field === 'Modèle' ? supplierFacts(product).model || 'Non communiqué' : field === 'Qualité' ? supplierFacts(product).quality || 'Non communiquée' : field === 'Couleur' ? supplierFacts(product).color || 'Non communiquée' : supplierFacts(product).frame || 'Non précisé' }}
            </td>
          </tr>
          <tr class="border-t border-default">
            <th class="p-3 text-left text-muted">
              Fournisseur
            </th><td v-for="product in compared" :key="supplierProductKey(product)" class="p-3">
              <UButton
                v-if="product.url"
                :to="product.url"
                target="_blank"
                rel="noopener noreferrer"
                icon="i-lucide-external-link"
                label="Voir la fiche"
                variant="outline"
                size="sm"
              />
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="compared.length < 2" class="mt-3 text-sm text-muted">
        Sélectionnez au moins deux pièces dans la liste pour les comparer.
      </p>
      <p class="mt-4 text-xs text-muted">
        Caractéristiques issues des données et titres fournisseur. Les valeurs absentes et la compatibilité Europe restent à vérifier. Aucun coût de livraison ou taxe n’est ajouté.
      </p>
    </template>
  </UModal>
</template>
