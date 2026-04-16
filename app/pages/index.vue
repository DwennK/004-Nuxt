<script setup lang="ts">
import {
  documentTypeColors,
  documentTypeLabels,
  paymentMethodColors,
  paymentMethodLabels,
  ticketStatusColors,
  ticketStatusLabels
} from '~~/shared/constants/pos'
import type { HomeOverview } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime, toDateInputValue } from '~~/shared/utils/pos'

const { data: home } = await useFetch<HomeOverview>('/api/home', {
  query: {
    date: toDateInputValue()
  }
})

const activityIcons = {
  payment: 'i-lucide-wallet-cards',
  ticket: 'i-lucide-wrench',
  document: 'i-lucide-file-text'
} as const

const priorityIcons = {
  'due-documents': 'i-lucide-scale',
  'ready-tickets': 'i-lucide-package-check',
  'open-tickets': 'i-lucide-wrench',
  'reports': 'i-lucide-chart-column'
} as const

const displayDate = computed(() => {
  const date = home.value?.date || toDateInputValue()

  return new Intl.DateTimeFormat('fr-CH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  }).format(new Date(`${date}T12:00:00`))
})

const summaryItems = computed(() => {
  const summary = home.value?.summary
  const cashbox = home.value?.cashbox

  return [{
    title: 'Encaissé aujourd’hui',
    value: formatCurrency(summary?.totalPaid || 0),
    description: `${cashbox?.methods.length || 0} mode(s) utilisé(s)`,
    icon: 'i-lucide-wallet-cards'
  }, {
    title: 'À encaisser',
    value: formatCurrency(summary?.totalBalanceDue || 0),
    description: `${summary?.dueDocumentCount || 0} facture(s) avec solde`,
    icon: 'i-lucide-scale'
  }, {
    title: 'Tickets ouverts',
    value: String(summary?.openTicketCount || 0),
    description: `${summary?.openedToday || 0} nouveau(x) aujourd’hui`,
    icon: 'i-lucide-wrench'
  }, {
    title: 'Prêts pour retrait',
    value: String(summary?.readyForPickupCount || 0),
    description: 'Dossiers à restituer',
    icon: 'i-lucide-package-check'
  }]
})

const latestPaymentLabel = computed(() => {
  const latest = home.value?.cashbox.latestPaymentAt

  if (!latest) {
    return 'Aucun encaissement validé aujourd’hui.'
  }

  return `Dernier encaissement à ${new Intl.DateTimeFormat('fr-CH', {
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(latest))}`
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
        <section class="rounded-2xl border border-default bg-elevated/35 px-4 py-3">
          <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div
              v-for="item in summaryItems"
              :key="item.title"
              class="flex items-start gap-3 rounded-xl px-1 py-1"
            >
              <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary ring ring-primary/15">
                <UIcon :name="item.icon" class="size-4.5" />
              </div>

              <div class="min-w-0 space-y-1">
                <p class="text-[11px] font-medium uppercase tracking-[0.14em] text-toned">
                  {{ item.title }}
                </p>
                <p class="text-2xl font-semibold leading-none text-highlighted">
                  {{ item.value }}
                </p>
                <p class="text-sm text-toned">
                  {{ item.description }}
                </p>
              </div>
            </div>
          </div>
        </section>

        <div class="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_22rem]">
          <UCard :ui="{ body: 'p-0' }">
            <template #header>
              <div class="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Activité récente
                  </h2>
                  <p class="text-sm text-toned">
                    Chronologie du comptoir: encaissements, tickets et documents créés aujourd’hui.
                  </p>
                </div>

                <UBadge variant="subtle" color="neutral">
                  {{ home?.activity.length || 0 }} événement(s)
                </UBadge>
              </div>
            </template>

            <div v-if="home?.activity.length" class="divide-y divide-default">
              <NuxtLink
                v-for="item in home.activity"
                :key="item.id"
                :to="item.to"
                class="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-muted/35"
              >
                <div class="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-toned transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                  <UIcon :name="activityIcons[item.kind]" class="size-4.5" />
                </div>

                <div class="min-w-0 flex-1">
                  <div class="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="font-medium text-highlighted">
                          {{ item.title }}
                        </p>

                        <UBadge
                          v-if="item.badgeLabel"
                          :color="item.badgeColor || 'neutral'"
                          variant="subtle"
                          size="sm"
                        >
                          {{ item.badgeLabel }}
                        </UBadge>
                      </div>

                      <p class="text-sm text-toned">
                        {{ item.subtitle }}
                      </p>
                    </div>

                    <div class="flex shrink-0 items-center gap-3">
                      <span class="text-xs text-toned">
                        {{ formatDateTime(item.occurredAt) }}
                      </span>

                      <span
                        v-if="typeof item.amount === 'number'"
                        class="font-medium text-highlighted"
                      >
                        {{ formatCurrency(item.amount) }}
                      </span>
                    </div>
                  </div>
                </div>
              </NuxtLink>
            </div>

            <UEmpty
              v-else
              icon="i-lucide-activity"
              title="Aucune activité aujourd’hui"
              description="Les derniers mouvements du comptoir apparaîtront ici."
            />
          </UCard>

          <div class="space-y-4">
            <UCard :ui="{ body: 'p-0' }">
              <template #header>
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h2 class="text-lg font-semibold text-highlighted">
                      À faire maintenant
                    </h2>
                    <p class="text-sm text-toned">
                      Les priorités comptoir du jour, sans détour.
                    </p>
                  </div>

                  <UBadge variant="subtle" color="primary">
                    {{ home?.priorities.length || 0 }} items
                  </UBadge>
                </div>
              </template>

              <div class="divide-y divide-default">
                <NuxtLink
                  v-for="item in home?.priorities || []"
                  :key="item.id"
                  :to="item.to"
                  class="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/35"
                >
                  <div class="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-toned transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                    <UIcon :name="priorityIcons[item.id]" class="size-4.5" />
                  </div>

                  <div class="min-w-0 flex-1">
                    <div class="flex items-center justify-between gap-3">
                      <div class="min-w-0">
                        <p class="font-medium text-highlighted">
                          {{ item.title }}
                        </p>
                        <p class="text-sm text-toned">
                          {{ item.description }}
                        </p>
                      </div>

                      <span class="text-lg font-semibold text-highlighted">
                        {{ item.value }}
                      </span>
                    </div>

                    <div class="mt-2">
                      <UBadge :color="item.badgeColor" variant="soft" size="sm">
                        {{ item.badgeLabel }}
                      </UBadge>
                    </div>
                  </div>
                </NuxtLink>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <h2 class="text-lg font-semibold text-highlighted">
                      Caisse du jour
                    </h2>
                    <p class="text-sm text-toned">
                      Encaissement validé, dernier mouvement et modes utilisés.
                    </p>
                  </div>

                  <NuxtLink to="/payments">
                    <UBadge variant="soft" color="neutral">
                      Paiements
                    </UBadge>
                  </NuxtLink>
                </div>
              </template>

              <div class="space-y-4">
                <div class="rounded-2xl border border-default bg-elevated/35 px-4 py-3">
                  <p class="text-xs font-medium uppercase tracking-[0.12em] text-toned">
                    Total encaissé
                  </p>
                  <p class="mt-1 text-3xl font-semibold text-highlighted">
                    {{ formatCurrency(home?.cashbox.totalPaid || 0) }}
                  </p>
                  <p class="mt-2 text-sm text-toned">
                    {{ latestPaymentLabel }}
                  </p>
                </div>

                <div v-if="home?.cashbox.methods.length" class="space-y-2">
                  <div
                    v-for="method in home.cashbox.methods"
                    :key="method.method"
                    class="flex items-center justify-between gap-3 rounded-xl border border-default px-3 py-2"
                  >
                    <UBadge
                      :color="paymentMethodColors[method.method]"
                      variant="subtle"
                      size="sm"
                    >
                      {{ paymentMethodLabels[method.method] }}
                    </UBadge>

                    <span class="font-medium text-highlighted">
                      {{ formatCurrency(method.total) }}
                    </span>
                  </div>
                </div>

                <UEmpty
                  v-else
                  icon="i-lucide-wallet"
                  title="Aucun paiement enregistré"
                  description="Les encaissements du jour apparaîtront ici."
                />
              </div>
            </UCard>
          </div>
        </div>

        <div class="grid gap-4 xl:grid-cols-2">
          <UCard :ui="{ body: 'p-0' }">
            <template #header>
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Tickets prêts pour retrait
                  </h2>
                  <p class="text-sm text-toned">
                    Dossiers à restituer ou à confirmer avec le client.
                  </p>
                </div>

                <UBadge variant="subtle" color="success">
                  {{ home?.summary.readyForPickupCount || 0 }}
                </UBadge>
              </div>
            </template>

            <div v-if="home?.readyTickets.length" class="divide-y divide-default">
              <NuxtLink
                v-for="ticket in home.readyTickets"
                :key="ticket.id"
                :to="`/tickets/${ticket.id}`"
                class="group flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/35"
              >
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="font-medium text-highlighted">
                      {{ ticket.ticketNumber }}
                    </p>
                    <UBadge :color="ticketStatusColors[ticket.status]" variant="subtle" size="sm">
                      {{ ticketStatusLabels[ticket.status] }}
                    </UBadge>
                  </div>

                  <p class="text-sm text-toned">
                    {{ ticket.customerName }}<span v-if="ticket.brand || ticket.model"> · {{ [ticket.brand, ticket.model].filter(Boolean).join(' ') }}</span>
                  </p>
                  <p class="mt-1 line-clamp-1 text-sm text-toned">
                    {{ ticket.issueDescription }}
                  </p>
                </div>

                <span class="shrink-0 text-xs text-toned">
                  {{ formatDateTime(ticket.openedAt) }}
                </span>
              </NuxtLink>
            </div>

            <UEmpty
              v-else
              icon="i-lucide-package-check"
              title="Aucun ticket prêt"
              description="Les dossiers prêts à restituer apparaîtront ici."
            />
          </UCard>

          <UCard :ui="{ body: 'p-0' }">
            <template #header>
              <div class="flex items-start justify-between gap-3">
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Documents à encaisser
                  </h2>
                  <p class="text-sm text-toned">
                    Factures avec solde, triées par montant restant.
                  </p>
                </div>

                <UBadge variant="subtle" color="warning">
                  {{ home?.summary.dueDocumentCount || 0 }}
                </UBadge>
              </div>
            </template>

            <div v-if="home?.dueDocuments.length" class="divide-y divide-default">
              <NuxtLink
                v-for="document in home.dueDocuments"
                :key="document.id"
                :to="`/documents/${document.id}`"
                class="group flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-muted/35"
              >
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <p class="font-medium text-highlighted">
                      {{ document.documentNumber }}
                    </p>
                    <UBadge :color="documentTypeColors[document.type]" variant="subtle" size="sm">
                      {{ documentTypeLabels[document.type] }}
                    </UBadge>
                  </div>

                  <p class="text-sm text-toned">
                    {{ document.customerName }}
                  </p>
                  <p class="mt-1 text-sm text-toned">
                    Total TTC {{ formatCurrency(document.total) }} · Émis le {{ formatDateTime(document.issuedAt) }}
                  </p>
                </div>

                <div class="shrink-0 text-right">
                  <p class="font-medium text-highlighted">
                    {{ formatCurrency(document.balanceDue) }}
                  </p>
                  <p class="text-xs text-toned">
                    restant
                  </p>
                </div>
              </NuxtLink>
            </div>

            <UEmpty
              v-else
              icon="i-lucide-scale"
              title="Aucun solde en attente"
              description="Les factures à encaisser apparaîtront ici."
            />
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
