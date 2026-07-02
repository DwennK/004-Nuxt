<script setup lang="ts">
import type { TableColumn, TabsItem } from '@nuxt/ui'
import { upperFirst } from 'scule'
import type { DashboardTableColumn, DashboardTableInstance } from '~/types/table'
import {
  documentStatusColors,
  documentStatusLabels,
  documentTypeLabels
} from '~~/shared/constants/pos'
import type { DocumentListItem, DocumentListResponse, DocumentType } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime, isPayableDocumentType } from '~~/shared/utils/pos'

const UBadge = resolveComponent('UBadge')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const confirmDelete = useConfirmDelete()
const runApiAction = useApiAction()
const route = useRoute()
const router = useRouter()
const table = useTemplateRef<DashboardTableInstance>('table')

const search = ref(typeof route.query.q === 'string' ? route.query.q : '')
const debouncedSearch = refDebounced(search, 250)
const typeFilter = ref<'all' | DocumentListItem['type']>(
  typeof route.query.type === 'string' && route.query.type in documentTypeLabels
    ? route.query.type as DocumentListItem['type']
    : 'all'
)
const statusFilter = ref<'all' | DocumentListItem['status']>(
  typeof route.query.status === 'string' && route.query.status in documentStatusLabels
    ? route.query.status as DocumentListItem['status']
    : 'all'
)
const paymentStateFilter = ref<'all' | 'due'>(route.query.paymentState === 'due' ? 'due' : 'all')
const dateFrom = ref(typeof route.query.dateFrom === 'string' ? route.query.dateFrom : '')
const dateTo = ref(typeof route.query.dateTo === 'string' ? route.query.dateTo : '')
const pagination = ref({
  pageIndex: 0,
  pageSize: 50
})
const columnVisibility = ref()

const tabItems: TabsItem[] = [
  {
    label: 'Tous',
    icon: 'i-lucide-files',
    value: 'all'
  },
  {
    label: documentTypeLabels.quote,
    icon: 'i-lucide-scroll-text',
    value: 'quote'
  },
  {
    label: documentTypeLabels.customer_order,
    icon: 'i-lucide-clipboard-list',
    value: 'customer_order'
  },
  {
    label: documentTypeLabels.invoice,
    icon: 'i-lucide-file-text',
    value: 'invoice'
  }
]

const createDocumentActions: Record<DocumentType, {
  icon: string
  label: string
  to: string
}> = {
  quote: {
    icon: 'i-lucide-scroll-text',
    label: 'Nouveau devis',
    to: '/documents/new?type=quote'
  },
  customer_order: {
    icon: 'i-lucide-clipboard-list',
    label: 'Nouvelle commande',
    to: '/documents/new?type=customer_order'
  },
  invoice: {
    icon: 'i-lucide-file-text',
    label: 'Nouvelle facture',
    to: '/documents/new?type=invoice'
  }
}

const createDocumentAction = computed(() => {
  return typeFilter.value === 'all' ? null : createDocumentActions[typeFilter.value]
})

const statusItems = [
  { label: 'Tous les statuts', value: 'all' },
  ...Object.entries(documentStatusLabels).map(([value, label]) => ({ label, value }))
]

const query = computed(() => ({
  q: debouncedSearch.value.trim() || undefined,
  type: typeFilter.value === 'all' ? undefined : typeFilter.value,
  status: statusFilter.value === 'all' ? undefined : statusFilter.value,
  dateFrom: dateFrom.value || undefined,
  dateTo: dateTo.value || undefined,
  paymentState: paymentStateFilter.value === 'due' ? 'due' : undefined,
  sortBy: paymentStateFilter.value === 'due' ? 'balanceDue' : undefined,
  page: pagination.value.pageIndex + 1,
  pageSize: pagination.value.pageSize
}))

const { data: documentsResponse, status, refresh } = await useFetch<DocumentListResponse>('/api/documents', {
  query,
  lazy: true
})

const documents = computed(() => documentsResponse.value?.items || [])
const totalResults = computed(() => documentsResponse.value?.total || 0)
const totalPages = computed(() => Math.max(Math.ceil(totalResults.value / pagination.value.pageSize), 1))

watch([debouncedSearch, typeFilter, statusFilter, paymentStateFilter, dateFrom, dateTo], () => {
  pagination.value.pageIndex = 0
  router.replace({
    query: {
      ...route.query,
      q: debouncedSearch.value.trim() || undefined,
      type: typeFilter.value === 'all' ? undefined : typeFilter.value,
      status: statusFilter.value === 'all' ? undefined : statusFilter.value,
      paymentState: paymentStateFilter.value === 'due' ? 'due' : undefined,
      dateFrom: dateFrom.value || undefined,
      dateTo: dateTo.value || undefined
    }
  })
})

watch(() => route.query.paymentState, (paymentState) => {
  paymentStateFilter.value = paymentState === 'due' ? 'due' : 'all'
})

watch(totalResults, (total) => {
  const lastPageIndex = Math.max(Math.ceil(total / pagination.value.pageSize) - 1, 0)

  if (pagination.value.pageIndex > lastPageIndex) {
    pagination.value.pageIndex = lastPageIndex
  }
})

const hasActiveFilters = computed(() =>
  !!search.value.trim()
  || typeFilter.value !== 'all'
  || statusFilter.value !== 'all'
  || paymentStateFilter.value !== 'all'
  || !!dateFrom.value
  || !!dateTo.value
)

