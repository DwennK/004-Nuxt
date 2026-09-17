<script setup lang="ts">
import { documentTypes } from '~~/shared/constants/pos'
import type { CustomerRecord, DocumentDetail, DocumentStatus, DocumentType, TicketDetail } from '~~/shared/types/pos'

const $fetch = useDossierFetch()
const requestFetch = useRequestFetch()

const route = useRoute()
const { isSaving, saveError, save } = useFormAction()
const dirty = ref(false)
const documentMutation = useIdempotentMutation()
const customerId = computed(() => Number(route.query.customerId || 0) || null)
const savId = computed(() => Number(route.query.savId || 0) || null)
const ticketId = computed(() => Number(route.query.ticketId || 0) || null)
const requestedDocumentType = computed<DocumentType | null>(() => {
  const type = Array.isArray(route.query.type) ? route.query.type[0] : route.query.type

  return documentTypes.includes(type as DocumentType) ? type as DocumentType : null
})
const newDocumentTitleLabels: Record<DocumentType, string> = {
  quote: 'Nouveau devis',
  customer_order: 'Nouvelle commande',
  invoice: 'Nouvelle facture',
  sav: 'Nouveau SAV'
}
const allowedDocumentTypes = computed<DocumentType[]>(() => requestedDocumentType.value ? [requestedDocumentType.value] : documentTypes.filter(type => type !== 'sav'))
const initialDocumentValue = computed(() => requestedDocumentType.value ? { type: requestedDocumentType.value, savId: savId.value, ...(savCommercialSource.value ? { lines: savCommercialSource.value.lines } : {}) } : {})
const pageTitle = computed(() => requestedDocumentType.value ? newDocumentTitleLabels[requestedDocumentType.value] : 'Nouveau devis / facture')

const { data: customer, refresh: refreshCustomers } = await useAsyncData('new-document-customer', () => {
  return customerId.value ? requestFetch<CustomerRecord>(`/api/customers/${customerId.value}`) : Promise.resolve(null)
}, { watch: [customerId] })

const { data: ticket } = await useAsyncData('new-document-ticket', () => ticketId.value ? requestFetch<TicketDetail>(`/api/tickets/${ticketId.value}`) : Promise.resolve(null), { watch: [ticketId] })
const sourceId = computed(() => {
  if (!savId.value) return null
  const candidates = ticket.value?.documents.filter(document => document.savId === savId.value && document.status !== 'cancelled') || []
  if (requestedDocumentType.value === 'invoice') return (candidates.find(document => document.type === 'customer_order') || candidates.find(document => document.type === 'quote'))?.id
  return requestedDocumentType.value === 'customer_order' ? candidates.find(document => document.type === 'quote')?.id : null
})
const { data: savCommercialSource } = await useAsyncData('new-sav-commercial-source', () => sourceId.value ? requestFetch<DocumentDetail>(`/api/documents/${sourceId.value}`) : Promise.resolve(null), { watch: [sourceId] })
async function saveSav(sav: import('~~/shared/types/sav').SavDetails) {
  if (!ticket.value) return
  await saveDocument({ type: 'sav', status: 'issued', customerId: ticket.value.customerId, ticketId: ticket.value.id, issuedAt: sav.receivedAt, sav, notes: '', lines: [] })
}

const dossier = useDossier(() => ticketId.value ? { kind: 'ticket', id: ticketId.value } : null, { edit: true })
provide('pos-dossier-state', dossier.current)

async function saveDocument(payload: {
  type: DocumentType
  status: DocumentStatus
  customerId: number
  ticketId: number | null
  issuedAt: string
  notes: string
  sav?: import('~~/shared/types/sav').SavDetails
  lines: Array<{
    catalogItemId: number | null
    label: string
    quantity: number
    unitPrice: number
    vatRate: number
    categoryHint: 'accessory' | 'repair' | 'service' | null
  }>
}) {
  const attempt = documentMutation.getAttempt('create-document', payload, () => payload)
  const result = await save(() => $fetch<DocumentDetail>('/api/documents', {
    method: 'POST',
    headers: { 'Idempotency-Key': attempt.key },
    body: attempt.payload
  }), { success: 'Document créé' })
  if (!result?.ok) return
  dirty.value = false
  await navigateTo(`/documents/${result.data.id}`)
  documentMutation.complete('create-document')
}
</script>

<template>
  <UDashboardPanel id="document-create">
    <template #header>
      <UDashboardNavbar :title="pageTitle">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <div id="new-document-actions" class="flex items-center gap-2" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <PosDossierBanner :state="dossier.current.value" :refresh="refreshCustomers" />
      <div class="mx-auto flex w-full max-w-[108rem] flex-col gap-4">
        <PosSavEditor
          v-if="requestedDocumentType === 'sav' && ticket"
          :key="dossier.current.value?.epoch"
          v-model:dirty="dirty"
          :ticket="ticket"
          :disabled="dossier.blocked.value"
          :saving="isSaving"
          :save-error="saveError"
          @save="saveSav"
        />
        <UAlert v-else-if="requestedDocumentType === 'sav'" title="Ouvrez un dossier pour créer un SAV." />
        <PosDocumentEditor
          v-else
          :key="dossier.current.value?.epoch"
          v-model:dirty="dirty"
          actions-target="#new-document-actions"
          :disabled="dossier.blocked.value"
          :customers="customer ? [customer] : []"
          :saving="isSaving"
          :save-error="saveError"
          :initial-value="initialDocumentValue"
          :allowed-types="allowedDocumentTypes"
          :fixed-customer-id="customerId"
          :fixed-ticket-id="ticketId"
          submit-label="Créer le document"
          @save="saveDocument"
          @cancel="saveError = null"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
