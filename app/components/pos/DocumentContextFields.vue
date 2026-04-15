<script setup lang="ts">
import type { CustomerRecord } from '~~/shared/types/pos'
import type { DocumentDraftController } from '~~/app/composables/useDocumentDraft'

const props = withDefaults(defineProps<{
  editor: DocumentDraftController
  customers: CustomerRecord[]
  fixedCustomerId?: number | null
}>(), {
  fixedCustomerId: null
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
          description="Les modifications du contexte seront prises en compte quand vous cliquerez sur Enregistrer."
        />
      </div>
    </template>
  </USlideover>
</template>
