<script setup lang="ts">
import type { DocumentDetail, TicketDetail } from '~~/shared/types/pos'
import type { SavDetails } from '~~/shared/types/sav'
import { savStatuses, savCoverages, savStatusLabels, savCoverageLabels } from '~~/shared/types/sav'
import { savDetailsSchema } from '~~/shared/validation/sav'

const props = defineProps<{
  ticket: TicketDetail | null
  document?: DocumentDetail
  disabled?: boolean
  saving?: boolean
  saveError?: string | null
}>()
const emit = defineEmits<{ save: [value: SavDetails] }>()
const dirty = defineModel<boolean>('dirty', { default: false })
const state = reactive<SavDetails>({
  sourceDocumentId: null, repair: '', reason: '', coverage: 'pending', status: 'received',
  diagnosis: '', work: '', receivedAt: new Date().toISOString(), deliveredAt: null
})
let baseline = ''
function reset() {
  if (props.document?.sav) Object.assign(state, props.document.sav)
  baseline = JSON.stringify(state)
  dirty.value = false
}
watch(() => props.document, reset, { immediate: true })
watch(state, () => {
  dirty.value = JSON.stringify(state) !== baseline
})
const sources = computed(() => [
  { label: 'Réparation du dossier', value: 0 },
  ...(props.ticket?.documents || []).filter(document => document.type !== 'sav').map(document => ({ label: document.documentNumber, value: document.id }))
])
const sourceId = computed({ get: () => state.sourceDocumentId || 0, set: (value) => {
  state.sourceDocumentId = value || null
} })
const statusItems = savStatuses.map(value => ({ label: savStatusLabels[value], value }))
const coverageItems = savCoverages.map(value => ({ label: savCoverageLabels[value], value }))
</script>

<template>
  <UForm
    :schema="savDetailsSchema"
    :state="state"
    class="space-y-3"
    @submit="emit('save', { ...state })"
  >
    <div v-if="ticket && !document" class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <NuxtLink :to="`/dossiers/${ticket.id}`" class="font-medium text-primary hover:underline">{{ ticket.ticketNumber }}</NuxtLink>
      <span>{{ ticket.customer.displayName }}</span>
    </div>
    <fieldset :disabled="disabled || saving" class="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <UCard :ui="{ body: 'space-y-3 p-4 sm:p-4' }">
        <div class="flex flex-wrap items-center gap-2 border-b border-default pb-3">
          <UIcon name="i-lucide-wrench" class="size-5 text-primary" />
          <span class="font-semibold">{{ [ticket?.brand, ticket?.model].filter(Boolean).join(' ') || 'Appareil du dossier' }}</span>
          <span class="text-xs text-muted">{{ ticket?.imei || ticket?.serialNumber }}</span>
        </div>
        <UFormField label="Réparation concernée" name="repair" required>
          <UInput v-model="state.repair" class="w-full" placeholder="Ex. Remplacement de l’écran" />
        </UFormField>
        <UFormField label="Motif du retour" name="reason" required>
          <UTextarea
            v-model="state.reason"
            :rows="3"
            class="w-full"
            placeholder="Problème signalé par le client"
          />
        </UFormField>
        <div v-if="document" class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Diagnostic" name="diagnosis">
            <UTextarea v-model="state.diagnosis" :rows="5" class="w-full" />
          </UFormField>
          <UFormField label="Travaux et pièces remplacées" name="work">
            <UTextarea v-model="state.work" :rows="5" class="w-full" />
          </UFormField>
        </div>
      </UCard>
      <UCard :ui="{ body: 'space-y-4 p-4 sm:p-4' }">
        <UFormField label="Document d’origine" name="sourceDocumentId">
          <USelect v-model="sourceId" :items="sources" class="w-full" />
        </UFormField>
        <UFormField label="Prise en charge" name="coverage">
          <USelect v-model="state.coverage" :items="coverageItems" class="w-full" />
        </UFormField>
        <UFormField v-if="document" label="Statut du SAV" name="status">
          <USelect v-model="state.status" :items="statusItems" class="w-full" />
        </UFormField>
        <PosFormFeedback :saving="saving" :error="saveError" />
        <div class="flex flex-wrap gap-2">
          <UButton
            type="submit"
            icon="i-lucide-save"
            :loading="saving"
            :disabled="disabled || (!dirty && !!document)"
            :label="document ? 'Enregistrer le SAV' : 'Créer le SAV'"
          />
          <UButton
            v-if="dirty && document"
            label="Annuler"
            color="neutral"
            variant="soft"
            @click="reset"
          />
        </div>
        <PosUnsavedChanges :dirty="dirty" :snapshot="JSON.stringify(state)" :saving="saving" />
      </UCard>
    </fieldset>
  </UForm>
</template>
