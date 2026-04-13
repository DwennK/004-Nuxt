<script setup lang="ts">
import type { DropdownMenuItem, TableColumn } from '@nuxt/ui'
import { documentTypeColors, documentTypeLabels, paymentMethodColors, paymentMethodLabels } from '~~/shared/constants/pos'
import type { DailySummary, DocumentListItem } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime, toDateInputValue } from '~~/shared/utils/pos'

const UBadge = resolveComponent('UBadge')
const NuxtLink = resolveComponent('NuxtLink')

const selectedActivity = ref<'paid' | 'due'>('paid')

const [{ data: summary }, { data: documents }] = await Promise.all([
  useFetch<DailySummary>('/api/reports/end-of-day', {
    query: {
      date: toDateInputValue()
    }
  }),
  useFetch<DocumentListItem[]>('/api/documents')
])

const paidDocuments = computed(() => summary.value?.paidDocuments || [])

const dueDocuments = computed(() => {
  return [...(documents.value || [])]
    .filter(document => document.balanceDue > 0)
    .sort((left, right) => right.balanceDue - left.balanceDue)
})

const totalBalanceDue = computed(() => {
  return dueDocuments.value.reduce((sum, document) => sum + document.balanceDue, 0)
})

const latestPaymentAt = computed(() => {
  return paidDocuments.value.reduce<string | null>((latest, document) => {
    if (!latest) {
      return document.paidAt
    }

    return new Date(document.paidAt).getTime() > new Date(latest).getTime()
      ? document.paidAt
      : latest
  }, null)
})

