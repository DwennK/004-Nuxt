<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import {
  documentStatusColors,
  documentStatusLabels,
  documentTypeColors,
  documentTypeLabels,
  lineCategoryColors,
  lineCategoryLabels,
  paymentMethodColors,
  paymentMethodLabels
} from '~~/shared/constants/pos'
import type { CatalogItemRecord, CustomerRecord, DocumentDetail, DocumentStatus, DocumentType } from '~~/shared/types/pos'
import { supportsDocumentPrintProfile } from '~~/shared/utils/print'
import { formatCurrency, formatDateTime, isPayableDocumentType } from '~~/shared/utils/pos'

const UBadge = resolveComponent('UBadge')
const NuxtLink = resolveComponent('NuxtLink')

const route = useRoute()
const toast = useToast()
const id = computed(() => Number(route.params.id))
const activeTab = ref('overview')
const paymentOpen = ref(false)
const editOpen = ref(false)

const tabItems = [
  { label: 'Vue d’ensemble', value: 'overview', icon: 'i-lucide-file-text' },
  { label: 'Lignes', value: 'lines', icon: 'i-lucide-list' },
  { label: 'Paiements', value: 'payments', icon: 'i-lucide-wallet' }
]

const [{ data: document, refresh }, { data: customers }, { data: catalogItems }] = await Promise.all([
  useFetch<DocumentDetail>(() => `/api/documents/${id.value}`),
  useFetch<CustomerRecord[]>('/api/customers'),
  useFetch<CatalogItemRecord[]>('/api/catalog-items', { query: { activeOnly: true } })
])

const paidAmount = computed(() => document.value?.payments
  .filter(payment => payment.status === 'paid')
  .reduce((total: number, payment) => total + payment.amount, 0) || 0)

const isPayableDocument = computed(() => document.value ? isPayableDocumentType(document.value.type) : false)
const balanceDue = computed(() => isPayableDocument.value ? Math.max((document.value?.total || 0) - paidAmount.value, 0) : 0)
const supportsA4Print = computed(() => document.value ? supportsDocumentPrintProfile(document.value.type, 'a4') : false)
const supportsThermalPrint = computed(() => document.value ? supportsDocumentPrintProfile(document.value.type, 'thermal') : false)
const customerContactLine = computed(() => {
  if (!document.value) {
    return 'Aucun contact'
  }

  return [document.value.customer.phone, document.value.customer.email].filter(Boolean).join(' · ') || 'Aucun contact'
})

async function saveDocument(payload: {
  type: DocumentType
  status: DocumentStatus
  customerId: number
  ticketId: number | null
  issuedAt: string
  notes: string
  lines: Array<{
    catalogItemId: number | null
    label: string
    quantity: number
    unitPrice: number
    vatRate: number
    categoryHint: 'accessory' | 'repair' | 'service' | null
  }>
}) {
  await $fetch(`/api/documents/${id.value}`, {
    method: 'PATCH',
    body: payload
  })

  toast.add({
    title: 'Document mis à jour',
    color: 'success'
  })

  editOpen.value = false
  await refresh()
}

async function markPaid(payload: {
  method: 'cash' | 'card' | 'twint' | 'bank_transfer'
  amount: number
  reference: string
  notes: string
}) {
  await $fetch(`/api/documents/${id.value}/mark-paid`, {
    method: 'POST',
    body: payload
  })

  paymentOpen.value = false
  toast.add({
    title: 'Paiement enregistré',
    color: 'success'
  })
  await refresh()
}

const lineColumns: TableColumn<DocumentDetail['lines'][number]>[] = [
  {
    accessorKey: 'label',
    header: 'Ligne',
    cell: ({ row }) => h('div', { class: 'space-y-1' }, [
      h('p', { class: 'font-medium text-highlighted' }, row.original.label),
      row.original.categoryHint
        ? h(UBadge, {
            color: lineCategoryColors[row.original.categoryHint],
            variant: 'subtle'
          }, () => lineCategoryLabels[row.original.categoryHint!])
        : null
    ])
  },
  {
    accessorKey: 'quantity',
    header: 'Qté'
  },
  {
    accessorKey: 'unitPrice',
    header: 'Prix TTC',
    cell: ({ row }) => formatCurrency(row.original.unitPrice)
  },
  {
    accessorKey: 'vatRate',
    header: 'TVA incl.',
    cell: ({ row }) => `${row.original.vatRate}%`
  },
  {
    accessorKey: 'lineTotal',
    header: 'Total TTC',
    cell: ({ row }) => formatCurrency(row.original.lineTotal)
  }
]

