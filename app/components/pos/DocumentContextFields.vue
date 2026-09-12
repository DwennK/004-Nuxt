<script setup lang="ts">
import type { DocumentDraftController } from '~~/app/composables/useDocumentDraft'

const props = withDefaults(defineProps<{
  editor: DocumentDraftController
  formId: string
  saving?: boolean
  saveError?: string | null
  submitLabel?: string
}>(), {
  submitLabel: 'Enregistrer le document'
})

const open = defineModel<boolean>('open', { default: false })
const focusReturn = usePosFocusReturn(open)

const state = props.editor.state
</script>

<template>
  <USlideover
    v-model:open="open"
    :content="focusReturn"
    :dismissible="!saving"
    :close="!saving"
    :title="state.type === 'customer_order' ? 'Message client' : 'Dates et message client'"
    :description="state.type === 'customer_order' ? 'Ajoutez un message destiné au client.' : 'Précisez la date limite et le message destiné au client.'"
    side="right"
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <div class="space-y-4">
        <UFormField
          v-if="state.type !== 'customer_order'"
          :label="state.type === 'quote' ? 'Valable jusqu’au' : 'Date d’échéance'"
          name="dueDate"
          hint="Facultatif"
        >
          <UInput
            v-model="state.dueDate"
            type="date"
            class="w-full"
            :disabled="saving"
          />
        </UFormField>
        <UFormField
          label="Message visible sur le document"
          name="notes"
          hint="Facultatif"
          description="Ce message apparaît sur le PDF, l’impression A4 et le ticket thermique remis au client."
        >
          <UTextarea
            v-model="state.notes"
            :rows="4"
            placeholder="Ex. Merci de présenter ce document lors du retrait."
            class="w-full"
          />
        </UFormField>
      </div>
    </template>

    <template #footer>
      <div class="w-full space-y-3">
        <PosFormFeedback :saving="saving" :error="saveError" />
        <div class="flex items-center justify-end gap-2">
          <UButton
            type="button"
            color="neutral"
            variant="soft"
            label="Fermer"
            :disabled="saving"
            @click="open = false"
          />
          <UButton
            :form="props.formId"
            type="submit"
            icon="i-lucide-save"
            :label="saving ? 'Enregistrement…' : props.submitLabel"
            :loading="saving"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
