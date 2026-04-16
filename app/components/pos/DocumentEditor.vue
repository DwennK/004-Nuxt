<script setup lang="ts">
import type { CatalogItemRecord, CustomerRecord, DocumentType } from '~~/shared/types/pos'
import type { DocumentInitialValue, DocumentSavePayload } from '~~/app/composables/useDocumentDraft'

const props = withDefaults(defineProps<{
  customers: CustomerRecord[]
  catalogItems: CatalogItemRecord[]
  initialValue?: DocumentInitialValue
  submitLabel?: string
  allowedTypes?: DocumentType[]
  fixedCustomerId?: number | null
  fixedTicketId?: number | null
}>(), {
  initialValue: () => ({}),
  submitLabel: 'Enregistrer le document',
  allowedTypes: () => ['quote', 'customer_order', 'invoice'],
  fixedCustomerId: null,
  fixedTicketId: null
})

const emit = defineEmits<{
  save: [payload: DocumentSavePayload]
}>()

const editor = useDocumentDraft({
  initialValue: toRef(props, 'initialValue'),
  allowedTypes: toRef(props, 'allowedTypes'),
  fixedCustomerId: toRef(props, 'fixedCustomerId'),
  fixedTicketId: toRef(props, 'fixedTicketId'),
  catalogItems: toRef(props, 'catalogItems')
})
const schema = editor.schema
const state = editor.state
const contextOpen = defineModel<boolean>('contextOpen', { default: false })
const formId = useId()

function onSubmit() {
  emit('save', editor.serialize())
}
</script>

<template>
  <UForm
    :id="formId"
    :schema="schema"
    :state="state"
    class="space-y-4"
    @submit="onSubmit"
  >
    <PosDocumentLinesEditor
      :editor="editor"
      :catalog-items="catalogItems"
    >
      <template #header-actions>
        <UButton
          type="submit"
          icon="i-lucide-save"
          :label="submitLabel"
          size="lg"
        />
      </template>
    </PosDocumentLinesEditor>

    <PosDocumentContextFields
      v-model:open="contextOpen"
      :editor="editor"
      :customers="customers"
      :fixed-customer-id="fixedCustomerId"
      :form-id="formId"
      :submit-label="submitLabel"
    />
  </UForm>
</template>
