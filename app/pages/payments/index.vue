<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { getPaginationRowModel } from '@tanstack/table-core'
import { upperFirst } from 'scule'
import type { DashboardTableColumn, DashboardTableInstance } from '~/types/table'
import {
  paymentMethodColors,
  paymentMethodLabels,
  paymentMethods,
  paymentStatusColors,
  paymentStatusLabels
} from '~~/shared/constants/pos'
import type { PaymentListItem } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime, toDateInputValue } from '~~/shared/utils/pos'

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const toast = useToast()
const table = useTemplateRef<DashboardTableInstance>('table')

const search = ref('')
const methodFilter = ref<'all' | PaymentListItem['method']>('all')
const statusFilter = ref<'all' | PaymentListItem['status']>('all')
const dateFrom = ref('')
const dateTo = ref('')
const pagination = ref({
  pageIndex: 0,
  pageSize: 10
})
const sorting = ref([{ id: 'paidAt', desc: true }])
const columnVisibility = ref()

const methodItems = [
  { label: 'Tous les modes', value: 'all' },
  ...paymentMethods.map(method => ({
    label: paymentMethodLabels[method],
    value: method
  }))
]

const statusItems = [
  { label: 'Tous les statuts', value: 'all' },
  ...Object.entries(paymentStatusLabels).map(([value, label]) => ({ label, value }))
]

const { data: payments, status, refresh } = await useFetch<PaymentListItem[]>('/api/payments')

const filteredPayments = computed(() => {
  const term = search.value.trim().toLowerCase()

  return (payments.value || []).filter((payment) => {
    const matchesSearch = !term || [
      payment.customerName,
      payment.documentNumber
    ].some(value => value?.toLowerCase().includes(term))

    const matchesMethod = methodFilter.value === 'all' || payment.method === methodFilter.value
    const matchesStatus = statusFilter.value === 'all' || payment.status === statusFilter.value
    const paymentDate = toDateInputValue(new Date(payment.paidAt))
    const matchesDateFrom = !dateFrom.value || paymentDate >= dateFrom.value
    const matchesDateTo = !dateTo.value || paymentDate <= dateTo.value

    return matchesSearch && matchesMethod && matchesStatus && matchesDateFrom && matchesDateTo
  })
})

watch([search, methodFilter, statusFilter, dateFrom, dateTo], () => {
  pagination.value.pageIndex = 0
})

const hasActiveFilters = computed(() =>
  !!search.value.trim()
  || methodFilter.value !== 'all'
  || statusFilter.value !== 'all'
  || !!dateFrom.value
  || !!dateTo.value
)

function resetFilters() {
  search.value = ''
  methodFilter.value = 'all'
  statusFilter.value = 'all'
  dateFrom.value = ''
  dateTo.value = ''
}

async function removePayment(id: number) {
  await $fetch(`/api/payments/${id}`, { method: 'DELETE' })
  toast.add({ title: 'Paiement supprimé', color: 'success' })
  await refresh()
}

function getRowItems(payment: PaymentListItem) {
  return [[{
    label: 'Ouvrir le document',
    icon: 'i-lucide-arrow-up-right',
    onSelect() {
      navigateTo(`/documents/${payment.documentId}`)
    }
  }], [{
    label: 'Supprimer',
    icon: 'i-lucide-trash',
    color: 'error',
    onSelect() {
      removePayment(payment.id)
    }
  }]]
}

function getCompactPaymentMethodLabel(method: PaymentListItem['method']) {
  if (method === 'bank_transfer') {
    return 'Virement'
  }

  return paymentMethodLabels[method]
}

function getPaymentStatusBadge(status: PaymentListItem['status']) {
  if (status === 'paid') {
    return null
  }

  return {
    label: paymentStatusLabels[status],
    color: paymentStatusColors[status]
  }
}

