<script setup lang="ts">
import ReportsOverviewCharts from '~/components/reports/ReportsOverviewCharts.client.vue'
import {
  catalogItemTypeColors,
  catalogItemTypeLabels,
  documentTypeLabels,
  ticketStatusColors,
  ticketStatusLabels
} from '~~/shared/constants/pos'
import type {
  CatalogItemListResponse,
  CounterOverviewResponse,
  CustomerListResponse,
  DocumentListItem,
  DocumentListResponse,
  TicketListItem,
  TicketListResponse
} from '~~/shared/types/pos'
import { formatCurrency, formatDateTime, getCatalogItemTypeLabel } from '~~/shared/utils/pos'

type CounterAction = {
  label: string
  description: string
  icon: string
  to: string
  variant: 'solid' | 'soft'
}

type WorkQueue = {
  id: string
  title: string
  description: string
  icon: string
  count: number
  tone: 'success' | 'warning' | 'info'
  to: string
  items: TicketListItem[]
}

type QueueFilter = 'all' | 'pickup' | 'payment' | 'blocked'

type QueueFilterItem = {
  label: string
  value: QueueFilter
  count: number
}

type CounterWorkItem = {
  id: string
  kind: Exclude<QueueFilter, 'all'>
  to: string
  icon: string
  tone: 'success' | 'warning' | 'info'
  eyebrow: string
  title: string
  subtitle: string
  detail: string
  meta: string
  amount?: number
  actionLabel: string
}

const search = ref('')
const selectedQueueFilter = ref<QueueFilter>('all')
const debouncedSearch = refDebounced(search, 250)
const minimumSearchLength = 2

const searchTerm = computed(() => debouncedSearch.value.trim())
const canSearch = computed(() => searchTerm.value.length >= minimumSearchLength)

const counterActions: CounterAction[] = [{
  label: 'Vente rapide',
  description: 'Démarrer une vente',
  icon: 'i-lucide-shopping-cart',
  to: '/sales/new',
  variant: 'solid'
}, {
  label: 'Nouveau ticket',
  description: 'Créer une réparation',
  icon: 'i-lucide-wrench',
  to: '/tickets/new',
  variant: 'soft'
}]

const { data: counterOverview, status: counterOverviewStatus } = await useFetch<CounterOverviewResponse>('/api/comptoir', {
  key: 'counter-overview',
  lazy: true
})

const readyTickets = computed(() => counterOverview.value?.readyTickets)
const dueDocuments = computed(() => counterOverview.value?.dueDocuments)
const diagnosisTickets = computed(() => counterOverview.value?.diagnosisTickets)
const approvalTickets = computed(() => counterOverview.value?.approvalTickets)
const waitingPartsTickets = computed(() => counterOverview.value?.waitingPartsTickets)
const reportsOverview = computed(() => counterOverview.value?.reportsOverview)

const { data: customerResults, status: customerSearchStatus, refresh: refreshCustomerResults } = await useFetch<CustomerListResponse>('/api/customers', {
  key: 'counter-search-customers',
  query: computed(() => ({
    search: searchTerm.value,
    pageSize: 5
  })),
  immediate: false,
  watch: false
})

const { data: ticketResults, status: ticketSearchStatus, refresh: refreshTicketResults } = await useFetch<TicketListResponse>('/api/tickets', {
  key: 'counter-search-tickets',
  query: computed(() => ({
    q: searchTerm.value,
    pageSize: 5
  })),
  immediate: false,
  watch: false
})

const { data: documentResults, status: documentSearchStatus, refresh: refreshDocumentResults } = await useFetch<DocumentListResponse>('/api/documents', {
  key: 'counter-search-documents',
  query: computed(() => ({
    q: searchTerm.value,
    pageSize: 5
  })),
  immediate: false,
  watch: false
})

const { data: catalogResults, status: catalogSearchStatus, refresh: refreshCatalogResults } = await useFetch<CatalogItemListResponse>('/api/catalog-items', {
  key: 'counter-search-catalog',
  query: computed(() => ({
    search: searchTerm.value,
    activeOnly: true,
    pageSize: 5
  })),
  immediate: false,
  watch: false
})

