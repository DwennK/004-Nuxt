<script setup lang="ts">
import type { CatalogItemRecord, CustomerRecord, DocumentDetail, DocumentStatus, DocumentType } from '~~/shared/types/pos'

const route = useRoute()
const toast = useToast()
const customerId = computed(() => Number(route.query.customerId || 0) || null)
const ticketId = computed(() => Number(route.query.ticketId || 0) || null)

const [{ data: customers }, { data: catalogItems }] = await Promise.all([
  useFetch<CustomerRecord[]>('/api/customers'),
  useFetch<CatalogItemRecord[]>('/api/catalog-items', {
    query: {
      activeOnly: true
    }
  })
])

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
      <UDashboardNavbar title="Nouveau document">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-[108rem] flex-col gap-4">
        <div>
          <h2 class="text-lg font-semibold text-highlighted">
            Document avancé
          </h2>
          <p class="text-sm text-toned">
            À utiliser pour les devis, commandes, factures ou reçus hors flux rapide, avec contrôle complet des lignes et du client.
          </p>
        </div>

        <PosDocumentEditor
          v-if="customers && catalogItems"
          :customers="customers"
          :catalog-items="catalogItems"
          :fixed-customer-id="customerId"
          :fixed-ticket-id="ticketId"
          submit-label="Créer le document"
          @save="saveDocument"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
