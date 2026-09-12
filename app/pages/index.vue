<script setup lang="ts">
import {
  catalogItemTypeColors,
  catalogItemTypeLabels,
  paymentMethodLabels,
  ticketStatusColors,
  ticketStatusLabels
} from '~~/shared/constants/pos'
import type {
  CounterOverviewResponse,
  TicketListItem
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

type QueueFilter = 'all' | 'pickup' | 'blocked'

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
  actionLabel: string
}

const search = ref('')
const handleRecordScan = useRecordScan(search)
const selectedQueueFilter = ref<QueueFilter>('all')
const {
  searchTerm,
  canSearch,
  results: globalSearchResults,
  loading: isSearching
} = useGlobalSearch(search, 5)

const counterActions: CounterAction[] = [{
  label: 'Vente rapide',
  description: 'Démarrer une vente',
  icon: 'i-lucide-shopping-cart',
  to: '/sales/new',
  variant: 'solid'
}, {
  label: 'Nouveau dossier',
  description: 'Créer une réparation',
  icon: 'i-lucide-wrench',
  to: '/dossiers/new',
  variant: 'soft'
}]

const { data: counterOverview, status: counterOverviewStatus, refresh } = await useFetch<CounterOverviewResponse>('/api/comptoir', {
  key: 'counter-overview',
  lazy: true
})

const readyTickets = computed(() => counterOverview.value?.readyTickets)
const diagnosisTickets = computed(() => counterOverview.value?.diagnosisTickets)
const approvalTickets = computed(() => counterOverview.value?.approvalTickets)
const waitingPartsTickets = computed(() => counterOverview.value?.waitingPartsTickets)
const dailyPayments = computed(() => counterOverview.value?.dailyPayments)

const customerResults = computed(() => globalSearchResults.value?.customers)
const ticketResults = computed(() => globalSearchResults.value?.tickets)
const documentResults = computed(() => globalSearchResults.value?.documents)
const catalogResults = computed(() => globalSearchResults.value?.catalogItems)

const readyTicketItems = computed(() => readyTickets.value?.items || [])

const blockedQueues = computed<WorkQueue[]>(() => [{
  id: 'diagnosis',
  title: 'Diagnostic',
  description: 'Dossiers à analyser ou chiffrer.',
  icon: 'i-lucide-stethoscope',
  count: diagnosisTickets.value?.total || 0,
  tone: 'info',
  to: '/dossiers?status=diagnosis',
  items: diagnosisTickets.value?.items || []
}, {
  id: 'approval',
  title: 'Accord client',
  description: 'Relancer, accepter ou refuser.',
  icon: 'i-lucide-badge-help',
  count: approvalTickets.value?.total || 0,
  tone: 'warning',
  to: '/dossiers?status=awaiting_customer_approval',
  items: approvalTickets.value?.items || []
}, {
  id: 'parts',
  title: 'Pièces',
  description: 'En attente de réception.',
  icon: 'i-lucide-package-search',
  count: waitingPartsTickets.value?.total || 0,
  tone: 'warning',
  to: '/dossiers?status=waiting_parts',
  items: waitingPartsTickets.value?.items || []
}])

