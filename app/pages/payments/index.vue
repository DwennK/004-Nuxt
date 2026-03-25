<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { getPaginationRowModel } from '@tanstack/table-core'
import { upperFirst } from 'scule'
import type { DashboardTableColumn, DashboardTableInstance } from '~/types/table'
import {
  paymentMethodColors,
  paymentMethodLabels,
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
const dateFilter = ref(toDateInputValue())
const pagination = ref({
  pageIndex: 0,
  pageSize: 10
})
const sorting = ref([{ id: 'paidAt', desc: true }])
const columnVisibility = ref()

const methodItems = [
  { label: 'All methods', value: 'all' },
  ...Object.entries(paymentMethodLabels).map(([value, label]) => ({ label, value }))
]

const statusItems = [
  { label: 'All statuses', value: 'all' },
  ...Object.entries(paymentStatusLabels).map(([value, label]) => ({ label, value }))
]

const { data: payments, status, refresh } = await useFetch<PaymentListItem[]>('/api/payments')

const filteredPayments = computed(() => {
  const term = search.value.trim().toLowerCase()

  return (payments.value || []).filter((payment) => {
    const matchesSearch = !term || [
      payment.customerName,
      payment.documentNumber,
      payment.reference
    ].some(value => value?.toLowerCase().includes(term))

    const matchesMethod = methodFilter.value === 'all' || payment.method === methodFilter.value
    const matchesStatus = statusFilter.value === 'all' || payment.status === statusFilter.value
    const matchesDate = !dateFilter.value || toDateInputValue(new Date(payment.paidAt)) === dateFilter.value

    return matchesSearch && matchesMethod && matchesStatus && matchesDate
  })
})

watch([search, methodFilter, statusFilter, dateFilter], () => {
  pagination.value.pageIndex = 0
})

async function removePayment(id: number) {
  await $fetch(`/api/payments/${id}`, { method: 'DELETE' })
  toast.add({ title: 'Payment removed', color: 'success' })
  await refresh()
}

function getRowItems(payment: PaymentListItem) {
  return [[{
    label: 'Open document',
    icon: 'i-lucide-arrow-up-right',
    onSelect() {
      navigateTo(`/documents/${payment.documentId}`)
    }
  }], [{
    label: 'Delete',
    icon: 'i-lucide-trash',
    color: 'error',
    onSelect() {
      removePayment(payment.id)
    }
  }]]
}

const columns: TableColumn<PaymentListItem>[] = [
  {
    accessorKey: 'amount',
    header: ({ column }) => h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      label: 'Amount',
      icon: column.getIsSorted() === 'asc'
        ? 'i-lucide-arrow-up-wide-narrow'
        : column.getIsSorted() === 'desc'
          ? 'i-lucide-arrow-down-wide-narrow'
          : 'i-lucide-arrow-up-down',
      class: '-mx-2.5',
      onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
    }),
    cell: ({ row }) => h('div', { class: 'space-y-1' }, [
      h('p', { class: 'font-medium text-highlighted' }, formatCurrency(row.original.amount)),
      h('div', { class: 'flex flex-wrap gap-2' }, [
        h(UBadge, { color: paymentMethodColors[row.original.method], variant: 'subtle' }, () => paymentMethodLabels[row.original.method]),
        h(UBadge, { color: paymentStatusColors[row.original.status], variant: 'subtle' }, () => paymentStatusLabels[row.original.status])
      ])
    ])
  },
  {
    accessorKey: 'customerName',
    header: 'Customer',
    cell: ({ row }) => h('div', { class: 'min-w-0' }, [
      h('p', { class: 'font-medium truncate' }, row.original.customerName || 'Walk-in / not set'),
      h('p', { class: 'text-sm text-toned truncate' }, row.original.documentNumber)
    ])
  },
  {
    accessorKey: 'documentType',
    header: 'Document',
    cell: ({ row }) => row.original.documentType
  },
  {
    accessorKey: 'reference',
    header: 'Reference',
    cell: ({ row }) => row.original.reference || 'No reference'
  },
  {
    accessorKey: 'paidAt',
    header: 'Encaisse a',
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
      <UDashboardNavbar title="Payments">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar class="flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-3">
          <UInput
            v-model="search"
            icon="i-lucide-search"
            placeholder="Search by customer, document or reference"
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
          <UInput v-model="dateFilter" type="date" class="w-44" />
        </div>

        <UDropdownMenu
          :items="
            table?.tableApi
              ?.getAllColumns()
              .filter((column: DashboardTableColumn) => column.getCanHide())
              .map((column: DashboardTableColumn) => ({
                label: upperFirst(column.id),
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
            label="Columns"
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
          <PosSummaryCard title="Payments" :value="String(payments?.length || 0)" icon="i-lucide-wallet" />
          <PosSummaryCard title="Paid total" :value="formatCurrency((filteredPayments || []).reduce((sum, payment) => sum + payment.amount, 0))" icon="i-lucide-wallet-cards" />
          <PosSummaryCard title="Cash" :value="formatCurrency((filteredPayments || []).filter(payment => payment.method === 'cash').reduce((sum, payment) => sum + payment.amount, 0))" icon="i-lucide-banknote" />
          <PosSummaryCard title="Visible" :value="String(filteredPayments.length)" icon="i-lucide-filter" />
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
            th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
            td: 'border-b border-default align-top',
            separator: 'h-0'
          }"
          @select="(_, row) => navigateTo(`/documents/${row.original.documentId}`)"
        >
          <template #empty>
            <UEmpty
              icon="i-lucide-wallet"
              title="No payments found"
              description="Adjust the date or method filters to see results."
            />
          </template>
        </UTable>

        <div class="flex items-center justify-between gap-3 border-t border-default pt-4">
          <p class="text-sm text-toned">
            {{ table?.tableApi?.getFilteredRowModel().rows.length || filteredPayments.length }} payment(s)
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
