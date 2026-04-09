<script setup lang="ts">
import { documentTypeLabels, paymentMethodLabels } from '~~/shared/constants/pos'
import type { CatalogItemRecord, CustomerRecord, DocumentDetail, PaymentMethod } from '~~/shared/types/pos'
import { supportsDocumentPrintProfile } from '~~/shared/utils/print'
import { formatCurrency, normalizeSearchText, parseCurrencyInput } from '~~/shared/utils/pos'

type SaleLine = {
  id: string
  catalogItemId: number | null
  label: string
  quantity: number
  unitPrice: number
  vatRate: number
  categoryHint: 'accessory' | 'repair' | 'service' | null
}

const toast = useToast()

const saleType = ref<'receipt' | 'invoice'>('receipt')
const receiptAttachCustomer = ref(false)
const attachCustomer = computed({
  get: () => saleType.value === 'invoice' || receiptAttachCustomer.value,
  set: (value: boolean) => {
    if (saleType.value === 'receipt') {
      receiptAttachCustomer.value = value
    }
  }
})
const search = ref('')
const selectedCustomerId = ref<number | null>(null)
const lines = ref<SaleLine[]>([])
const isSaving = ref<PaymentMethod | null>(null)
const lastCreatedDocument = ref<DocumentDetail | null>(null)
const lastCompletedPaymentMethod = ref<PaymentMethod | null>(null)
const saleCompletionOpen = ref(false)
const customerPool = ref<CustomerRecord[]>([])
const searchOpen = ref(false)
const highlightedItemIndex = ref(0)
let nextSaleLineId = 0
let searchCloseTimeout: ReturnType<typeof setTimeout> | null = null

const [{ data: customers }, { data: catalogItems }] = await Promise.all([
  useFetch<CustomerRecord[]>('/api/customers'),
  useFetch<CatalogItemRecord[]>('/api/catalog-items', {
    query: {
      activeOnly: true
    }
  })
])

watchEffect(() => {
  customerPool.value = customers.value ? [...customers.value] : []
})

const activeItems = computed(() => (catalogItems.value || []).filter(item => item.isActive))

const quickPickItems = computed(() => {
  return activeItems.value.slice(0, 8)
})

const filteredItems = computed(() => {
  const term = normalizeSearchText(search.value)

  if (!term) {
    return quickPickItems.value
  }

  return activeItems.value.filter((item) => {
    return [
      item.name,
      item.sku,
      item.type,
      item.category,
      item.brand,
      item.model,
      item.serviceKind,
      item.keywords.join(' ')
    ].some(value => normalizeSearchText(value).includes(term))
  }).slice(0, 10)
})

const searchPanelItems = computed(() => {
  return search.value.trim() ? filteredItems.value : quickPickItems.value
})

const searchPanelTitle = computed(() => {
  return search.value.trim() ? 'Résultats' : 'Suggestions'
})

const totals = computed(() => {
  const total = lines.value.reduce((sum, line) => sum + (line.quantity * line.unitPrice), 0)
  const taxAmount = lines.value.reduce((sum, line) => {
    if (!line.vatRate) {
      return sum
    }

    const subtotal = line.quantity * line.unitPrice
    const net = Math.round(subtotal / (1 + (line.vatRate / 100)))
    return sum + Math.max(subtotal - net, 0)
  }, 0)

  return {
    total,
    taxAmount,
    subtotal: Math.max(total - taxAmount, 0)
  }
})

const canCharge = computed(() => {
  if (!lines.value.length) {
    return false
  }

  if (saleType.value === 'invoice') {
    return Boolean(selectedCustomerId.value)
  }

  return !attachCustomer.value || Boolean(selectedCustomerId.value)
})

const lastPaymentMethodLabel = computed(() => {
  return lastCompletedPaymentMethod.value ? paymentMethodLabels[lastCompletedPaymentMethod.value] : ''
})

watch(searchPanelItems, (items) => {
  if (!items.length) {
    highlightedItemIndex.value = 0
    return
  }

  if (highlightedItemIndex.value >= items.length) {
    highlightedItemIndex.value = 0
  }
})

watch(search, (value) => {
  highlightedItemIndex.value = 0

  if (value.trim()) {
    openSearchPanel()
    return
  }

  cancelSearchClose()
})

function getCategoryHint(item: CatalogItemRecord): SaleLine['categoryHint'] {
  if (item.type === 'product') {
    return 'accessory'
  }

  return item.type === 'repair' ? 'repair' : 'service'
}

