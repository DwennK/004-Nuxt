<script setup lang="ts">
import type { CustomerListResponse, TicketDetail } from '~~/shared/types/pos'

const $fetch = useDossierFetch()

const route = useRoute()
const { isSaving, saveError, save } = useFormAction()
const id = computed(() => Number(route.params.id))
const formId = 'ticket-editor-form'
const dirty = ref(false)

const [{ data: ticket, refresh: refreshTicket }, { data: customers }] = await Promise.all([
  useFetch<TicketDetail>(() => `/api/tickets/${id.value}`),
  useFetch<CustomerListResponse>('/api/customers', {
    query: { pageSize: 250 }
  })
])

const dossier = useDossier(() => ({ kind: 'ticket', id: id.value }), { record: ticket, edit: true })
provide('pos-dossier-state', dossier.current)

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
  const result = await save(() => $fetch(`/api/tickets/${id.value}`, {
    method: 'PATCH',
    body: payload
  }), { success: 'Dossier enregistré' })
  if (!result?.ok) return
  dirty.value = false
  await navigateTo(`/tickets/${id.value}`)
}
</script>

<template>
  <UDashboardPanel id="ticket-edit">
    <template #header>
      <UDashboardNavbar :title="ticket?.ticketNumber ? `Modifier ${ticket.ticketNumber}` : 'Modifier le dossier'">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <div class="flex items-center gap-2">
            <span id="ticket-unsaved-status" class="inline-flex h-8 w-8 shrink-0 sm:w-36" />
            <UButton
              v-if="ticket"
              :to="`/tickets/${id}/print`"
              label="Imprimer"
              aria-label="Imprimer"
              icon="i-lucide-printer"
              color="neutral"
              variant="subtle"
              :ui="{ label: 'hidden sm:inline' }"
            />
            <UButton
              :to="`/tickets/${id}`"
              label="Annuler"
              aria-label="Annuler"
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              :ui="{ label: 'hidden sm:inline' }"
            />
            <UButton
              :form="formId"
              type="submit"
              :label="isSaving ? 'Enregistrement…' : 'Enregistrer les modifications'"
              :loading="isSaving"
              :disabled="dossier.blocked.value"
              aria-label="Enregistrer les modifications"
              icon="i-lucide-check"
              :ui="{ label: 'hidden sm:inline' }"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <PosDossierBanner :state="dossier.current.value" :refresh="refreshTicket" />
      <div class="mx-auto flex w-full max-w-[108rem] flex-col gap-3">
        <PosTicketForm
          v-if="ticket && customers?.items"
          :key="dossier.current.value?.epoch"
          v-model:dirty="dirty"
          :disabled="dossier.blocked.value"
          :form-id="formId"
          unsaved-target="#ticket-unsaved-status"
          :saving="isSaving"
          :save-error="saveError"
          layout="intake"
          :show-submit="false"
          :customers="customers.items"
          :initial-value="ticket"
          @save="saveTicket"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
