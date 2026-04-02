<script setup lang="ts">
import type { DocumentSavePayload } from '~~/app/composables/useDocumentDraft'
import {
  documentStatusColors,
  documentStatusLabels,
  documentTypeColors,
  documentTypeLabels
} from '~~/shared/constants/pos'
import type { CatalogItemRecord, CustomerRecord, DocumentDetail } from '~~/shared/types/pos'
import { supportsDocumentPrintProfile } from '~~/shared/utils/print'
import { formatCurrency, isPayableDocumentType } from '~~/shared/utils/pos'

const UBadge = resolveComponent('UBadge')
const route = useRoute()
const toast = useToast()
const id = computed(() => Number(route.params.id))
const activeTab = ref('lines')

const tabItems = [
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
async function saveDocument(payload: DocumentSavePayload) {
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

        <div v-if="activeTab === 'lines'" class="grid gap-4 xl:h-[calc(100vh-18.5rem)] xl:grid-cols-[minmax(0,1fr)_18rem]">
          <PosDocumentEditor
            v-if="customers && catalogItems"
            :customers="customers"
            :catalog-items="catalogItems"
            :initial-value="document"
            :fixed-ticket-id="document.ticketId"
            submit-label="Enregistrer le document"
            class="xl:col-span-2"
            @save="saveDocument"
          />
        </div>

        <div v-else-if="activeTab === 'payments'" class="grid gap-4 xl:h-[calc(100vh-18.5rem)] xl:grid-cols-[minmax(0,1fr)_18rem]">
          <PosDocumentPaymentsEditor
            :document-id="document.id"
            :customer-id="document.customerId"
            :payments="document.payments"
            :document-total="document.total"
            :balance-due="balanceDue"
            :is-payable-document="isPayableDocument"
            class="xl:col-span-2"
            @refresh="refresh()"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