function createSaleLine(input: Omit<SaleLine, 'id'>): SaleLine {
  return {
    id: `sale-line-${nextSaleLineId++}`,
    ...input
  }
}

function addCatalogItem(item: CatalogItemRecord) {
  const existing = lines.value.find(line => line.catalogItemId === item.id)

  if (existing) {
    existing.quantity += 1
    return
  }

  lines.value.push(createSaleLine({
    catalogItemId: item.id,
    label: item.name,
    quantity: 1,
    unitPrice: item.defaultPrice,
    vatRate: item.vatRate,
    categoryHint: getCategoryHint(item)
  }))

  closeSearchPanel()
  search.value = ''
}

function incrementLine(index: number) {
  lines.value[index]!.quantity += 1
}

function decrementLine(index: number) {
  const line = lines.value[index]

  if (!line) {
    return
  }

  if (line.quantity <= 1) {
    return
  }

  line.quantity -= 1
}

function removeLine(index: number) {
  if (!lines.value[index]) {
    return
  }

  lines.value.splice(index, 1)
}

function cloneLine(index: number) {
  const line = lines.value[index]

  if (!line) {
    return
  }

  lines.value.splice(index + 1, 0, {
    ...line,
    id: `sale-line-${nextSaleLineId++}`
  })
}

function moveLine(index: number, direction: 'up' | 'down') {
  const targetIndex = direction === 'up' ? index - 1 : index + 1

  if (!lines.value[index] || targetIndex < 0 || targetIndex >= lines.value.length) {
    return
  }

  const [line] = lines.value.splice(index, 1)

  if (!line) {
    return
  }

  lines.value.splice(targetIndex, 0, line)
}

function detachLineFromCatalog(line: SaleLine) {
  line.catalogItemId = null
}

function updateLineLabel(index: number, value: string) {
  const line = lines.value[index]

  if (!line) {
    return
  }

  detachLineFromCatalog(line)
  line.label = value
}

function updateLineUnitPrice(index: number, value: number | null) {
  const line = lines.value[index]

  if (!line) {
    return
  }

  detachLineFromCatalog(line)
  line.unitPrice = Math.max(parseCurrencyInput(value || 0), 0)
}

function addFirstMatch() {
  const item = searchPanelItems.value[highlightedItemIndex.value] || filteredItems.value[0]

  if (!item || !search.value.trim()) {
    return
  }

  addCatalogItem(item)
}

function openSearchPanel() {
  cancelSearchClose()
  searchOpen.value = true
}

function closeSearchPanel() {
  cancelSearchClose()
  searchOpen.value = false
  highlightedItemIndex.value = 0
}

function scheduleSearchClose() {
  cancelSearchClose()
  searchCloseTimeout = setTimeout(() => {
    searchOpen.value = false
    highlightedItemIndex.value = 0
  }, 120)
}

function cancelSearchClose() {
  if (searchCloseTimeout) {
    clearTimeout(searchCloseTimeout)
    searchCloseTimeout = null
  }
}

function highlightNextResult() {
  if (!searchPanelItems.value.length) {
    return
  }

  highlightedItemIndex.value = (highlightedItemIndex.value + 1) % searchPanelItems.value.length
}

function highlightPreviousResult() {
  if (!searchPanelItems.value.length) {
    return
  }

  highlightedItemIndex.value = highlightedItemIndex.value <= 0
    ? searchPanelItems.value.length - 1
    : highlightedItemIndex.value - 1
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    openSearchPanel()
    highlightNextResult()
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    openSearchPanel()
    highlightPreviousResult()
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeSearchPanel()
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    addFirstMatch()
  }
}

function handleBarcodeScan(value: string) {
  const normalizedValue = normalizeSearchText(value)
  const match = activeItems.value.find((item) => {
    return normalizeSearchText(item.sku) === normalizedValue
      || normalizeSearchText(item.name) === normalizedValue
  })

  if (match) {
    addCatalogItem(match)
    toast.add({
      title: 'Article scanné',
      description: `${match.name} ajouté au panier.`,
      color: 'success'
    })
  } else {
    search.value = value
    openSearchPanel()
    toast.add({
      title: 'Code scanné',
      description: `Aucun article trouvé pour "${value}". Résultats filtrés.`,
      color: 'warning'
    })
  }
}

