<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { documentTypeColors, documentTypeLabels, lineCategoryLabels, paymentMethodLabels } from '~~/shared/constants/pos'
import type { DailySummary } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime, toDateInputValue } from '~~/shared/utils/pos'

const UBadge = resolveComponent('UBadge')
const NuxtLink = resolveComponent('NuxtLink')

const date = ref(toDateInputValue())

const { data: summary, refresh } = await useFetch<DailySummary>('/api/reports/end-of-day', {
  query: computed(() => ({
    date: date.value
  }))
})

watch(date, async () => {
  await refresh()
})

const paidDocumentColumns: TableColumn<DailySummary['paidDocuments'][number]>[] = [
  {
    accessorKey: 'documentNumber',
    header: 'Document',
    cell: ({ row }) => h('div', { class: 'space-y-1' }, [
      h(NuxtLink, { to: `/documents/${row.original.id}`, class: 'font-medium text-highlighted' }, () => row.original.documentNumber),
      h(UBadge, {
        color: documentTypeColors[row.original.type],
        variant: 'subtle'
      }, () => documentTypeLabels[row.original.type])
    ])
  },
  {
    accessorKey: 'customerName',
    header: 'Customer'
  },
  {
    accessorKey: 'paidAmountToday',
    header: 'Encaisse aujourd hui',
    cell: ({ row }) => formatCurrency(row.original.paidAmountToday)
  },
  {
    accessorKey: 'total',
    header: 'Total TTC',
    cell: ({ row }) => formatCurrency(row.original.total)
  },
  {
    accessorKey: 'paidAt',
    header: 'Encaisse a',
    cell: ({ row }) => formatDateTime(row.original.paidAt)
  }
]

const paymentMethodColumns: TableColumn<DailySummary['totalsByMethod'][number]>[] = [
  {
    accessorKey: 'method',
    header: 'Method',
    cell: ({ row }) => paymentMethodLabels[row.original.method]
  },
  {
    accessorKey: 'total',
    header: 'Encaisse',
    cell: ({ row }) => formatCurrency(row.original.total)
  }
]

const turnoverColumns: TableColumn<DailySummary['turnoverByCategory'][number]>[] = [
  {
    accessorKey: 'category',
    header: 'Category',
    cell: ({ row }) => lineCategoryLabels[row.original.category]
  },
  {
    accessorKey: 'total',
    header: 'Turnover',
    cell: ({ row }) => formatCurrency(row.original.total)
  }
]
</script>

<template>
  <UDashboardPanel id="report-daily">
    <template #header>
      <UDashboardNavbar title="End of day">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UInput v-model="date" type="date" class="w-52" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="summary" class="space-y-6">
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <PosSummaryCard title="Total paid today" :value="formatCurrency(summary.totalPaid)" icon="i-lucide-wallet-cards" />
          <PosSummaryCard title="Open tickets" :value="String(summary.ticketStats.openCount)" icon="i-lucide-wrench" />
          <PosSummaryCard title="Opened today" :value="String(summary.ticketStats.openedToday)" icon="i-lucide-folder-plus" />
          <PosSummaryCard title="Closed today" :value="String(summary.ticketStats.closedToday)" icon="i-lucide-folder-check" />
        </div>

        <div class="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Paid invoices and receipts
                </h2>
                <p class="text-sm text-toned">
                  Documents with paid cashflow attributed to the selected day.
                </p>
              </div>
            </template>

            <UTable
              :data="summary.paidDocuments"
              :columns="paidDocumentColumns"
              sticky="header"
              :ui="{
                base: 'table-fixed border-separate border-spacing-0',
                thead: '[&>tr]:bg-elevated/60 [&>tr]:after:content-none',
                tbody: '[&>tr]:last:[&>td]:border-b-0',
                th: 'py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r',
                td: 'border-b border-default align-top',
                separator: 'h-0'
              }"
            >
              <template #empty>
                <UEmpty
                  icon="i-lucide-receipt"
                  title="No paid documents"
                  description="No payments were booked for the selected date."
                />
              </template>
            </UTable>
          </UCard>

          <div class="space-y-6">
            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    By payment method
                  </h2>
                </div>
              </template>

              <UTable
                :data="summary.totalsByMethod"
                :columns="paymentMethodColumns"
                :ui="{ td: 'align-top' }"
              >
                <template #empty>
                  <UEmpty
                    icon="i-lucide-wallet"
                    title="No payment methods to show"
                    description="Booked payments will appear here."
                    size="sm"
                    variant="naked"
                  />
                </template>
              </UTable>
            </UCard>

            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Turnover split
                  </h2>
                  <p class="text-sm text-toned">
                    Based on paid document lines for the selected day.
                  </p>
                </div>
              </template>

              <UTable
                :data="summary.turnoverByCategory"
                :columns="turnoverColumns"
                :ui="{ td: 'align-top' }"
              >
                <template #empty>
                  <UEmpty
                    icon="i-lucide-pie-chart"
                    title="No turnover split"
                    description="No categorized document lines were paid on this date."
                    size="sm"
                    variant="naked"
                  />
                </template>
              </UTable>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
