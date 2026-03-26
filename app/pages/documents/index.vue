<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { getPaginationRowModel } from '@tanstack/table-core'
import { upperFirst } from 'scule'
import type { DashboardTableColumn, DashboardTableInstance } from '~/types/table'
import {
  documentStatusColors,
  documentStatusLabels,
  documentTypeColors,
  documentTypeLabels
} from '~~/shared/constants/pos'
import type { DocumentListItem } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime } from '~~/shared/utils/pos'

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const toast = useToast()
const table = useTemplateRef<DashboardTableInstance>('table')

const search = ref('')
const typeFilter = ref<'all' | DocumentListItem['type']>('all')
const statusFilter = ref<'all' | DocumentListItem['status']>('all')
const dateFilter = ref('')
const pagination = ref({
  pageIndex: 0,
  pageSize: 10
})
const sorting = ref([{ id: 'issuedAt', desc: true }])
const columnVisibility = ref()

const typeItems = [
  { label: 'Tous les types', value: 'all' },
  ...Object.entries(documentTypeLabels).map(([value, label]) => ({ label, value }))
]

const statusItems = [
  { label: 'Tous les statuts', value: 'all' },
  ...Object.entries(documentStatusLabels).map(([value, label]) => ({ label, value }))
]

const { data: documents, status, refresh } = await useFetch<DocumentListItem[]>('/api/documents')

const filteredDocuments = computed(() => {
  const term = search.value.trim().toLowerCase()

  return (documents.value || []).filter((document) => {
    const matchesSearch = !term || [
      document.documentNumber,
      document.customerName,
      document.ticketNumber
    ].some(value => value?.toLowerCase().includes(term))

    const matchesType = typeFilter.value === 'all' || document.type === typeFilter.value
    const matchesStatus = statusFilter.value === 'all' || document.status === statusFilter.value
    const matchesDate = !dateFilter.value || toDateInputValue(new Date(document.issuedAt)) === dateFilter.value

    return matchesSearch && matchesType && matchesStatus && matchesDate
  })
})

watch([search, typeFilter, statusFilter, dateFilter], () => {
  pagination.value.pageIndex = 0
})

const hasActiveFilters = computed(() =>
  !!search.value.trim()
  || typeFilter.value !== 'all'
  || statusFilter.value !== 'all'
  || !!dateFilter.value
)

function resetFilters() {
  search.value = ''
  typeFilter.value = 'all'
  statusFilter.value = 'all'
  dateFilter.value = ''
}

async function removeDocument(id: number) {
  await $fetch(`/api/documents/${id}`, { method: 'DELETE' })
  toast.add({ title: 'Document supprimé', color: 'success' })
  await refresh()
}

function getRowItems(document: DocumentListItem) {
  return [[{
    label: 'Ouvrir le document',
    icon: 'i-lucide-arrow-up-right',
    onSelect() {
      navigateTo(`/documents/${document.id}`)
    }
  }, {
    label: 'Aperçu imprimable',
    icon: 'i-lucide-printer',
    onSelect() {
      navigateTo(`/documents/${document.id}/print`)
    }
  }], [{
    label: 'Supprimer',
    icon: 'i-lucide-trash',
    color: 'error',
    onSelect() {
      removeDocument(document.id)
    }
  }]]
}

