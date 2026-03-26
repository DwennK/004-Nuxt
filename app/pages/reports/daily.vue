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
    cell: ({ row }) => paymentMethodLabels[row.original.method]
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
      <div v-if="summary" class="space-y-6">
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <PosSummaryCard title="Total encaissé aujourd’hui" :value="formatCurrency(summary.totalPaid)" icon="i-lucide-wallet-cards" />
          <PosSummaryCard title="Tickets ouverts" :value="String(summary.ticketStats.openCount)" icon="i-lucide-wrench" />
          <PosSummaryCard title="Ouverts aujourd’hui" :value="String(summary.ticketStats.openedToday)" icon="i-lucide-folder-plus" />
          <PosSummaryCard title="Clôturés aujourd’hui" :value="String(summary.ticketStats.closedToday)" icon="i-lucide-folder-check" />
        </div>

        <div class="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Factures et reçus encaissés
                </h2>
                <p class="text-sm text-toned">
                  Documents dont les encaissements sont attribués au jour sélectionné.
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
                  title="Aucun document encaissé"
                  description="Aucun paiement n’a été comptabilisé à la date sélectionnée."
                />
              </template>
            </UTable>
          </UCard>

          <div class="space-y-6">
            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Par mode de paiement
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
                    title="Aucun mode de paiement à afficher"
                    description="Les paiements comptabilisés apparaîtront ici."
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
                    Répartition du chiffre d’affaires
                  </h2>
                  <p class="text-sm text-toned">
                    Basée sur les lignes de documents encaissés pour le jour sélectionné.
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
