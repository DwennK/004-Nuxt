<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { upperFirst } from 'scule'
import { woocommerceOrderStatusLabels } from '~~/shared/constants/pos'
import type { WooImportResult, WooOrderListResponse, WooOrderSummary } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime } from '~~/shared/utils/pos'

const UBadge = resolveComponent('UBadge')
const UButton = resolveComponent('UButton')

const toast = useToast()
const manualOrderRef = ref('')
const currentPage = ref(1)
const pageSize = 20
const importingOrderRef = ref<string | null>(null)
const manualImportPending = ref(false)

const query = computed(() => ({
  page: currentPage.value,
  pageSize
}))

const { data: ordersResponse, status, error, refresh } = await useFetch<WooOrderListResponse>('/api/tools/woocommerce/orders', {
  query,
  default: () => ({
    items: [],
    page: 1,
    pageSize,
    total: 0
  })
})

const orders = computed(() => ordersResponse.value?.items || [])
const totalResults = computed(() => ordersResponse.value?.total || 0)
const totalPages = computed(() => Math.max(Math.ceil(totalResults.value / pageSize), 1))

watch(totalResults, (total) => {
  const lastPage = Math.max(Math.ceil(total / pageSize), 1)

  if (currentPage.value > lastPage) {
    currentPage.value = lastPage
  }
})

function getFetchErrorMessage(fetchError: unknown, fallback: string) {
  if (!fetchError || typeof fetchError !== 'object') {
    return fallback
  }

  if ('data' in fetchError && fetchError.data && typeof fetchError.data === 'object' && 'statusMessage' in fetchError.data) {
    const statusMessage = fetchError.data.statusMessage

    if (typeof statusMessage === 'string' && statusMessage.trim()) {
      return statusMessage
    }
  }

  if ('statusMessage' in fetchError && typeof fetchError.statusMessage === 'string' && fetchError.statusMessage.trim()) {
    return fetchError.statusMessage
  }

  if ('message' in fetchError && typeof fetchError.message === 'string' && fetchError.message.trim()) {
    return fetchError.message
  }

  return fallback
}

const errorMessage = computed(() =>
  error.value
    ? getFetchErrorMessage(error.value, 'Impossible de charger les commandes WooCommerce.')
    : null
)

function getStatusLabel(statusValue: string) {
  if (statusValue in woocommerceOrderStatusLabels) {
    return woocommerceOrderStatusLabels[statusValue as keyof typeof woocommerceOrderStatusLabels]
  }

  return upperFirst(statusValue.replace(/-/g, ' '))
}

function isOrderImportPending(order: WooOrderSummary) {
  return importingOrderRef.value === order.number
}

async function importOrder(orderRef: string, source: 'manual' | 'list') {
  if (source === 'manual') {
    manualImportPending.value = true
  } else {
    importingOrderRef.value = orderRef
  }

  try {
    const result = await $fetch<WooImportResult>('/api/tools/woocommerce/import', {
      method: 'POST',
      body: {
        orderRef
      }
    })

    toast.add({
      title: 'Facture créée',
      description: `La commande WooCommerce #${result.orderNumber} a été importée en ${result.documentNumber}.`,
      color: 'success'
    })

    await navigateTo(`/documents/${result.documentId}`)
  } catch (fetchError) {
    toast.add({
      title: 'Import impossible',
      description: getFetchErrorMessage(fetchError, 'La commande WooCommerce n’a pas pu être importée.'),
      color: 'error'
    })
  } finally {
    if (source === 'manual') {
      manualImportPending.value = false
    } else {
      importingOrderRef.value = null
    }
  }
}

async function importManualOrder() {
  const value = manualOrderRef.value.trim()

  if (!value) {
    toast.add({
      title: 'Numéro manquant',
      description: 'Saisissez un numéro de commande WooCommerce.',
      color: 'warning'
    })
    return
  }

  await importOrder(value, 'manual')
}

