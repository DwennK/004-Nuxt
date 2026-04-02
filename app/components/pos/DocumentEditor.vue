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
  allowedTypes: () => ['quote', 'customer_order', 'invoice', 'receipt'],
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

function onSubmit() {
  emit('save', editor.serialize())
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    class="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]"
    @submit="onSubmit"
  >
    <PosDocumentLinesEditor
      :editor="editor"
      :catalog-items="catalogItems"
    />

    <PosDocumentContextFields
      :editor="editor"
      :customers="customers"
      :submit-label="submitLabel"
      :fixed-customer-id="fixedCustomerId"
    />
  </UForm>
</template>
