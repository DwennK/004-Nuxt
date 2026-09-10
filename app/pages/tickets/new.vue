<script setup lang="ts">
import type { CustomerListResponse, TicketRecord } from '~~/shared/types/pos'

const $fetch = useDossierFetch()

const route = useRoute()
const { isSaving, saveError, save } = useFormAction()
const customerId = computed(() => Number(route.query.customerId || 0))
const formId = 'ticket-editor-form'
const dirty = ref(false)
const formVersion = ref(0)
const createdTicket = ref<TicketRecord | null>(null)
const completionOpen = ref(false)
const completionHandled = ref(false)

async function openCreatedTicket(print = false) {
  if (!createdTicket.value) return
  completionHandled.value = true
  await navigateTo(`/tickets/${createdTicket.value.id}${print ? '/print?profile=thermal' : ''}`)
}

function startNewTicket() {
  completionHandled.value = true
  createdTicket.value = null
  completionOpen.value = false
  dirty.value = false
  formVersion.value++
}

function onCompletionClosed() {
  if (createdTicket.value && !completionHandled.value) void openCreatedTicket()
}

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
  if (createdTicket.value) return
  const result = await save(() => $fetch<TicketRecord>(`/api/tickets`, {
    method: 'POST',
    body: { ...payload, customerId: payload.customerId || customerId.value }
  }), { success: 'Dossier créé' })
  if (!result?.ok) return
  dirty.value = false
  createdTicket.value = result.data
  completionHandled.value = false
  completionOpen.value = true
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
            <span id="ticket-unsaved-status" class="inline-flex h-8 w-8 shrink-0 sm:w-36" />
            <UButton
              to="/tickets"
              label="Annuler"
              aria-label="Annuler"
              icon="i-lucide-x"
              :ui="{ label: 'hidden sm:inline' }"
              color="neutral"
              variant="ghost"
            />
            <UButton
              :form="formId"
              type="submit"
              :label="isSaving ? 'Enregistrement…' : 'Créer le dossier'"
              :loading="isSaving"
              :disabled="!!createdTicket"
              icon="i-lucide-check"
              aria-label="Créer le dossier"
              :ui="{ label: 'hidden sm:inline' }"
            />
          </div>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto flex w-full max-w-[108rem] flex-col gap-3">
        <PosTicketForm
          v-if="customers?.items"
          :key="formVersion"
          v-model:dirty="dirty"
          :form-id="formId"
          unsaved-target="#ticket-unsaved-status"
          :saving="isSaving"
          :disabled="!!createdTicket"
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

  <UModal
    v-model:open="completionOpen"
    title="Dossier créé"
    :description="createdTicket ? `${createdTicket.ticketNumber} enregistré` : undefined"
    :ui="{ content: 'max-w-md', footer: 'flex flex-wrap justify-end gap-2' }"
    @after:leave="onCompletionClosed"
  >
    <template #body>
      <div class="space-y-5">
        <div class="flex items-center gap-3">
          <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-success text-inverted">
            <UIcon name="i-lucide-check" class="size-5" />
          </span>
          <p class="text-lg font-semibold text-highlighted">
            {{ createdTicket?.ticketNumber }}
          </p>
        </div>
        <UButton
          label="Imprimer thermique"
          icon="i-lucide-printer"
          color="neutral"
          variant="outline"
          size="lg"
          block
          @click="openCreatedTicket(true)"
        />
      </div>
    </template>
    <template #footer>
      <UButton
        label="Voir le dossier"
        color="neutral"
        variant="ghost"
        @click="openCreatedTicket()"
      />
      <UButton
        label="Nouveau dossier"
        trailing-icon="i-lucide-arrow-right"
        @click="startNewTicket"
      />
    </template>
  </UModal>
</template>
