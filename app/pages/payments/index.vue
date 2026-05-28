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

type PeriodPreset = 'today' | 'month' | 'last_7_days' | 'all' | 'custom'

function shiftIsoDate(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year!, month! - 1, day! + days, 12, 0, 0))

  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0')
  ].join('-')
}

function getMonthStartDate(date = new Date()) {
  const today = toDateInputValue(date)
  const [year, month] = today.split('-')

  return `${year}-${month}-01`
}

function getCurrentMonthRange() {
  const today = toDateInputValue()

  return {
    from: getMonthStartDate(),
    to: today
  }
}

const search = ref('')
const methodFilter = ref<'all' | PaymentListItem['method']>('all')
const statusFilter = ref<'all' | PaymentListItem['status']>('all')
const periodPreset = ref<PeriodPreset>('month')
const currentMonthRange = getCurrentMonthRange()
const dateFrom = ref(currentMonthRange.from)
const dateTo = ref(currentMonthRange.to)
const pagination = ref({
  pageIndex: 0,
  pageSize: 50
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

const periodItems = [
  { label: 'Ce mois', value: 'month' },
  { label: 'Aujourd’hui', value: 'today' },
  { label: '7 derniers jours', value: 'last_7_days' },
  { label: 'Toutes les dates', value: 'all' },
  { label: 'Période personnalisée', value: 'custom' }
]

const paymentQuery = computed(() => ({
  method: methodFilter.value === 'all' ? undefined : methodFilter.value,
  status: statusFilter.value === 'all' ? undefined : statusFilter.value,
  dateFrom: dateFrom.value || undefined,
  dateTo: dateTo.value || undefined
}))

const { data: payments, status, refresh } = await useFetch<PaymentListItem[]>('/api/payments', {
  query: paymentQuery
})

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

watch(periodPreset, (preset) => {
  const today = toDateInputValue()

  if (preset === 'today') {
    dateFrom.value = today
    dateTo.value = today
  } else if (preset === 'month') {
    dateFrom.value = getMonthStartDate()
    dateTo.value = today
  } else if (preset === 'last_7_days') {
    dateFrom.value = shiftIsoDate(today, -6)
    dateTo.value = today
  } else if (preset === 'all') {
    dateFrom.value = ''
    dateTo.value = ''
  }
})

watch([dateFrom, dateTo], ([from, to]) => {
  const today = toDateInputValue()

  if (!from && !to) {
    periodPreset.value = 'all'
  } else if (from === today && to === today) {
    periodPreset.value = 'today'
  } else if (from === getMonthStartDate() && to === today) {
    periodPreset.value = 'month'
  } else if (from === shiftIsoDate(today, -6) && to === today) {
    periodPreset.value = 'last_7_days'
  } else {
    periodPreset.value = 'custom'
  }
})

watch([search, methodFilter, statusFilter, dateFrom, dateTo], () => {
  pagination.value.pageIndex = 0
})

const hasActiveFilters = computed(() =>
  !!search.value.trim()
  || methodFilter.value !== 'all'
  || statusFilter.value !== 'all'
  || periodPreset.value !== 'month'
  || dateFrom.value !== getMonthStartDate()
  || dateTo.value !== toDateInputValue()
)

function resetFilters() {
  search.value = ''
  methodFilter.value = 'all'
  statusFilter.value = 'all'
  periodPreset.value = 'month'
  const range = getCurrentMonthRange()
  dateFrom.value = range.from
  dateTo.value = range.to
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
            class="w-64"
          />
          <USelectMenu
            v-model="periodPreset"
            :items="periodItems"
            value-key="value"
            class="w-48"
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
            <UInput v-model="dateFrom" type="date" class="w-36" />
          </div>
          <div class="flex items-center gap-2">
            <span class="text-xs text-toned">Fin</span>
            <UInput v-model="dateTo" type="date" class="w-36" />
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