const columns: TableColumn<DocumentListItem>[] = [
  {
    accessorKey: 'documentNumber',
    header: ({ column }) => h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      label: 'Document',
      icon: column.getIsSorted() === 'asc'
        ? 'i-lucide-arrow-up-az'
        : column.getIsSorted() === 'desc'
          ? 'i-lucide-arrow-down-az'
          : 'i-lucide-arrow-up-down',
      class: '-mx-2.5',
      onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
    }),
    cell: ({ row }) => h('div', { class: 'space-y-1' }, [
      h('p', { class: 'font-medium text-highlighted' }, row.original.documentNumber),
      h('div', { class: 'flex flex-wrap gap-2' }, [
        h(UBadge, { color: documentTypeColors[row.original.type], variant: 'subtle' }, () => documentTypeLabels[row.original.type]),
        h(UBadge, { color: documentStatusColors[row.original.status], variant: 'subtle' }, () => documentStatusLabels[row.original.status])
      ])
    ])
  },
  {
    accessorKey: 'customerName',
    header: 'Client',
    cell: ({ row }) => h('div', { class: 'min-w-0' }, [
      h('p', { class: 'font-medium truncate' }, row.original.customerName),
      h('p', { class: 'text-sm text-toned truncate' }, row.original.ticketNumber || 'Vente directe / autonome')
    ])
  },
  {
    accessorKey: 'total',
    header: 'Total TTC',
    cell: ({ row }) => h('div', { class: 'space-y-1 text-right' }, [
      h('p', { class: 'font-medium text-highlighted' }, formatCurrency(row.original.total)),
      h('p', { class: 'text-sm text-toned' }, `Encaissé ${formatCurrency(row.original.paidAmount)}`)
    ])
  },
  {
    accessorKey: 'balanceDue',
    header: 'Reste à payer',
    cell: ({ row }) => formatCurrency(row.original.balanceDue)
  },
  {
    accessorKey: 'issuedAt',
    header: 'Émis le',
    cell: ({ row }) => formatDateTime(row.original.issuedAt)
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
  <UDashboardPanel id="documents-list">
    <template #header>
      <UDashboardNavbar title="Documents">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton to="/documents/new" icon="i-lucide-file-plus-2" label="Facture / reçu direct" />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Rechercher par document, client ou ticket"
            class="max-w-md"
          />
          <USelectMenu
            v-model="typeFilter"
            :items="typeItems"
            value-key="value"
            class="w-48"
          />
          <USelectMenu
            v-model="statusFilter"
            :items="statusItems"
            value-key="value"
            class="w-48"
          />
          <UInput v-model="dateFilter" type="date" class="w-44" />
          <UButton
            v-if="hasActiveFilters"
            color="neutral"
            variant="outline"
            icon="i-lucide-x"
            label="Réinitialiser"
            @click="resetFilters"
          />
        </div>

        <UDropdownMenu
          :items="
            table?.tableApi
              ?.getAllColumns()
              .filter((column: DashboardTableColumn) => column.getCanHide())
              .map((column: DashboardTableColumn) => ({
                label: ({
                  documentNumber: 'Document',
                  customerName: 'Client',
                  total: 'Total TTC',
                  balanceDue: 'Reste à payer',
                  issuedAt: 'Émis le',
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
        <div class="grid gap-4 md:grid-cols-4">
          <PosSummaryCard title="Documents" :value="String(documents?.length || 0)" icon="i-lucide-files" />
          <PosSummaryCard title="Payés" :value="String((documents || []).filter(document => document.status === 'paid').length)" icon="i-lucide-wallet" />
          <PosSummaryCard title="Restant à encaisser" :value="formatCurrency((documents || []).reduce((sum, document) => sum + document.balanceDue, 0))" icon="i-lucide-scale" />
          <PosSummaryCard title="Visibles" :value="String(filteredDocuments.length)" icon="i-lucide-filter" />
        </div>

        <UTable
          ref="table"
          v-model:pagination="pagination"
          v-model:sorting="sorting"
          v-model:column-visibility="columnVisibility"
          :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
          :data="filteredDocuments"
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
          @select="(_, row) => navigateTo(`/documents/${row.original.id}`)"
        >
          <template #empty>
            <UEmpty
              icon="i-lucide-files"
              title="Aucun document trouvé"
              description="Ajustez les filtres ou créez un nouveau document."
            />
          </template>
        </UTable>

        <div class="flex items-center justify-between gap-3 border-t border-default pt-4">
          <p class="text-sm text-toned">
            {{ table?.tableApi?.getFilteredRowModel().rows.length || filteredDocuments.length }} document(s)
          </p>

          <UPagination
            :default-page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
            :items-per-page="table?.tableApi?.getState().pagination.pageSize"
            :total="table?.tableApi?.getFilteredRowModel().rows.length || filteredDocuments.length"
            @update:page="(page: number) => table?.tableApi?.setPageIndex(page - 1)"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
