<script setup lang="ts">
import { documentTypeLabels, paymentMethodLabels } from '~~/shared/constants/pos'
import type { CatalogItemRecord, CustomerRecord, DocumentDetail, PaymentMethod } from '~~/shared/types/pos'
import { formatCurrency } from '~~/shared/utils/pos'

type SaleLine = {
  catalogItemId: number | null
  label: string
  quantity: number
  unitPrice: number
  vatRate: number
  categoryHint: 'accessory' | 'repair' | 'service' | null
}

const toast = useToast()

const saleType = ref<'receipt' | 'invoice'>('receipt')
const attachCustomer = ref(false)
const search = ref('')
const selectedCustomerId = ref<number | null>(null)
const lines = ref<SaleLine[]>([])
const isSaving = ref<PaymentMethod | null>(null)
const lastCreatedDocument = ref<DocumentDetail | null>(null)
const customerPool = ref<CustomerRecord[]>([])

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

watch(saleType, (value) => {
  if (value === 'invoice') {
    attachCustomer.value = true
  }
})

const activeItems = computed(() => (catalogItems.value || []).filter(item => item.isActive))

const quickPickItems = computed(() => {
  const explicitQuickPicks = activeItems.value.filter(item => item.isQuickPick)

  if (explicitQuickPicks.length) {
    return explicitQuickPicks.slice(0, 8)
  }

  return activeItems.value.filter(item => item.type === 'product').slice(0, 8)
})

