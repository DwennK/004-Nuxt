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
  premiumTone: 'green' | 'orange' | 'blue' | 'violet'
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

type CounterKpi = {
  label: string
  value: string
  description: string
  icon: string
  tone: 'green' | 'orange' | 'blue' | 'violet'
  to: string
}

const search = ref('')
const selectedQueueFilter = ref<QueueFilter>('all')
const debouncedSearch = refDebounced(search, 250)
const minimumSearchLength = 2
const now = useNow({ interval: 60_000 })
const { isPremiumDashboardTheme } = useDashboardTheme()

const searchTerm = computed(() => debouncedSearch.value.trim())
const canSearch = computed(() => searchTerm.value.length >= minimumSearchLength)
const counterPanelUi = computed(() => isPremiumDashboardTheme.value
  ? {
      root: 'border-e-0 bg-[#061120]',
      body: 'gap-0 overflow-y-auto p-0 sm:p-0'
    }
  : undefined)

const counterActions: CounterAction[] = [{
  label: 'Vente rapide',
  description: 'Démarrer une vente',
  icon: 'i-lucide-shopping-cart',
  to: '/sales/new',
  color: 'primary',
  premiumTone: 'green'
}, {
  label: 'Nouveau ticket',
  description: 'Créer une réparation',
  icon: 'i-lucide-wrench',
  to: '/tickets/new',
  color: 'warning',
  premiumTone: 'orange'
}, {
  label: 'Client',
  description: 'Rechercher un client',
  icon: 'i-lucide-user-plus',
  to: '/customers/new',
  color: 'neutral',
  premiumTone: 'blue'
}, {
  label: 'Document',
  description: 'Factures, BL, devis',
  icon: 'i-lucide-file-plus-2',
  to: '/documents/new',
  color: 'neutral',
  premiumTone: 'violet'
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
const headerDate = computed(() => new Intl.DateTimeFormat('fr-CH', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric'
}).format(now.value))
const headerTime = computed(() => new Intl.DateTimeFormat('fr-CH', {
  hour: '2-digit',
  minute: '2-digit'
}).format(now.value))
const counterKpis = computed<CounterKpi[]>(() => [{
  label: 'À traiter',
  value: String(totalCounterItems.value),
  description: 'tâches en attente',
  icon: 'i-lucide-clipboard-check',
  tone: 'green',
  to: '/comptoir'
}, {
  label: 'Restitutions',
  value: String(totalReadyTickets.value),
  description: 'à remettre au client',
  icon: 'i-lucide-package-check',
  tone: 'green',
  to: '/tickets?status=ready_for_pickup'
}, {
  label: 'À encaisser',
  value: formatCurrency(totalDueAmount.value),
  description: 'montant à collecter',
  icon: 'i-lucide-wallet-cards',
  tone: 'orange',
  to: '/documents?paymentState=due'
}, {
  label: 'Bloqués',
  value: String(totalBlockedTickets.value),
  description: 'dossiers en attente',
  icon: 'i-lucide-lock-keyhole',
  tone: 'violet',
  to: '/tickets'
}])
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

function getWorkItemSubtitleLines(item: CounterWorkItem) {
  return item.subtitle.split(' · ').filter(Boolean)
}

function getPremiumActionIconClass(tone: CounterAction['premiumTone']) {
  if (tone === 'orange') {
    return 'bg-[#fff1dc] text-[#ff8a00] ring-[#ffd59a] shadow-[inset_0_-10px_18px_rgba(255,138,0,0.10)]'
  }

  if (tone === 'blue') {
    return 'bg-[#def2ff] text-[#1688f4] ring-[#b8e2ff] shadow-[inset_0_-10px_18px_rgba(22,136,244,0.10)]'
  }

  if (tone === 'violet') {
    return 'bg-[#eee2ff] text-[#7c3aed] ring-[#dac5ff] shadow-[inset_0_-10px_18px_rgba(124,58,237,0.10)]'
  }

  return 'bg-[#d9f8e8] text-[#10b981] ring-[#a9efcf] shadow-[inset_0_-10px_18px_rgba(16,185,129,0.10)]'
}

function getPremiumActionCardClass(tone: CounterAction['premiumTone']) {
  if (tone === 'orange') {
    return 'hover:border-orange-200/80 hover:shadow-[0_18px_50px_rgba(255,138,0,0.10)]'
  }

  if (tone === 'blue') {
    return 'hover:border-sky-200/80 hover:shadow-[0_18px_50px_rgba(22,136,244,0.10)]'
  }

  if (tone === 'violet') {
    return 'hover:border-violet-200/80 hover:shadow-[0_18px_50px_rgba(124,58,237,0.10)]'
  }

  return 'hover:border-emerald-200/80 hover:shadow-[0_18px_50px_rgba(16,185,129,0.10)]'
}

function getPremiumActionLabelClass(_tone: CounterAction['premiumTone']) {
  return 'text-slate-950'
}

function getPremiumActionDescriptionClass(_tone: CounterAction['premiumTone']) {
  return 'text-slate-500'
}

function getPremiumActionArrowClass(_tone: CounterAction['premiumTone']) {
  return 'text-slate-950 group-hover:text-emerald-600'
}

function getPremiumKpiCardClass(tone: CounterKpi['tone']) {
  if (tone === 'orange') {
    return 'border-orange-200/70 from-white to-orange-50/80 text-orange-500'
  }

  if (tone === 'blue') {
    return 'border-sky-200/70 from-white to-sky-50/80 text-sky-500'
  }

  if (tone === 'violet') {
    return 'border-violet-200/70 from-white to-violet-50/80 text-violet-500'
  }

  return 'border-emerald-200/70 from-white to-emerald-50/80 text-emerald-500'
}

function getPremiumToneBadgeClass(tone: CounterWorkItem['tone']) {
  if (tone === 'warning') {
    return 'bg-orange-50 text-orange-700 ring-orange-200'
  }

  if (tone === 'info') {
    return 'bg-sky-50 text-sky-700 ring-sky-200'
  }

  return 'bg-emerald-50 text-emerald-700 ring-emerald-200'
}

function getPremiumToneIconClass(tone: CounterWorkItem['tone']) {
  if (tone === 'warning') {
    return 'bg-orange-50 text-orange-600 ring-orange-200'
  }

  if (tone === 'info') {
    return 'bg-sky-50 text-sky-600 ring-sky-200'
  }

  return 'bg-emerald-50 text-emerald-600 ring-emerald-200'
}

useHead({
  title: 'Comptoir'
})
</script>

<template>
  <UDashboardPanel id="counter" :ui="counterPanelUi">
    <template v-if="!isPremiumDashboardTheme" #header>
      <UDashboardNavbar title="Comptoir">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            to="/sales/new"
            label="Vente rapide"
            icon="i-lucide-shopping-cart"
          />
          <UButton
            to="/tickets/new"
            label="Nouveau ticket"
            icon="i-lucide-wrench"
            color="neutral"
            variant="subtle"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div
        v-if="isPremiumDashboardTheme"
        class="relative min-h-svh overflow-hidden border border-slate-200/70 bg-[linear-gradient(180deg,#fbfcff_0%,#f7f9fd_45%,#ffffff_100%)] px-4 py-5 shadow-[0_28px_90px_rgba(15,23,42,0.10)] sm:px-6 lg:rounded-l-[3rem] lg:rounded-r-[2rem] lg:border-y-0 lg:px-14 lg:pt-12"
      >
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_74%_10%,rgba(16,185,129,0.13),transparent_26%),radial-gradient(circle_at_88%_56%,rgba(124,58,237,0.08),transparent_28%)]" />
        <div class="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(255,255,255,0.92)_0%,rgba(255,255,255,0)_100%)]" />

        <div class="relative mx-auto max-w-[104rem]">
          <header class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
            <div class="min-w-0 flex-1">
              <div class="flex flex-wrap items-center gap-3">
                <UDashboardSidebarCollapse class="lg:hidden" />
                <h1 class="text-5xl font-black tracking-normal text-slate-950 sm:text-6xl">
                  Comptoir
                </h1>
                <span class="inline-flex items-center gap-2 rounded-full bg-white/80 px-3 py-1 text-sm font-bold text-emerald-700 shadow-sm ring-1 ring-emerald-200 backdrop-blur">
                  <span class="size-2 rounded-full bg-emerald-500" />
                  En ligne
                </span>
              </div>
              <p class="mt-3 max-w-3xl text-base text-slate-500">
                Gérez vos réparations, encaissements et restitutions en un coup d’œil.
              </p>
            </div>

            <div class="flex shrink-0 flex-col items-stretch gap-4 sm:items-end xl:-mt-8">
              <div class="flex items-center justify-end gap-3">
                <div class="flex items-center gap-2">
                  <UButton
                    icon="i-lucide-search"
                    color="neutral"
                    variant="soft"
                    square
                    class="rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                  />
                  <UButton
                    icon="i-lucide-bell"
                    color="neutral"
                    variant="soft"
                    square
                    class="rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                  />
                  <UButton
                    icon="i-lucide-sun"
                    color="neutral"
                    variant="soft"
                    square
                    class="rounded-full bg-white text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
                  />
                </div>

                <div class="hidden min-w-32 text-right md:block">
                  <p class="text-xs font-medium capitalize text-slate-500">
                    {{ headerDate }}
                  </p>
                  <p class="text-2xl font-extrabold leading-tight text-slate-950 tabular-nums">
                    {{ headerTime }}
                  </p>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-3 sm:justify-end">
                <NuxtLink
                  to="/sales/new"
                  class="group inline-flex h-[3.25rem] w-[11.25rem] items-center gap-3 rounded-[0.95rem] bg-[linear-gradient(180deg,#21c78a_0%,#08a96a_100%)] px-5 text-sm font-extrabold text-white shadow-[0_18px_42px_rgba(16,185,129,0.32)] ring-1 ring-emerald-400/40 transition hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(16,185,129,0.38)]"
                >
                  <UIcon name="i-lucide-shopping-cart" class="size-6 shrink-0" />
                  <span class="flex-1 whitespace-nowrap">Vente rapide</span>
                  <UIcon name="i-lucide-chevron-right" class="size-5 shrink-0 text-emerald-100 transition group-hover:translate-x-0.5" />
                </NuxtLink>
                <NuxtLink
                  to="/tickets/new"
                  class="group inline-flex h-[3.25rem] items-center rounded-[0.95rem] bg-[linear-gradient(180deg,#081327_0%,#020817_100%)] px-4 text-sm font-extrabold text-white shadow-[0_18px_42px_rgba(15,23,42,0.26)] ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:shadow-[0_22px_48px_rgba(15,23,42,0.32)]"
                >
                  <span class="inline-flex items-center gap-3 pr-4">
                    <UIcon name="i-lucide-plus-square" class="size-5 shrink-0 text-white" />
                    <span class="whitespace-nowrap">Nouveau ticket</span>
                  </span>
                  <span class="h-6 w-px bg-white/10" />
                  <UIcon name="i-lucide-chevron-down" class="ml-4 size-5 shrink-0 text-white/80 transition group-hover:translate-y-0.5" />
                </NuxtLink>
              </div>
            </div>
          </header>

          <section class="mt-4 rounded-[1.5rem] border border-slate-200/80 bg-white/90 p-2 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
            <div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
              <UInput
                v-model="search"
                icon="i-lucide-search"
                size="xl"
                autofocus
                placeholder="Scanner ou rechercher client, ticket, facture, téléphone, IMEI…"
                :loading="isSearching"
                class="w-full"
                :ui="{ base: 'h-12 rounded-[1.15rem] border-0 bg-transparent px-4 text-base text-slate-900 shadow-none ring-0 placeholder:text-slate-400 focus-visible:ring-0' }"
              />

              <div class="flex gap-2">
                <UButton
                  icon="i-lucide-maximize"
                  color="neutral"
                  variant="soft"
                  size="lg"
                  square
                  class="rounded-2xl bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
                />
              </div>
            </div>
          </section>

          <section v-if="canSearch" class="mt-4 rounded-[1.5rem] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.07)]">
            <div class="mb-4 flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate text-sm font-bold text-slate-950">
                  Résultats pour "{{ searchTerm }}"
                </p>
                <p class="text-sm text-slate-500">
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
                <div class="flex items-center gap-2 text-xs font-bold text-slate-500">
                  <UIcon name="i-lucide-users" class="size-4 text-sky-500" />
                  Clients
                </div>
                <NuxtLink
                  v-for="customer in customerResults?.items || []"
                  :key="customer.id"
                  :to="`/customers/${customer.id}`"
                  class="block rounded-2xl border border-slate-200 px-3 py-2.5 transition hover:border-emerald-200 hover:bg-emerald-50/40"
                >
                  <p class="truncate text-sm font-semibold text-slate-950">
                    {{ customer.displayName }}
                  </p>
                  <p class="truncate text-xs text-slate-500">
                    {{ [customer.phone, customer.email].filter(Boolean).join(' · ') || 'Fiche client' }}
                  </p>
                </NuxtLink>
              </div>

              <div class="space-y-2">
                <div class="flex items-center gap-2 text-xs font-bold text-slate-500">
                  <UIcon name="i-lucide-wrench" class="size-4 text-orange-500" />
                  Tickets
                </div>
                <NuxtLink
                  v-for="ticket in ticketResults?.items || []"
                  :key="ticket.id"
                  :to="`/tickets/${ticket.id}`"
                  class="block rounded-2xl border border-slate-200 px-3 py-2.5 transition hover:border-emerald-200 hover:bg-emerald-50/40"
                >
                  <div class="flex items-center justify-between gap-2">
                    <p class="truncate text-sm font-semibold text-slate-950">
                      {{ ticket.ticketNumber }}
                    </p>
                    <UBadge :color="ticketStatusColors[ticket.status]" variant="subtle" size="sm">
                      {{ ticketStatusLabels[ticket.status] }}
                    </UBadge>
                  </div>
                  <p class="truncate text-xs text-slate-500">
                    {{ getTicketSubtitle(ticket) }}
                  </p>
                </NuxtLink>
              </div>

              <div class="space-y-2">
                <div class="flex items-center gap-2 text-xs font-bold text-slate-500">
                  <UIcon name="i-lucide-files" class="size-4 text-violet-500" />
                  Documents
                </div>
                <NuxtLink
                  v-for="document in documentResults?.items || []"
                  :key="document.id"
                  :to="`/documents/${document.id}`"
                  class="block rounded-2xl border border-slate-200 px-3 py-2.5 transition hover:border-emerald-200 hover:bg-emerald-50/40"
                >
                  <div class="flex items-center justify-between gap-2">
                    <p class="truncate text-sm font-semibold text-slate-950">
                      {{ document.documentNumber }}
                    </p>
                    <span class="text-xs font-bold text-slate-950">
                      {{ formatCurrency(document.total) }}
                    </span>
                  </div>
                  <p class="truncate text-xs text-slate-500">
                    {{ document.customerName }}
                  </p>
                </NuxtLink>
              </div>

              <div class="space-y-2">
                <div class="flex items-center gap-2 text-xs font-bold text-slate-500">
                  <UIcon name="i-lucide-package-search" class="size-4 text-emerald-500" />
                  Catalogue
                </div>
                <NuxtLink
                  v-for="item in catalogResults?.items || []"
                  :key="item.id"
                  :to="`/catalog/${item.id}`"
                  class="block rounded-2xl border border-slate-200 px-3 py-2.5 transition hover:border-emerald-200 hover:bg-emerald-50/40"
                >
                  <div class="flex items-center justify-between gap-2">
                    <p class="truncate text-sm font-semibold text-slate-950">
                      {{ item.name }}
                    </p>
                    <UBadge :color="catalogItemTypeColors[item.type]" variant="subtle" size="sm">
                      {{ catalogItemTypeLabels[item.type] }}
                    </UBadge>
                  </div>
                  <p class="truncate text-xs text-slate-500">
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
          </section>

          <section class="mt-5 grid gap-4 lg:grid-cols-4">
            <NuxtLink
              v-for="action in counterActions"
              :key="action.to"
              :to="action.to"
              class="group relative flex h-[6.1rem] items-center gap-4 overflow-hidden rounded-[1.15rem] border border-slate-200/80 bg-white px-5 py-4 shadow-[0_15px_40px_rgba(15,23,42,0.055)] transition duration-200 hover:-translate-y-px"
              :class="getPremiumActionCardClass(action.premiumTone)"
            >
              <span
                class="flex size-14 shrink-0 items-center justify-center rounded-[1rem] ring-1 transition duration-200 group-hover:scale-[1.03]"
                :class="getPremiumActionIconClass(action.premiumTone)"
              >
                <UIcon :name="action.icon" class="size-7" />
              </span>
              <span class="min-w-0 flex-1">
                <span
                  class="block whitespace-nowrap text-base font-extrabold leading-tight"
                  :class="getPremiumActionLabelClass(action.premiumTone)"
                >
                  {{ action.label }}
                </span>
                <span
                  class="mt-1 block whitespace-nowrap text-sm font-medium leading-snug"
                  :class="getPremiumActionDescriptionClass(action.premiumTone)"
                >
                  {{ action.description }}
                </span>
              </span>
              <span
                class="flex size-8 shrink-0 items-center justify-center transition duration-200 group-hover:translate-x-0.5"
                :class="getPremiumActionArrowClass(action.premiumTone)"
              >
                <UIcon name="i-lucide-chevron-right" class="size-6" />
              </span>
            </NuxtLink>
          </section>

          <section class="mt-5 grid gap-4 lg:grid-cols-4">
            <NuxtLink
              v-for="kpi in counterKpis"
              :key="kpi.label"
              :to="kpi.to"
              class="group relative h-[8.6rem] overflow-hidden rounded-[1.15rem] border bg-gradient-to-br p-5 shadow-[0_18px_55px_rgba(15,23,42,0.06)] transition duration-200 hover:-translate-y-px hover:shadow-[0_24px_70px_rgba(15,23,42,0.10)]"
              :class="getPremiumKpiCardClass(kpi.tone)"
            >
              <span class="absolute inset-x-5 top-0 h-1 rounded-b-full bg-current opacity-25" />
              <div class="flex h-full items-center gap-5">
                <span
                  class="flex size-16 shrink-0 items-center justify-center rounded-[1.1rem] bg-white/90 shadow-sm ring-1 ring-current/20 transition group-hover:scale-[1.03]"
                >
                  <UIcon :name="kpi.icon" class="size-8" />
                </span>

                <div class="min-w-0 flex-1">
                  <p class="text-sm font-bold text-slate-600">
                    {{ kpi.label }}
                  </p>
                  <p class="mt-1 whitespace-nowrap pr-8 text-[1.55rem] font-extrabold leading-tight tracking-normal text-slate-950 tabular-nums">
                    {{ kpi.value }}
                  </p>
                  <p class="mt-2 truncate pr-8 text-sm text-slate-500">
                    {{ kpi.description }}
                  </p>
                </div>

                <span class="absolute bottom-6 right-5 flex items-end gap-1 opacity-45 transition group-hover:opacity-70">
                  <span class="h-1.5 w-1.5 rounded-full bg-current transition group-hover:h-3" />
                  <span class="h-2.5 w-1.5 rounded-full bg-current transition group-hover:h-5" />
                  <span class="h-4 w-1.5 rounded-full bg-current transition group-hover:h-2.5" />
                  <span class="h-2 w-1.5 rounded-full bg-current transition group-hover:h-4" />
                  <span class="h-5 w-1.5 rounded-full bg-current transition group-hover:h-6" />
                </span>
              </div>
            </NuxtLink>
          </section>

          <section class="mt-6 overflow-hidden rounded-[1.5rem] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.08)]">
            <div class="flex flex-col gap-4 border-b border-slate-200 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 class="text-2xl font-extrabold tracking-normal text-slate-950">
                  À traiter maintenant
                </h2>
                <p class="mt-1 text-sm text-slate-500">
                  Restitutions, encaissements et dossiers bloqués au même endroit.
                </p>
              </div>

              <div class="flex flex-wrap gap-1 rounded-2xl bg-slate-100/90 p-1 shadow-inner ring-1 ring-slate-200/80">
                <button
                  v-for="filter in queueFilters"
                  :key="filter.value"
                  type="button"
                  class="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition"
                  :class="selectedQueueFilter === filter.value ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/15' : 'text-slate-500 hover:text-slate-950'"
                  @click="selectedQueueFilter = filter.value"
                >
                  <span>{{ filter.label }}</span>
                  <span
                    class="rounded-lg px-1.5 py-0.5 text-xs tabular-nums"
                    :class="selectedQueueFilter === filter.value ? 'bg-white/15 text-white' : 'bg-white text-slate-500'"
                  >
                    {{ filter.count }}
                  </span>
                </button>
              </div>
            </div>

            <div v-if="filteredWorkItems.length" class="divide-y divide-slate-100">
              <NuxtLink
                v-for="item in filteredWorkItems"
                :key="item.id"
                :to="item.to"
                class="group grid gap-4 px-5 py-3 transition hover:bg-slate-50/80 xl:grid-cols-[auto_10rem_minmax(0,1.1fr)_minmax(0,1fr)_auto] xl:items-center"
              >
                <div
                  class="flex size-9 items-center justify-center rounded-xl ring-1"
                  :class="getPremiumToneIconClass(item.tone)"
                >
                  <UIcon :name="item.icon" class="size-5" />
                </div>

                <div class="flex flex-wrap items-center gap-2">
                  <span
                    class="inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-bold ring-1"
                    :class="getPremiumToneBadgeClass(item.tone)"
                  >
                    {{ item.eyebrow }}
                  </span>
                  <div>
                    <p class="font-extrabold text-slate-950">
                      {{ item.title }}
                    </p>
                    <p class="text-xs text-slate-500">
                      {{ item.kind === 'payment' ? item.detail : item.meta }}
                    </p>
                  </div>
                </div>

                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-slate-950">
                    {{ getWorkItemSubtitleLines(item)[0] }}
                  </p>
                  <p
                    v-if="getWorkItemSubtitleLines(item)[1]"
                    class="mt-0.5 truncate text-sm text-slate-500"
                  >
                    {{ getWorkItemSubtitleLines(item).slice(1).join(' · ') }}
                  </p>
                </div>

                <p class="min-w-0 truncate text-sm text-slate-500">
                  {{ item.kind === 'payment' ? item.meta : item.detail }}
                </p>

                <div class="flex items-center justify-between gap-4 xl:justify-end">
                  <p
                    v-if="item.amount !== undefined"
                    class="min-w-32 text-right text-base font-black text-orange-500 tabular-nums"
                  >
                    {{ formatCurrency(item.amount) }}
                  </p>
                  <UButton
                    :label="item.actionLabel"
                    :icon="item.actionLabel === 'Encaisser' ? 'i-lucide-credit-card' : 'i-lucide-arrow-up-right'"
                    :color="item.actionLabel === 'Encaisser' ? 'warning' : 'primary'"
                    variant="soft"
                    size="sm"
                    class="h-9 rounded-xl px-4 font-black"
                    tabindex="-1"
                  />
                </div>
              </NuxtLink>
            </div>

            <UEmpty
              v-else
              icon="i-lucide-check-circle-2"
              :title="emptyQueueLabel"
              description="La file comptoir se remplira dès qu’un dossier demande une action."
              class="py-16"
            />
          </section>
        </div>
      </div>

      <div v-else class="mx-auto grid w-full max-w-[118rem] gap-4 2xl:grid-cols-[minmax(0,1fr)_24rem]">
        <main class="min-w-0 space-y-4">
          <section class="rounded-xl border border-default bg-default shadow-sm">
            <div class="grid gap-3 border-b border-default p-3 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-center">
              <UInput
                v-model="search"
                icon="i-lucide-search"
                size="xl"
                autofocus
                placeholder="Scanner ou rechercher client, ticket, facture, téléphone, IMEI..."
                :loading="isSearching"
                class="w-full"
              />

              <div class="grid grid-cols-2 gap-2 sm:grid-cols-4 2xl:w-[34rem]">
                <UButton
                  v-for="action in counterActions"
                  :key="action.to"
                  :to="action.to"
                  :label="action.label"
                  :icon="action.icon"
                  :color="action.color"
                  :variant="action.color === 'primary' ? 'solid' : 'soft'"
                  size="lg"
                  class="justify-center"
                />
              </div>
            </div>

            <div v-if="canSearch" class="p-3">
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
                  <div class="flex items-center gap-2 text-xs font-medium text-toned">
                    <UIcon name="i-lucide-users" class="size-4" />
                    Clients
                  </div>
                  <NuxtLink
                    v-for="customer in customerResults?.items || []"
                    :key="customer.id"
                    :to="`/customers/${customer.id}`"
                    class="block rounded-lg border border-default px-3 py-2 transition hover:border-primary/30 hover:bg-muted/40"
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
                  <div class="flex items-center gap-2 text-xs font-medium text-toned">
                    <UIcon name="i-lucide-wrench" class="size-4" />
                    Tickets
                  </div>
                  <NuxtLink
                    v-for="ticket in ticketResults?.items || []"
                    :key="ticket.id"
                    :to="`/tickets/${ticket.id}`"
                    class="block rounded-lg border border-default px-3 py-2 transition hover:border-primary/30 hover:bg-muted/40"
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
                  <div class="flex items-center gap-2 text-xs font-medium text-toned">
                    <UIcon name="i-lucide-files" class="size-4" />
                    Documents
                  </div>
                  <NuxtLink
                    v-for="document in documentResults?.items || []"
                    :key="document.id"
                    :to="`/documents/${document.id}`"
                    class="block rounded-lg border border-default px-3 py-2 transition hover:border-primary/30 hover:bg-muted/40"
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
                  <div class="flex items-center gap-2 text-xs font-medium text-toned">
                    <UIcon name="i-lucide-package-search" class="size-4" />
                    Catalogue
                  </div>
                  <NuxtLink
                    v-for="item in catalogResults?.items || []"
                    :key="item.id"
                    :to="`/catalog/${item.id}`"
                    class="block rounded-lg border border-default px-3 py-2 transition hover:border-primary/30 hover:bg-muted/40"
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

          <section class="grid gap-2 md:grid-cols-4">
            <NuxtLink
              to="/comptoir"
              class="rounded-lg border border-default bg-elevated/35 px-3 py-2.5 transition hover:bg-muted/50"
            >
              <p class="text-xs font-medium text-toned">
                À traiter
              </p>
              <p class="mt-1 text-2xl font-semibold leading-none text-highlighted">
                {{ totalCounterItems }}
              </p>
            </NuxtLink>
            <NuxtLink
              to="/tickets?status=ready_for_pickup"
              class="rounded-lg border border-success/20 bg-success/5 px-3 py-2.5 transition hover:bg-success/10"
            >
              <p class="text-xs font-medium text-success">
                Restitutions
              </p>
              <p class="mt-1 text-2xl font-semibold leading-none text-highlighted">
                {{ totalReadyTickets }}
              </p>
            </NuxtLink>
            <NuxtLink
              to="/documents?paymentState=due"
              class="rounded-lg border border-warning/20 bg-warning/5 px-3 py-2.5 transition hover:bg-warning/10"
            >
              <p class="text-xs font-medium text-warning">
                À encaisser
              </p>
              <p class="mt-1 truncate text-xl font-semibold leading-none text-highlighted">
                {{ formatCurrency(totalDueAmount) }}
              </p>
            </NuxtLink>
            <NuxtLink
              to="/tickets"
              class="rounded-lg border border-info/20 bg-info/5 px-3 py-2.5 transition hover:bg-info/10"
            >
              <p class="text-xs font-medium text-info">
                Bloqués
              </p>
              <p class="mt-1 text-2xl font-semibold leading-none text-highlighted">
                {{ totalBlockedTickets }}
              </p>
            </NuxtLink>
          </section>

          <section class="overflow-hidden rounded-xl border border-default bg-default shadow-sm">
            <div class="flex flex-col gap-3 border-b border-default p-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  À traiter maintenant
                </h2>
                <p class="text-sm text-toned">
                  Restitutions, encaissements et dossiers bloqués au même endroit.
                </p>
              </div>

              <div class="flex flex-wrap gap-1 rounded-lg bg-elevated p-1">
                <button
                  v-for="filter in queueFilters"
                  :key="filter.value"
                  type="button"
                  class="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition"
                  :class="selectedQueueFilter === filter.value ? 'bg-default text-highlighted shadow-sm ring-1 ring-default' : 'text-toned hover:text-highlighted'"
                  @click="selectedQueueFilter = filter.value"
                >
                  <span>{{ filter.label }}</span>
                  <span
                    class="rounded bg-muted px-1.5 py-0.5 text-xs tabular-nums"
                    :class="selectedQueueFilter === filter.value ? 'text-highlighted' : 'text-toned'"
                  >
                    {{ filter.count }}
                  </span>
                </button>
              </div>
            </div>

            <div v-if="filteredWorkItems.length" class="divide-y divide-default">
              <NuxtLink
                v-for="item in filteredWorkItems"
                :key="item.id"
                :to="item.to"
                class="group grid gap-3 px-4 py-3 transition hover:bg-muted/35 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"
              >
                <div
                  class="flex size-10 items-center justify-center rounded-lg"
                  :class="item.tone === 'success'
                    ? 'bg-success/10 text-success'
                    : item.tone === 'warning'
                      ? 'bg-warning/10 text-warning'
                      : 'bg-info/10 text-info'"
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

        <aside class="grid gap-4 lg:grid-cols-3 2xl:sticky 2xl:top-4 2xl:block 2xl:self-start 2xl:space-y-4">
          <section class="rounded-xl border border-default bg-default p-4 shadow-sm">
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

            <div class="mt-4 divide-y divide-default">
              <NuxtLink
                to="/tickets?status=ready_for_pickup"
                class="flex items-center justify-between gap-3 py-3"
              >
                <span class="text-sm text-toned">Retraits prêts</span>
                <span class="font-semibold text-highlighted">{{ totalReadyTickets }}</span>
              </NuxtLink>
              <NuxtLink
                to="/documents?paymentState=due"
                class="flex items-center justify-between gap-3 py-3"
              >
                <span class="text-sm text-toned">Factures ouvertes</span>
                <span class="font-semibold text-highlighted">{{ totalDueDocuments }}</span>
              </NuxtLink>
              <NuxtLink
                to="/tickets"
                class="flex items-center justify-between gap-3 py-3"
              >
                <span class="text-sm text-toned">Tickets bloqués</span>
                <span class="font-semibold text-highlighted">{{ totalBlockedTickets }}</span>
              </NuxtLink>
            </div>
          </section>

          <section class="rounded-xl border border-default bg-default p-4 shadow-sm">
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
              />
            </div>

            <div v-if="dueDocumentItems.length" class="mt-3 space-y-2">
              <NuxtLink
                v-for="document in dueDocumentItems.slice(0, 4)"
                :key="document.id"
                :to="`/documents/${document.id}`"
                class="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-lg px-2 py-2 transition hover:bg-muted/40"
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

          <section class="rounded-xl border border-default bg-default p-4 shadow-sm">
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
              />
            </div>

            <div class="mt-3 space-y-2">
              <NuxtLink
                v-for="queue in blockedQueues"
                :key="queue.id"
                :to="queue.to"
                class="flex items-center justify-between gap-3 rounded-lg px-2 py-2 transition hover:bg-muted/40"
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
