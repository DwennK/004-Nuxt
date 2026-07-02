<script setup lang="ts">
import type { TableColumn, TabsItem } from '@nuxt/ui'
import type { LocationQueryValue } from 'vue-router'
import type {
  CatalogItemInput,
  CatalogItemListResponse,
  CatalogItemRecord,
  CatalogItemType
} from '~~/shared/types/pos'
import {
  catalogArticleCategories,
  catalogRepairCategories,
  catalogServiceCategories
} from '~~/shared/constants/pos'
import { formatCurrency } from '~~/shared/utils/pos'

type CatalogView = 'articles' | 'repairs' | 'services'
const ALL_CATEGORIES = '__all__'

const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const route = useRoute()
const router = useRouter()
const confirmDelete = useConfirmDelete()
const runApiAction = useApiAction()

const activeView = ref<CatalogView>('articles')
const createOpen = ref(false)
const editOpen = ref(false)
const editingItem = ref<CatalogItemRecord | null>(null)
const createType = ref<CatalogItemType>('product')

const articleSearch = ref('')
const repairSearch = ref('')
const serviceSearch = ref('')
const debouncedArticleSearch = refDebounced(articleSearch, 250)
const debouncedRepairSearch = refDebounced(repairSearch, 250)
const debouncedServiceSearch = refDebounced(serviceSearch, 250)
const articleCategory = ref(ALL_CATEGORIES)
const repairCategory = ref(ALL_CATEGORIES)
const serviceCategory = ref(ALL_CATEGORIES)
const articleActiveOnly = ref(false)
const repairActiveOnly = ref(false)
const serviceActiveOnly = ref(false)

const articlePagination = ref({ pageIndex: 0, pageSize: 50 })
const repairPagination = ref({ pageIndex: 0, pageSize: 50 })
const servicePagination = ref({ pageIndex: 0, pageSize: 50 })

function buildQuery(
  type: CatalogItemType,
  search: string,
  category: string,
  activeOnly: boolean,
  pagination: { pageIndex: number, pageSize: number }
) {
  return {
    type,
    search: search.trim() || undefined,
    category: category === ALL_CATEGORIES ? undefined : category,
    activeOnly: activeOnly || undefined,
    page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize
  }
}

const articleQuery = computed(() => buildQuery('product', debouncedArticleSearch.value, articleCategory.value, articleActiveOnly.value, articlePagination.value))
const repairQuery = computed(() => buildQuery('repair', debouncedRepairSearch.value, repairCategory.value, repairActiveOnly.value, repairPagination.value))
const serviceQuery = computed(() => buildQuery('service', debouncedServiceSearch.value, serviceCategory.value, serviceActiveOnly.value, servicePagination.value))

const [
  { data: articleResponse, status: articleStatus, refresh: refreshArticles },
  { data: repairResponse, status: repairStatus, refresh: refreshRepairs },
  { data: serviceResponse, status: serviceStatus, refresh: refreshServices }
] = await Promise.all([
  useFetch<CatalogItemListResponse>('/api/catalog-items', { query: articleQuery, key: 'catalog-articles', lazy: true }),
  useFetch<CatalogItemListResponse>('/api/catalog-items', { query: repairQuery, key: 'catalog-repairs', lazy: true }),
  useFetch<CatalogItemListResponse>('/api/catalog-items', { query: serviceQuery, key: 'catalog-services', lazy: true })
])

async function refresh() {
  await Promise.all([refreshArticles(), refreshRepairs(), refreshServices()])
}

const articleItems = computed(() => articleResponse.value?.items || [])
const repairItems = computed(() => repairResponse.value?.items || [])
const serviceItems = computed(() => serviceResponse.value?.items || [])
const articleTotal = computed(() => articleResponse.value?.total || 0)
const repairTotal = computed(() => repairResponse.value?.total || 0)
const serviceTotal = computed(() => serviceResponse.value?.total || 0)
const articleTotalPages = computed(() => Math.max(Math.ceil(articleTotal.value / articlePagination.value.pageSize), 1))
const repairTotalPages = computed(() => Math.max(Math.ceil(repairTotal.value / repairPagination.value.pageSize), 1))
const serviceTotalPages = computed(() => Math.max(Math.ceil(serviceTotal.value / servicePagination.value.pageSize), 1))

