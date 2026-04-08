<script setup lang="ts">
import type { TableColumn, TabsItem } from '@nuxt/ui'
import { getPaginationRowModel } from '@tanstack/table-core'
import type { LocationQueryValue } from 'vue-router'
import type { DashboardTableInstance } from '~/types/table'
import type { CatalogItemInput, CatalogItemRecord, CatalogItemType } from '~~/shared/types/pos'
import {
  catalogArticleCategories,
  catalogServiceCategories
} from '~~/shared/constants/pos'
import { formatCurrency, normalizeSearchText } from '~~/shared/utils/pos'

type CatalogView = 'articles' | 'services'
const ALL_CATEGORIES = '__all__'

const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const route = useRoute()
const router = useRouter()
const toast = useToast()
const articleTable = useTemplateRef<DashboardTableInstance>('articleTable')
const serviceTable = useTemplateRef<DashboardTableInstance>('serviceTable')

const activeView = ref<CatalogView>('articles')
const createOpen = ref(false)
const editOpen = ref(false)
const editingItem = ref<CatalogItemRecord | null>(null)
const createType = ref<CatalogItemType>('product')

const articleSearch = ref('')
const serviceSearch = ref('')
const articleCategory = ref(ALL_CATEGORIES)
const serviceCategory = ref(ALL_CATEGORIES)
const articleActiveOnly = ref(false)
const serviceActiveOnly = ref(false)

const articlePagination = ref({ pageIndex: 0, pageSize: 10 })
const servicePagination = ref({ pageIndex: 0, pageSize: 10 })
const articleSorting = ref([{ id: 'name', desc: false }])
const serviceSorting = ref([{ id: 'name', desc: false }])

const { data: items, status, refresh } = await useFetch<CatalogItemRecord[]>('/api/catalog-items')

const tabItems: TabsItem[] = [
  { label: 'Articles', icon: 'i-lucide-package', value: 'articles', slot: 'articles' },
  { label: 'Prestations', icon: 'i-lucide-wrench', value: 'services', slot: 'services' }
]

function getQueryValue(value: LocationQueryValue | LocationQueryValue[] | undefined) {
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
  return view === 'articles' ? 'product' : 'service'
}

function getViewForItemType(type: CatalogItemType): CatalogView {
  return type === 'product' ? 'articles' : 'services'
}

