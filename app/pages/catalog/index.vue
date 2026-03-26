<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { getPaginationRowModel } from '@tanstack/table-core'
import { upperFirst } from 'scule'
import type { DashboardTableColumn, DashboardTableInstance } from '~/types/table'
import { catalogItemTypeColors, catalogItemTypeLabels } from '~~/shared/constants/pos'
import type { CatalogItemRecord } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime } from '~~/shared/utils/pos'

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const toast = useToast()
const table = useTemplateRef<DashboardTableInstance>('table')

const search = ref('')
const activeOnly = ref(false)
const createOpen = ref(false)
const editOpen = ref(false)
const editingItem = ref<CatalogItemRecord | null>(null)
const pagination = ref({
  pageIndex: 0,
  pageSize: 10
})
const sorting = ref([{ id: 'name', desc: false }])
const columnVisibility = ref()

const { data: items, status, refresh } = await useFetch<CatalogItemRecord[]>('/api/catalog-items')

const filteredItems = computed(() => {
  const term = search.value.trim().toLowerCase()

  return (items.value || []).filter((item) => {
    const matchesSearch = !term || [
      item.name,
      item.sku,
      catalogItemTypeLabels[item.type]
    ].some(value => value?.toLowerCase().includes(term))

    const matchesActive = !activeOnly.value || item.isActive

    return matchesSearch && matchesActive
  })
})

const editingItemForm = computed(() => {
  if (!editingItem.value) {
    return undefined
  }

  return {
    name: editingItem.value.name,
    sku: editingItem.value.sku || '',
    type: editingItem.value.type,
    defaultPrice: editingItem.value.defaultPrice,
    vatRate: editingItem.value.vatRate,
    isActive: editingItem.value.isActive,
    isQuickPick: editingItem.value.isQuickPick
  }
})

watch([search, activeOnly], () => {
  pagination.value.pageIndex = 0
})

async function saveItem(payload: {
  name: string
  sku: string
  type: 'product' | 'service' | 'repair_part' | 'labor'
  defaultPrice: number
  vatRate: number
  isActive: boolean
  isQuickPick: boolean
}) {
  if (editingItem.value) {
    await $fetch(`/api/catalog-items/${editingItem.value.id}`, {
      method: 'PATCH',
      body: payload
    })

    toast.add({ title: 'Article mis à jour', color: 'success' })
    editOpen.value = false
    editingItem.value = null
  } else {
    await $fetch('/api/catalog-items', {
      method: 'POST',
      body: payload
    })

    toast.add({ title: 'Article créé', color: 'success' })
    createOpen.value = false
  }

  await refresh()
}

async function removeItem(id: number) {
  await $fetch(`/api/catalog-items/${id}`, { method: 'DELETE' })
  toast.add({ title: 'Article supprimé', color: 'success' })
  await refresh()
}

function getRowItems(item: CatalogItemRecord) {
  return [[{
    label: 'Ouvrir l’article',
    icon: 'i-lucide-arrow-up-right',
    onSelect() {
      navigateTo(`/catalog/${item.id}`)
    }
  }], [{
    label: 'Modification rapide',
    icon: 'i-lucide-pencil',
    onSelect() {
      editingItem.value = item
      editOpen.value = true
    }
  }, {
    label: 'Supprimer',
    icon: 'i-lucide-trash',
    color: 'error',
    onSelect() {
      removeItem(item.id)
    }
  }]]
}

