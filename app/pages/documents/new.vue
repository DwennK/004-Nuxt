<script setup lang="ts">
import type { CatalogItemRecord, CustomerRecord, DocumentDetail } from '~~/shared/types/pos'

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
  const document = await $fetch<DocumentDetail>('/api/documents', {
    method: 'POST',
    body: payload
  })

  toast.add({
    title: 'Document created',
    color: 'success'
  })

  await navigateTo(`/documents/${document.id}`)
}
</script>

<template>
  <UDashboardPanel id="document-create">
    <template #header>
      <UDashboardNavbar title="New Document">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UCard class="mx-auto w-full max-w-6xl">
        <template #header>
          <div>
            <h2 class="text-lg font-semibold text-highlighted">
              Direct sale or standalone document
            </h2>
            <p class="text-sm text-toned">
              Use this for direct accessory sales, quick support services, standalone quotes, or ticket-linked billing when needed.
            </p>
          </div>
        </template>

        <PosDocumentEditor
          v-if="customers && catalogItems"
          :customers="customers"
          :catalog-items="catalogItems"
          :fixed-customer-id="customerId"
          :fixed-ticket-id="ticketId"
          submit-label="Create document"
          @save="saveDocument"
        />
      </UCard>
    </template>
  </UDashboardPanel>
</template>