async function ensureCounterCustomer() {
  const existing = customerPool.value.find((customer) => {
    return customer.displayName === 'Client comptoir'
      && !customer.phone
      && !customer.email
  })

  if (existing) {
    return existing.id
  }

  const created = await $fetch<CustomerRecord>('/api/customers', {
    method: 'POST',
    body: {
      displayName: 'Client comptoir',
      notes: 'Client créé automatiquement pour les ventes rapides sans client nominatif.'
    }
  })

  customerPool.value = [...customerPool.value, created]
  return created.id
}

function resetSaleState() {
  search.value = ''
  closeSearchPanel()
  lines.value = []
  receiptAttachCustomer.value = false
  selectedCustomerId.value = saleType.value === 'invoice' ? selectedCustomerId.value : null
}

function focusSearchInput() {
  if (typeof document === 'undefined') {
    return
  }

  requestAnimationFrame(() => {
    document.querySelector<HTMLInputElement>('input[name="sale-search"]')?.focus()
  })
}

function closeSaleCompletionModal() {
  saleCompletionOpen.value = false
}

function handleSaleCompletionClosed() {
  lastCreatedDocument.value = null
  lastCompletedPaymentMethod.value = null
  focusSearchInput()
}

async function navigateToCompletedDocument(path: string) {
  closeSaleCompletionModal()
  await navigateTo(path)
}

async function completeSale(method: PaymentMethod) {
  if (!lines.value.length) {
    return
  }

  if (saleType.value === 'invoice' && !selectedCustomerId.value) {
    toast.add({
      title: 'Client requis',
      description: 'Sélectionnez un client pour créer une facture nominative.',
      color: 'warning'
    })
    return
  }

  isSaving.value = method

  try {
    const customerId = (saleType.value === 'invoice' || attachCustomer.value)
      ? selectedCustomerId.value!
      : await ensureCounterCustomer()

    const createdDocument = await $fetch<DocumentDetail>('/api/documents', {
      method: 'POST',
      body: {
        type: saleType.value,
        status: 'issued',
        customerId,
        ticketId: null,
        issuedAt: new Date().toISOString(),
        notes: null,
        lines: lines.value.map(({ id: _id, ...line }) => line)
      }
    })

    const paidDocument = await $fetch<DocumentDetail>(`/api/documents/${createdDocument.id}/mark-paid`, {
      method: 'POST',
      body: {
        method,
        paidAt: new Date().toISOString()
      }
    })

    lastCreatedDocument.value = paidDocument
    lastCompletedPaymentMethod.value = method
    saleCompletionOpen.value = true
    resetSaleState()
  } finally {
    isSaving.value = null
  }
}

function selectAllOnFocus(event: FocusEvent) {
  const target = event.target

  if (!(target instanceof HTMLInputElement)) {
    return
  }

  requestAnimationFrame(() => {
    target.select()
  })
}
</script>

