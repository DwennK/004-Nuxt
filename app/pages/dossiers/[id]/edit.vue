<script setup lang="ts">
import type { LineCategoryHint, TicketDetail } from '~~/shared/types/pos'

const $fetch = useDossierFetch()

const route = useRoute()
const { isSaving, saveError, save } = useFormAction()
const id = computed(() => Number(route.params.id))
const formId = 'ticket-editor-form'
const dirty = ref(false)

const { data: ticket, refresh: refreshTicket } = await useFetch<TicketDetail>(() => `/api/tickets/${id.value}`)

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
    categoryHint: LineCategoryHint | null
  }>
}) {
  const result = await save(() => $fetch(`/api/tickets/${id.value}`, {
    method: 'PATCH',
    body: payload
  }), { success: 'Dossier enregistré' })
  if (!result?.ok) return
  dirty.value = false
  await navigateTo(`/dossiers/${id.value}`)
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
            <PosPrintButton
              v-if="ticket"
              :preview-url="`/dossiers/${id}/print`"
              compact
              :disabled="dirty || isSaving"
              label="Imprimer"
              aria-label="Imprimer"
              icon="i-lucide-printer"
              color="neutral"
              variant="subtle"
            />
            <UButton
              :to="`/dossiers/${id}`"
              label="Annuler"
              aria-label="Annuler"
              class="pos-cancel-button"
              icon="i-lucide-x"
              color="error"
              variant="soft"
              :disabled="isSaving"
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
          v-if="ticket"
          :key="dossier.current.value?.epoch"
          v-model:dirty="dirty"
          :disabled="dossier.blocked.value"
          :form-id="formId"
          unsaved-target="#ticket-unsaved-status"
          :saving="isSaving"
          :save-error="saveError"
          layout="intake"
          :show-submit="false"
          :customers="[ticket.customer]"
          :initial-value="ticket"
          @save="saveTicket"
        />
      </div>
    </template>
  </UDashboardPanel>
</template>
