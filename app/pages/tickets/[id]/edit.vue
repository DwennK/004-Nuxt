<script setup lang="ts">
import type { CatalogItemRecord, CustomerRecord, TicketDetail } from '~~/shared/types/pos'

const route = useRoute()
const toast = useToast()
const id = computed(() => Number(route.params.id))
const formId = 'ticket-editor-form'

const [{ data: ticket }, { data: customers }, { data: catalogItems }] = await Promise.all([
  useFetch<TicketDetail>(() => `/api/tickets/${id.value}`),
  useFetch<CustomerRecord[]>('/api/customers'),
  useFetch<CatalogItemRecord[]>('/api/catalog-items', {
    query: {
      activeOnly: true
    }
  })
])

async function saveTicket(payload: {
  customerId: number
  type: 'repair' | 'support'
  status: TicketDetail['status']
  brand: string
  model: string
  serialNumber: string
  imei: string
  accessCode: string
  simCode: string
  issueDescription: string
  internalNotes: string
  openedAt: string
  closedAt: string
  lines: Array<{
    catalogItemId: number | null
    label: string
    quantity: number
    unitPrice: number
    vatRate: number
    categoryHint: 'accessory' | 'repair' | 'service' | null
  }>
}) {
  await $fetch(`/api/tickets/${id.value}`, {
    method: 'PATCH',
    body: payload
  })

  toast.add({
    title: 'Ticket mis à jour',
    color: 'success'
  })

  await navigateTo(`/tickets/${id.value}`)
}
</script>

<template>
  <UDashboardPanel id="ticket-edit">
    <template #header>
      <UDashboardNavbar :title="ticket?.ticketNumber ? `Modifier ${ticket.ticketNumber}` : 'Modifier le ticket'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              v-if="ticket"
              :to="`/tickets/${id}/print`"
              label="Imprimer"
              icon="i-lucide-printer"
              color="neutral"
              variant="subtle"
            />
            <UButton
              :to="`/tickets/${id}`"
              label="Annuler"
              color="neutral"
              variant="ghost"
            />
            <UButton
              :form="formId"
              type="submit"
              label="Valider"
              icon="i-lucide-check"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-[108rem] flex-col gap-3">
        <PosTicketForm
          v-if="ticket && customers"
          :form-id="formId"
          layout="intake"
          :show-submit="false"
          :customers="customers"
          :catalog-items="catalogItems || []"
          :initial-value="ticket"
          @save="saveTicket"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
