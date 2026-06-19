<script setup lang="ts">
import { documentTypes, documentTypeLabels } from '~~/shared/constants/pos'
import type { CustomerListResponse, DocumentDetail, DocumentStatus, DocumentType } from '~~/shared/types/pos'

const route = useRoute()
const toast = useToast()
const customerId = computed(() => Number(route.query.customerId || 0) || null)
const ticketId = computed(() => Number(route.query.ticketId || 0) || null)
const requestedDocumentType = computed<DocumentType | null>(() => {
  const type = Array.isArray(route.query.type) ? route.query.type[0] : route.query.type

  return documentTypes.includes(type as DocumentType) ? type as DocumentType : null
})
const newDocumentTitleLabels: Record<DocumentType, string> = {
  quote: 'Nouveau devis',
  customer_order: 'Nouvelle commande',
  invoice: 'Nouvelle facture'
}
const allowedDocumentTypes = computed<DocumentType[]>(() => requestedDocumentType.value ? [requestedDocumentType.value] : [...documentTypes])
const initialDocumentValue = computed(() => requestedDocumentType.value ? { type: requestedDocumentType.value } : {})
const pageTitle = computed(() => requestedDocumentType.value ? newDocumentTitleLabels[requestedDocumentType.value] : 'Nouveau devis / facture')
const pageDescription = computed(() => requestedDocumentType.value
  ? `${documentTypeLabels[requestedDocumentType.value]} sélectionné pour cette création.`
  : 'Choisissez le type commercial avant de saisir les lignes et le client.')

const { data: customers } = await useFetch<CustomerListResponse>('/api/customers', {
  query: { pageSize: 250 }
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
  const document = await $fetch<DocumentDetail>('/api/documents', {
    method: 'POST',
    body: payload
  })

  toast.add({
    title: 'Document créé',
    color: 'success'
  })

  await navigateTo(`/documents/${document.id}`)
}
</script>

<template>
  <UDashboardPanel id="document-create">
    <template #header>
      <UDashboardNavbar :title="pageTitle">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-[108rem] flex-col gap-4">
        <div>
          <h2 class="text-lg font-semibold text-highlighted">
            {{ pageTitle }}
          </h2>
          <p class="text-sm text-toned">
            {{ pageDescription }}
          </p>
        </div>

        <PosDocumentEditor
          v-if="customers?.items"
          :customers="customers.items"
          :initial-value="initialDocumentValue"
          :allowed-types="allowedDocumentTypes"
          :fixed-customer-id="customerId"
          :fixed-ticket-id="ticketId"
          submit-label="Créer le document"
          @save="saveDocument"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