const displayDate = computed(() => {
  const date = summary.value?.date || toDateInputValue()
  return new Intl.DateTimeFormat('fr-CH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date(`${date}T12:00:00`))
})

const stats = computed(() => [{
  title: 'Encaissé aujourd’hui',
  value: formatCurrency(summary.value?.totalPaid || 0),
  description: `${paidDocuments.value.length} encaissement(s) comptabilisé(s)`,
  icon: 'i-lucide-wallet-cards'
}, {
  title: 'Tickets ouverts',
  value: String(summary.value?.ticketStats.openCount || 0),
  description: `${summary.value?.ticketStats.openedToday || 0} ouvert(s) aujourd’hui`,
  icon: 'i-lucide-wrench'
}, {
  title: 'Restant à encaisser',
  value: formatCurrency(totalBalanceDue.value),
  description: `${dueDocuments.value.length} document(s) avec solde`,
  icon: 'i-lucide-scale'
}, {
  title: 'Clôturés aujourd’hui',
  value: String(summary.value?.ticketStats.closedToday || 0),
  description: 'Suivi des remises et clôtures',
  icon: 'i-lucide-package-check'
}])

const queueItems = computed(() => [{
  title: 'Tickets ouverts',
  value: String(summary.value?.ticketStats.openCount || 0),
  description: `${summary.value?.ticketStats.openedToday || 0} nouveau(x) aujourd’hui`,
  to: '/tickets',
  icon: 'i-lucide-wrench',
  badge: 'Voir les tickets'
}, {
  title: 'Documents à encaisser',
  value: String(dueDocuments.value.length),
  description: `${formatCurrency(totalBalanceDue.value)} restant à encaisser`,
  to: '/documents',
  icon: 'i-lucide-receipt-text',
  badge: 'Ouvrir les documents'
}, {
  title: 'Encaissements du jour',
  value: formatCurrency(summary.value?.totalPaid || 0),
  description: latestPaymentAt.value
    ? `Dernier encaissement à ${new Intl.DateTimeFormat('fr-CH', { hour: '2-digit', minute: '2-digit' }).format(new Date(latestPaymentAt.value))}`
    : 'Aucun encaissement enregistré',
  to: '/payments',
  icon: 'i-lucide-wallet',
  badge: 'Voir les paiements'
}, {
  title: 'Reports',
  value: String(summary.value?.ticketStats.closedToday || 0),
  description: 'Préparer le rapport et vérifier la caisse',
  to: '/reports',
  icon: 'i-lucide-chart-column',
  badge: 'Ouvrir le rapport'
}])

const paymentMethodSummary = computed(() => {
  return [...(summary.value?.totalsByMethod || [])]
    .filter(item => item.total > 0)
    .sort((left, right) => right.total - left.total)
})

const quickActionItems = [[{
  label: 'Nouveau client',
  icon: 'i-lucide-user-plus',
  to: '/customers/new'
}, {
  label: 'Nouveau document',
  icon: 'i-lucide-file-plus-2',
  to: '/documents/new'
}, {
  label: 'Reports',
  icon: 'i-lucide-chart-column',
  to: '/reports'
}]] satisfies DropdownMenuItem[][]

const activityTabItems = [{
  label: 'Encaissements',
  value: 'paid'
}, {
  label: 'À encaisser',
  value: 'due'
}]

const paidDocumentColumns: TableColumn<DailySummary['paidDocuments'][number]>[] = [
  {
    accessorKey: 'documentNumber',
    header: 'Document',
    cell: ({ row }) => h('div', { class: 'space-y-1' }, [
      h(NuxtLink, { to: `/documents/${row.original.id}`, class: 'font-medium text-highlighted' }, () => row.original.documentNumber),
      h(UBadge, {
        color: documentTypeColors[row.original.type],
        variant: 'subtle',
        size: 'sm'
      }, () => documentTypeLabels[row.original.type])
    ])
  },
  {
    accessorKey: 'customerName',
    header: 'Client'
  },
  {
    accessorKey: 'paidAmountToday',
    header: 'Encaissé',
    cell: ({ row }) => h('div', { class: 'text-right font-medium text-highlighted' }, formatCurrency(row.original.paidAmountToday))
  },
  {
    accessorKey: 'paidAt',
    header: 'Heure',
    cell: ({ row }) => h('div', { class: 'text-sm text-toned' }, formatDateTime(row.original.paidAt))
  }
]

const dueDocumentColumns: TableColumn<DocumentListItem>[] = [
  {
    accessorKey: 'documentNumber',
    header: 'Document',
    cell: ({ row }) => h('div', { class: 'space-y-1' }, [
      h(NuxtLink, { to: `/documents/${row.original.id}`, class: 'font-medium text-highlighted' }, () => row.original.documentNumber),
      h(UBadge, {
        color: documentTypeColors[row.original.type],
        variant: 'subtle',
        size: 'sm'
      }, () => documentTypeLabels[row.original.type])
    ])
  },
  {
    accessorKey: 'customerName',
    header: 'Client'
  },
  {
    accessorKey: 'balanceDue',
    header: 'Restant',
    cell: ({ row }) => h('div', { class: 'text-right font-medium text-highlighted' }, formatCurrency(row.original.balanceDue))
  },
  {
    accessorKey: 'total',
    header: 'Total TTC',
    cell: ({ row }) => h('div', { class: 'text-right text-toned' }, formatCurrency(row.original.total))
  }
]

type ActivityRow = DailySummary['paidDocuments'][number] | DocumentListItem

const activityRows = computed(() => selectedActivity.value === 'paid' ? paidDocuments.value : dueDocuments.value)
const activityColumns = computed<TableColumn<ActivityRow>[]>(() => {
  return selectedActivity.value === 'paid'
    ? paidDocumentColumns as TableColumn<ActivityRow>[]
    : dueDocumentColumns as TableColumn<ActivityRow>[]
})
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="Vue d’ensemble">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #trailing>
          <UBadge color="neutral" variant="subtle" class="capitalize">
            {{ displayDate }}
          </UBadge>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <UCard
            v-for="stat in stats"
            :key="stat.title"
            :ui="{ body: 'p-4' }"
          >
            <div class="flex items-start gap-3">
              <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring ring-primary/15">
                <UIcon :name="stat.icon" class="size-4.5" />
              </div>

              <div class="min-w-0 space-y-1">
                <p class="text-[11px] font-medium uppercase tracking-[0.14em] text-toned">
                  {{ stat.title }}
                </p>
                <p class="text-2xl font-semibold leading-none text-highlighted">
                  {{ stat.value }}
                </p>
                <p class="text-sm text-toned">
                  {{ stat.description }}
                </p>
              </div>
            </div>
          </UCard>
        </div>

        <div class="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <UCard :ui="{ body: 'p-0' }">
            <template #header>
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    À traiter maintenant
                  </h2>
                  <p class="text-sm text-toned">
                    Vue opérateur des éléments qui demandent une action aujourd’hui.
                  </p>
                </div>

                <UBadge variant="subtle" color="primary">
                  {{ queueItems.length }} priorités
                </UBadge>
              </div>
            </template>

            <div class="divide-y divide-default">
              <NuxtLink
                v-for="item in queueItems"
                :key="item.title"
                :to="item.to"
                class="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/40"
              >
                <div class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-toned transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                  <UIcon :name="item.icon" class="size-4.5" />
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p class="font-medium text-highlighted">
                        {{ item.title }}
                      </p>
                      <p class="text-sm text-toned">
                        {{ item.description }}
                      </p>
                    </div>

                    <div class="flex items-center gap-3">
                      <span class="text-xl font-semibold text-highlighted">
                        {{ item.value }}
                      </span>
                      <UBadge variant="soft" color="neutral">
                        {{ item.badge }}
                      </UBadge>
                    </div>
                  </div>
                </div>
              </NuxtLink>
            </div>
          </UCard>

          <div class="space-y-4">
            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Actions
                  </h2>
                  <p class="text-sm text-toned">
                    Les deux flux principaux du comptoir restent au premier plan.
                  </p>
                </div>
              </template>

              <div class="space-y-3">
                <div class="grid gap-3 sm:grid-cols-2">
                  <UButton
                    to="/tickets/new"
                    label="Nouvelle réparation"
                    icon="i-lucide-wrench"
                    size="xl"
                    block
                    class="justify-start"
                  />
                  <UButton
                    to="/sales/new"
                    label="Vente rapide"
                    icon="i-lucide-receipt"
                    size="xl"
                    block
                    class="justify-start"
                  />
                </div>

                <div class="flex flex-col gap-3 sm:flex-row">
                  <UDropdownMenu
                    v-slot="{ open }"
                    :items="quickActionItems"
                    :content="{ align: 'start' }"
                    class="flex-1"
                  >
                    <UButton
                      label="Autres actions"
                      color="neutral"
                      variant="outline"
                      class="w-full justify-between"
                      trailing-icon="i-lucide-chevron-down"
                      :ui="{
                        trailingIcon: ['transition-transform duration-200', open ? 'rotate-180' : undefined].filter(Boolean).join(' ')
                      }"
                    />
                  </UDropdownMenu>

                  <UButton
                    to="/reports"
                    label="Reports"
                    color="neutral"
                    variant="subtle"
                    icon="i-lucide-chart-column"
                    class="justify-start"
                  />
                </div>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <h2 class="text-lg font-semibold text-highlighted">
                      Répartition des encaissements
                    </h2>
                    <p class="text-sm text-toned">
                      Contrôle rapide des modes de paiement utilisés aujourd’hui.
                    </p>
                  </div>

                  <UBadge variant="subtle" color="neutral">
                    {{ paymentMethodSummary.length }} mode(s)
                  </UBadge>
                </div>
              </template>

              <div v-if="paymentMethodSummary.length" class="space-y-3">
                <div
                  v-for="method in paymentMethodSummary"
                  :key="method.method"
                  class="flex items-center justify-between gap-3 rounded-xl border border-default px-3 py-2"
                >
                  <div class="flex items-center gap-3">
                    <UBadge
                      :color="paymentMethodColors[method.method]"
                      variant="subtle"
                      size="sm"
                    >
                      {{ paymentMethodLabels[method.method] }}
                    </UBadge>
                  </div>

                  <span class="font-medium text-highlighted">
                    {{ formatCurrency(method.total) }}
                  </span>
                </div>
              </div>

              <UEmpty
                v-else
                icon="i-lucide-wallet"
                title="Aucun paiement enregistré"
                description="Les modes de paiement utilisés aujourd’hui apparaîtront ici."
              />
            </UCard>
          </div>
        </div>

        <UCard>
          <template #header>
            <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Activité du jour
                </h2>
                <p class="text-sm text-toned">
                  Suivi compact des encaissements réalisés et des documents restant à traiter.
                </p>
              </div>

              <div class="flex items-center gap-3">
                <UBadge variant="subtle" color="neutral">
                  {{ activityRows.length }} ligne(s)
                </UBadge>

                <UTabs
                  v-model="selectedActivity"
                  :items="activityTabItems"
                  :content="false"
                  size="xs"
                />
              </div>
            </div>
          </template>

          <UTable
            :data="activityRows"
            :columns="activityColumns"
            sticky="header"
            class="shrink-0"
            :ui="{
              base: 'table-fixed border-separate border-spacing-0',
              thead: '[&>tr]:bg-elevated/60 [&>tr]:after:content-none',
              tbody: '[&>tr]:last:[&>td]:border-b-0',
              th: 'px-3 py-2 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r text-xs uppercase tracking-[0.12em] text-toned',
              td: 'px-3 py-3 border-b border-default align-top',
              separator: 'h-0'
            }"
            @select="(_, row) => navigateTo(`/documents/${row.original.id}`)"
          >
            <template #empty>
              <UEmpty
                :icon="selectedActivity === 'paid' ? 'i-lucide-receipt' : 'i-lucide-scale'"
                :title="selectedActivity === 'paid' ? 'Aucun document encaissé' : 'Aucun solde en attente'"
                :description="selectedActivity === 'paid'
                  ? 'Les encaissements validés aujourd’hui apparaîtront ici.'
                  : 'Les documents avec un reste à payer apparaîtront ici.'"
              />
            </template>
          </UTable>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
