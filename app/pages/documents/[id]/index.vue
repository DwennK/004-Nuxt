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
import type { CatalogItemRecord, CustomerRecord, DocumentDetail } from '~~/shared/types/pos'
import { formatCurrency, formatDateTime } from '~~/shared/utils/pos'

const UBadge = resolveComponent('UBadge')
const NuxtLink = resolveComponent('NuxtLink')

const route = useRoute()
const toast = useToast()
const id = computed(() => Number(route.params.id))
const activeTab = ref('overview')
const paymentOpen = ref(false)

const tabItems = [
  { label: 'Vue d’ensemble', value: 'overview', icon: 'i-lucide-file-text' },
  { label: 'Lignes', value: 'lines', icon: 'i-lucide-list' },
  { label: 'Paiements', value: 'payments', icon: 'i-lucide-wallet' },
  { label: 'Aperçu imprimable', value: 'print', icon: 'i-lucide-printer' }
]

const [{ data: document, refresh }, { data: customers }, { data: catalogItems }] = await Promise.all([
  useFetch<DocumentDetail>(() => `/api/documents/${id.value}`),
  useFetch<CustomerRecord[]>('/api/customers'),
  useFetch<CatalogItemRecord[]>('/api/catalog-items', { query: { activeOnly: true } })
])

const paidAmount = computed(() => document.value?.payments
  .filter(payment => payment.status === 'paid')
  .reduce((total: number, payment) => total + payment.amount, 0) || 0)

const balanceDue = computed(() => Math.max((document.value?.total || 0) - paidAmount.value, 0))