const columns: TableColumn<CatalogItemRecord>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      label: 'Article',
      icon: column.getIsSorted() === 'asc'
        ? 'i-lucide-arrow-up-az'
        : column.getIsSorted() === 'desc'
          ? 'i-lucide-arrow-down-az'
          : 'i-lucide-arrow-up-down',
      class: '-mx-2.5',
      onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
    }),
    cell: ({ row }) => h('div', { class: 'min-w-0' }, [
      h('p', { class: 'font-medium text-highlighted truncate' }, row.original.name),
      h('div', { class: 'mt-1 flex flex-wrap items-center gap-2 text-sm text-toned' }, [
        h('span', { class: 'truncate' }, row.original.sku || 'Aucun SKU'),
        row.original.isQuickPick
          ? h(UBadge, { color: 'primary', variant: 'soft', size: 'sm' }, () => 'Raccourci')
          : null
      ])
    ])
  },
  {
    accessorKey: 'type',
    header: 'Type',
    cell: ({ row }) => h(UBadge, {
      color: catalogItemTypeColors[row.original.type],
      variant: 'subtle'
    }, () => catalogItemTypeLabels[row.original.type])
  },
  {
    accessorKey: 'defaultPrice',
    header: 'Prix TTC',
    cell: ({ row }) => formatCurrency(row.original.defaultPrice)
  },
  {
    accessorKey: 'vatRate',
    header: 'TVA',
    cell: ({ row }) => `${row.original.vatRate}%`
  },
  {
    accessorKey: 'isActive',
    header: 'Statut',
    cell: ({ row }) => h(UBadge, {
      color: row.original.isActive ? 'success' : 'neutral',
      variant: 'subtle'
    }, () => row.original.isActive ? 'Actif' : 'Inactif')
  },
  {
    accessorKey: 'updatedAt',
    header: 'Mis à jour',
    cell: ({ row }) => formatDateTime(row.original.updatedAt)
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
            icon="i-lucide-package-plus"
            label="Article rapide"
            variant="subtle"
            @click="createOpen = true"
          />
          <UButton to="/catalog/new" icon="i-lucide-arrow-up-right" label="Fiche complète" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Rechercher des produits, services ou pièces"
            class="max-w-md"
          />
          <USwitch v-model="activeOnly" label="Actifs seulement" />
        </div>

        <UDropdownMenu
          :items="
            table?.tableApi
              ?.getAllColumns()
              .filter((column: DashboardTableColumn) => column.getCanHide())
              .map((column: DashboardTableColumn) => ({
                label: ({
                  name: 'Article',
                  type: 'Type',
                  defaultPrice: 'Prix TTC',
                  vatRate: 'TVA',
                  isActive: 'Statut',
                  updatedAt: 'Mis à jour',
                  actions: 'Actions'
                } as Record<string, string>)[column.id] || upperFirst(column.id),
                type: 'checkbox' as const,
                checked: column.getIsVisible(),
                onUpdateChecked(checked: boolean) {
                  table?.tableApi?.getColumn(column.id)?.toggleVisibility(!!checked)
                },
                onSelect(e?: Event) {
                  e?.preventDefault()
                }
              }))
          "
          :content="{ align: 'end' }"
        >
          <UButton
            label="Colonnes"
            color="neutral"
            variant="outline"
            trailing-icon="i-lucide-settings-2"
          />
        </UDropdownMenu>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <div class="grid gap-4 md:grid-cols-3">
          <PosSummaryCard title="Articles" :value="String(items?.length || 0)" icon="i-lucide-package-search" />
          <PosSummaryCard title="Visibles" :value="String(filteredItems.length)" icon="i-lucide-filter" />
          <PosSummaryCard title="Actifs" :value="String((items || []).filter(item => item.isActive).length)" icon="i-lucide-badge-check" />
        </div>

        <UTable
          ref="table"
          v-model:pagination="pagination"
          v-model:sorting="sorting"
          v-model:column-visibility="columnVisibility"
          :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
          :data="filteredItems"
          :columns="columns"
          sticky="header"
          :loading="status === 'pending'"
          class="shrink-0"
          :ui="{
            base: 'table-fixed border-separate border-spacing-0',
            thead: '[&>tr]:bg-elevated/60 [&>tr]:after:content-none',
            tbody: '[&>tr]:last:[&>td]:border-b-0',
            th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
            td: 'border-b border-default align-top',
            separator: 'h-0'
          }"
          @select="(_, row) => navigateTo(`/catalog/${row.original.id}`)"
        >
          <template #empty>
            <UEmpty
              icon="i-lucide-package-search"
              title="Aucun article trouvé"
              description="Créez un article ou ajustez les filtres actuels."
            />
          </template>
        </UTable>

        <div class="flex items-center justify-between gap-3 border-t border-default pt-4">
          <p class="text-sm text-toned">
            {{ table?.tableApi?.getFilteredRowModel().rows.length || filteredItems.length }} article(s)
          </p>

          <UPagination
            :default-page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
            :items-per-page="table?.tableApi?.getState().pagination.pageSize"
            :total="table?.tableApi?.getFilteredRowModel().rows.length || filteredItems.length"
            @update:page="(page: number) => table?.tableApi?.setPageIndex(page - 1)"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <PosCatalogItemSlideover
    v-model:open="createOpen"
    title="Article rapide"
    description="Ajoutez un produit, service, pièce ou poste de main-d’œuvre sans quitter la liste."
    submit-label="Créer l’article"
    @save="saveItem"
  />

  <PosCatalogItemSlideover
    v-model:open="editOpen"
    title="Modifier l’article"
    description="Ajustez le prix TTC, la TVA ou la disponibilité directement depuis la liste opérateur."
    submit-label="Enregistrer les modifications"
    :initial-value="editingItemForm"
    @save="saveItem"
  />
</template>