const paymentColumns: TableColumn<DocumentDetail['payments'][number]>[] = [
  {
    accessorKey: 'method',
    header: 'Mode de paiement',
    cell: ({ row }) => h(UBadge, {
      color: paymentMethodColors[row.original.method],
      variant: 'subtle'
    }, () => paymentMethodLabels[row.original.method])
  },
  {
    accessorKey: 'amount',
    header: 'Montant',
    cell: ({ row }) => formatCurrency(row.original.amount)
  },
  {
    accessorKey: 'paidAt',
    header: 'Encaissé à',
    cell: ({ row }) => formatDateTime(row.original.paidAt)
  },
  {
    accessorKey: 'reference',
    header: 'Référence',
    cell: ({ row }) => row.original.reference || 'Aucune référence'
  }
]
</script>

<template>
  <UDashboardPanel id="document-detail">
    <template #header>
      <UDashboardNavbar :title="document?.documentNumber || 'Détail du document'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <UButton
            v-if="isPayableDocument && document?.status !== 'paid' && balanceDue > 0"
            icon="i-lucide-wallet"
            label="Enregistrer un paiement"
            variant="subtle"
            @click="paymentOpen = true"
          />
          <UButton
            label="Modifier"
            icon="i-lucide-pencil"
            color="neutral"
            variant="ghost"
            @click="editOpen = true"
          />
          <UButton
            v-if="supportsA4Print"
            :to="`/documents/${id}/print?profile=a4`"
            icon="i-lucide-file-text"
            label="Imprimer A4"
            color="neutral"
            variant="subtle"
          />
          <UButton
            v-if="supportsThermalPrint"
            :to="`/documents/${id}/print?profile=thermal`"
            icon="i-lucide-receipt"
            label="Imprimer thermique"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="document && customers && catalogItems" class="space-y-3">
        <div class="rounded-2xl border border-default/80 bg-muted/20 px-4 py-3">
          <div class="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :color="documentTypeColors[document.type]" variant="subtle" size="sm">
                {{ documentTypeLabels[document.type] }}
              </UBadge>
              <UBadge :color="documentStatusColors[document.status]" variant="subtle" size="sm">
                {{ documentStatusLabels[document.status] }}
              </UBadge>
              <span class="text-sm text-toned">
                {{ document.customer.displayName }}
              </span>
              <span v-if="document.ticket" class="text-sm text-toned">
                · Ticket {{ document.ticket.ticketNumber }}
              </span>
            </div>

            <div class="grid gap-2 sm:grid-cols-4">
              <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                  Total
                </p>
                <p class="text-sm font-semibold text-highlighted">
                  {{ formatCurrency(document.total) }}
                </p>
              </div>
              <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                  Encaissé
                </p>
                <p class="text-sm font-semibold text-highlighted">
                  {{ formatCurrency(paidAmount) }}
                </p>
              </div>
              <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                  {{ isPayableDocument ? 'Restant' : 'Type' }}
                </p>
                <p class="text-sm font-semibold text-highlighted">
                  {{ isPayableDocument ? formatCurrency(balanceDue) : documentTypeLabels[document.type] }}
                </p>
              </div>
              <div class="rounded-xl border border-default bg-default/80 px-3 py-2">
                <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                  Lignes
                </p>
                <p class="text-sm font-semibold text-highlighted">
                  {{ document.lines.length }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <UTabs
          v-model="activeTab"
          :items="tabItems"
          value-key="value"
          variant="link"
          :content="false"
          class="w-full"
        />

        <div v-if="activeTab === 'overview'" class="grid gap-4 xl:h-[calc(100vh-18.5rem)] xl:grid-cols-[1.05fr_0.95fr]">
          <div class="space-y-4 xl:min-h-0 xl:overflow-y-auto pr-1">
            <UCard :ui="{ body: 'space-y-3 p-4', header: 'p-4 pb-0' }">
              <template #header>
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Synthèse
                  </h2>
                </div>
              </template>

              <div class="grid gap-3 md:grid-cols-2">
                <div class="space-y-2">
                  <div class="flex items-center justify-between rounded-2xl border border-default px-4 py-2.5">
                    <span class="text-sm text-toned">Type</span>
                    <UBadge :color="documentTypeColors[document.type]" variant="subtle">
                      {{ documentTypeLabels[document.type] }}
                    </UBadge>
                  </div>
                  <div class="flex items-center justify-between rounded-2xl border border-default px-4 py-2.5">
                    <span class="text-sm text-toned">Statut</span>
                    <UBadge :color="documentStatusColors[document.status]" variant="subtle">
                      {{ documentStatusLabels[document.status] }}
                    </UBadge>
                  </div>
                  <div class="flex items-center justify-between rounded-2xl border border-default px-4 py-2.5">
                    <span class="text-sm text-toned">Émis le</span>
                    <span class="text-sm font-medium text-highlighted">{{ formatDateTime(document.issuedAt) }}</span>
                  </div>
                </div>

                <div class="space-y-2">
                  <div class="rounded-2xl border border-default bg-default/70 px-4 py-3">
                    <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                      Client
                    </p>
                    <p class="mt-1 text-sm font-medium text-highlighted">
                      {{ document.customer.displayName }}
                    </p>
                    <p class="mt-1 text-xs text-toned">
                      {{ customerContactLine }}
                    </p>
                  </div>
                  <div class="rounded-2xl border border-default bg-default/70 px-4 py-3">
                    <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                      Liaison
                    </p>
                    <template v-if="document.ticket">
                      <p class="mt-1 text-sm font-medium text-highlighted">
                        Ticket
                      </p>
                      <NuxtLink :to="`/tickets/${document.ticket.id}`" class="mt-1 inline-flex text-sm text-primary">
                        {{ document.ticket.ticketNumber }}
                      </NuxtLink>
                    </template>
                    <p v-else class="mt-1 text-sm text-toned">
                      Vente directe / document autonome
                    </p>
                  </div>
                </div>
              </div>
            </UCard>

            <UCard :ui="{ body: 'space-y-3 p-4', header: 'p-4 pb-0' }">
              <template #header>
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Totaux et notes
                  </h2>
                </div>
              </template>

              <div class="grid gap-3 md:grid-cols-3">
                <div class="rounded-2xl border border-default px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    Total HT
                  </p>
                  <p class="mt-1 font-semibold text-highlighted">
                    {{ formatCurrency(document.subtotal) }}
                  </p>
                </div>
                <div class="rounded-2xl border border-default px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    TVA incluse
                  </p>
                  <p class="mt-1 font-semibold text-highlighted">
                    {{ formatCurrency(document.taxAmount) }}
                  </p>
                </div>
                <div class="rounded-2xl border border-default px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    {{ isPayableDocument ? 'Reste à payer' : 'Encaissement' }}
                  </p>
                  <p class="mt-1 font-semibold text-highlighted">
                    {{ isPayableDocument ? formatCurrency(balanceDue) : 'Non applicable' }}
                  </p>
                </div>
              </div>

              <div class="rounded-2xl border border-default bg-muted/20 px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-toned">
                  Notes
                </p>
                <p class="mt-2 text-sm text-highlighted">
                  {{ document.notes || 'Aucune note sur ce document.' }}
                </p>
              </div>
            </UCard>
          </div>

          <UCard :ui="{ body: 'p-4', header: 'p-4 pb-0' }" class="xl:min-h-0">
            <template #header>
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Lignes actuelles
                  </h2>
                </div>
                <span class="text-xs text-toned">
                  {{ document.lines.length }} ligne(s)
                </span>
              </div>
            </template>

            <div class="xl:max-h-[calc(100vh-24rem)] xl:overflow-auto pr-1">
              <UTable :data="document.lines" :columns="lineColumns" sticky="header">
                <template #empty>
                  <UEmpty
                    icon="i-lucide-list"
                    title="Aucune ligne"
                    description="Ajoutez des lignes dans l’onglet édition."
                  />
                </template>
              </UTable>
            </div>
          </UCard>
        </div>

        <div v-else-if="activeTab === 'lines'" class="grid gap-4 xl:h-[calc(100vh-18.5rem)] xl:grid-cols-[minmax(0,1fr)_18rem]">
          <UCard :ui="{ body: 'space-y-4 p-4', header: 'p-4 pb-0' }" class="xl:min-h-0">
            <template #header>
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Lignes du document
                  </h2>
                  <p class="text-sm text-toned">
                    Vue opérateur compacte. L’édition complète reste disponible à la demande.
                  </p>
                </div>
                <UButton
                  label="Modifier le document"
                  icon="i-lucide-pencil"
                  size="sm"
                  color="neutral"
                  variant="soft"
                  @click="editOpen = true"
                />
              </div>
            </template>

            <div class="xl:max-h-[calc(100vh-27rem)] xl:overflow-auto pr-1">
              <UTable :data="document.lines" :columns="lineColumns" sticky="header">
                <template #empty>
                  <UEmpty
                    icon="i-lucide-list"
                    title="Aucune ligne"
                    description="Ajoutez des lignes dans l’éditeur complet."
                  />
                </template>
              </UTable>
            </div>

            <div class="grid gap-3 md:grid-cols-3">
              <div class="rounded-2xl border border-default px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-toned">
                  Total HT
                </p>
                <p class="mt-1 font-semibold text-highlighted">
                  {{ formatCurrency(document.subtotal) }}
                </p>
              </div>
              <div class="rounded-2xl border border-default px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-toned">
                  TVA incluse
                </p>
                <p class="mt-1 font-semibold text-highlighted">
                  {{ formatCurrency(document.taxAmount) }}
                </p>
              </div>
              <div class="rounded-2xl border border-default px-4 py-3">
                <p class="text-xs uppercase tracking-wide text-toned">
                  Total TTC
                </p>
                <p class="mt-1 font-semibold text-highlighted">
                  {{ formatCurrency(document.total) }}
                </p>
              </div>
            </div>
          </UCard>

          <div class="space-y-4 xl:min-h-0 xl:overflow-y-auto pr-1">
            <UCard :ui="{ body: 'space-y-3 p-4', header: 'p-4 pb-0' }">
              <template #header>
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Contexte
                  </h2>
                </div>
              </template>

              <div class="space-y-2 text-sm">
                <div class="flex items-center justify-between gap-3">
                  <span class="text-toned">Type</span>
                  <UBadge :color="documentTypeColors[document.type]" variant="subtle" size="sm">
                    {{ documentTypeLabels[document.type] }}
                  </UBadge>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="text-toned">Statut</span>
                  <UBadge :color="documentStatusColors[document.status]" variant="subtle" size="sm">
                    {{ documentStatusLabels[document.status] }}
                  </UBadge>
                </div>
                <div class="flex items-center justify-between gap-3">
                  <span class="text-toned">Client</span>
                  <span class="font-medium text-highlighted text-right">{{ document.customer.displayName }}</span>
                </div>
                <div class="flex items-start justify-between gap-3">
                  <span class="text-toned">Émis le</span>
                  <span class="font-medium text-highlighted text-right">{{ formatDateTime(document.issuedAt) }}</span>
                </div>
              </div>
            </UCard>

            <UCard :ui="{ body: 'space-y-3 p-4', header: 'p-4 pb-0' }">
              <template #header>
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Liaison et notes
                  </h2>
                </div>
              </template>

              <div class="space-y-3 text-sm">
                <div>
                  <p class="text-xs uppercase tracking-wide text-toned">
                    Ticket
                  </p>
                  <template v-if="document.ticket">
                    <NuxtLink :to="`/tickets/${document.ticket.id}`" class="mt-1 inline-flex font-medium text-primary">
                      {{ document.ticket.ticketNumber }}
                    </NuxtLink>
                  </template>
                  <p v-else class="mt-1 text-toned">
                    Vente directe / document autonome
                  </p>
                </div>

                <div class="rounded-2xl border border-default bg-muted/20 px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    Notes
                  </p>
                  <p class="mt-2 text-sm text-highlighted">
                    {{ document.notes || 'Aucune note sur ce document.' }}
                  </p>
                </div>
              </div>
            </UCard>
          </div>
        </div>

        <div v-else-if="activeTab === 'payments'" class="grid gap-4 xl:h-[calc(100vh-18.5rem)] xl:grid-cols-[minmax(0,1fr)_18rem]">
          <UCard :ui="{ body: 'p-4', header: 'p-4 pb-0' }" class="xl:min-h-0">
            <template #header>
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Historique des paiements
                  </h2>
                </div>
                <span class="text-xs text-toned">
                  {{ document.payments.length }} paiement(s)
                </span>
              </div>
            </template>

            <div class="xl:max-h-[calc(100vh-24rem)] xl:overflow-auto pr-1">
              <UTable :data="document.payments" :columns="paymentColumns" sticky="header">
                <template #empty>
                  <UEmpty
                    icon="i-lucide-wallet"
                    title="Aucun paiement enregistré"
                    description="Enregistrez un paiement depuis l’action d’en-tête."
                  />
                </template>
              </UTable>
            </div>
          </UCard>

          <div class="space-y-4 xl:min-h-0 xl:overflow-y-auto pr-1">
            <UCard :ui="{ body: 'space-y-4 p-4', header: 'p-4 pb-0' }">
              <template #header>
                <div>
                  <h2 class="text-base font-semibold text-highlighted">
                    Solde
                  </h2>
                </div>
              </template>

              <div class="space-y-3">
                <div class="rounded-2xl border border-default bg-muted/20 px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    {{ isPayableDocument ? 'Restant' : 'Encaissement' }}
                  </p>
                  <p class="mt-2 text-lg font-semibold text-highlighted">
                    {{ isPayableDocument ? formatCurrency(balanceDue) : 'Non applicable' }}
                  </p>
                </div>

                <div class="grid gap-3">
                  <div class="rounded-2xl border border-default px-4 py-3">
                    <p class="text-xs uppercase tracking-wide text-toned">
                      Total document
                    </p>
                    <p class="mt-1 font-semibold text-highlighted">
                      {{ formatCurrency(document.total) }}
                    </p>
                  </div>
                  <div class="rounded-2xl border border-default px-4 py-3">
                    <p class="text-xs uppercase tracking-wide text-toned">
                      Déjà encaissé
                    </p>
                    <p class="mt-1 font-semibold text-highlighted">
                      {{ formatCurrency(paidAmount) }}
                    </p>
                  </div>
                </div>

                <UButton
                  v-if="isPayableDocument && document.status !== 'paid' && balanceDue > 0"
                  label="Enregistrer un paiement"
                  icon="i-lucide-wallet"
                  block
                  @click="paymentOpen = true"
                />
              </div>
            </UCard>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <PosDocumentPaymentSlideover
    v-if="document && isPayableDocument"
    v-model:open="paymentOpen"
    :balance-due="balanceDue"
    @save="markPaid"
  />

  <USlideover
    v-model:open="editOpen"
    title="Modifier le document"
    description="Édition complète des lignes et du contexte commercial."
    :ui="{ content: 'max-w-5xl' }"
  >
    <template #body>
      <PosDocumentEditor
        v-if="document"
        :customers="customers || []"
        :catalog-items="catalogItems || []"
        :initial-value="document"
        :fixed-ticket-id="document.ticketId"
        submit-label="Enregistrer le document"
        @save="saveDocument"
      />
    </template>
  </USlideover>
</template>