<template>
  <UDashboardPanel id="sales-create">
    <template #header>
      <UDashboardNavbar title="Vente rapide">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            to="/documents/new"
            label="Document avancé"
            icon="i-lucide-file-plus-2"
            variant="ghost"
            color="neutral"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-[108rem] flex-col gap-4">
        <UModal
          v-if="lastCreatedDocument"
          v-model:open="saleCompletionOpen"
          :dismissible="false"
          :close="false"
          :ui="{
            content: 'max-w-2xl overflow-hidden rounded-[2rem] border border-success/20 shadow-2xl',
            body: 'p-0',
            footer: 'border-t border-default/70 p-4 sm:px-6'
          }"
          @after:leave="handleSaleCompletionClosed"
        >
          <template #body>
            <div class="bg-[linear-gradient(180deg,rgba(34,197,94,0.12),rgba(34,197,94,0.03))] px-6 py-6 sm:px-7 sm:py-7">
              <div class="flex items-start gap-4">
                <div class="mt-1 flex size-12 shrink-0 items-center justify-center rounded-full bg-success/12 text-success ring-1 ring-success/15">
                  <UIcon name="i-lucide-badge-check" class="size-6" />
                </div>

                <div class="min-w-0 flex-1 space-y-5">
                  <div class="space-y-2">
                    <p class="text-sm font-medium uppercase tracking-[0.18em] text-success">
                      Encaissement terminé
                    </p>
                    <div class="flex flex-wrap items-end gap-x-3 gap-y-1">
                      <h2 class="text-4xl font-semibold tracking-tight text-highlighted sm:text-5xl">
                        {{ formatCurrency(lastCreatedDocument.total) }}
                      </h2>
                      <p class="pb-1 text-base text-toned">
                        encaissé
                      </p>
                    </div>
                    <p class="text-lg font-medium text-highlighted">
                      {{ documentTypeLabels[lastCreatedDocument.type] }} {{ lastCreatedDocument.documentNumber }}
                    </p>
                  </div>

                  <div class="grid gap-3 rounded-[1.5rem] border border-default/70 bg-default/85 p-4 sm:grid-cols-3">
                    <div>
                      <p class="text-[11px] uppercase tracking-[0.16em] text-toned">
                        Paiement
                      </p>
                      <p class="mt-1 text-sm font-medium text-highlighted">
                        {{ lastPaymentMethodLabel }}
                      </p>
                    </div>
                    <div>
                      <p class="text-[11px] uppercase tracking-[0.16em] text-toned">
                        Client
                      </p>
                      <p class="mt-1 text-sm font-medium text-highlighted">
                        {{ lastCreatedDocument.customer.displayName }}
                      </p>
                    </div>
                    <div>
                      <p class="text-[11px] uppercase tracking-[0.16em] text-toned">
                        Type
                      </p>
                      <p class="mt-1 text-sm font-medium text-highlighted">
                        {{ documentTypeLabels[lastCreatedDocument.type] }}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <template #footer>
            <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p class="text-sm text-toned">
                Vente enregistrée. Passez directement à la suivante ou ouvrez le document.
              </p>

              <div class="flex flex-wrap justify-end gap-2">
                <UButton
                  v-if="supportsDocumentPrintProfile(lastCreatedDocument.type, 'thermal')"
                  :label="'Imprimer thermique'"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-printer"
                  @click="navigateToCompletedDocument(`/documents/${lastCreatedDocument.id}/print?profile=thermal`)"
                />
                <UButton
                  :label="'Imprimer A4'"
                  color="neutral"
                  variant="soft"
                  icon="i-lucide-file-text"
                  @click="navigateToCompletedDocument(`/documents/${lastCreatedDocument.id}/print?profile=a4`)"
                />
                <UButton
                  :label="'Voir le document'"
                  color="neutral"
                  variant="ghost"
                  @click="navigateToCompletedDocument(`/documents/${lastCreatedDocument.id}`)"
                />
                <UButton
                  label="Nouvelle vente"
                  color="primary"
                  icon="i-lucide-arrow-right"
                  autofocus
                  @click="closeSaleCompletionModal"
                />
              </div>
            </div>
          </template>
        </UModal>

        <div class="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
          <div class="space-y-4">
            <UCard
              variant="subtle"
              :ui="{
                root: 'overflow-visible rounded-[2rem] shadow-sm',
                body: 'space-y-4 p-4 sm:p-4',
                header: 'p-4 pb-0 sm:p-4 sm:pb-0'
              }"
            >
              <template #header>
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="space-y-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h2 class="text-base font-semibold text-highlighted">
                        Recherche article
                      </h2>
                      <UBadge color="neutral" variant="soft" size="sm">
                        Entrée ajoute le premier résultat
                      </UBadge>
                    </div>
                  </div>

                  <div class="flex flex-wrap items-center gap-2 text-xs text-toned">
                    <span>{{ lines.length ? `${lines.length} ligne(s)` : 'Panier vide' }}</span>
                    <span>{{ formatCurrency(totals.total) }}</span>
                  </div>
                </div>
              </template>

              <div
                class="relative"
                @focusin="cancelSearchClose"
                @focusout="scheduleSearchClose"
                @pointerdown="openSearchPanel"
              >
                <div class="flex gap-2">
                  <UInput
                    v-model="search"
                    name="sale-search"
                    icon="i-lucide-search"
                    size="xl"
                    class="flex-1"
                    placeholder="cable, coque, chargeur, verre..."
                    autofocus
                    @keydown="handleSearchKeydown"
                  />
                  <PosBarcodeScanner
                    title="Scanner un article"
                    description="Scannez le code-barres ou QR code d'un article pour l'ajouter au panier."
                    trigger-size="lg"
                    trigger-aria-label="Scanner un code-barres"
                    @scanned="handleBarcodeScan"
                  />
                </div>

                <div
                  v-if="searchOpen"
                  class="absolute inset-x-0 top-full z-20 mt-2 rounded-2xl border border-default bg-default p-2 shadow-lg"
                >
                  <div class="flex items-center justify-between gap-3 px-2 pb-2">
                    <p class="text-sm font-medium text-highlighted">
                      {{ searchPanelTitle }}
                    </p>
                    <span class="text-xs text-toned">
                      {{ searchPanelItems.length }} article(s)
                    </span>
                  </div>

                  <div v-if="searchPanelItems.length" class="max-h-[18rem] space-y-1 overflow-y-auto pr-1">
                    <button
                      v-for="(item, index) in searchPanelItems"
                      :key="item.id"
                      type="button"
                      class="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition"
                      :class="index === highlightedItemIndex
                        ? 'bg-primary/8 ring-1 ring-primary/20'
                        : 'hover:bg-muted/60'"
                      @mouseenter="highlightedItemIndex = index"
                      @click="addCatalogItem(item)"
                    >
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium text-highlighted">
                          {{ item.name }}
                        </p>
                        <p class="truncate text-xs text-toned">
                          {{ item.sku || 'Sans SKU' }}
                        </p>
                      </div>
                      <span class="shrink-0 text-sm font-medium text-highlighted">
                        {{ formatCurrency(item.defaultPrice) }}
                      </span>
                    </button>
                  </div>

                  <div v-else class="rounded-xl border border-dashed border-default px-4 py-5 text-sm text-toned">
                    Aucun article trouvé pour cette recherche.
                  </div>
                </div>
              </div>
            </UCard>

            <UCard
              variant="subtle"
              :ui="{
                root: 'rounded-[2rem] shadow-sm',
                body: 'space-y-4 p-4 sm:p-4',
                header: 'p-4 pb-0 sm:p-4 sm:pb-0'
              }"
            >
              <template #header>
                <div class="flex items-center justify-between gap-3">
                  <div>
                    <h2 class="text-base font-semibold text-highlighted">
                      Panier
                    </h2>
                    <p class="text-sm text-toned">
                      {{ lines.length ? `${lines.length} ligne(s)` : 'Ajoutez un article via la recherche.' }}
                    </p>
                  </div>
                  <div class="text-right">
                    <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                      Total
                    </p>
                    <p class="text-2xl font-semibold text-highlighted">
                      {{ formatCurrency(totals.total) }}
                    </p>
                  </div>
                </div>
              </template>

              <UEmpty
                v-if="!lines.length"
                icon="i-lucide-shopping-bag"
                title="Panier vide"
                description="Lancez une recherche ou scannez un article."
                class="py-8"
              />

              <div v-else class="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
                <div
                  v-for="(line, index) in lines"
                  :key="line.id"
                  class="grid gap-2 rounded-2xl border border-default bg-default px-3 py-3 md:grid-cols-[minmax(0,1fr)_4.75rem_auto_9rem_auto] md:items-center"
                >
                  <div class="min-w-0">
                    <UInput
                      :id="`sale-line-label-${line.id}`"
                      :model-value="line.label"
                      size="sm"
                      class="w-full"
                      placeholder="Libellé de la ligne"
                      @update:model-value="updateLineLabel(index, String($event || ''))"
                    />
                  </div>

                  <div class="md:min-w-0 md:justify-self-start">
                    <label :for="`sale-line-price-${line.id}`" class="sr-only">
                      Prix unitaire
                    </label>
                    <UInputNumber
                      :id="`sale-line-price-${line.id}`"
                      :model-value="line.unitPrice / 100"
                      :min="0"
                      :step="0.05"
                      :increment="false"
                      :decrement="false"
                      size="sm"
                      variant="subtle"
                      :format-options="{ minimumFractionDigits: 2, maximumFractionDigits: 2 }"
                      class="w-[4.75rem]"
                      @update:model-value="updateLineUnitPrice(index, $event)"
                      @focus="selectAllOnFocus"
                    />
                  </div>

                  <div class="flex items-center gap-1 justify-self-start md:justify-self-center">
                    <UButton
                      type="button"
                      icon="i-lucide-minus"
                      color="neutral"
                      variant="soft"
                      size="xs"
                      :disabled="line.quantity <= 1"
                      @click="decrementLine(index)"
                    />
                    <span class="w-8 text-center text-sm font-medium text-highlighted">
                      {{ line.quantity }}
                    </span>
                    <UButton
                      type="button"
                      icon="i-lucide-plus"
                      color="neutral"
                      variant="soft"
                      size="xs"
                      @click="incrementLine(index)"
                    />
                  </div>

                  <div class="text-left md:text-right">
                    <p class="text-lg font-semibold text-highlighted">
                      {{ formatCurrency(line.quantity * line.unitPrice) }}
                    </p>
                  </div>

                  <div class="flex items-center justify-end gap-1">
                    <UButton
                      type="button"
                      icon="i-lucide-arrow-up"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :disabled="index === 0"
                      :aria-label="`Monter ${line.label}`"
                      @click="moveLine(index, 'up')"
                    />
                    <UButton
                      type="button"
                      icon="i-lucide-arrow-down"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :disabled="index === lines.length - 1"
                      :aria-label="`Descendre ${line.label}`"
                      @click="moveLine(index, 'down')"
                    />
                    <UButton
                      type="button"
                      icon="i-lucide-copy"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      :aria-label="`Cloner ${line.label}`"
                      @click="cloneLine(index)"
                    />
                    <UButton
                      type="button"
                      icon="i-lucide-trash-2"
                      color="error"
                      variant="ghost"
                      size="xs"
                      :aria-label="`Supprimer ${line.label}`"
                      @click="removeLine(index)"
                    />
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <div class="space-y-4 xl:sticky xl:top-3">
            <UCard
              variant="subtle"
              :ui="{
                root: 'rounded-[2rem] shadow-sm',
                body: 'space-y-4 p-4 sm:p-4',
                header: 'p-4 pb-0 sm:p-4 sm:pb-0'
              }"
            >
              <template #header>
                <div class="flex items-start justify-between gap-3">
                  <div class="space-y-1">
                    <h2 class="text-base font-semibold text-highlighted">
                      Encaissement
                    </h2>
                    <p class="text-sm text-toned">
                      Type de document, client éventuel, puis paiement direct.
                    </p>
                  </div>
                  <UBadge color="primary" variant="soft" size="sm">
                    {{ lines.length ? `${lines.length} ligne(s)` : 'Panier vide' }}
                  </UBadge>
                </div>
              </template>

              <div class="grid grid-cols-2 gap-2">
                <UButton
                  type="button"
                  :color="saleType === 'receipt' ? 'primary' : 'neutral'"
                  :variant="saleType === 'receipt' ? 'solid' : 'soft'"
                  label="Reçu"
                  class="justify-center"
                  @click="saleType = 'receipt'"
                />
                <UButton
                  type="button"
                  :color="saleType === 'invoice' ? 'primary' : 'neutral'"
                  :variant="saleType === 'invoice' ? 'solid' : 'soft'"
                  label="Facture"
                  class="justify-center"
                  @click="saleType = 'invoice'"
                />
              </div>

              <UFormField
                v-if="saleType === 'receipt'"
                label="Client nominatif"
                name="attachCustomer"
              >
                <USwitch v-model="attachCustomer" label="Associer un client à ce reçu" />
              </UFormField>

              <UFormField
                v-if="saleType === 'invoice' || attachCustomer"
                label="Client"
                name="customerId"
                :required="saleType === 'invoice'"
              >
                <PosCustomerSelectField
                  :model-value="selectedCustomerId"
                  :customers="customerPool"
                  placeholder="Rechercher ou créer un client"
                  @update:model-value="selectedCustomerId = $event"
                  @created="customerPool = [...customerPool, $event]"
                />
              </UFormField>

              <div class="space-y-2 rounded-2xl border border-default bg-default/70 px-4 py-3">
                <div class="flex items-center justify-between gap-3 text-sm">
                  <span class="text-toned">Sous-total HT</span>
                  <span class="font-medium text-highlighted">{{ formatCurrency(totals.subtotal) }}</span>
                </div>
                <div class="flex items-center justify-between gap-3 text-sm">
                  <span class="text-toned">TVA</span>
                  <span class="font-medium text-highlighted">{{ formatCurrency(totals.taxAmount) }}</span>
                </div>
                <div class="flex items-center justify-between gap-3 border-t border-default pt-3">
                  <span class="text-sm font-medium text-highlighted">Total TTC</span>
                  <span class="text-xl font-semibold text-highlighted">{{ formatCurrency(totals.total) }}</span>
                </div>
              </div>

              <div class="space-y-2">
                <h3 class="text-sm font-medium text-highlighted">
                  Paiement direct
                </h3>

                <div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                  <UButton
                    v-for="method in ['cash', 'card', 'twint', 'bank_transfer']"
                    :key="method"
                    type="button"
                    :label="`Encaisser · ${paymentMethodLabels[method as PaymentMethod]}`"
                    :icon="isSaving === method ? 'i-lucide-loader-circle' : 'i-lucide-badge-check'"
                    :loading="isSaving === method"
                    :disabled="!canCharge || Boolean(isSaving)"
                    size="lg"
                    class="justify-center"
                    @click="completeSale(method as PaymentMethod)"
                  />
                </div>
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