watch(searchTerm, (value) => {
  if (value.length < minimumSearchLength) {
    return
  }

  void Promise.all([
    refreshCustomerResults(),
    refreshTicketResults(),
    refreshDocumentResults(),
    refreshCatalogResults()
  ])
})

const readyTicketItems = computed(() => readyTickets.value?.items || [])
const dueDocumentItems = computed(() => dueDocuments.value?.items || [])

const blockedQueues = computed<WorkQueue[]>(() => [{
  id: 'diagnosis',
  title: 'Diagnostic',
  description: 'Dossiers à analyser ou chiffrer.',
  icon: 'i-lucide-stethoscope',
  count: diagnosisTickets.value?.total || 0,
  tone: 'info',
  to: '/tickets?status=diagnosis',
  items: diagnosisTickets.value?.items || []
}, {
  id: 'approval',
  title: 'Accord client',
  description: 'Relancer, accepter ou refuser.',
  icon: 'i-lucide-badge-help',
  count: approvalTickets.value?.total || 0,
  tone: 'warning',
  to: '/tickets?status=awaiting_customer_approval',
  items: approvalTickets.value?.items || []
}, {
  id: 'parts',
  title: 'Pièces',
  description: 'En attente de réception.',
  icon: 'i-lucide-package-search',
  count: waitingPartsTickets.value?.total || 0,
  tone: 'warning',
  to: '/tickets?status=waiting_parts',
  items: waitingPartsTickets.value?.items || []
}])

const totalReadyTickets = computed(() => readyTickets.value?.total || 0)
const totalDueDocuments = computed(() => dueDocuments.value?.total || 0)
const totalDueAmount = computed(() => dueDocuments.value?.summary.totalBalanceDue || 0)
const totalBlockedTickets = computed(() => blockedQueues.value.reduce((total, queue) => total + queue.count, 0))
const totalCounterItems = computed(() => totalReadyTickets.value + totalDueDocuments.value + totalBlockedTickets.value)
const isCounterInitialLoading = computed(() => counterOverviewStatus.value === 'pending' && !counterOverview.value)
const queueFilters = computed<QueueFilterItem[]>(() => [{
  label: 'Tout',
  value: 'all',
  count: totalCounterItems.value
}, {
  label: 'Restitutions',
  value: 'pickup',
  count: totalReadyTickets.value
}, {
  label: 'Encaissements',
  value: 'payment',
  count: totalDueDocuments.value
}, {
  label: 'Bloqués',
  value: 'blocked',
  count: totalBlockedTickets.value
}])
const counterWorkItems = computed<CounterWorkItem[]>(() => {
  const pickupItems = readyTicketItems.value.map(ticket => ({
    id: `pickup-${ticket.id}`,
    kind: 'pickup' as const,
    to: `/tickets/${ticket.id}`,
    icon: 'i-lucide-package-check',
    tone: 'success' as const,
    eyebrow: 'Restitution',
    title: ticket.ticketNumber,
    subtitle: getTicketSubtitle(ticket),
    detail: ticket.issueDescription,
    meta: formatDateTime(ticket.openedAt),
    actionLabel: 'Ouvrir'
  }))

  const paymentItems = dueDocumentItems.value.map(document => ({
    id: `payment-${document.id}`,
    kind: 'payment' as const,
    to: `/documents/${document.id}`,
    icon: 'i-lucide-wallet-cards',
    tone: 'warning' as const,
    eyebrow: documentTypeLabels[document.type],
    title: document.documentNumber,
    subtitle: `${document.customerName}${document.ticketNumber ? ` · ${document.ticketNumber}` : ''}`,
    detail: `Émis le ${formatDateTime(document.issuedAt)}`,
    meta: 'Reste à payer',
    amount: document.balanceDue,
    actionLabel: getDocumentActionLabel(document)
  }))

  const blockedItems = blockedQueues.value.flatMap(queue => queue.items.map(ticket => ({
    id: `blocked-${queue.id}-${ticket.id}`,
    kind: 'blocked' as const,
    to: `/tickets/${ticket.id}`,
    icon: queue.icon,
    tone: queue.tone,
    eyebrow: queue.title,
    title: ticket.ticketNumber,
    subtitle: getTicketSubtitle(ticket),
    detail: ticket.issueDescription,
    meta: formatDateTime(ticket.openedAt),
    actionLabel: 'Traiter'
  })))

  return [...pickupItems, ...paymentItems, ...blockedItems]
})
const filteredWorkItems = computed(() => {
  if (selectedQueueFilter.value === 'all') {
    return counterWorkItems.value
  }

  return counterWorkItems.value.filter(item => item.kind === selectedQueueFilter.value)
})
const isQueueLoading = computed(() =>
  !counterWorkItems.value.length
  && counterOverviewStatus.value === 'pending'
)
const emptyQueueLabel = computed(() => {
  if (selectedQueueFilter.value === 'pickup') {
    return 'Aucune restitution en attente'
  }

  if (selectedQueueFilter.value === 'payment') {
    return 'Rien à encaisser'
  }

  if (selectedQueueFilter.value === 'blocked') {
    return 'Aucun ticket bloqué'
  }

  return 'Rien à traiter maintenant'
})
const hasSearchResults = computed(() =>
  canSearch.value
  && Boolean(
    customerResults.value?.items.length
    || ticketResults.value?.items.length
    || documentResults.value?.items.length
    || catalogResults.value?.items.length
  )
)
const isSearching = computed(() =>
  canSearch.value
  && [customerSearchStatus.value, ticketSearchStatus.value, documentSearchStatus.value, catalogSearchStatus.value].some(status => status === 'pending')
)

