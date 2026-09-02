<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { ShopifyConnection, ShopifyImportResult, ShopifyOrderList, ShopifyOrderSummary } from '~~/shared/types/shopify'
import { shopifyFinancialLabels, shopifyFulfillmentLabels } from '~~/shared/constants/shopify'
import { formatCurrency, formatDateTime } from '~~/shared/utils/pos'

const toast = useToast()
const reference = ref('')
const cursors = ref<Array<string | undefined>>([undefined])
const page = ref(0)
const searching = ref(false)
const importing = ref<string | null>(null)
const found = ref<ShopifyOrderSummary | null>(null)
const lookupError = ref('')
const { data: connection, error: connectionError, status: connectionStatus, refresh: reconnect } = await useFetch<ShopifyConnection>('/api/tools/shopify/connection')
const { data: response, error: ordersError, status: ordersStatus, refresh: refreshOrders } = await useFetch<ShopifyOrderList>('/api/tools/shopify/orders', {
  query: computed(() => ({ after: cursors.value[page.value] })), immediate: false, watch: false
})
if (connection.value?.configured) await refreshOrders()
const busy = computed(() => connectionStatus.value === 'pending' || ordersStatus.value === 'pending' || searching.value || Boolean(importing.value))
const rows = computed(() => found.value ? [found.value] : response.value?.items || [])
function message(error: unknown) {
  return (error as { data?: { statusMessage?: string } })?.data?.statusMessage || 'Impossible de contacter Shopify. Réessayez.'
}
const loadError = computed(() => connectionError.value || ordersError.value)
const columns: TableColumn<ShopifyOrderSummary>[] = [
  { accessorKey: 'name', header: 'Commande' },
  { accessorKey: 'customerName', header: 'Client' },
  { accessorKey: 'financialStatus', header: 'Paiement' },
  { accessorKey: 'fulfillmentStatus', header: 'Traitement' },
  { accessorKey: 'totalCents', header: 'Total TTC' },
  { id: 'actions', header: '' }
]

async function refresh() {
  lookupError.value = ''
  found.value = null
  page.value = 0
  cursors.value = [undefined]
  await reconnect()
  if (connection.value?.configured && !connectionError.value) await refreshOrders()
}

async function changePage(next: number) {
  if (busy.value) return
  if (next > page.value) cursors.value[next] = response.value?.pageInfo.endCursor || undefined
  page.value = next
  await refreshOrders()
}

async function search() {
  if (!reference.value.trim() || busy.value) return
  searching.value = true
  lookupError.value = ''
  found.value = null
  try {
    found.value = await $fetch<ShopifyOrderSummary>('/api/tools/shopify/search', { query: { orderRef: reference.value.trim() } })
  } catch (error) {
    lookupError.value = message(error)
  } finally {
    searching.value = false
  }
}

async function importOrder(order: ShopifyOrderSummary) {
  if (busy.value) return
  importing.value = order.id
  try {
    const result = await $fetch<ShopifyImportResult>('/api/tools/shopify/import', { method: 'POST', body: { orderRef: order.id } })
    toast.add({ title: result.alreadyImported ? 'Commande déjà importée' : 'Facture créée', description: `${result.documentNumber} · ${result.paymentsAdded} paiement(s) ajouté(s)`, color: 'success' })
    await navigateTo(`/documents/${result.documentId}`)
  } catch (error) {
    toast.add({ title: 'Import impossible', description: message(error), color: 'error' })
  } finally {
    importing.value = null
  }
}
</script>