function openCreateSlideover(view: CatalogView = activeView.value, options: { syncQuery?: boolean } = {}) {
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

function openEditSlideover(item: CatalogItemRecord, options: { syncQuery?: boolean } = {}) {
  const { syncQuery = true } = options

  activeView.value = getViewForItemType(item.type)
  editingItem.value = item
  createOpen.value = false
  editOpen.value = true

  if (syncQuery) {
    void replaceCatalogQuery({ edit: String(item.id), create: null })
  }
}

function filterItems(type: CatalogItemType, search: string, category: string, activeOnly: boolean) {
  const term = normalizeSearchText(search)
  const requestedCategory = category === ALL_CATEGORIES ? '' : category.trim()

  return (items.value || []).filter((item) => {
    if (item.type !== type) {
      return false
    }

    if (activeOnly && !item.isActive) {
      return false
    }

    if (requestedCategory && item.category !== requestedCategory) {
      return false
    }

    if (!term) {
      return true
    }

    return [
      item.name,
      item.sku,
      item.category,
      item.brand,
      item.model,
      item.serviceKind,
      item.keywords.join(' ')
    ].some(value => normalizeSearchText(value).includes(term))
  })
}

const articleItems = computed(() => filterItems('product', articleSearch.value, articleCategory.value, articleActiveOnly.value))
const serviceItems = computed(() => filterItems('service', serviceSearch.value, serviceCategory.value, serviceActiveOnly.value))

const articleCategoryOptions = computed(() => {
  const values = new Set([
    ...catalogArticleCategories,
    ...(items.value || []).filter(item => item.type === 'product').map(item => item.category)
  ])

  return [
    { label: 'Toutes les catégories', value: ALL_CATEGORIES },
    ...Array.from(values).filter(Boolean).sort().map(value => ({ label: value, value }))
  ]
})

const serviceCategoryOptions = computed(() => {
  const values = new Set([
    ...catalogServiceCategories,
    ...(items.value || []).filter(item => item.type === 'service').map(item => item.category)
  ])

  return [
    { label: 'Toutes les catégories', value: ALL_CATEGORIES },
    ...Array.from(values).filter(Boolean).sort().map(value => ({ label: value, value }))
  ]
})

const createInitialValue = computed<Partial<CatalogItemInput>>(() => ({
  type: createType.value,
  category: 'Autre',
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
    cell: ({ row }) => h('div', { class: 'min-w-0 leading-tight' }, [
      h('p', { class: 'truncate font-medium text-highlighted' }, row.original.name),
      h('p', { class: 'truncate text-xs text-toned' }, row.original.sku || 'Sans SKU')
    ])
  },
  {
    accessorKey: 'category',
    header: 'Catégorie',
    cell: ({ row }) => h(UBadge, { color: 'neutral', variant: 'subtle', label: row.original.category })
  },
  {
    accessorKey: 'defaultPrice',
    header: 'Prix TTC',
    cell: ({ row }) => formatCurrency(row.original.defaultPrice)
  },
  {
    accessorKey: 'isActive',
    header: 'Statut',
    cell: ({ row }) => h('span', {
      class: row.original.isActive
        ? 'text-sm font-medium text-success'
        : 'text-sm font-medium text-toned'
    }, row.original.isActive ? 'Actif' : 'Inactif')
  },
  {
    accessorKey: 'updatedAt',
    header: 'Mis à jour',
    cell: ({ row }) => new Intl.DateTimeFormat('fr-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date(row.original.updatedAt))
  },
  {
    id: 'actions',
    cell: ({ row }) => h('div', { class: 'text-right' }, h(
      UDropdownMenu,
      {
        content: { align: 'end' },
        items: getRowItems(row.original)
      },
      () => h(UButton, {
        icon: 'i-lucide-ellipsis-vertical',
        color: 'neutral',
        variant: 'ghost'
      })
    ))
  }
]

const serviceColumns: TableColumn<CatalogItemRecord>[] = [
  {
    accessorKey: 'name',
    header: 'Prestation',
    cell: ({ row }) => h('div', { class: 'min-w-0 leading-tight' }, [
      h('p', { class: 'truncate font-medium text-highlighted' }, row.original.name),
      h('p', { class: 'truncate text-xs text-toned' }, row.original.serviceKind || 'Intervention non précisée')
    ])
  },
  {
    accessorKey: 'category',
    header: 'Catégorie',
    cell: ({ row }) => h(UBadge, { color: 'neutral', variant: 'subtle', label: row.original.category })
  },
  {
    accessorKey: 'device',
    header: 'Appareil',
    cell: ({ row }) => row.original.model || row.original.brand || 'Prestation générique'
  },
  {
    accessorKey: 'defaultPrice',
    header: 'Prix TTC',
    cell: ({ row }) => formatCurrency(row.original.defaultPrice)
  },
  {
    accessorKey: 'isActive',
    header: 'Statut',
    cell: ({ row }) => h('span', {
      class: row.original.isActive
        ? 'text-sm font-medium text-success'
        : 'text-sm font-medium text-toned'
    }, row.original.isActive ? 'Actif' : 'Inactif')
  },
  {
    accessorKey: 'updatedAt',
    header: 'Mis à jour',
    cell: ({ row }) => new Intl.DateTimeFormat('fr-CH', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(new Date(row.original.updatedAt))
  },
  {
    id: 'actions',
    cell: ({ row }) => h('div', { class: 'text-right' }, h(
      UDropdownMenu,
      {
        content: { align: 'end' },
        items: getRowItems(row.original)
      },
      () => h(UButton, {
        icon: 'i-lucide-ellipsis-vertical',
        color: 'neutral',
        variant: 'ghost'
      })
    ))
  }
]

async function saveItem(payload: CatalogItemInput) {
  const label = payload.type === 'service' ? 'Prestation' : 'Article'

  if (editingItem.value) {
    await $fetch(`/api/catalog-items/${editingItem.value.id}`, {
      method: 'PATCH',
      body: payload
    })

    toast.add({ title: `${label} mise à jour`, color: 'success' })
    editOpen.value = false
    editingItem.value = null
  } else {
    await $fetch('/api/catalog-items', {
      method: 'POST',
      body: payload
    })

    toast.add({ title: `${label} créée`, color: 'success' })
    createOpen.value = false
  }

  await refresh()
}

async function removeItem(item: CatalogItemRecord) {
  await $fetch(`/api/catalog-items/${item.id}`, { method: 'DELETE' })
  toast.add({
    title: item.type === 'service' ? 'Prestation supprimée' : 'Article supprimé',
    color: 'success'
  })
  await refresh()
}

function getRowItems(item: CatalogItemRecord) {
  const label = item.type === 'service' ? 'la prestation' : 'l’article'

  return [[{
    label: `Modifier ${label}`,
    icon: 'i-lucide-pencil',
    onSelect() {
      openEditSlideover(item)
    }
  }, {
    label: 'Supprimer',
    icon: 'i-lucide-trash',
    color: 'error',
    onSelect() {
      removeItem(item)
    }
  }]]
}

watch([articleSearch, articleCategory, articleActiveOnly], () => {
  articlePagination.value.pageIndex = 0
})

watch([serviceSearch, serviceCategory, serviceActiveOnly], () => {
  servicePagination.value.pageIndex = 0
})

watch([items, () => route.query.edit, () => route.query.create], () => {
  const createQuery = getQueryValue(route.query.create)
  const editQuery = getQueryValue(route.query.edit)

  if (createQuery) {
    openCreateSlideover(activeView.value, { syncQuery: false })
    return
  }

  if (editQuery) {
    const item = (items.value || []).find(candidate => String(candidate.id) === editQuery)

    if (item) {
      openEditSlideover(item, { syncQuery: false })
      return
    }

    if (items.value) {
      createOpen.value = false
      editOpen.value = false
      editingItem.value = null
      void replaceCatalogQuery({ edit: null })
    }
    return
  }

  createOpen.value = false
  editOpen.value = false
  editingItem.value = null
}, { immediate: true })

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
            :icon="activeView === 'services' ? 'i-lucide-wrench' : 'i-lucide-package-plus'"
            :label="activeView === 'services' ? 'Nouvelle prestation' : 'Nouvel article'"
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
            :value="String((items || []).filter(item => item.type === 'product').length)"
            icon="i-lucide-package-search"
          />
          <PosSummaryCard
            title="Prestations"
            :value="String((items || []).filter(item => item.type === 'service').length)"
            icon="i-lucide-wrench"
          />
          <PosSummaryCard
            title="Actifs"
            :value="String((items || []).filter(item => item.isActive).length)"
            icon="i-lucide-badge-check"
          />
        </div>

        <UTabs
          v-model="activeView"
          :items="tabItems"
          variant="link"
          :ui="{ list: 'w-fit rounded-2xl border border-default bg-muted/30 p-1' }"
        >
          <template #articles>
            <div class="space-y-4">
              <UDashboardToolbar class="flex flex-wrap items-center justify-between gap-3">
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
                  <USwitch v-model="articleActiveOnly" label="Actifs seulement" />
                </div>
              </UDashboardToolbar>

              <UTable
                ref="articleTable"
                v-model:pagination="articlePagination"
                v-model:sorting="articleSorting"
                :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
                :data="articleItems"
                :columns="articleColumns"
                sticky="header"
                :loading="status === 'pending'"
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
                  <UEmpty
                    icon="i-lucide-package-search"
                    title="Aucun article trouvé"
                    description="Ajoutez un article ou ajustez les filtres actuels."
                  />
                </template>
              </UTable>

              <div class="flex items-center justify-between gap-3 border-t border-default pt-4">
                <p class="text-sm text-toned">
                  {{ articleTable?.tableApi?.getFilteredRowModel().rows.length || articleItems.length }} article(s)
                </p>

                <UPagination
                  :default-page="(articleTable?.tableApi?.getState().pagination.pageIndex || 0) + 1"
                  :items-per-page="articleTable?.tableApi?.getState().pagination.pageSize"
                  :total="articleTable?.tableApi?.getFilteredRowModel().rows.length || articleItems.length"
                  @update:page="(page: number) => articleTable?.tableApi?.setPageIndex(page - 1)"
                />
              </div>
            </div>
          </template>

          <template #services>
            <div class="space-y-4">
              <UDashboardToolbar class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-3">
                  <UInput
                    v-model="serviceSearch"
                    icon="i-lucide-search"
                    placeholder="Rechercher des prestations"
                    class="max-w-md"
                  />
                  <USelect
                    v-model="serviceCategory"
                    :items="serviceCategoryOptions"
                    value-key="value"
                    class="min-w-52"
                  />
                  <USwitch v-model="serviceActiveOnly" label="Actives seulement" />
                </div>
              </UDashboardToolbar>

              <UTable
                ref="serviceTable"
                v-model:pagination="servicePagination"
                v-model:sorting="serviceSorting"
                :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
                :data="serviceItems"
                :columns="serviceColumns"
                sticky="header"
                :loading="status === 'pending'"
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
                  <UEmpty
                    icon="i-lucide-wrench"
                    title="Aucune prestation trouvée"
                    description="Créez une prestation atelier ou ajustez les filtres actuels."
                  />
                </template>
              </UTable>

              <div class="flex items-center justify-between gap-3 border-t border-default pt-4">
                <p class="text-sm text-toned">
                  {{ serviceTable?.tableApi?.getFilteredRowModel().rows.length || serviceItems.length }} prestation(s)
                </p>

                <UPagination
                  :default-page="(serviceTable?.tableApi?.getState().pagination.pageIndex || 0) + 1"
                  :items-per-page="serviceTable?.tableApi?.getState().pagination.pageSize"
                  :total="serviceTable?.tableApi?.getFilteredRowModel().rows.length || serviceItems.length"
                  @update:page="(page: number) => serviceTable?.tableApi?.setPageIndex(page - 1)"
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
    :title="createType === 'service' ? 'Nouvelle prestation' : 'Nouvel article'"
    :description="createType === 'service'
      ? 'Ajoutez une prestation structurée pour la recherche atelier et les tickets.'
      : 'Ajoutez un article vendu tel quel sans quitter la liste.'"
    :submit-label="createType === 'service' ? 'Créer la prestation' : 'Créer l’article'"
    :initial-value="createInitialValue"
    @save="saveItem"
  />

  <PosCatalogItemSlideover
    v-model:open="editOpen"
    :title="editingItem?.type === 'service' ? 'Modifier la prestation' : 'Modifier l’article'"
    description="Ajustez le prix TTC, la structure ou la disponibilité directement depuis le catalogue."
    submit-label="Enregistrer les modifications"
    :initial-value="editingItemForm"
    @save="saveItem"
  />
</template>