const columns: TableColumn<PaymentListItem>[] = [
  {
    accessorKey: 'amount',
    header: ({ column }) => h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      label: 'Montant',
      icon: column.getIsSorted() === 'asc'
        ? 'i-lucide-arrow-up-wide-narrow'
        : column.getIsSorted() === 'desc'
          ? 'i-lucide-arrow-down-wide-narrow'
          : 'i-lucide-arrow-up-down',
      class: '-mx-2.5',
      onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
    }),
    cell: ({ row }) => {
      const statusBadge = getPaymentStatusBadge(row.original.status)

      return h('div', { class: 'flex items-center gap-2 min-w-0' }, [
        h('p', { class: 'shrink-0 font-medium text-highlighted' }, formatCurrency(row.original.amount)),
        h(UBadge, {
          color: paymentMethodColors[row.original.method],
          variant: 'subtle',
          size: 'sm'
        }, () => getCompactPaymentMethodLabel(row.original.method)),
        statusBadge
          ? h(UBadge, {
              color: statusBadge.color,
              variant: 'subtle',
              size: 'sm'
            }, () => statusBadge.label)
          : null
      ])
    }
  },
  {
    accessorKey: 'customerName',
    header: 'Client',
    cell: ({ row }) => h('div', { class: 'truncate font-medium' }, row.original.customerName || 'Passage comptoir')
  },
  {
    accessorKey: 'documentType',
    header: 'Document',
    cell: ({ row }) => h('span', { class: 'font-medium text-highlighted' }, row.original.documentNumber)
  },
  {
    accessorKey: 'paidAt',
    header: 'Encaissé à',
    cell: ({ row }) => formatDateTime(row.original.paidAt)
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
  <UDashboardPanel id="payments-list">
    <template #header>
      <UDashboardNavbar title="Paiements">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Rechercher par client ou document"
            class="max-w-md"
          />
          <USelectMenu
            v-model="methodFilter"
            :items="methodItems"
            value-key="value"
            class="w-44"
          />
          <USelectMenu
            v-model="statusFilter"
            :items="statusItems"
            value-key="value"
            class="w-44"
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
                  amount: 'Montant',
                  customerName: 'Client',
                  documentType: 'Document',
                  paidAt: 'Encaissé à',
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
          <PosSummaryCard title="Paiements" :value="String(payments?.length || 0)" icon="i-lucide-wallet" />
          <PosSummaryCard title="Total encaissé" :value="formatCurrency((filteredPayments || []).reduce((sum, payment) => sum + payment.amount, 0))" icon="i-lucide-wallet-cards" />
          <PosSummaryCard title="Espèces" :value="formatCurrency((filteredPayments || []).filter(payment => payment.method === 'cash').reduce((sum, payment) => sum + payment.amount, 0))" icon="i-lucide-banknote" />
          <PosSummaryCard title="Visibles" :value="String(filteredPayments.length)" icon="i-lucide-filter" />
        </div>

        <UTable
          ref="table"
          v-model:pagination="pagination"
          v-model:sorting="sorting"
          v-model:column-visibility="columnVisibility"
          :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
          :data="filteredPayments"
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
          @select="(_, row) => navigateTo(`/documents/${row.original.documentId}`)"
        >
          <template #empty>
            <UEmpty
              icon="i-lucide-wallet"
              title="Aucun paiement trouvé"
              description="Ajustez la période ou les filtres pour voir des résultats."
            />
          </template>
        </UTable>

        <div class="flex items-center justify-between gap-3 border-t border-default pt-4">
          <p class="text-sm text-toned">
            {{ table?.tableApi?.getFilteredRowModel().rows.length || filteredPayments.length }} paiement(s)
          </p>

          <UPagination
            :default-page="(table?.tableApi?.getState().pagination.pageIndex || 0) + 1"
            :items-per-page="table?.tableApi?.getState().pagination.pageSize"
            :total="table?.tableApi?.getFilteredRowModel().rows.length || filteredPayments.length"
            @update:page="(page: number) => table?.tableApi?.setPageIndex(page - 1)"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