<template>
  <UDashboardPanel id="shopify-import">
    <template #header>
      <UDashboardNavbar title="Import Shopify">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            label="Rafraîchir"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="ghost"
            :loading="busy"
            @click="refresh"
          />
        </template>
      </UDashboardNavbar>
      <UDashboardToolbar v-if="connection?.configured" class="flex flex-wrap gap-3">
        <form class="flex w-full flex-wrap items-end gap-2" @submit.prevent="search">
          <UFormField label="Numéro de commande" class="min-w-0 flex-1 sm:max-w-sm">
            <UInput
              v-model="reference"
              placeholder="Ex. #1001 ou identifiant Shopify"
              icon="i-lucide-hash"
              class="w-full"
              :disabled="busy"
            />
          </UFormField>
          <UButton
            type="submit"
            label="Rechercher"
            icon="i-lucide-search"
            :loading="searching"
            :disabled="busy || !reference.trim()"
          />
          <UButton
            v-if="found || lookupError"
            label="Revenir à la liste"
            color="neutral"
            variant="ghost"
            @click="found = null; lookupError = ''"
          />
        </form>
      </UDashboardToolbar>
    </template>
    <template #body>
      <div class="flex h-full min-h-0 flex-col gap-3">
        <UAlert
          v-if="loadError"
          title="Connexion Shopify impossible"
          :description="message(loadError)"
          color="error"
          icon="i-lucide-triangle-alert"
        />
        <UEmpty
          v-else-if="!connection?.configured && connectionStatus !== 'pending'"
          icon="i-lucide-shopping-bag"
          title="Shopify non connecté"
          description="L’import est prêt. Les accès à la boutique doivent être configurés pour afficher les commandes."
          class="py-12"
        />
        <template v-else-if="connection?.configured">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p class="text-sm font-medium text-highlighted">
                {{ found ? 'Commande recherchée' : 'Commandes à traiter' }}
              </p>
              <p class="text-xs text-muted">
                {{ connection.shop?.name }} · {{ connection.shop?.domain }}
              </p>
            </div>
            <UBadge
              v-if="!connection.allOrders"
              label="Accès aux 60 derniers jours"
              variant="subtle"
              color="neutral"
            />
          </div>
          <UAlert
            v-if="lookupError"
            title="Recherche impossible"
            :description="lookupError"
            color="warning"
            icon="i-lucide-search"
          />
          <div class="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-default">
            <UEmpty
              v-if="!rows.length && ordersStatus !== 'pending'"
              title="Aucune commande à traiter"
              description="Les commandes ouvertes de la boutique apparaîtront ici."
              icon="i-lucide-check"
              class="py-10"
            />
            <div v-else class="min-h-0 flex-1 divide-y divide-default overflow-y-auto sm:hidden">
              <p v-if="ordersStatus === 'pending'" class="p-4 text-sm text-muted">
                Chargement des commandes…
              </p>
              <article v-for="order in rows" :key="order.id" class="space-y-2 p-3">
                <div class="flex items-center justify-between gap-2 font-medium text-highlighted">
                  <span>{{ order.name }}</span>
                  <span class="tabular-nums">{{ order.currency === 'CHF' ? formatCurrency(order.totalCents) : `${(order.totalCents / 100).toFixed(2)} ${order.currency}` }}</span>
                </div>
                <div class="text-xs text-muted">
                  <p class="truncate text-sm text-default">
                    {{ order.customerName }}
                  </p>
                  <p>{{ formatDateTime(order.createdAt) }} · {{ shopifyFulfillmentLabels[order.fulfillmentStatus] || order.fulfillmentStatus }}</p>
                </div>
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <UBadge :label="shopifyFinancialLabels[order.financialStatus] || order.financialStatus" :color="order.financialStatus === 'PAID' ? 'success' : 'warning'" variant="subtle" />
                  <UButton
                    v-if="order.documentId"
                    :to="`/documents/${order.documentId}`"
                    label="Voir la facture"
                    color="neutral"
                    variant="outline"
                    size="sm"
                  />
                  <UButton
                    v-else
                    label="Importer"
                    icon="i-lucide-download"
                    size="sm"
                    :loading="importing === order.id"
                    :disabled="busy || order.currency !== 'CHF'"
                    @click="importOrder(order)"
                  />
                </div>
                <PosShopifyPaymentSync v-if="order.documentId" :document-id="order.documentId" @refresh="refreshOrders()" />
              </article>
            </div>
            <UTable
              v-if="rows.length || ordersStatus === 'pending'"
              :data="rows"
              :columns="columns"
              :loading="ordersStatus === 'pending'"
              sticky="header"
              class="hidden min-h-0 flex-1 overflow-auto sm:block"
            >
              <template #name-cell="{ row }">
                <p class="font-medium text-highlighted">
                  {{ row.original.name }}
                </p>
                <p class="text-xs text-muted">
                  {{ formatDateTime(row.original.createdAt) }}
                </p>
              </template>
              <template #financialStatus-cell="{ row }">
                <UBadge :label="shopifyFinancialLabels[row.original.financialStatus] || row.original.financialStatus" :color="row.original.financialStatus === 'PAID' ? 'success' : 'warning'" variant="subtle" />
              </template>
              <template #fulfillmentStatus-cell="{ row }">
                <span>{{ shopifyFulfillmentLabels[row.original.fulfillmentStatus] || row.original.fulfillmentStatus }}</span>
              </template>
              <template #totalCents-cell="{ row }">
                <span class="font-medium tabular-nums">{{ row.original.currency === 'CHF' ? formatCurrency(row.original.totalCents) : `${(row.original.totalCents / 100).toFixed(2)} ${row.original.currency}` }}</span>
              </template>
              <template #actions-cell="{ row }">
                <div class="flex justify-end gap-2">
                  <template v-if="row.original.documentId">
                    <UButton
                      :to="`/documents/${row.original.documentId}`"
                      label="Voir la facture"
                      icon="i-lucide-arrow-up-right"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                    />
                    <PosShopifyPaymentSync :document-id="row.original.documentId" @refresh="refreshOrders()" />
                  </template>
                  <UButton
                    v-else
                    label="Importer"
                    icon="i-lucide-download"
                    size="sm"
                    :loading="importing === row.original.id"
                    :disabled="busy || row.original.currency !== 'CHF'"
                    @click="importOrder(row.original)"
                  />
                </div>
              </template>
            </UTable>
            <div v-if="!found" class="mt-auto flex items-center justify-between gap-2 border-t border-default px-3 py-2">
              <span class="text-xs text-muted">Page {{ page + 1 }}</span>
              <div class="flex gap-1">
                <UButton
                  label="Précédent"
                  icon="i-lucide-chevron-left"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :disabled="page === 0 || busy"
                  @click="changePage(page - 1)"
                />
                <UButton
                  label="Suivant"
                  trailing-icon="i-lucide-chevron-right"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :disabled="!response?.pageInfo.hasNextPage || busy"
                  @click="changePage(page + 1)"
                />
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </UDashboardPanel>
</template>
