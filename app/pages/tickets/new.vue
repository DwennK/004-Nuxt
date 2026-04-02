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
  accessCode: string
  simCode: string
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
    title: 'Ticket créé',
    color: 'success'
  })

  await navigateTo(`/tickets/${ticket.id}`)
}
</script>

<template>
  <UDashboardPanel id="ticket-create">
    <template #header>
      <UDashboardNavbar title="Nouvelle réparation">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-[108rem] flex-col gap-3">
        <PosTicketForm
          v-if="customers"
          layout="intake"
          :customers="customers"
          :initial-value="{ customerId: customerId || undefined, type: 'repair' }"
          submit-label="Créer le ticket"
          @save="saveTicket"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