const tabItems: TabsItem[] = [
  {
    label: 'Articles',
    icon: 'i-lucide-package',
    value: 'articles',
    slot: 'articles'
  },
  {
    label: 'Réparations',
    icon: 'i-lucide-wrench',
    value: 'repairs',
    slot: 'repairs'
  },
  {
    label: 'Services',
    icon: 'i-lucide-briefcase-business',
    value: 'services',
    slot: 'services'
  }
]

function getQueryValue(
  value: LocationQueryValue | LocationQueryValue[] | undefined
) {
  return Array.isArray(value) ? value[0] : value
}

function replaceCatalogQuery(updates: Record<string, string | null>) {
  const nextQuery = Object.fromEntries(
    Object.entries({
      ...route.query,
      ...updates
    }).filter(([, value]) => value !== null)
  )

  return router.replace({ query: nextQuery })
}

function getViewType(view: CatalogView) {
  if (view === 'articles') {
    return 'product'
  }

  return view === 'repairs' ? 'repair' : 'service'
}

function getViewForItem(item: CatalogItemRecord): CatalogView {
  if (item.type === 'product') {
    return 'articles'
  }

  return item.type === 'repair' ? 'repairs' : 'services'
}

function getCreateUpdateTitle(
  type: CatalogItemType,
  action: 'created' | 'updated' | 'deleted'
) {
  if (type === 'product') {
    return action === 'deleted'
      ? 'Article supprimé'
      : action === 'updated'
        ? 'Article mis à jour'
        : 'Article créé'
  }

  if (type === 'repair') {
    return action === 'deleted'
      ? 'Réparation supprimée'
      : action === 'updated'
        ? 'Réparation mise à jour'
        : 'Réparation créée'
  }

  return action === 'deleted'
    ? 'Service supprimé'
    : action === 'updated'
      ? 'Service mis à jour'
      : 'Service créé'
}

function openCreateSlideover(
  view: CatalogView = activeView.value,
  options: { syncQuery?: boolean } = {}
) {
  const { syncQuery = true } = options

  activeView.value = view
  createType.value = getViewType(view)
  editingItem.value = null
  editOpen.value = false
  createOpen.value = true

  if (syncQuery) {
    void replaceCatalogQuery({ create: '1', edit: null })
  }
}

function openEditSlideover(
  item: CatalogItemRecord,
  options: { syncQuery?: boolean } = {}
) {
  const { syncQuery = true } = options

  activeView.value = getViewForItem(item)
  editingItem.value = item
  createOpen.value = false
  editOpen.value = true

  if (syncQuery) {
    void replaceCatalogQuery({ edit: String(item.id), create: null })
  }
}

function buildCategoryOptions(base: readonly string[]) {
  return [
    { label: 'Toutes les catégories', value: ALL_CATEGORIES },
    ...Array.from(new Set(base))
      .filter(Boolean)
      .sort()
      .map(value => ({ label: value, value }))
  ]
}

const articleCategoryOptions = computed(() => buildCategoryOptions(catalogArticleCategories))
const repairCategoryOptions = computed(() => buildCategoryOptions(catalogRepairCategories))
const serviceCategoryOptions = computed(() => buildCategoryOptions(catalogServiceCategories))

const createInitialValue = computed<Partial<CatalogItemInput>>(() => ({
  type: createType.value,
  category: activeView.value === 'services'
    ? 'Diagnostic'
    : activeView.value === 'repairs'
      ? 'iPhone'
      : 'Autre',
  brand: null,
  model: null,
  serviceKind: null,
  keywords: []
}))