async function saveDocument(payload: {
  type: 'quote' | 'invoice' | 'receipt' | 'credit_note'
  status: 'draft' | 'issued' | 'paid' | 'cancelled'
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
            v-if="document?.status !== 'paid' && balanceDue > 0"
            icon="i-lucide-wallet"
            label="Enregistrer un paiement"
            variant="subtle"
            @click="paymentOpen = true"
          />
          <UButton :to="`/documents/${id}/print`" icon="i-lucide-printer" label="Aperçu imprimable" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="document && customers && catalogItems" class="space-y-6">
        <div class="grid gap-4 md:grid-cols-4">
          <PosSummaryCard title="Total TTC" :value="formatCurrency(document.total)" icon="i-lucide-receipt" />
          <PosSummaryCard title="Encaissé" :value="formatCurrency(paidAmount)" icon="i-lucide-wallet" />
          <PosSummaryCard title="Reste à payer" :value="formatCurrency(balanceDue)" icon="i-lucide-badge-euro" />
          <PosSummaryCard title="Lignes" :value="String(document.lines.length)" icon="i-lucide-list" />
        </div>

        <UTabs
          v-model="activeTab"
          :items="tabItems"
          value-key="value"
          class="w-full"
        />

        <div v-if="activeTab === 'overview'" class="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
          <div class="space-y-6">
            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    État commercial
                  </h2>
                </div>
              </template>

              <div class="space-y-3">
                <div class="flex items-center justify-between rounded-2xl border border-default px-4 py-3">
                  <span class="text-sm text-toned">Type</span>
                  <UBadge :color="documentTypeColors[document.type]" variant="subtle">
                    {{ documentTypeLabels[document.type] }}
                  </UBadge>
                </div>
                <div class="flex items-center justify-between rounded-2xl border border-default px-4 py-3">
                  <span class="text-sm text-toned">Statut</span>
                  <UBadge :color="documentStatusColors[document.status]" variant="subtle">
                    {{ documentStatusLabels[document.status] }}
                  </UBadge>
                </div>
                <div class="flex items-center justify-between rounded-2xl border border-default px-4 py-3">
                  <span class="text-sm text-toned">Émis le</span>
                  <span class="text-sm font-medium text-highlighted">{{ formatDateTime(document.issuedAt) }}</span>
                </div>
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Objets liés
                  </h2>
                </div>
              </template>

              <div class="space-y-3 text-sm text-toned">
                <div>
                  <p class="font-medium text-highlighted">
                    {{ document.customer.displayName }}
                  </p>
                  <p>{{ document.customer.phone }}</p>
                  <p>{{ document.customer.email }}</p>
                </div>
                <div class="rounded-2xl border border-default p-4">
                  <p v-if="document.ticket" class="font-medium text-highlighted">
                    Ticket
                  </p>
                  <p v-if="document.ticket">
                    <NuxtLink :to="`/tickets/${document.ticket.id}`" class="text-primary">
                      {{ document.ticket.ticketNumber }}
                    </NuxtLink>
                  </p>
                  <p v-else>
                    Vente directe / document autonome
                  </p>
                </div>
              </div>
            </UCard>
          </div>

          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Notes et totaux
                </h2>
              </div>
            </template>

            <div class="space-y-4">
              <div class="rounded-2xl border border-default bg-muted/20 p-4">
                <p class="text-xs uppercase tracking-wide text-toned">
                  Notes
                </p>
                <p class="mt-2 text-sm text-highlighted">
                  {{ document.notes || 'Aucune note sur ce document.' }}
                </p>
              </div>
              <div class="grid gap-3 md:grid-cols-3">
                <div class="rounded-2xl border border-default px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    Total HT
                  </p>
                  <p class="mt-2 font-semibold text-highlighted">
                    {{ formatCurrency(document.subtotal) }}
                  </p>
                </div>
                <div class="rounded-2xl border border-default px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    TVA incluse
                  </p>
                  <p class="mt-2 font-semibold text-highlighted">
                    {{ formatCurrency(document.taxAmount) }}
                  </p>
                </div>
                <div class="rounded-2xl border border-default px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    Reste à payer
                  </p>
                  <p class="mt-2 font-semibold text-highlighted">
                    {{ formatCurrency(balanceDue) }}
                  </p>
                </div>
              </div>
            </div>
          </UCard>
        </div>

        <UCard v-else-if="activeTab === 'lines'">
          <template #header>
            <div>
              <h2 class="text-lg font-semibold text-highlighted">
                Éditeur de document
              </h2>
              <p class="text-sm text-toned">
                Les ventes directes et la facturation liée à un ticket partagent le même éditeur.
              </p>
            </div>
          </template>

          <PosDocumentEditor
            :customers="customers"
            :catalog-items="catalogItems"
            :initial-value="document"
            :fixed-ticket-id="document.ticketId"
            submit-label="Enregistrer le document"
            @save="saveDocument"
          />
        </UCard>

        <div v-else-if="activeTab === 'payments'" class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Historique des paiements
                </h2>
              </div>
            </template>

            <UTable :data="document.payments" :columns="paymentColumns" sticky="header">
              <template #empty>
                <UEmpty
                  icon="i-lucide-wallet"
                  title="Aucun paiement enregistré"
                  description="Enregistrez un paiement depuis l’action d’en-tête."
                />
              </template>
            </UTable>
          </UCard>

          <div class="space-y-6">
            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Solde restant
                  </h2>
                </div>
              </template>

              <div class="space-y-4">
                <div class="rounded-2xl border border-default bg-muted/20 px-4 py-3">
                  <p class="text-xs uppercase tracking-wide text-toned">
                    Restant
                  </p>
                  <p class="mt-2 text-lg font-semibold text-highlighted">
                    {{ formatCurrency(balanceDue) }}
                  </p>
                </div>

                <UButton
                  v-if="document.status !== 'paid' && balanceDue > 0"
                  label="Enregistrer un paiement"
                  icon="i-lucide-wallet"
                  block
                  @click="paymentOpen = true"
                />
              </div>
            </UCard>

            <UCard>
              <template #header>
                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Lignes actuelles
                  </h2>
                </div>
              </template>

              <UTable :data="document.lines" :columns="lineColumns">
                <template #empty>
                  <UEmpty
                    icon="i-lucide-list"
                    title="Aucune ligne"
                    description="Ajoutez des lignes dans l’onglet éditeur."
                    size="sm"
                    variant="naked"
                  />
                </template>
              </UTable>
            </UCard>
          </div>
        </div>

        <div v-else class="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Aperçu imprimable
                </h2>
                <p class="text-sm text-toned">
                  Ouvrez une vraie mise en page documentaire avant de lancer l’impression.
                </p>
              </div>
            </template>

            <div class="space-y-4">
              <UButton :to="`/documents/${id}/print`" label="Ouvrir l’aperçu imprimable" icon="i-lucide-printer" />
              <div class="rounded-2xl border border-default p-4 text-sm text-toned">
                L’aperçu imprimable sépare le document commercial de l’interface opérateur et ajoute un vrai bouton d’impression.
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <div>
                <h2 class="text-lg font-semibold text-highlighted">
                  Lignes actuelles du document
                </h2>
              </div>
            </template>

            <UTable :data="document.lines" :columns="lineColumns" sticky="header">
              <template #empty>
                <UEmpty
                  icon="i-lucide-list"
                  title="Aucune ligne"
                  description="Ajoutez des lignes dans l’onglet éditeur."
                />
              </template>
            </UTable>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <PosDocumentPaymentSlideover
    v-if="document"
    v-model:open="paymentOpen"
    :balance-due="balanceDue"
    @save="markPaid"
  />
</template>