const filteredItems = computed(() => {
  const term = search.value.trim().toLowerCase()

  if (!term) {
    return quickPickItems.value
  }

  return activeItems.value.filter((item) => {
    return [
      item.name,
      item.sku,
      item.type
    ].some(value => value?.toLowerCase().includes(term))
  }).slice(0, 10)
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

const selectedCustomer = computed(() => {
  return customerPool.value.find(customer => customer.id === selectedCustomerId.value) || null
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

function getCategoryHint(item: CatalogItemRecord): SaleLine['categoryHint'] {
  if (item.type === 'product') {
    return 'accessory'
  }

  if (item.type === 'service') {
    return 'service'
  }

  return 'repair'
}

function addCatalogItem(item: CatalogItemRecord) {
  const existing = lines.value.find(line => line.catalogItemId === item.id)

  if (existing) {
    existing.quantity += 1
    return
  }

  lines.value.push({
    catalogItemId: item.id,
    label: item.name,
    quantity: 1,
    unitPrice: item.defaultPrice,
    vatRate: item.vatRate,
    categoryHint: getCategoryHint(item)
  })
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
    lines.value.splice(index, 1)
    return
  }

  line.quantity -= 1
}

function addFirstMatch() {
  const item = filteredItems.value[0]

  if (!item) {
    return
  }

  addCatalogItem(item)
  search.value = ''
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
  lines.value = []
  attachCustomer.value = saleType.value === 'invoice'
  selectedCustomerId.value = saleType.value === 'invoice' ? selectedCustomerId.value : null
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
        lines: lines.value
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
    resetSaleState()

    toast.add({
      title: `${documentTypeLabels[saleType.value]} encaissé`,
      description: `${paymentMethodLabels[method]} · ${formatCurrency(paidDocument.total)}`,
      color: 'success'
    })
  } finally {
    isSaving.value = null
  }
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
      <div class="mx-auto flex w-full max-w-[108rem] flex-col gap-5">
        <div class="flex flex-wrap items-start justify-between gap-3 rounded-3xl border border-default bg-default/80 px-4 py-4 shadow-sm sm:px-5">
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <h1 class="text-xl font-semibold text-highlighted">
                Vente comptoir
              </h1>
              <UBadge color="success" variant="subtle" size="sm">
                Reçu par défaut
              </UBadge>
            </div>
            <p class="text-sm text-toned">
              Recherchez un article, ajoutez-le au panier, encaissez avec le mode de paiement choisi. Le client reste optionnel tant qu’il ne demande pas de facture nominative.
            </p>
          </div>
        </div>

        <UAlert
          v-if="lastCreatedDocument"
          color="success"
          variant="soft"
          icon="i-lucide-check-circle-2"
          :title="`${documentTypeLabels[lastCreatedDocument.type]} ${lastCreatedDocument.documentNumber} créé`"
          :description="`${formatCurrency(lastCreatedDocument.total)} encaissé pour ${lastCreatedDocument.customer.displayName}`"
        >
          <template #actions>
            <div class="flex flex-wrap gap-2">
              <UButton
                :to="`/documents/${lastCreatedDocument.id}/print`"
                label="Aperçu imprimable"
                size="sm"
              />
              <UButton
                :to="`/documents/${lastCreatedDocument.id}`"
                label="Voir le document"
                color="neutral"
                variant="soft"
                size="sm"
              />
            </div>
          </template>
        </UAlert>

        <div class="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
          <div class="space-y-5">
            <UCard
              variant="subtle"
              :ui="{
                root: 'rounded-3xl',
                body: 'space-y-5 p-4 sm:p-5',
                header: 'p-4 pb-0 sm:p-5 sm:pb-0'
              }"
            >
              <template #header>
                <div class="space-y-1">
                  <h2 class="text-base font-semibold text-highlighted">
                    Article / recherche
                  </h2>
                  <p class="text-sm text-toned">
                    La recherche garde le focus. `Entrée` ajoute le premier résultat.
                  </p>
                </div>
              </template>

              <UInput
                v-model="search"
                icon="i-lucide-search"
                class="w-full"
                placeholder="cable, coque, chargeur, verre..."
                autofocus
                @keydown.enter.prevent="addFirstMatch"
              />

              <div class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <h3 class="text-sm font-medium text-highlighted">
                    Raccourcis comptoir
                  </h3>
                  <span class="text-xs text-toned">
                    {{ quickPickItems.length ? `${quickPickItems.length} article(s)` : 'Configurez les raccourcis dans le catalogue' }}
                  </span>
                </div>

                <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <UButton
                    v-for="item in quickPickItems"
                    :key="item.id"
                    type="button"
                    color="neutral"
                    variant="soft"
                    class="h-auto min-h-20 justify-start rounded-2xl px-4 py-3 text-left"
                    @click="addCatalogItem(item)"
                  >
                    <div class="space-y-1">
                      <p class="font-medium text-highlighted">
                        {{ item.name }}
                      </p>
                      <p class="text-xs text-toned">
                        {{ formatCurrency(item.defaultPrice) }}
                      </p>
                    </div>
                  </UButton>
                </div>
              </div>

              <div class="space-y-3">
                <div class="flex items-center justify-between gap-3">
                  <h3 class="text-sm font-medium text-highlighted">
                    Résultats
                  </h3>
                  <span class="text-xs text-toned">
                    {{ filteredItems.length }} résultat(s)
                  </span>
                </div>

                <div class="space-y-2">
                  <button
                    v-for="item in filteredItems"
                    :key="item.id"
                    type="button"
                    class="flex w-full items-center justify-between rounded-2xl border border-default bg-default/70 px-4 py-3 text-left transition hover:border-primary/30 hover:bg-primary/5"
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
              </div>
            </UCard>

            <UCard
              variant="subtle"
              :ui="{
                root: 'rounded-3xl',
                body: 'space-y-4 p-4 sm:p-5',
                header: 'p-4 pb-0 sm:p-5 sm:pb-0'
              }"
            >
              <template #header>
                <div class="space-y-1">
                  <h2 class="text-base font-semibold text-highlighted">
                    Panier
                  </h2>
                  <p class="text-sm text-toned">
                    Ajustez les quantités sans quitter l’écran.
                  </p>
                </div>
              </template>

              <UEmpty
                v-if="!lines.length"
                icon="i-lucide-shopping-bag"
                title="Panier vide"
                description="Ajoutez un article rapide ou utilisez la recherche."
              />

              <div v-else class="space-y-3">
                <div
                  v-for="(line, index) in lines"
                  :key="`${line.catalogItemId || line.label}-${index}`"
                  class="flex items-center gap-3 rounded-2xl border border-default bg-default/70 px-4 py-3"
                >
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-highlighted">
                      {{ line.label }}
                    </p>
                    <p class="text-xs text-toned">
                      {{ formatCurrency(line.unitPrice) }} · TVA {{ line.vatRate }}%
                    </p>
                  </div>

                  <div class="flex items-center gap-2">
                    <UButton
                      type="button"
                      icon="i-lucide-minus"
                      color="neutral"
                      variant="soft"
                      size="sm"
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
                      size="sm"
                      @click="incrementLine(index)"
                    />
                  </div>

                  <div class="w-24 text-right text-sm font-semibold text-highlighted">
                    {{ formatCurrency(line.quantity * line.unitPrice) }}
                  </div>
                </div>
              </div>
            </UCard>
          </div>

          <div class="space-y-5 xl:sticky xl:top-4">
            <UCard
              variant="subtle"
              :ui="{
                root: 'rounded-3xl shadow-sm',
                body: 'space-y-5 p-4 sm:p-5',
                header: 'p-4 pb-0 sm:p-5 sm:pb-0'
              }"
            >
              <template #header>
                <div class="space-y-1">
                  <h2 class="text-base font-semibold text-highlighted">
                    Encaissement
                  </h2>
                  <p class="text-sm text-toned">
                    Choisissez le document, puis cliquez directement sur le mode de paiement.
                  </p>
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
                description="Activez seulement si le client veut apparaître sur le document."
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

              <div class="space-y-2 rounded-2xl border border-default bg-default/70 p-4">
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

              <div class="space-y-3">
                <h3 class="text-sm font-medium text-highlighted">
                  Paiement direct
                </h3>

                <div class="grid gap-2">
                  <UButton
                    v-for="method in ['cash', 'card', 'twint', 'bank_transfer']"
                    :key="method"
                    type="button"
                    :label="`Encaisser · ${paymentMethodLabels[method as PaymentMethod]}`"
                    :icon="isSaving === method ? 'i-lucide-loader-circle' : 'i-lucide-badge-check'"
                    :loading="isSaving === method"
                    :disabled="!canCharge || Boolean(isSaving)"
                    class="justify-center"
                    @click="completeSale(method as PaymentMethod)"
                  />
                </div>
              </div>

              <div class="rounded-2xl border border-dashed border-default px-4 py-3 text-xs text-toned">
                {{ selectedCustomer?.displayName || 'Client comptoir automatique si aucun client n’est associé.' }}
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
