<script setup lang="ts">
import type { CustomerListResponse } from '~~/shared/types/pos'

const route = useRoute()
const toast = useToast()
const customerId = computed(() => Number(route.query.customerId || 0))
const formId = 'ticket-editor-form'

const { data: customers } = await useFetch<CustomerListResponse>('/api/customers', {
  query: { pageSize: 250 }
})

async function saveTicket(payload: {
  customerId: number
  type: 'repair' | 'support'
  status: 'new' | 'diagnosis' | 'awaiting_customer_approval' | 'approved' | 'in_progress' | 'waiting_parts' | 'ready_for_pickup' | 'delivered' | 'closed' | 'cancelled'
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
  const ticket = await $fetch('/api/tickets', {
    method: 'POST',
    body: {
      ...payload,
      customerId: payload.customerId || customerId.value
    }
  })

  toast.add({
    title: 'Ticket créé',
    color: 'success'
  })

  await navigateTo(`/tickets/${ticket.id}`)
}
</script>

<template>
  <UDashboardPanel id="ticket-create">
    <template #header>
      <UDashboardNavbar title="Nouveau ticket">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <UButton
              to="/tickets"
              label="Annuler"
              color="neutral"
              variant="ghost"
            />
            <UButton
              :form="formId"
              type="submit"
              label="Créer le ticket"
              icon="i-lucide-check"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-[108rem] flex-col gap-3">
        <PosTicketForm
          v-if="customers?.items"
          :form-id="formId"
          layout="intake"
          :show-submit="false"
          :customers="customers.items"
          :initial-value="{ customerId: customerId || undefined, type: 'repair' }"
          @save="saveTicket"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
