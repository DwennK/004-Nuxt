<script setup lang="ts">
import {
  catalogItemTypeColors,
  catalogItemTypeLabels,
  documentTypeLabels,
  ticketStatusColors,
  ticketStatusLabels
} from '~~/shared/constants/pos'
import type {
  CatalogItemListResponse,
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
  color: 'primary' | 'warning' | 'neutral'
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
  color: 'primary'
}, {
  label: 'Nouveau ticket',
  description: 'Créer une réparation',
  icon: 'i-lucide-wrench',
  to: '/tickets/new',
  color: 'warning'
}, {
  label: 'Client',
  description: 'Rechercher un client',
  icon: 'i-lucide-user-plus',
  to: '/customers/new',
  color: 'neutral'
}, {
  label: 'Document',
  description: 'Factures, BL, devis',
  icon: 'i-lucide-file-plus-2',
  to: '/documents/new',
  color: 'neutral'
}]

const [{ data: readyTickets }, { data: dueDocuments }, { data: diagnosisTickets }, { data: approvalTickets }, { data: waitingPartsTickets }] = await Promise.all([
  useFetch<TicketListResponse>('/api/tickets', {
    key: 'counter-ready-tickets',
    query: { status: 'ready_for_pickup', pageSize: 6 }
  }),
  useFetch<DocumentListResponse>('/api/documents', {
    key: 'counter-due-documents',
    query: { paymentState: 'due', sortBy: 'balanceDue', pageSize: 6 }
  }),
  useFetch<TicketListResponse>('/api/tickets', {
    key: 'counter-diagnosis-tickets',
    query: { status: 'diagnosis', pageSize: 4 }
  }),
  useFetch<TicketListResponse>('/api/tickets', {
    key: 'counter-approval-tickets',
    query: { status: 'awaiting_customer_approval', pageSize: 4 }
  }),
  useFetch<TicketListResponse>('/api/tickets', {
    key: 'counter-waiting-parts-tickets',
    query: { status: 'waiting_parts', pageSize: 4 }
  })
])

const searchQuery = computed(() => canSearch.value ? searchTerm.value : '__no_counter_search__')

const { data: customerResults, status: customerSearchStatus } = await useFetch<CustomerListResponse>('/api/customers', {
  key: 'counter-search-customers',
  query: computed(() => ({
    search: searchQuery.value,
    pageSize: 5
  }))
})

const { data: ticketResults, status: ticketSearchStatus } = await useFetch<TicketListResponse>('/api/tickets', {
  key: 'counter-search-tickets',
  query: computed(() => ({
    q: searchQuery.value,
    pageSize: 5
  }))
})

const { data: documentResults, status: documentSearchStatus } = await useFetch<DocumentListResponse>('/api/documents', {
  key: 'counter-search-documents',
  query: computed(() => ({
    q: searchQuery.value,
    pageSize: 5
  }))
})

const { data: catalogResults, status: catalogSearchStatus } = await useFetch<CatalogItemListResponse>('/api/catalog-items', {
  key: 'counter-search-catalog',
  query: computed(() => ({
    search: searchQuery.value,
    activeOnly: true,
    pageSize: 5
  }))
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
            class="hidden bg-white text-blue-700 hover:bg-blue-50 sm:inline-flex"
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

              <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4 2xl:w-[42rem]">
                <UButton
                  v-for="action in counterActions"
                  :key="action.to"
                  :to="action.to"
                  :label="action.label"
                  :icon="action.icon"
                  :color="action.color"
                  :variant="action.color === 'primary' ? 'solid' : 'soft'"
                  size="lg"
                  class="justify-center rounded-[4px] shadow-none"
                />
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
              <p class="mt-1 text-2xl font-semibold leading-none text-highlighted">
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
              <p class="mt-1 text-2xl font-semibold leading-none text-highlighted">
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
              <p class="mt-1 truncate text-xl font-semibold leading-none text-highlighted">
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
              <p class="mt-1 text-2xl font-semibold leading-none text-highlighted">
                {{ totalBlockedTickets }}
              </p>
            </NuxtLink>
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

            <div v-if="filteredWorkItems.length" class="divide-y divide-blue-100 bg-white">
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
                <span class="font-semibold text-highlighted">{{ totalReadyTickets }}</span>
              </NuxtLink>
              <NuxtLink
                to="/documents?paymentState=due"
                class="flex items-center justify-between gap-3 py-3 transition hover:text-blue-700"
              >
                <span class="text-sm text-toned">Factures ouvertes</span>
                <span class="font-semibold text-highlighted">{{ totalDueDocuments }}</span>
              </NuxtLink>
              <NuxtLink
                to="/tickets"
                class="flex items-center justify-between gap-3 py-3 transition hover:text-blue-700"
              >
                <span class="text-sm text-toned">Tickets bloqués</span>
                <span class="font-semibold text-highlighted">{{ totalBlockedTickets }}</span>
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

            <div v-if="dueDocumentItems.length" class="mt-3 space-y-2">
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

            <div class="mt-3 space-y-2">
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