const totalReadyTickets = computed(() => readyTickets.value?.total || 0)
const totalBlockedTickets = computed(() => blockedQueues.value.reduce((total, queue) => total + queue.count, 0))
const totalCounterItems = computed(() => totalReadyTickets.value + totalBlockedTickets.value)
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
  label: 'Bloqués',
  value: 'blocked',
  count: totalBlockedTickets.value
}])
const counterWorkItems = computed<CounterWorkItem[]>(() => {
  const pickupItems = readyTicketItems.value.map(ticket => ({
    id: `pickup-${ticket.id}`,
    kind: 'pickup' as const,
    to: `/dossiers/${ticket.id}`,
    icon: 'i-lucide-package-check',
    tone: 'success' as const,
    eyebrow: 'Restitution',
    title: ticket.ticketNumber,
    subtitle: getTicketSubtitle(ticket),
    detail: ticket.issueDescription,
    meta: formatDateTime(ticket.openedAt),
    actionLabel: 'Ouvrir'
  }))

  const blockedItems = blockedQueues.value.flatMap(queue => queue.items.map(ticket => ({
    id: `blocked-${queue.id}-${ticket.id}`,
    kind: 'blocked' as const,
    to: `/dossiers/${ticket.id}`,
    icon: queue.icon,
    tone: queue.tone,
    eyebrow: queue.title,
    title: ticket.ticketNumber,
    subtitle: getTicketSubtitle(ticket),
    detail: ticket.issueDescription,
    meta: formatDateTime(ticket.openedAt),
    actionLabel: 'Traiter'
  })))

  return [...pickupItems, ...blockedItems]
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

  if (selectedQueueFilter.value === 'blocked') {
    return 'Aucun dossier bloqué'
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
function clearSearch() {
  search.value = ''
}

function getTicketSubtitle(ticket: Pick<TicketListItem, 'customerName' | 'brand' | 'model'>) {
  return [ticket.customerName, [ticket.brand, ticket.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
}

useHead({
  title: 'Accueil'
})
</script>

<template>
  <UDashboardPanel id="counter" class="outlook-panel">
    <template #header>
      <UDashboardNavbar
        title="Accueil"
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
            to="/dossiers/new"
            label="Nouveau dossier"
            icon="i-lucide-wrench"
            color="neutral"
            variant="ghost"
            class="hidden text-white hover:bg-default/15 sm:inline-flex"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto grid w-full max-w-[118rem] gap-3 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <main class="min-w-0 space-y-3">
          <section class="outlook-mail-toolbar overflow-hidden rounded-md">
            <div class="grid gap-2 border-b border-default bg-default p-2 2xl:grid-cols-[minmax(0,1fr)_auto] 2xl:items-center">
              <div class="flex items-center gap-2">
                <UInput
                  v-model="search"
                  icon="i-lucide-search"
                  size="xl"
                  autofocus
                  placeholder="Scanner ou rechercher client, dossier, facture, téléphone, IMEI..."
                  :loading="isSearching"
                  class="w-full"
                  :ui="{ base: 'h-10 rounded-[4px] bg-muted ring-accented focus-visible:ring-primary' }"
                />
                <PosBarcodeScanner
                  trigger-size="xl"
                  title="Scanner un document ou un code-barres"
                  trigger-aria-label="Scanner un document ou un code-barres avec la caméra"
                  @scanned="handleRecordScan"
                />
              </div>

              <div class="grid grid-cols-2 gap-2 2xl:w-[34rem]">
                <NuxtLink
                  v-for="action in counterActions"
                  :key="action.to"
                  :to="action.to"
                  class="group flex min-h-16 items-center gap-2 rounded-[6px] border px-2 py-2.5 sm:gap-3 sm:px-3 transition focus-visible:outline-2 focus-visible:outline-offset-2"
                  :class="action.variant === 'solid'
                    ? 'border-primary bg-primary text-inverted shadow-sm hover:bg-primary/75 focus-visible:outline-primary/25'
                    : 'border-primary/25 bg-primary/10 text-primary hover:border-primary/40 hover:bg-primary/15 focus-visible:outline-primary/25'"
                >
                  <span
                    class="flex size-8 shrink-0 items-center justify-center rounded-[5px] ring-1 transition sm:size-10"
                    :class="action.variant === 'solid'
                      ? 'bg-default/15 text-inverted ring-default/25 group-hover:bg-default/20'
                      : 'bg-default text-primary ring-primary/20 group-hover:ring-primary/30'"
                  >
                    <UIcon :name="action.icon" class="size-5" />
                  </span>
                  <span class="min-w-0">
                    <span class="block text-xs font-semibold leading-5 sm:text-sm">
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

            <div v-if="canSearch" class="bg-default p-3">
              <div class="mb-3 flex items-center justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-semibold text-highlighted">
                    Résultats pour "{{ searchTerm }}"
                  </p>
                  <p class="text-xs text-toned">
                    Clients, dossiers, documents et catalogue.
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
                  <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    <UIcon name="i-lucide-users" class="size-4 text-primary" />
                    Clients
                  </div>
                  <NuxtLink
                    v-for="customer in customerResults?.items || []"
                    :key="customer.id"
                    :to="`/customers/${customer.id}`"
                    class="block rounded-md border border-default px-3 py-2 transition hover:border-primary hover:bg-muted"
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
                  <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    <UIcon name="i-lucide-wrench" class="size-4 text-primary" />
                    Dossiers
                  </div>
                  <NuxtLink
                    v-for="ticket in ticketResults?.items || []"
                    :key="ticket.id"
                    :to="`/dossiers/${ticket.id}`"
                    class="block rounded-md border border-default px-3 py-2 transition hover:border-primary hover:bg-muted"
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
                  <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    <UIcon name="i-lucide-files" class="size-4 text-primary" />
                    Documents
                  </div>
                  <NuxtLink
                    v-for="document in documentResults?.items || []"
                    :key="document.id"
                    :to="`/documents/${document.id}`"
                    class="block rounded-md border border-default px-3 py-2 transition hover:border-primary hover:bg-muted"
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
                  <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                    <UIcon name="i-lucide-package-search" class="size-4 text-primary" />
                    Catalogue
                  </div>
                  <NuxtLink
                    v-for="item in catalogResults?.items || []"
                    :key="item.id"
                    :to="`/catalog/${item.id}`"
                    class="block rounded-md border border-default px-3 py-2 transition hover:border-primary hover:bg-muted"
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

          <section class="outlook-mail-toolbar grid grid-cols-3 overflow-hidden rounded-md">
            <NuxtLink
              to="/"
              class="border-r border-default px-3 py-2.5 transition hover:bg-muted"
            >
              <p class="text-xs font-semibold uppercase tracking-wide text-muted">
                À traiter
              </p>
              <USkeleton v-if="isCounterInitialLoading" class="mt-1 h-7 w-10" />
              <p v-else class="mt-1 text-2xl font-semibold leading-none text-highlighted">
                {{ totalCounterItems }}
              </p>
            </NuxtLink>
            <NuxtLink
              to="/dossiers?status=ready_for_pickup"
              class="border-r border-default px-3 py-2.5 transition hover:bg-muted"
            >
              <p class="text-xs font-semibold uppercase tracking-wide text-primary">
                Restitutions
              </p>
              <USkeleton v-if="isCounterInitialLoading" class="mt-1 h-7 w-8" />
              <p v-else class="mt-1 text-2xl font-semibold leading-none text-highlighted">
                {{ totalReadyTickets }}
              </p>
            </NuxtLink>
            <NuxtLink
              to="/dossiers"
              class="px-3 py-2.5 transition hover:bg-muted"
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

          <UAlert
            v-if="counterOverviewStatus === 'error'"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            title="Chargement de l’accueil indisponible"
          >
            <template #actions>
              <UButton
                label="Réessayer"
                color="error"
                variant="soft"
                @click="refresh()"
              />
            </template>
          </UAlert>

          <section class="outlook-surface overflow-hidden rounded-md">
            <div class="flex flex-col gap-3 border-b border-default bg-default p-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  À traiter maintenant
                </h2>
                <p class="text-sm text-toned">
                  Dossiers prêts et en attente.
                </p>
              </div>

              <div class="flex flex-wrap gap-1 rounded-[4px] bg-muted p-1 ring-1 ring-default">
                <button
                  v-for="filter in queueFilters"
                  :key="filter.value"
                  type="button"
                  :aria-pressed="selectedQueueFilter === filter.value"
                  class="inline-flex items-center gap-2 rounded-[4px] px-2 py-1.5 text-sm font-medium transition sm:px-3"
                  :class="selectedQueueFilter === filter.value ? 'outlook-tab-active' : 'text-toned hover:bg-default/60 hover:text-highlighted'"
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

            <div v-if="isQueueLoading" class="space-y-3 bg-default p-3">
              <USkeleton
                v-for="index in 4"
                :key="index"
                class="h-14 w-full"
              />
            </div>

            <div v-else-if="filteredWorkItems.length" class="divide-y divide-default overflow-y-auto bg-default xl:max-h-[calc(100dvh-24rem)]">
              <NuxtLink
                v-for="item in filteredWorkItems"
                :key="item.id"
                :to="item.to"
                class="outlook-row group grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 px-3 py-2.5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center"
              >
                <div
                  class="row-span-2 flex size-10 items-center justify-center rounded-md ring-1 md:row-span-1"
                  :class="item.tone === 'success'
                    ? 'bg-muted text-primary ring-accented'
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

                <div class="col-start-2 flex items-center justify-between gap-3 md:col-start-auto md:justify-end">
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
              v-else-if="counterOverviewStatus !== 'error'"
              icon="i-lucide-check-circle-2"
              :title="emptyQueueLabel"
              description="La file d’accueil se remplira dès qu’un dossier demande une action."
              class="py-14"
            />
          </section>
        </main>

        <aside class="outlook-surface self-start overflow-hidden rounded-md xl:sticky xl:top-3">
          <section class="border-b border-default bg-default p-4">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-base font-semibold text-highlighted">
                Encaissements du jour
              </h2>
              <UButton
                icon="i-lucide-refresh-cw"
                aria-label="Actualiser l’accueil"
                color="neutral"
                variant="ghost"
                size="xs"
                :loading="counterOverviewStatus === 'pending'"
                @click="refresh()"
              />
            </div>
            <div v-if="isCounterInitialLoading" class="mt-4 space-y-3">
              <USkeleton class="h-8 w-36" />
              <USkeleton class="h-4 w-24" />
            </div>
            <div v-else-if="dailyPayments" class="mt-4">
              <p class="text-2xl font-semibold text-highlighted tabular-nums">
                {{ formatCurrency(dailyPayments.totalPaid) }}
              </p>
              <p class="mt-1 text-xs text-toned">
                {{ dailyPayments.transactionCount }} paiement{{ dailyPayments.transactionCount === 1 ? '' : 's' }}
              </p>
              <dl v-if="dailyPayments.methods.length" class="mt-3 divide-y divide-default">
                <div v-for="row in dailyPayments.methods" :key="row.method" class="flex justify-between gap-3 py-2 text-sm">
                  <dt class="text-toned">
                    {{ paymentMethodLabels[row.method] }}
                  </dt>
                  <dd class="font-medium text-highlighted tabular-nums">
                    {{ formatCurrency(row.total) }}
                  </dd>
                </div>
              </dl>
              <p v-else class="mt-3 text-sm text-toned">
                Aucun encaissement aujourd’hui.
              </p>
            </div>
            <div class="mt-4 flex flex-wrap gap-2 border-t border-default pt-3">
              <UButton
                to="/reports"
                :prefetch="false"
                label="Rapports"
                icon="i-lucide-chart-no-axes-combined"
                color="neutral"
                variant="soft"
                size="sm"
              />
              <UButton
                to="/documents?paymentState=due"
                :prefetch="false"
                label="Impayés"
                icon="i-lucide-files"
                color="neutral"
                variant="ghost"
                size="sm"
              />
            </div>
          </section>

          <section class="bg-default p-4">
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-base font-semibold text-highlighted">
                Blocages
              </h2>
              <UButton
                to="/dossiers"
                label="Dossiers"
                color="neutral"
                variant="ghost"
                size="xs"
                class="text-primary hover:bg-muted"
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
                class="flex items-center justify-between gap-3 rounded-[4px] px-2 py-2 transition hover:bg-muted"
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
