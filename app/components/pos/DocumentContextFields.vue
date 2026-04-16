<script setup lang="ts">
import type { CustomerRecord } from '~~/shared/types/pos'
import type { DocumentDraftController } from '~~/app/composables/useDocumentDraft'

const props = withDefaults(defineProps<{
  editor: DocumentDraftController
  customers: CustomerRecord[]
  fixedCustomerId?: number | null
  formId: string
  submitLabel?: string
}>(), {
  fixedCustomerId: null,
  submitLabel: 'Enregistrer le document'
})

const open = defineModel<boolean>('open', { default: false })

const state = props.editor.state
const documentTypeItems = props.editor.documentTypeItems
const documentStatusItems = props.editor.documentStatusItems
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Modifier le contexte"
    description="Type, statut, client, date et notes restent modifiables sans encombrer l’écran principal."
    side="right"
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <div class="grid gap-2 sm:grid-cols-2">
          <UFormField label="Type de document" name="type">
            <USelectMenu
              v-model="state.type"
              :items="documentTypeItems"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Statut" name="status">
            <USelectMenu
              v-model="state.status"
              :items="documentStatusItems"
              value-key="value"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField label="Client" name="customerId">
          <PosCustomerSelectField
            :model-value="state.customerId || null"
            :customers="props.customers"
            placeholder="Rechercher ou créer un client"
            :disabled="fixedCustomerId !== null"
            @update:model-value="state.customerId = $event || 0"
          />
        </UFormField>

        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="Émis le" name="issuedAt">
            <UInput
              v-model="state.issuedAt"
              type="datetime-local"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Ticket lié" name="ticketId">
            <UInput
              :model-value="state.ticketId ? String(state.ticketId) : 'Vente directe / document autonome'"
              :disabled="true"
              class="w-full"
            />
          </UFormField>
        </div>

        <UFormField label="Notes" name="notes">
          <UTextarea
            v-model="state.notes"
            :rows="4"
            placeholder="Notes internes ou imprimables"
            class="w-full"
          />
        </UFormField>

        <UAlert
          icon="i-lucide-info"
          color="neutral"
          variant="subtle"
          title="Enregistrement"
          description="Vous pouvez enregistrer directement depuis ce panneau."
        />
      </div>
    </template>

    <template #footer>
      <div class="flex items-center justify-end gap-2">
        <UButton
          type="button"
          color="neutral"
          variant="soft"
          label="Fermer"
          @click="open = false"
        />
        <UButton
          :form="props.formId"
          type="submit"
          icon="i-lucide-save"
          :label="props.submitLabel"
        />
      </div>
    </template>
  </USlideover>
</template>
