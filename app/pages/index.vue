<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { documentTypeColors, documentTypeLabels } from '~~/shared/constants/pos'
import type { DailySummary } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime, toDateInputValue } from '~~/shared/utils/pos'

const UBadge = resolveComponent('UBadge')
const NuxtLink = resolveComponent('NuxtLink')

const [{ data: summary }, { data: tickets }, { data: documents }] = await Promise.all([
  useFetch<DailySummary>('/api/reports/end-of-day', {
    query: {
      date: toDateInputValue()
    }
  }),
  useFetch('/api/tickets'),
  useFetch('/api/documents')
])

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
    accessorKey: 'paidAt',
    header: 'Encaissé à',
    cell: ({ row }) => formatDateTime(row.original.paidAt)
  }
]
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Vue d’ensemble du magasin">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6">
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <PosSummaryCard title="Encaissé aujourd’hui" :value="formatCurrency(summary?.totalPaid || 0)" icon="i-lucide-wallet-cards" />
          <PosSummaryCard title="Tickets ouverts" :value="String(summary?.ticketStats.openCount || 0)" icon="i-lucide-wrench" />
          <PosSummaryCard title="Documents" :value="String(documents?.length || 0)" icon="i-lucide-file-text" />
          <PosSummaryCard title="Tickets" :value="String(tickets?.length || 0)" icon="i-lucide-clipboard-list" />
        </div>

        <div class="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Actions rapides
                </h2>
                <p class="text-sm text-toned">
                  Gardez les flux principaux du magasin à un clic.
                </p>
              </div>
            </template>

            <div class="grid gap-3">
              <UButton
                to="/customers/new"
                label="Nouveau client"
                icon="i-lucide-user-plus"
                variant="subtle"
                class="justify-start"
              />
              <UButton
                to="/tickets/new"
                label="Nouveau ticket suivi"
                icon="i-lucide-wrench"
                variant="subtle"
                class="justify-start"
              />
              <UButton
                to="/documents/new"
                label="Facture ou reçu direct"
                icon="i-lucide-receipt"
                variant="subtle"
                class="justify-start"
              />
              <UButton
                to="/reports/daily"
                label="Rapport de fin de journée"
                icon="i-lucide-chart-column"
                variant="subtle"
                class="justify-start"
              />
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Documents encaissés aujourd’hui
                </h2>
                <p class="text-sm text-toned">
                  Vue opérateur de ce qui a réellement été encaissé aujourd’hui.
                </p>
              </div>
            </template>

            <UTable
              :data="summary?.paidDocuments || []"
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
                  description="Les factures et reçus encaissés aujourd’hui apparaîtront ici."
                />
              </template>
            </UTable>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
