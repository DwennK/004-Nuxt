<script setup lang="ts">
import {
  catalogItemTypeColors,
  catalogItemTypeLabels,
  documentTypeColors,
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
  color: 'primary' | 'success' | 'warning' | 'neutral'
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

const search = ref('')
const debouncedSearch = refDebounced(search, 250)
const minimumSearchLength = 2

const searchTerm = computed(() => debouncedSearch.value.trim())
const canSearch = computed(() => searchTerm.value.length >= minimumSearchLength)

const counterActions: CounterAction[] = [{
  label: 'Vente rapide',
  description: 'Scanner, encaisser, imprimer.',
  icon: 'i-lucide-shopping-cart',
  to: '/sales/new',
  color: 'primary'
}, {
  label: 'Nouveau ticket',
  description: 'Prise en charge atelier.',
  icon: 'i-lucide-wrench',
  to: '/tickets/new',
  color: 'warning'
}, {
  label: 'Nouveau client',
  description: 'Fiche rapide comptoir.',
  icon: 'i-lucide-user-plus',
  to: '/customers/new',
  color: 'neutral'
}, {
  label: 'Document avancé',
  description: 'Devis, commande, facture.',
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
  <UDashboardPanel id="counter">
    <template #header>
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
      <div class="mx-auto flex w-full max-w-[112rem] flex-col gap-4">
        <section class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_28rem]">
          <div class="rounded-2xl border border-default bg-elevated/40 p-3">
            <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div class="relative flex-1">
                <UInput
                  v-model="search"
                  icon="i-lucide-search"
                  size="xl"
                  autofocus
                  placeholder="Client, téléphone, ticket, facture, IMEI, appareil..."
                  :loading="isSearching"
                  class="w-full"
                />
              </div>

              <div class="grid gap-2 sm:grid-cols-2 lg:w-[26rem]">
                <UButton
                  to="/sales/new"
                  label="Encaisser une vente"
                  icon="i-lucide-badge-check"
                  size="lg"
                  class="justify-center"
                />
                <UButton
                  to="/tickets/new"
                  label="Prendre un appareil"
                  icon="i-lucide-scan-line"
                  size="lg"
                  color="warning"
                  variant="soft"
                  class="justify-center"
                />
              </div>
            </div>

            <div v-if="canSearch" class="mt-3 rounded-xl border border-default bg-default p-3">
              <div class="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium text-highlighted">
                    Résultats pour “{{ searchTerm }}”
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
                  <div class="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-toned">
                    <UIcon name="i-lucide-users" class="size-4" />
                    Clients
                  </div>
                  <NuxtLink
                    v-for="customer in customerResults?.items || []"
                    :key="customer.id"
                    :to="`/customers/${customer.id}`"
                    class="block rounded-xl border border-default px-3 py-2 transition hover:bg-muted/60"
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
                  <div class="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-toned">
                    <UIcon name="i-lucide-wrench" class="size-4" />
                    Tickets
                  </div>
                  <NuxtLink
                    v-for="ticket in ticketResults?.items || []"
                    :key="ticket.id"
                    :to="`/tickets/${ticket.id}`"
                    class="block rounded-xl border border-default px-3 py-2 transition hover:bg-muted/60"
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
                  <div class="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-toned">
                    <UIcon name="i-lucide-files" class="size-4" />
                    Documents
                  </div>
                  <NuxtLink
                    v-for="document in documentResults?.items || []"
                    :key="document.id"
                    :to="`/documents/${document.id}`"
                    class="block rounded-xl border border-default px-3 py-2 transition hover:bg-muted/60"
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
                  <div class="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-toned">
                    <UIcon name="i-lucide-package-search" class="size-4" />
                    Catalogue
                  </div>
                  <NuxtLink
                    v-for="item in catalogResults?.items || []"
                    :key="item.id"
                    :to="`/catalog/${item.id}`"
                    class="block rounded-xl border border-default px-3 py-2 transition hover:bg-muted/60"
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

            <div v-else class="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              <NuxtLink
                v-for="action in counterActions"
                :key="action.to"
                :to="action.to"
                class="group rounded-xl border border-default bg-default px-3 py-3 transition hover:bg-muted/60"
              >
                <div class="flex items-start gap-3">
                  <div
                    class="flex size-10 shrink-0 items-center justify-center rounded-xl ring"
                    :class="action.color === 'primary'
                      ? 'bg-primary/10 text-primary ring-primary/15'
                      : action.color === 'warning'
                        ? 'bg-warning/10 text-warning ring-warning/15'
                        : 'bg-muted text-toned ring-default'"
                  >
                    <UIcon :name="action.icon" class="size-5" />
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-highlighted">
                      {{ action.label }}
                    </p>
                    <p class="mt-1 text-xs text-toned">
                      {{ action.description }}
                    </p>
                  </div>
                </div>
              </NuxtLink>
            </div>
          </div>

          <div class="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <NuxtLink
              to="/tickets?status=ready_for_pickup"
              class="rounded-2xl border border-success/25 bg-success/8 px-4 py-3 transition hover:bg-success/12"
            >
              <p class="text-xs font-medium uppercase tracking-[0.14em] text-success">
                À restituer
              </p>
              <div class="mt-2 flex items-end justify-between gap-3">
                <p class="text-3xl font-semibold leading-none text-highlighted">
                  {{ totalReadyTickets }}
                </p>
                <UIcon name="i-lucide-package-check" class="size-6 text-success" />
              </div>
            </NuxtLink>

            <NuxtLink
              to="/documents?paymentState=due"
              class="rounded-2xl border border-warning/25 bg-warning/8 px-4 py-3 transition hover:bg-warning/12"
            >
              <p class="text-xs font-medium uppercase tracking-[0.14em] text-warning">
                À encaisser
              </p>
              <div class="mt-2 flex items-end justify-between gap-3">
                <div>
                  <p class="text-2xl font-semibold leading-none text-highlighted">
                    {{ formatCurrency(totalDueAmount) }}
                  </p>
                  <p class="mt-1 text-xs text-toned">
                    {{ totalDueDocuments }} facture(s)
                  </p>
                </div>
                <UIcon name="i-lucide-wallet-cards" class="size-6 text-warning" />
              </div>
            </NuxtLink>

            <NuxtLink
              to="/tickets"
              class="rounded-2xl border border-info/25 bg-info/8 px-4 py-3 transition hover:bg-info/12"
            >
              <p class="text-xs font-medium uppercase tracking-[0.14em] text-info">
                Bloqués
              </p>
              <div class="mt-2 flex items-end justify-between gap-3">
                <p class="text-3xl font-semibold leading-none text-highlighted">
                  {{ totalBlockedTickets }}
                </p>
                <UIcon name="i-lucide-list-todo" class="size-6 text-info" />
              </div>
            </NuxtLink>
          </div>
        </section>

        <section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(24rem,0.9fr)]">
          <UCard
            :ui="{
              root: 'rounded-2xl shadow-sm',
              body: 'p-0',
              header: 'p-4 pb-0'
            }"
          >
            <template #header>
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Tickets prêts à restituer
                  </h2>
                  <p class="text-sm text-toned">
                    À ouvrir dès que le client est au comptoir.
                  </p>
                </div>
                <UButton
                  to="/tickets?status=ready_for_pickup"
                  label="Tout voir"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                />
              </div>
            </template>

            <div v-if="readyTicketItems.length" class="divide-y divide-default">
              <NuxtLink
                v-for="ticket in readyTicketItems"
                :key="ticket.id"
                :to="`/tickets/${ticket.id}`"
                class="group grid gap-3 px-4 py-3 transition hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
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
                  <p class="mt-1 truncate text-sm text-toned">
                    {{ getTicketSubtitle(ticket) }}
                  </p>
                  <p class="mt-1 line-clamp-1 text-sm text-toned">
                    {{ ticket.issueDescription }}
                  </p>
                </div>
                <div class="flex items-center justify-end gap-2">
                  <UButton
                    label="Ouvrir"
                    icon="i-lucide-arrow-up-right"
                    color="success"
                    variant="soft"
                    size="sm"
                    tabindex="-1"
                  />
                </div>
              </NuxtLink>
            </div>

            <UEmpty
              v-else
              icon="i-lucide-package-check"
              title="Aucun retrait en attente"
              description="Les tickets prêts apparaîtront ici."
              class="py-10"
            />
          </UCard>

          <UCard
            :ui="{
              root: 'rounded-2xl shadow-sm',
              body: 'p-0',
              header: 'p-4 pb-0'
            }"
          >
            <template #header>
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Factures à encaisser
                  </h2>
                  <p class="text-sm text-toned">
                    Soldes ouverts, triés par montant.
                  </p>
                </div>
                <UButton
                  to="/documents?paymentState=due"
                  label="Tout voir"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                />
              </div>
            </template>

            <div v-if="dueDocumentItems.length" class="divide-y divide-default">
              <NuxtLink
                v-for="document in dueDocumentItems"
                :key="document.id"
                :to="`/documents/${document.id}`"
                class="group grid gap-3 px-4 py-3 transition hover:bg-muted/40 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
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
                  <p class="mt-1 truncate text-sm text-toned">
                    {{ document.customerName }}<span v-if="document.ticketNumber"> · {{ document.ticketNumber }}</span>
                  </p>
                  <p class="mt-1 text-xs text-toned">
                    Émis le {{ formatDateTime(document.issuedAt) }}
                  </p>
                </div>
                <div class="flex items-center justify-between gap-3 md:justify-end">
                  <div class="text-right">
                    <p class="font-semibold text-warning">
                      {{ formatCurrency(document.balanceDue) }}
                    </p>
                    <p class="text-xs text-toned">
                      restant
                    </p>
                  </div>
                  <UButton
                    :label="getDocumentActionLabel(document)"
                    icon="i-lucide-wallet"
                    color="warning"
                    variant="soft"
                    size="sm"
                    tabindex="-1"
                  />
                </div>
              </NuxtLink>
            </div>

            <UEmpty
              v-else
              icon="i-lucide-wallet-cards"
              title="Rien à encaisser"
              description="Les factures avec solde apparaîtront ici."
              class="py-10"
            />
          </UCard>
        </section>

        <section>
          <div class="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 class="text-base font-semibold text-highlighted">
                Tickets bloqués
              </h2>
              <p class="text-sm text-toned">
                Les dossiers qui demandent une décision avant d’avancer.
              </p>
            </div>
          </div>

          <div class="grid gap-4 xl:grid-cols-3">
            <UCard
              v-for="queue in blockedQueues"
              :key="queue.id"
              :ui="{
                root: 'rounded-2xl shadow-sm',
                body: 'p-0',
                header: 'p-4 pb-0'
              }"
            >
              <template #header>
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-start gap-3">
                    <div
                      class="flex size-10 shrink-0 items-center justify-center rounded-xl"
                      :class="queue.tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-info/10 text-info'"
                    >
                      <UIcon :name="queue.icon" class="size-5" />
                    </div>
                    <div>
                      <h3 class="text-sm font-semibold text-highlighted">
                        {{ queue.title }}
                      </h3>
                      <p class="text-xs text-toned">
                        {{ queue.description }}
                      </p>
                    </div>
                  </div>
                  <UBadge :color="queue.tone" variant="soft">
                    {{ queue.count }}
                  </UBadge>
                </div>
              </template>

              <div v-if="queue.items.length" class="divide-y divide-default">
                <NuxtLink
                  v-for="ticket in queue.items"
                  :key="ticket.id"
                  :to="`/tickets/${ticket.id}`"
                  class="block px-4 py-3 transition hover:bg-muted/40"
                >
                  <div class="flex items-center justify-between gap-2">
                    <p class="truncate text-sm font-medium text-highlighted">
                      {{ ticket.ticketNumber }}
                    </p>
                    <span class="shrink-0 text-xs text-toned">
                      {{ formatDateTime(ticket.openedAt) }}
                    </span>
                  </div>
                  <p class="mt-1 truncate text-sm text-toned">
                    {{ getTicketSubtitle(ticket) }}
                  </p>
                  <p class="mt-1 line-clamp-1 text-xs text-toned">
                    {{ ticket.issueDescription }}
                  </p>
                </NuxtLink>

                <div v-if="queue.count > queue.items.length" class="px-4 py-3">
                  <UButton
                    :to="queue.to"
                    :label="`Voir ${queue.count - queue.items.length} autre(s)`"
                    color="neutral"
                    variant="ghost"
                    size="sm"
                    block
                  />
                </div>
              </div>

              <UEmpty
                v-else
                icon="i-lucide-check-circle-2"
                title="File vide"
                description="Aucun ticket dans cet état."
                class="py-8"
              />
            </UCard>
          </div>
        </section>
      </div>
    </template>
  </UDashboardPanel>
</template>
