<script setup lang="ts">
import type { CustomerRecord } from '~~/shared/types/pos'

const route = useRoute()
const toast = useToast()
const customerId = computed(() => Number(route.query.customerId || 0))

const { data: customers } = await useFetch<CustomerRecord[]>('/api/customers')

async function saveTicket(payload: {
  customerId: number
  type: 'repair' | 'support'
  status: 'new' | 'diagnosis' | 'awaiting_customer_approval' | 'approved' | 'in_progress' | 'waiting_parts' | 'ready_for_pickup' | 'delivered' | 'closed' | 'cancelled'
  brand: string
  model: string
  serialNumber: string
  imei: string
  issueDescription: string
  internalNotes: string
  openedAt: string
  closedAt: string
}) {
  const ticket = await $fetch('/api/tickets', {
    method: 'POST',
    body: {
      ...payload,
      customerId: payload.customerId || customerId.value
    }
  })

  toast.add({
    title: 'Ticket created',
    color: 'success'
  })

  await navigateTo(`/tickets/${ticket.id}`)
}
</script>

<template>
  <UDashboardPanel id="ticket-create">
    <template #header>
      <UDashboardNavbar title="New Ticket">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UCard class="mx-auto w-full max-w-5xl">
        <PosTicketForm
          v-if="customers"
          :customers="customers"
          :initial-value="{ customerId: customerId || undefined }"
          submit-label="Create ticket"
          @save="saveTicket"
        />
      </UCard>
    </template>
  </UDashboardPanel>
</template>