function resetFilters() {
  search.value = ''
  typeFilter.value = 'all'
  statusFilter.value = 'all'
  paymentStateFilter.value = 'all'
  dateFrom.value = ''
  dateTo.value = ''
}

async function removeDocument(document: DocumentListItem) {
  const confirmed = await confirmDelete({
    title: `Supprimer ${document.documentNumber} ?`,
    description: 'Le document sera définitivement supprimé.'
  })

  if (!confirmed) {
    return
  }

  const result = await runApiAction(
    () => $fetch(`/api/documents/${document.id}`, { method: 'DELETE' }),
    {
      success: 'Document supprimé',
      errorTitle: 'Suppression impossible',
      errorDescription: 'Les documents encaissés doivent être annulés ou corrigés, pas supprimés.'
    }
  )

  if (result.ok) {
    await refresh()
  }
}

function getRowItems(document: DocumentListItem) {
  const groups: Array<Array<{
    label: string
    icon: string
    color?: 'error'
    onSelect: () => void
  }>> = [[{
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
  }]]

  if (document.status !== 'paid' && document.paidAmount <= 0) {
    groups.push([{
      label: 'Supprimer',
      icon: 'i-lucide-trash',
      color: 'error',
      onSelect() {
        removeDocument(document)
      }
    }])
  }

  return groups
}

function getDocumentStatusBadge(status: DocumentListItem['status']) {
  if (status === 'draft' || status === 'cancelled') {
    return {
      label: documentStatusLabels[status],
      color: documentStatusColors[status]
    }
  }

  return null
}

function getBalanceDueClass(document: DocumentListItem) {
  if (!isPayableDocumentType(document.type)) {
    return 'text-toned'
  }

  if (document.balanceDue > 0) {
    return 'font-medium text-warning'
  }

  return 'text-toned'
}

const columns: TableColumn<DocumentListItem>[] = [
  {
    accessorKey: 'documentNumber',
    header: 'Document',
    cell: ({ row }) => {
      const statusBadge = getDocumentStatusBadge(row.original.status)

      return h('div', { class: 'flex items-center gap-2 min-w-0' }, [
        h('p', { class: 'truncate font-medium text-highlighted' }, row.original.documentNumber),
        statusBadge
          ? h(UBadge, { color: statusBadge.color, variant: 'subtle', size: 'sm' }, () => statusBadge.label)
          : null
      ])
    }
  },
  {
    accessorKey: 'customerName',
    header: 'Client',
    cell: ({ row }) => h('div', { class: 'truncate font-medium' }, row.original.customerName)
  },
  {
    accessorKey: 'total',
    header: 'Total TTC',
    cell: ({ row }) => h('div', { class: 'text-right font-medium text-highlighted' }, formatCurrency(row.original.total))
  },
  {
    accessorKey: 'balanceDue',
    header: 'Reste à payer',
    cell: ({ row }) => h('span', {
      class: getBalanceDueClass(row.original)
    }, isPayableDocumentType(row.original.type) ? formatCurrency(row.original.balanceDue) : '—')
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
      () => h(resolveComponent('UButton'), {
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
          <UButton
            v-if="createDocumentAction"
            :to="createDocumentAction.to"
            :icon="createDocumentAction.icon"
            :label="createDocumentAction.label"
          />
        </template>
      </UDashboardNavbar>

      <UTabs
        v-model="typeFilter"
        :items="tabItems"
        value-key="value"
        variant="link"
        :content="false"
        class="w-full border-t border-default px-4 pt-3 sm:px-6"
      />

      <UDashboardToolbar class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Rechercher par document, client ou ticket"
            class="max-w-md"
          />
          <USelectMenu
            v-model="statusFilter"
            :items="statusItems"
            value-key="value"
            class="w-48"
          />
          <UButton
            :label="paymentStateFilter === 'due' ? 'À encaisser' : 'Tous les paiements'"
            :icon="paymentStateFilter === 'due' ? 'i-lucide-wallet-cards' : 'i-lucide-scale'"
            :color="paymentStateFilter === 'due' ? 'warning' : 'neutral'"
            :variant="paymentStateFilter === 'due' ? 'soft' : 'outline'"
            @click="paymentStateFilter = paymentStateFilter === 'due' ? 'all' : 'due'"
          />
          <div class="flex items-center gap-2">
            <span class="text-xs text-toned">Début</span>
            <UInput v-model="dateFrom" type="date" class="w-40" />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-toned">Fin</span>
            <UInput v-model="dateTo" type="date" class="w-40" />
          </div>
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
        <UTable
          ref="table"
          v-model:column-visibility="columnVisibility"
          :data="documents"
          :columns="columns"
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
          @select="(_, row) => navigateTo(`/documents/${row.original.id}`)"
        >
          <template #empty>
            <div v-if="status === 'pending'" class="space-y-3 px-4 py-6">
              <USkeleton v-for="index in 5" :key="index" class="h-10 w-full" />
            </div>
            <UEmpty
              v-else
              icon="i-lucide-files"
              title="Aucun document trouvé"
              description="Ajustez la période ou les filtres pour voir des documents."
            />
          </template>
        </UTable>

        <div class="flex items-center justify-between gap-3 border-t border-default pt-4">
          <p class="text-sm text-toned">
            {{ totalResults }} résultat(s) · page {{ pagination.pageIndex + 1 }} / {{ totalPages }}
          </p>

          <UPagination
            :page="pagination.pageIndex + 1"
            :items-per-page="pagination.pageSize"
            :total="totalResults"
            @update:page="(page: number) => { pagination.pageIndex = page - 1 }"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