const columns: TableColumn<WooOrderSummary>[] = [
  {
    accessorKey: 'number',
    header: 'Commande',
    cell: ({ row }) => h('div', { class: 'min-w-0 leading-tight' }, [
      h('p', { class: 'font-medium text-highlighted' }, `#${row.original.number}`),
      h('p', { class: 'truncate text-xs text-toned' }, formatDateTime(row.original.createdAt))
    ])
  },
  {
    accessorKey: 'customerName',
    header: 'Client',
    cell: ({ row }) => h('div', { class: 'min-w-0 leading-tight' }, [
      h('p', { class: 'truncate font-medium' }, row.original.customerName),
      h('p', { class: 'truncate text-xs text-toned' }, row.original.email || row.original.phone || 'Sans contact')
    ])
  },
  {
    accessorKey: 'status',
    header: 'Statut',
    cell: ({ row }) => h(UBadge, {
      label: getStatusLabel(row.original.status),
      color: row.original.alreadyImported ? 'neutral' : 'warning',
      variant: 'subtle'
    })
  },
  {
    accessorKey: 'totalCents',
    header: 'Total',
    cell: ({ row }) => h('span', { class: 'font-medium text-highlighted' }, formatCurrency(row.original.totalCents))
  },
  {
    id: 'importState',
    header: 'Import',
    cell: ({ row }) => row.original.alreadyImported
      ? h(UButton, {
          to: `/documents/${row.original.documentId}`,
          label: 'Voir la facture',
          icon: 'i-lucide-arrow-up-right',
          color: 'neutral',
          variant: 'outline',
          size: 'sm'
        })
      : h(UButton, {
          label: 'Importer',
          icon: 'i-lucide-download',
          color: 'primary',
          size: 'sm',
          loading: isOrderImportPending(row.original),
          onClick: () => importOrder(row.original.number, 'list')
        })
  }
]
</script>

<template>
  <UDashboardPanel id="woocommerce-import">
    <template #header>
      <UDashboardNavbar title="Import Woocommerce">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            label="Rafraîchir"
            color="neutral"
            variant="ghost"
            :loading="status === 'pending'"
            @click="refresh"
          />
        </template>
      </UDashboardNavbar>

      <UDashboardToolbar class="flex flex-wrap items-end gap-3">
        <UFormField
          label="Numéro de commande"
          description="Import manuel par numéro ou ID WooCommerce."
          class="min-w-[18rem] flex-1"
        >
          <UInput
            v-model="manualOrderRef"
            icon="i-lucide-hash"
            placeholder="Ex. 72787 ou #72787"
            @keydown.enter.prevent="importManualOrder"
          />
        </UFormField>

        <UButton
          icon="i-lucide-download"
          label="Importer la commande"
          :loading="manualImportPending"
          @click="importManualOrder"
        />
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="flex h-full min-h-0 flex-col gap-4">
        <UAlert
          v-if="errorMessage"
          icon="i-lucide-triangle-alert"
          color="error"
          variant="soft"
          title="Chargement impossible"
          :description="errorMessage"
        />

        <UCard
          v-else
          :ui="{
            body: 'p-0 sm:p-0',
            header: 'px-4 py-3 sm:px-4',
            footer: 'px-4 py-3 sm:px-4'
          }"
          class="min-h-0 flex-1 overflow-hidden"
        >
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="font-medium text-highlighted">
                  Commandes ouvertes WooCommerce
                </p>
                <p class="text-sm text-toned">
                  Statuts affichés: pending, processing, on-hold
                </p>
              </div>

              <UBadge :label="totalResults" variant="subtle" />
            </div>
          </template>

          <UEmpty
            v-if="!orders.length && status !== 'pending'"
            icon="i-lucide-shopping-cart"
            title="Aucune commande ouverte"
            description="Les commandes WooCommerce ouvertes apparaîtront ici."
            class="py-12"
          />

          <UTable
            v-else
            :data="orders"
            :columns="columns"
            sticky="header"
            class="shrink-0"
            :loading="status === 'pending'"
          />

          <template #footer>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <span class="text-xs text-toned">
                Page {{ currentPage }} / {{ totalPages }} · {{ totalResults }} commande(s)
              </span>

              <div class="flex items-center gap-2">
                <UButton
                  icon="i-lucide-chevron-left"
                  label="Précédent"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :disabled="currentPage <= 1 || status === 'pending'"
                  @click="currentPage -= 1"
                />
                <UButton
                  label="Suivant"
                  trailing-icon="i-lucide-chevron-right"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  :disabled="currentPage >= totalPages || status === 'pending'"
                  @click="currentPage += 1"
                />
              </div>
            </div>
          </template>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
