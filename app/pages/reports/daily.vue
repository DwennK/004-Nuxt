<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import DailyBreakdownCharts from '~/components/reports/DailyBreakdownCharts.client.vue'
import { documentTypeColors, documentTypeLabels, lineCategoryLabels } from '~~/shared/constants/pos'
import type { DailySummary } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime, getPaymentMethodLabel, toDateInputValue } from '~~/shared/utils/pos'

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
    header: 'Client'
  },
  {
    accessorKey: 'paidAmountToday',
    header: 'Encaissé aujourd’hui',
    cell: ({ row }) => formatCurrency(row.original.paidAmountToday)
  },
  {
    accessorKey: 'total',
    header: 'Total TTC',
    cell: ({ row }) => formatCurrency(row.original.total)
  },
  {
    accessorKey: 'paidAt',
    header: 'Encaissé à',
    cell: ({ row }) => formatDateTime(row.original.paidAt)
  }
]

const paymentMethodColumns: TableColumn<DailySummary['totalsByMethod'][number]>[] = [
  {
    accessorKey: 'method',
    header: 'Mode de paiement',
    cell: ({ row }) => getPaymentMethodLabel(row.original.method)
  },
  {
    accessorKey: 'total',
    header: 'Encaissé',
    cell: ({ row }) => formatCurrency(row.original.total)
  }
]

const turnoverColumns: TableColumn<DailySummary['turnoverByCategory'][number]>[] = [
  {
    accessorKey: 'category',
    header: 'Catégorie',
    cell: ({ row }) => lineCategoryLabels[row.original.category]
  },
  {
    accessorKey: 'total',
    header: 'Chiffre d’affaires',
    cell: ({ row }) => formatCurrency(row.original.total)
  }
]
</script>

<template>
  <UDashboardPanel id="report-daily">
    <template #header>
      <UDashboardNavbar title="Fin de journée">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar>
        <UInput v-model="date" type="date" class="w-52" />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div v-if="summary" class="space-y-4">
        <div class="rounded-2xl border border-default/80 bg-muted/20 px-4 py-3">
          <div class="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge color="primary" variant="subtle" size="sm">
                {{ date }}
              </UBadge>
              <span class="text-sm text-toned">
                {{ summary.paidDocuments.length }} encaissement(s) comptabilisé(s)
              </span>
            </div>

            <div class="grid gap-2 sm:grid-cols-4">
              <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                  Total encaissé
                </p>
                <p class="text-sm font-semibold text-highlighted">
                  {{ formatCurrency(summary.totalPaid) }}
                </p>
              </div>
              <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                  Tickets ouverts
                </p>
                <p class="text-sm font-semibold text-highlighted">
                  {{ summary.ticketStats.openCount }}
                </p>
              </div>
              <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                  Ouverts
                </p>
                <p class="text-sm font-semibold text-highlighted">
                  {{ summary.ticketStats.openedToday }}
                </p>
              </div>
              <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                  Clôturés
                </p>
                <p class="text-sm font-semibold text-highlighted">
                  {{ summary.ticketStats.closedToday }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div class="grid gap-4 xl:h-[calc(100vh-16.5rem)] xl:grid-cols-[minmax(0,1fr)_22rem]">
          <UCard :ui="{ body: 'p-4', header: 'p-4 pb-0' }" class="xl:min-h-0">
            <template #header>
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Factures et reçus encaissés
                  </h2>
                </div>
                <span class="text-xs text-toned">
                  {{ summary.paidDocuments.length }} ligne(s)
                </span>
              </div>
            </template>

            <div class="xl:max-h-[calc(100vh-22rem)] xl:overflow-auto pr-1">
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
                    title="Aucun document encaissé"
                    description="Aucun paiement n’a été comptabilisé à la date sélectionnée."
                  />
                </template>
              </UTable>
            </div>
          </UCard>

          <div class="space-y-4 xl:min-h-0 xl:overflow-y-auto pr-1">
            <UCard :ui="{ body: 'space-y-3 p-4', header: 'p-4 pb-0' }">
              <template #header>
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Clôture
                  </h2>
                </div>
              </template>

              <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
                <div class="rounded-2xl border border-default bg-muted/20 px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    Total encaissé
                  </p>
                  <p class="mt-2 text-lg font-semibold text-highlighted">
                    {{ formatCurrency(summary.totalPaid) }}
                  </p>
                </div>
                <div class="rounded-2xl border border-default px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    Tickets ouverts
                  </p>
                  <p class="mt-1 font-semibold text-highlighted">
                    {{ summary.ticketStats.openCount }}
                  </p>
                </div>
                <div class="rounded-2xl border border-default px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    Ouverts aujourd’hui
                  </p>
                  <p class="mt-1 font-semibold text-highlighted">
                    {{ summary.ticketStats.openedToday }}
                  </p>
                </div>
                <div class="rounded-2xl border border-default px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    Clôturés aujourd’hui
                  </p>
                  <p class="mt-1 font-semibold text-highlighted">
                    {{ summary.ticketStats.closedToday }}
                  </p>
                </div>
              </div>
            </UCard>

            <UCard :ui="{ body: 'p-4', header: 'p-4 pb-0' }">
              <template #header>
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Par mode de paiement
                  </h2>
                </div>
              </template>

              <DailyBreakdownCharts kind="payments" :summary="summary" />

              <UTable
                :data="summary.totalsByMethod"
                :columns="paymentMethodColumns"
                :ui="{ td: 'align-top', th: 'py-2' }"
              >
                <template #empty>
                  <UEmpty
                    icon="i-lucide-wallet"
                    title="Aucun mode de paiement à afficher"
                    description="Les paiements comptabilisés apparaîtront ici."
                    size="sm"
                    variant="naked"
                  />
                </template>
              </UTable>
            </UCard>

            <UCard :ui="{ body: 'p-4', header: 'p-4 pb-0' }">
              <template #header>
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Répartition du chiffre d’affaires
                  </h2>
                </div>
              </template>

              <DailyBreakdownCharts kind="turnover" :summary="summary" />

              <UTable
                :data="summary.turnoverByCategory"
                :columns="turnoverColumns"
                :ui="{ td: 'align-top', th: 'py-2' }"
              >
                <template #empty>
                  <UEmpty
                    icon="i-lucide-pie-chart"
                    title="Aucune répartition disponible"
                    description="Aucune ligne catégorisée n’a été encaissée à cette date."
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