const editingItemForm = computed(() => {
  if (!editingItem.value) {
    return undefined
  }

  return {
    name: editingItem.value.name,
    sku: editingItem.value.sku,
    type: editingItem.value.type,
    category: editingItem.value.category,
    brand: editingItem.value.brand,
    model: editingItem.value.model,
    serviceKind: editingItem.value.serviceKind,
    keywords: editingItem.value.keywords,
    defaultPrice: editingItem.value.defaultPrice,
    vatRate: editingItem.value.vatRate,
    isActive: editingItem.value.isActive
  }
})

const articleColumns: TableColumn<CatalogItemRecord>[] = [
  {
    accessorKey: 'name',
    header: 'Article',
    cell: ({ row }) =>
      h('div', { class: 'min-w-0 leading-tight' }, [
        h(
          'p',
          { class: 'truncate font-medium text-highlighted' },
          row.original.name
        ),
        h(
          'p',
          { class: 'truncate text-xs text-toned' },
          row.original.sku || 'Sans SKU'
        )
      ])
  },
  {
    accessorKey: 'category',
    header: 'Catégorie',
    cell: ({ row }) =>
      h(UBadge, {
        color: 'neutral',
        variant: 'subtle',
        label: row.original.category
      })
  },
  {
    accessorKey: 'defaultPrice',
    header: 'Prix TTC',
    cell: ({ row }) => formatCurrency(row.original.defaultPrice)
  },
  {
    accessorKey: 'isActive',
    header: 'Statut',
    cell: ({ row }) =>
      h(
        'span',
        {
          class: row.original.isActive
            ? 'text-sm font-medium text-success'
            : 'text-sm font-medium text-toned'
        },
        row.original.isActive ? 'Actif' : 'Inactif'
      )
  },
  {
    accessorKey: 'updatedAt',
    header: 'Mis à jour',
    cell: ({ row }) =>
      new Intl.DateTimeFormat('fr-CH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(new Date(row.original.updatedAt))
  },
  {
    id: 'actions',
    cell: ({ row }) =>
      h(
        'div',
        { class: 'text-right' },
        h(
          UDropdownMenu,
          {
            content: { align: 'end' },
            items: getRowItems(row.original)
          },
          () =>
            h(UButton, {
              'icon': 'i-lucide-ellipsis-vertical',
              'color': 'neutral',
              'variant': 'ghost',
              'aria-label': 'Actions de la ligne'
            })
        )
      )
  }
]

const repairColumns: TableColumn<CatalogItemRecord>[] = [
  {
    accessorKey: 'name',
    header: 'Réparation',
    cell: ({ row }) =>
      h('div', { class: 'min-w-0 leading-tight' }, [
        h(
          'p',
          { class: 'truncate font-medium text-highlighted' },
          row.original.name
        ),
        h(
          'p',
          { class: 'truncate text-xs text-toned' },
          row.original.serviceKind || 'Intervention non précisée'
        )
      ])
  },
  {
    accessorKey: 'category',
    header: 'Catégorie',
    cell: ({ row }) =>
      h(UBadge, {
        color: 'neutral',
        variant: 'subtle',
        label: row.original.category
      })
  },
  {
    accessorKey: 'device',
    header: 'Appareil',
    cell: ({ row }) =>
      row.original.model || row.original.brand || 'Réparation générique'
  },
  {
    accessorKey: 'defaultPrice',
    header: 'Prix TTC',
    cell: ({ row }) => formatCurrency(row.original.defaultPrice)
  },
  {
    accessorKey: 'isActive',
    header: 'Statut',
    cell: ({ row }) =>
      h(
        'span',
        {
          class: row.original.isActive
            ? 'text-sm font-medium text-success'
            : 'text-sm font-medium text-toned'
        },
        row.original.isActive ? 'Actif' : 'Inactif'
      )
  },
  {
    accessorKey: 'updatedAt',
    header: 'Mis à jour',
    cell: ({ row }) =>
      new Intl.DateTimeFormat('fr-CH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(new Date(row.original.updatedAt))
  },
  {
    id: 'actions',
    cell: ({ row }) =>
      h(
        'div',
        { class: 'text-right' },
        h(
          UDropdownMenu,
          {
            content: { align: 'end' },
            items: getRowItems(row.original)
          },
          () =>
            h(UButton, {
              'icon': 'i-lucide-ellipsis-vertical',
              'color': 'neutral',
              'variant': 'ghost',
              'aria-label': 'Actions de la ligne'
            })
        )
      )
  }
]

const serviceColumns: TableColumn<CatalogItemRecord>[] = [
  {
    accessorKey: 'name',
    header: 'Service',
    cell: ({ row }) =>
      h('div', { class: 'min-w-0 leading-tight' }, [
        h(
          'p',
          { class: 'truncate font-medium text-highlighted' },
          row.original.name
        ),
        h(
          'p',
          { class: 'truncate text-xs text-toned' },
          row.original.serviceKind || 'Service générique'
        )
      ])
  },
  {
    accessorKey: 'category',
    header: 'Catégorie',
    cell: ({ row }) =>
      h(UBadge, {
        color: 'neutral',
        variant: 'subtle',
        label: row.original.category
      })
  },
  {
    accessorKey: 'defaultPrice',
    header: 'Prix TTC',
    cell: ({ row }) => formatCurrency(row.original.defaultPrice)
  },
  {
    accessorKey: 'isActive',
    header: 'Statut',
    cell: ({ row }) =>
      h(
        'span',
        {
          class: row.original.isActive
            ? 'text-sm font-medium text-success'
            : 'text-sm font-medium text-toned'
        },
        row.original.isActive ? 'Actif' : 'Inactif'
      )
  },
  {
    accessorKey: 'updatedAt',
    header: 'Mis à jour',
    cell: ({ row }) =>
      new Intl.DateTimeFormat('fr-CH', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      }).format(new Date(row.original.updatedAt))
  },
  {
    id: 'actions',
    cell: ({ row }) =>
      h(
        'div',
        { class: 'text-right' },
        h(
          UDropdownMenu,
          {
            content: { align: 'end' },
            items: getRowItems(row.original)
          },
          () =>
            h(UButton, {
              'icon': 'i-lucide-ellipsis-vertical',
              'color': 'neutral',
              'variant': 'ghost',
              'aria-label': 'Actions de la ligne'
            })
        )
      )
  }
]

async function saveItem(payload: CatalogItemInput) {
  if (editingItem.value) {
    const result = await runApiAction(
      () => $fetch(`/api/catalog-items/${editingItem.value!.id}`, {
        method: 'PATCH',
        body: payload
      }),
      { success: getCreateUpdateTitle(payload.type, 'updated'), errorTitle: 'Mise à jour impossible' }
    )

    if (!result.ok) {
      return
    }

    editOpen.value = false
    editingItem.value = null
  } else {
    const result = await runApiAction(
      () => $fetch('/api/catalog-items', {
        method: 'POST',
        body: payload
      }),
      { success: getCreateUpdateTitle(payload.type, 'created'), errorTitle: 'Création impossible' }
    )

    if (!result.ok) {
      return
    }

    createOpen.value = false
  }

  await refresh()
}

async function removeItem(item: CatalogItemRecord) {
  const confirmed = await confirmDelete({
    title: `Supprimer "${item.name}" ?`,
    description: 'L’élément sera définitivement retiré du catalogue.'
  })

  if (!confirmed) {
    return
  }

  const result = await runApiAction(
    () => $fetch(`/api/catalog-items/${item.id}`, { method: 'DELETE' }),
    { success: getCreateUpdateTitle(item.type, 'deleted'), errorTitle: 'Suppression impossible' }
  )

  if (result.ok) {
    await refresh()
  }
}

function getRowItems(item: CatalogItemRecord) {
  const label = item.type === 'product'
    ? 'l’article'
    : item.type === 'repair'
      ? 'la réparation'
      : 'le service'

  return [
    [
      {
        label: `Modifier ${label}`,
        icon: 'i-lucide-pencil',
        onSelect() {
          openEditSlideover(item)
        }
      },
      {
        label: 'Supprimer',
        icon: 'i-lucide-trash',
        color: 'error',
        onSelect() {
          removeItem(item)
        }
      }
    ]
  ]
}

watch([debouncedArticleSearch, articleCategory, articleActiveOnly], () => {
  articlePagination.value.pageIndex = 0
})

watch([debouncedRepairSearch, repairCategory, repairActiveOnly], () => {
  repairPagination.value.pageIndex = 0
})

watch([debouncedServiceSearch, serviceCategory, serviceActiveOnly], () => {
  servicePagination.value.pageIndex = 0
})

async function fetchItemById(itemId: number) {
  try {
    return await $fetch<CatalogItemRecord>(`/api/catalog-items/${itemId}`)
  } catch {
    return null
  }
}

watch(
  [() => route.query.edit, () => route.query.create],
  async () => {
    const createQuery = getQueryValue(route.query.create)
    const editQuery = getQueryValue(route.query.edit)

    if (createQuery) {
      openCreateSlideover(activeView.value, { syncQuery: false })
      return
    }

    if (editQuery) {
      const numericId = Number(editQuery)
      const item = Number.isFinite(numericId) ? await fetchItemById(numericId) : null

      if (item) {
        openEditSlideover(item, { syncQuery: false })
        return
      }

      createOpen.value = false
      editOpen.value = false
      editingItem.value = null
      void replaceCatalogQuery({ edit: null })
      return
    }

    createOpen.value = false
    editOpen.value = false
    editingItem.value = null
  },
  { immediate: true }
)

watch(createOpen, (open) => {
  if (!open && getQueryValue(route.query.create)) {
    void replaceCatalogQuery({ create: null })
  }
})

watch(editOpen, (open) => {
  if (!open) {
    editingItem.value = null
  }

  if (!open && getQueryValue(route.query.edit)) {
    void replaceCatalogQuery({ edit: null })
  }
})
</script>

<template>
  <UDashboardPanel id="catalog-list">
    <template #header>
      <UDashboardNavbar title="Catalogue">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            :icon="
              activeView === 'articles'
                ? 'i-lucide-package-plus'
                : activeView === 'repairs'
                  ? 'i-lucide-wrench'
                  : 'i-lucide-briefcase-business'
            "
            :label="
              activeView === 'articles'
                ? 'Nouvel article'
                : activeView === 'repairs'
                  ? 'Nouvelle réparation'
                  : 'Nouveau service'
            "
            variant="subtle"
            @click="openCreateSlideover(activeView)"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <div class="grid gap-4 md:grid-cols-3">
          <PosSummaryCard
            title="Articles"
            :value="String(articleTotal)"
            icon="i-lucide-package-search"
          />
          <PosSummaryCard
            title="Réparations"
            :value="String(repairTotal)"
            icon="i-lucide-wrench"
          />
          <PosSummaryCard
            title="Services"
            :value="String(serviceTotal)"
            icon="i-lucide-briefcase-business"
          />
        </div>

        <UTabs
          v-model="activeView"
          :items="tabItems"
          variant="pill"
          :ui="{
            list: 'w-full'
          }"
        >
          <template #articles>
            <div class="space-y-4">
              <UDashboardToolbar
                class="flex flex-wrap items-center justify-between gap-3"
              >
                <div class="flex flex-wrap items-center gap-3">
                  <UInput
                    v-model="articleSearch"
                    icon="i-lucide-search"
                    placeholder="Rechercher des articles"
                    class="max-w-md"
                  />
                  <USelect
                    v-model="articleCategory"
                    :items="articleCategoryOptions"
                    value-key="value"
                    class="min-w-52"
                  />
                  <USwitch
                    v-model="articleActiveOnly"
                    label="Actifs seulement"
                  />
                </div>
              </UDashboardToolbar>

              <UTable
                :data="articleItems"
                :columns="articleColumns"
                sticky="header"
                :loading="articleStatus === 'pending'"
                class="shrink-0"
                :ui="{
                  base: 'table-fixed border-separate border-spacing-0',
                  thead: '[&>tr]:bg-elevated/60 [&>tr]:after:content-none',
                  tbody: '[&>tr]:last:[&>td]:border-b-0',
                  th: 'py-1.5 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r text-xs',
                  td: 'border-b border-default py-2 align-middle text-sm',
                  separator: 'h-0'
                }"
                @select="(_, row) => openEditSlideover(row.original)"
              >
                <template #empty>
                  <div v-if="articleStatus === 'pending'" class="space-y-3 px-4 py-6">
                    <USkeleton v-for="index in 5" :key="index" class="h-10 w-full" />
                  </div>
                  <UEmpty
                    v-else
                    icon="i-lucide-package-search"
                    title="Aucun article trouvé"
                    description="Ajoutez un article ou ajustez les filtres actuels."
                  />
                </template>
              </UTable>

              <div
                class="flex items-center justify-between gap-3 border-t border-default pt-4"
              >
                <p class="text-sm text-toned">
                  {{ articleTotal }} article(s) · page {{ articlePagination.pageIndex + 1 }} / {{ articleTotalPages }}
                </p>

                <UPagination
                  :page="articlePagination.pageIndex + 1"
                  :items-per-page="articlePagination.pageSize"
                  :total="articleTotal"
                  @update:page="(page: number) => { articlePagination.pageIndex = page - 1 }"
                />
              </div>
            </div>
          </template>

          <template #repairs>
            <div class="space-y-4">
              <UDashboardToolbar
                class="flex flex-wrap items-center justify-between gap-3"
              >
                <div class="flex flex-wrap items-center gap-3">
                  <UInput
                    v-model="repairSearch"
                    icon="i-lucide-search"
                    placeholder="Rechercher des réparations"
                    class="max-w-md"
                  />
                  <USelect
                    v-model="repairCategory"
                    :items="repairCategoryOptions"
                    value-key="value"
                    class="min-w-52"
                  />
                  <USwitch
                    v-model="repairActiveOnly"
                    label="Actives seulement"
                  />
                </div>
              </UDashboardToolbar>

              <UTable
                :data="repairItems"
                :columns="repairColumns"
                sticky="header"
                :loading="repairStatus === 'pending'"
                class="shrink-0"
                :ui="{
                  base: 'table-fixed border-separate border-spacing-0',
                  thead: '[&>tr]:bg-elevated/60 [&>tr]:after:content-none',
                  tbody: '[&>tr]:last:[&>td]:border-b-0',
                  th: 'py-1.5 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r text-xs',
                  td: 'border-b border-default py-2 align-middle text-sm',
                  separator: 'h-0'
                }"
                @select="(_, row) => openEditSlideover(row.original)"
              >
                <template #empty>
                  <div v-if="repairStatus === 'pending'" class="space-y-3 px-4 py-6">
                    <USkeleton v-for="index in 5" :key="index" class="h-10 w-full" />
                  </div>
                  <UEmpty
                    v-else
                    icon="i-lucide-wrench"
                    title="Aucune réparation trouvée"
                    description="Créez une réparation atelier ou ajustez les filtres actuels."
                  />
                </template>
              </UTable>

              <div
                class="flex items-center justify-between gap-3 border-t border-default pt-4"
              >
                <p class="text-sm text-toned">
                  {{ repairTotal }} réparation(s) · page {{ repairPagination.pageIndex + 1 }} / {{ repairTotalPages }}
                </p>

                <UPagination
                  :page="repairPagination.pageIndex + 1"
                  :items-per-page="repairPagination.pageSize"
                  :total="repairTotal"
                  @update:page="(page: number) => { repairPagination.pageIndex = page - 1 }"
                />
              </div>
            </div>
          </template>

          <template #services>
            <div class="space-y-4">
              <UDashboardToolbar
                class="flex flex-wrap items-center justify-between gap-3"
              >
                <div class="flex flex-wrap items-center gap-3">
                  <UInput
                    v-model="serviceSearch"
                    icon="i-lucide-search"
                    placeholder="Rechercher des services"
                    class="max-w-md"
                  />
                  <USelect
                    v-model="serviceCategory"
                    :items="serviceCategoryOptions"
                    value-key="value"
                    class="min-w-52"
                  />
                  <USwitch
                    v-model="serviceActiveOnly"
                    label="Actifs seulement"
                  />
                </div>
              </UDashboardToolbar>

              <UTable
                :data="serviceItems"
                :columns="serviceColumns"
                sticky="header"
                :loading="serviceStatus === 'pending'"
                class="shrink-0"
                :ui="{
                  base: 'table-fixed border-separate border-spacing-0',
                  thead: '[&>tr]:bg-elevated/60 [&>tr]:after:content-none',
                  tbody: '[&>tr]:last:[&>td]:border-b-0',
                  th: 'py-1.5 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r text-xs',
                  td: 'border-b border-default py-2 align-middle text-sm',
                  separator: 'h-0'
                }"
                @select="(_, row) => openEditSlideover(row.original)"
              >
                <template #empty>
                  <div v-if="serviceStatus === 'pending'" class="space-y-3 px-4 py-6">
                    <USkeleton v-for="index in 5" :key="index" class="h-10 w-full" />
                  </div>
                  <UEmpty
                    v-else
                    icon="i-lucide-briefcase-business"
                    title="Aucun service trouvé"
                    description="Créez un service ou ajustez les filtres actuels."
                  />
                </template>
              </UTable>

              <div
                class="flex items-center justify-between gap-3 border-t border-default pt-4"
              >
                <p class="text-sm text-toned">
                  {{ serviceTotal }} service(s) · page {{ servicePagination.pageIndex + 1 }} / {{ serviceTotalPages }}
                </p>

                <UPagination
                  :page="servicePagination.pageIndex + 1"
                  :items-per-page="servicePagination.pageSize"
                  :total="serviceTotal"
                  @update:page="(page: number) => { servicePagination.pageIndex = page - 1 }"
                />
              </div>
            </div>
          </template>
        </UTabs>
      </div>
    </template>
  </UDashboardPanel>

  <PosCatalogItemSlideover
    v-model:open="createOpen"
    :title="
      createType === 'repair'
        ? 'Nouvelle réparation'
        : createType === 'service'
          ? 'Nouveau service'
          : 'Nouvel article'
    "
    :description="
      createType === 'repair'
        ? 'Ajoutez une réparation structurée pour la recherche atelier et les tickets.'
        : createType === 'service'
          ? 'Ajoutez un service structuré pour les opérations génériques.'
          : 'Ajoutez un article vendu tel quel sans quitter la liste.'
    "
    :submit-label="
      createType === 'repair'
        ? 'Créer la réparation'
        : createType === 'service'
          ? 'Créer le service'
          : 'Créer l’article'
    "
    :initial-value="createInitialValue"
    @save="saveItem"
  />

  <PosCatalogItemSlideover
    v-model:open="editOpen"
    :title="
      editingItem?.type === 'repair'
        ? 'Modifier la réparation'
        : editingItem?.type === 'service'
          ? 'Modifier le service'
          : 'Modifier l’article'
    "
    :description="
      editingItem?.type === 'service'
        ? 'Ajustez le prix TTC, la structure ou la disponibilité du service directement depuis le catalogue.'
        : editingItem?.type === 'repair'
          ? 'Ajustez le prix TTC, la structure ou la disponibilité de la réparation directement depuis le catalogue.'
          : 'Ajustez le prix TTC, la structure ou la disponibilité directement depuis le catalogue.'
    "
    submit-label="Enregistrer les modifications"
    :initial-value="editingItemForm"
    @save="saveItem"
  />
</template>