function clearSearch() {
  search.value = ''
}

function getDocumentActionLabel(document: DocumentListItem) {
  return document.balanceDue > 0 ? 'Encaisser' : 'Ouvrir'
}

function getTicketSubtitle(ticket: TicketListItem) {
  return [ticket.customerName, [ticket.brand, ticket.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
}

useHead({
  title: 'Comptoir'
})
</script>

<template>
  <UDashboardPanel id="counter" class="outlook-panel">
    <template #header>
      <UDashboardNavbar
        title="Comptoir"
        class="outlook-commandbar"
        :ui="{ title: 'text-white' }"
      >
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            to="/sales/new"
            label="Vente rapide"
            icon="i-lucide-shopping-cart"
            color="neutral"
            variant="solid"
            class="hidden bg-default text-primary hover:bg-muted sm:inline-flex"
          />
          <UButton
            to="/tickets/new"
            label="Nouveau ticket"
            icon="i-lucide-wrench"
            color="neutral"
            variant="ghost"
            class="hidden text-white hover:bg-white/15 sm:inline-flex"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto grid w-full max-w-[118rem] gap-3 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <main class="min-w-0 space-y-3">
          <section class="outlook-mail-toolbar overflow-hidden rounded-md">
            <div class="grid gap-2 border-b border-blue-100 bg-white p-2 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-center">
              <div class="flex items-center gap-2">
                <UInput
                  v-model="search"
                  icon="i-lucide-search"
                  size="xl"
                  autofocus
                  placeholder="Scanner ou rechercher client, ticket, facture, téléphone, IMEI..."
                  :loading="isSearching"
                  class="w-full"
                  :ui="{ base: 'h-10 rounded-[4px] bg-blue-50/80 ring-blue-200 focus-visible:ring-blue-500' }"
                />
                <PosBarcodeScanner
                  trigger-size="xl"
                  trigger-aria-label="Scanner un code-barres avec la caméra"
                  @scanned="search = $event"
                />
              </div>

              <div class="grid grid-cols-2 gap-2 2xl:w-[34rem]">
                <NuxtLink
                  v-for="action in counterActions"
                  :key="action.to"
                  :to="action.to"
                  class="group flex min-h-16 items-center gap-3 rounded-[6px] border px-3 py-2.5 transition focus-visible:outline-2 focus-visible:outline-offset-2"
                  :class="action.variant === 'solid'
                    ? 'border-primary bg-primary text-inverted shadow-sm hover:bg-primary/75 focus-visible:outline-primary/25'
                    : 'border-primary/25 bg-primary/10 text-primary hover:border-primary/40 hover:bg-primary/15 focus-visible:outline-primary/25'"
                >
                  <span
                    class="flex size-10 shrink-0 items-center justify-center rounded-[5px] ring-1 transition"
                    :class="action.variant === 'solid'
                      ? 'bg-default/15 text-inverted ring-default/25 group-hover:bg-default/20'
                      : 'bg-default text-primary ring-primary/20 group-hover:ring-primary/30'"
                  >
                    <UIcon :name="action.icon" class="size-5" />
                  </span>
                  <span class="min-w-0">
                    <span class="block truncate text-sm font-semibold leading-5">
                      {{ action.label }}
                    </span>
                    <span
                      class="hidden truncate text-xs sm:block"
                      :class="action.variant === 'solid' ? 'text-inverted/80' : 'text-primary/80'"
                    >
                      {{ action.description }}
                    </span>
                  </span>
                </NuxtLink>
              </div>
            </div>

            <div v-if="canSearch" class="bg-white p-3">
              <div class="mb-3 flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-highlighted">
                    Résultats pour "{{ searchTerm }}"
                  </p>
                  <p class="text-xs text-toned">
                    Clients, tickets, documents et catalogue.
                  </p>
                </div>
                <UButton
                  icon="i-lucide-x"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  aria-label="Effacer la recherche"
                  @click="clearSearch"
                />
              </div>

              <div v-if="hasSearchResults" class="grid gap-3 xl:grid-cols-4">
                <div class="space-y-2">
                  <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <UIcon name="i-lucide-users" class="size-4 text-blue-600" />
                    Clients
                  </div>
                  <NuxtLink
                    v-for="customer in customerResults?.items || []"
                    :key="customer.id"
                    :to="`/customers/${customer.id}`"
                    class="block rounded-md border border-blue-100 px-3 py-2 transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <p class="truncate text-sm font-medium text-highlighted">
                      {{ customer.displayName }}
                    </p>
                    <p class="truncate text-xs text-toned">
                      {{ [customer.phone, customer.email].filter(Boolean).join(' · ') || 'Fiche client' }}
                    </p>
                  </NuxtLink>
                </div>

                <div class="space-y-2">
                  <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <UIcon name="i-lucide-wrench" class="size-4 text-blue-600" />
                    Tickets
                  </div>
                  <NuxtLink
                    v-for="ticket in ticketResults?.items || []"
                    :key="ticket.id"
                    :to="`/tickets/${ticket.id}`"
                    class="block rounded-md border border-blue-100 px-3 py-2 transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <p class="truncate text-sm font-medium text-highlighted">
                        {{ ticket.ticketNumber }}
                      </p>
                      <UBadge :color="ticketStatusColors[ticket.status]" variant="subtle" size="sm">
                        {{ ticketStatusLabels[ticket.status] }}
                      </UBadge>
                    </div>
                    <p class="truncate text-xs text-toned">
                      {{ getTicketSubtitle(ticket) }}
                    </p>
                  </NuxtLink>
                </div>

                <div class="space-y-2">
                  <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <UIcon name="i-lucide-files" class="size-4 text-blue-600" />
                    Documents
                  </div>
                  <NuxtLink
                    v-for="document in documentResults?.items || []"
                    :key="document.id"
                    :to="`/documents/${document.id}`"
                    class="block rounded-md border border-blue-100 px-3 py-2 transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <p class="truncate text-sm font-medium text-highlighted">
                        {{ document.documentNumber }}
                      </p>
                      <span class="text-xs font-medium text-highlighted">
                        {{ formatCurrency(document.total) }}
                      </span>
                    </div>
                    <p class="truncate text-xs text-toned">
                      {{ document.customerName }}
                    </p>
                  </NuxtLink>
                </div>

                <div class="space-y-2">
                  <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <UIcon name="i-lucide-package-search" class="size-4 text-blue-600" />
                    Catalogue
                  </div>
                  <NuxtLink
                    v-for="item in catalogResults?.items || []"
                    :key="item.id"
                    :to="`/catalog/${item.id}`"
                    class="block rounded-md border border-blue-100 px-3 py-2 transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <div class="flex items-center justify-between gap-2">
                      <p class="truncate text-sm font-medium text-highlighted">
                        {{ item.name }}
                      </p>
                      <UBadge :color="catalogItemTypeColors[item.type]" variant="subtle" size="sm">
                        {{ catalogItemTypeLabels[item.type] }}
                      </UBadge>
                    </div>
                    <p class="truncate text-xs text-toned">
                      {{ [item.sku, item.model, item.serviceKind || getCatalogItemTypeLabel(item.type)].filter(Boolean).join(' · ') }}
                    </p>
                  </NuxtLink>
                </div>
              </div>

              <UEmpty
                v-else
                icon="i-lucide-search-x"
                title="Aucun résultat"
                description="Essayez un nom, un numéro, un modèle ou un document."
                class="py-8"
              />
            </div>
          </section>

          <section class="outlook-mail-toolbar grid overflow-hidden rounded-md md:grid-cols-4">
            <NuxtLink
              to="/comptoir"
              class="border-b border-blue-100 px-3 py-2.5 transition hover:bg-blue-50 md:border-b-0 md:border-r"
            >
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">
                À traiter
              </p>
              <USkeleton v-if="isCounterInitialLoading" class="mt-1 h-7 w-10" />
              <p v-else class="mt-1 text-2xl font-semibold leading-none text-highlighted">
                {{ totalCounterItems }}
              </p>
            </NuxtLink>
            <NuxtLink
              to="/tickets?status=ready_for_pickup"
              class="border-b border-blue-100 px-3 py-2.5 transition hover:bg-blue-50 md:border-b-0 md:border-r"
            >
              <p class="text-xs font-semibold uppercase tracking-wide text-blue-700">
                Restitutions
              </p>
              <USkeleton v-if="isCounterInitialLoading" class="mt-1 h-7 w-8" />
              <p v-else class="mt-1 text-2xl font-semibold leading-none text-highlighted">
                {{ totalReadyTickets }}
              </p>
            </NuxtLink>
            <NuxtLink
              to="/documents?paymentState=due"
              class="border-b border-blue-100 px-3 py-2.5 transition hover:bg-blue-50 md:border-b-0 md:border-r"
            >
              <p class="text-xs font-semibold uppercase tracking-wide text-amber-700">
                À encaisser
              </p>
              <USkeleton v-if="isCounterInitialLoading" class="mt-1 h-6 w-32" />
              <p v-else class="mt-1 truncate text-xl font-semibold leading-none text-highlighted">
                {{ formatCurrency(totalDueAmount) }}
              </p>
            </NuxtLink>
            <NuxtLink
              to="/tickets"
              class="px-3 py-2.5 transition hover:bg-blue-50"
            >
              <p class="text-xs font-semibold uppercase tracking-wide text-sky-700">
                Bloqués
              </p>
              <USkeleton v-if="isCounterInitialLoading" class="mt-1 h-7 w-8" />
              <p v-else class="mt-1 text-2xl font-semibold leading-none text-highlighted">
                {{ totalBlockedTickets }}
              </p>
            </NuxtLink>
          </section>

          <section class="overflow-hidden">
            <div
              v-if="counterOverviewStatus === 'pending' && !reportsOverview"
              class="grid gap-4 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]"
            >
              <USkeleton class="h-[26rem] rounded-md xl:col-span-2" />
              <USkeleton class="h-80 rounded-md" />
              <USkeleton class="h-80 rounded-md" />
            </div>

            <ReportsOverviewCharts
              v-if="reportsOverview"
              :overview="reportsOverview"
            />
          </section>

          <section class="outlook-surface overflow-hidden rounded-md">
            <div class="flex flex-col gap-3 border-b border-blue-100 bg-white p-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  À traiter maintenant
                </h2>
                <p class="text-sm text-toned">
                  Restitutions, encaissements et dossiers bloqués au même endroit.
                </p>
              </div>

              <div class="flex flex-wrap gap-1 rounded-[4px] bg-blue-50 p-1 ring-1 ring-blue-100">
                <button
                  v-for="filter in queueFilters"
                  :key="filter.value"
                  type="button"
                  class="inline-flex items-center gap-2 rounded-[4px] px-3 py-1.5 text-sm font-medium transition"
                  :class="selectedQueueFilter === filter.value ? 'outlook-tab-active' : 'text-slate-600 hover:bg-white/60 hover:text-slate-950'"
                  @click="selectedQueueFilter = filter.value"
                >
                  <span>{{ filter.label }}</span>
                  <span
                    class="rounded px-1.5 py-0.5 text-xs tabular-nums"
                    :class="selectedQueueFilter === filter.value ? 'text-highlighted' : 'text-toned'"
                  >
                    {{ filter.count }}
                  </span>
                </button>
              </div>
            </div>

            <div v-if="isQueueLoading" class="space-y-3 bg-white p-3">
              <USkeleton
                v-for="index in 4"
                :key="index"
                class="h-14 w-full"
              />
            </div>

            <div v-else-if="filteredWorkItems.length" class="divide-y divide-blue-100 bg-white">
              <NuxtLink
                v-for="item in filteredWorkItems"
                :key="item.id"
                :to="item.to"
                class="outlook-row group grid gap-3 px-3 py-2.5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"
              >
                <div
                  class="flex size-10 items-center justify-center rounded-md ring-1"
                  :class="item.tone === 'success'
                    ? 'bg-blue-50 text-blue-700 ring-blue-200'
                    : item.tone === 'warning'
                      ? 'bg-amber-50 text-amber-700 ring-amber-200'
                      : 'bg-sky-50 text-sky-700 ring-sky-200'"
                >
                  <UIcon :name="item.icon" class="size-5" />
                </div>

                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <UBadge :color="item.tone" variant="subtle" size="sm">
                      {{ item.eyebrow }}
                    </UBadge>
                    <p class="font-semibold text-highlighted">
                      {{ item.title }}
                    </p>
                    <span class="text-xs text-toned">
                      {{ item.meta }}
                    </span>
                  </div>
                  <p class="mt-1 truncate text-sm font-medium text-default">
                    {{ item.subtitle }}
                  </p>
                  <p class="mt-1 line-clamp-1 text-sm text-toned">
                    {{ item.detail }}
                  </p>
                </div>

                <div class="flex items-center justify-between gap-3 md:justify-end">
                  <div v-if="item.amount !== undefined" class="text-right">
                    <p class="font-semibold text-warning tabular-nums">
                      {{ formatCurrency(item.amount) }}
                    </p>
                    <p class="text-xs text-toned">
                      restant
                    </p>
                  </div>
                  <UButton
                    :label="item.actionLabel"
                    icon="i-lucide-arrow-up-right"
                    :color="item.tone"
                    variant="soft"
                    size="sm"
                    tabindex="-1"
                    class="opacity-100 transition md:opacity-80 md:group-hover:opacity-100"
                  />
                </div>
              </NuxtLink>
            </div>

            <UEmpty
              v-else
              icon="i-lucide-check-circle-2"
              :title="emptyQueueLabel"
              description="La file comptoir se remplira dès qu’un dossier demande une action."
              class="py-14"
            />
          </section>
        </main>

        <aside class="outlook-surface overflow-hidden rounded-md lg:grid lg:grid-cols-3 2xl:sticky 2xl:top-3 2xl:block 2xl:self-start">
          <section class="border-b border-blue-100 bg-blue-50/70 p-4 lg:border-b-0 lg:border-r 2xl:border-b 2xl:border-r-0">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold text-highlighted">
                  État comptoir
                </h2>
                <p class="text-sm text-toned">
                  Files ouvertes en ce moment.
                </p>
              </div>
              <UIcon name="i-lucide-activity" class="size-5 text-primary" />
            </div>

            <div class="mt-4 divide-y divide-blue-100">
              <NuxtLink
                to="/tickets?status=ready_for_pickup"
                class="flex items-center justify-between gap-3 py-3 transition hover:text-blue-700"
              >
                <span class="text-sm text-toned">Retraits prêts</span>
                <USkeleton v-if="isCounterInitialLoading" class="h-5 w-6" />
                <span v-else class="font-semibold text-highlighted">{{ totalReadyTickets }}</span>
              </NuxtLink>
              <NuxtLink
                to="/documents?paymentState=due"
                class="flex items-center justify-between gap-3 py-3 transition hover:text-blue-700"
              >
                <span class="text-sm text-toned">Factures ouvertes</span>
                <USkeleton v-if="isCounterInitialLoading" class="h-5 w-6" />
                <span v-else class="font-semibold text-highlighted">{{ totalDueDocuments }}</span>
              </NuxtLink>
              <NuxtLink
                to="/tickets"
                class="flex items-center justify-between gap-3 py-3 transition hover:text-blue-700"
              >
                <span class="text-sm text-toned">Tickets bloqués</span>
                <USkeleton v-if="isCounterInitialLoading" class="h-5 w-6" />
                <span v-else class="font-semibold text-highlighted">{{ totalBlockedTickets }}</span>
              </NuxtLink>
            </div>
          </section>

          <section class="border-b border-blue-100 bg-white p-4 lg:border-b-0 lg:border-r 2xl:border-b 2xl:border-r-0">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-base font-semibold text-highlighted">
                Encaissements
              </h2>
              <UButton
                to="/documents?paymentState=due"
                label="Tout voir"
                color="neutral"
                variant="ghost"
                size="xs"
                class="text-blue-700 hover:bg-blue-50"
              />
            </div>

            <div v-if="isCounterInitialLoading" class="mt-3 space-y-3">
              <div v-for="index in 4" :key="index" class="grid grid-cols-[minmax(0,1fr)_5rem] gap-3 px-2 py-2">
                <div class="space-y-2">
                  <USkeleton class="h-4 w-20" />
                  <USkeleton class="h-3 w-28" />
                </div>
                <USkeleton class="h-4 w-full" />
              </div>
            </div>

            <div v-else-if="dueDocumentItems.length" class="mt-3 space-y-2">
              <NuxtLink
                v-for="document in dueDocumentItems.slice(0, 4)"
                :key="document.id"
                :to="`/documents/${document.id}`"
                class="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-[4px] px-2 py-2 transition hover:bg-blue-50"
              >
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium text-highlighted">
                    {{ document.documentNumber }}
                  </p>
                  <p class="truncate text-xs text-toned">
                    {{ document.customerName }}
                  </p>
                </div>
                <p class="text-sm font-semibold text-warning tabular-nums">
                  {{ formatCurrency(document.balanceDue) }}
                </p>
              </NuxtLink>
            </div>

            <UEmpty
              v-else
              icon="i-lucide-wallet-cards"
              title="Rien à encaisser"
              class="py-8"
            />
          </section>

          <section class="bg-white p-4">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-base font-semibold text-highlighted">
                Blocages
              </h2>
              <UButton
                to="/tickets"
                label="Tickets"
                color="neutral"
                variant="ghost"
                size="xs"
                class="text-blue-700 hover:bg-blue-50"
              />
            </div>

            <div v-if="isCounterInitialLoading" class="mt-3 space-y-3">
              <div v-for="index in 3" :key="index" class="flex items-center justify-between gap-3 px-2 py-2">
                <div class="flex items-center gap-2">
                  <USkeleton class="size-4 rounded-full" />
                  <USkeleton class="h-4 w-28" />
                </div>
                <USkeleton class="h-5 w-7" />
              </div>
            </div>

            <div v-else class="mt-3 space-y-2">
              <NuxtLink
                v-for="queue in blockedQueues"
                :key="queue.id"
                :to="queue.to"
                class="flex items-center justify-between gap-3 rounded-[4px] px-2 py-2 transition hover:bg-blue-50"
              >
                <span class="flex min-w-0 items-center gap-2">
                  <UIcon
                    :name="queue.icon"
                    class="size-4 shrink-0"
                    :class="queue.tone === 'warning' ? 'text-warning' : 'text-info'"
                  />
                  <span class="truncate text-sm font-medium text-highlighted">
                    {{ queue.title }}
                  </span>
                </span>
                <UBadge :color="queue.tone" variant="soft" size="sm">
                  {{ queue.count }}
                </UBadge>
              </NuxtLink>
            </div>
          </section>
        </aside>
      </div>
    </template>
  </UDashboardPanel>
</template>
