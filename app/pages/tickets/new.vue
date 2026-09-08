<script setup lang="ts">
import type { CustomerListResponse } from '~~/shared/types/pos'

const $fetch = useDossierFetch()

const route = useRoute()
const { isSaving, saveError, save } = useFormAction()
const customerId = computed(() => Number(route.query.customerId || 0))
const formId = 'ticket-editor-form'
const dirty = ref(false)

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
  const result = await save(() => $fetch(`/api/tickets`, {
    method: 'POST',
    body: { ...payload, customerId: payload.customerId || customerId.value }
  }), { success: 'Dossier créé' })
  if (!result?.ok) return
  dirty.value = false
  await navigateTo(`/tickets/${result.data.id}`)
}
</script>

<template>
  <UDashboardPanel id="ticket-create">
    <template #header>
      <UDashboardNavbar title="Nouveau dossier">
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
              :label="isSaving ? 'Enregistrement…' : 'Créer le dossier'"
              :loading="isSaving"
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
          v-model:dirty="dirty"
          :form-id="formId"
          :saving="isSaving"
          :save-error="saveError"
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
