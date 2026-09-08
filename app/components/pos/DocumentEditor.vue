<script setup lang="ts">
import type { CatalogItemRecord, CustomerRecord, DocumentType } from '~~/shared/types/pos'
import type { DocumentInitialValue, DocumentSavePayload } from '~~/app/composables/useDocumentDraft'

const props = withDefaults(defineProps<{
  customers: CustomerRecord[]
  catalogItems?: CatalogItemRecord[]
  initialValue?: DocumentInitialValue
  disabled?: boolean
  saving?: boolean
  saveError?: string | null
  submitLabel?: string
  formId?: string
  showSubmitButton?: boolean
  allowedTypes?: DocumentType[]
  fixedCustomerId?: number | null
  fixedTicketId?: number | null
}>(), {
  catalogItems: () => [],
  initialValue: () => ({}),
  submitLabel: 'Enregistrer le document',
  formId: undefined,
  showSubmitButton: true,
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
const documentTypeItems = editor.documentTypeItems
const documentStatusItems = editor.documentStatusItems
const contextOpen = defineModel<boolean>('contextOpen', { default: false })
watch(() => props.disabled, (disabled) => {
  if (disabled) contextOpen.value = false
})
const dirty = defineModel<boolean>('dirty', { default: false })
const internalFormId = useId()
const resolvedFormId = computed(() => props.formId || internalFormId)
const toast = useToast()

const documentTypeActionLabels: Record<DocumentType, string> = {
  quote: 'le devis',
  customer_order: 'la commande',
  invoice: 'la facture'
}

const resolvedSubmitLabel = computed(() => {
  return props.submitLabel.replace('le document', documentTypeActionLabels[state.type])
})

const hasFixedCustomer = computed(() => props.fixedCustomerId !== null)
const isExistingDocument = computed(() => props.initialValue.id != null)

watch(editor.isDirty, (value) => {
  dirty.value = value
}, { immediate: true, flush: 'sync' })
defineExpose({ acceptSaved: editor.acceptSaved })

function onSubmit() {
  if (props.saving || props.disabled) return
  emit('save', editor.serialize())
}

function onSubmitError(event: { errors?: Array<{ name?: string, message?: string }> }) {
  const errors = event.errors || []
  const firstError = errors[0]
  const hasContextError = errors.some(error => ['type', 'status', 'customerId', 'ticketId', 'issuedAt', 'notes'].includes(String(error.name)))

  if (hasContextError) {
    contextOpen.value = true
  }

  toast.add({
    title: 'Document incomplet',
    description: firstError?.message || 'Vérifiez le type, le client et les lignes avant de créer le document.',
    color: 'error',
    icon: 'i-lucide-triangle-alert'
  })
}
</script>

<template>
  <div class="min-w-0 flex flex-col gap-3">
    <PosUnsavedChanges :dirty="dirty" :snapshot="JSON.stringify(editor.serialize(), null, 2)" :saving="props.saving" />
    <UForm
      :id="resolvedFormId"
      :schema="schema"
      :disabled="props.saving || props.disabled"
      :aria-busy="props.saving"
      :state="state"
      class="min-w-0 space-y-4"
      @submit="onSubmit"
      @error="onSubmitError"
    >
      <fieldset :disabled="props.saving || props.disabled" class="min-w-0 space-y-4">
        <div
          class="grid gap-3 rounded-2xl border border-default bg-muted/30 p-3 lg:items-end"
          :class="isExistingDocument
            ? 'lg:grid-cols-[minmax(16rem,1fr)_12rem_10rem_auto]'
            : 'lg:grid-cols-[11rem_minmax(16rem,1fr)_12rem_10rem_auto]'"
        >
          <UFormField v-if="!isExistingDocument" label="Type" name="type">
            <USelectMenu
              v-model="state.type"
              :items="documentTypeItems"
              value-key="value"
              :search-input="false"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Client" name="customerId">
            <PosCustomerSelectField
              :model-value="state.customerId || null"
              :customers="customers"
              placeholder="Rechercher ou créer un client"
              :disabled="hasFixedCustomer"
              @update:model-value="state.customerId = $event || 0"
            />
          </UFormField>

          <UFormField label="Émis le" name="issuedAt">
            <ClientOnly>
              <UInput
                v-model="state.issuedAt"
                type="datetime-local"
                class="w-full"
              />
              <template #fallback>
                <UInput
                  type="datetime-local"
                  disabled
                  class="w-full"
                />
              </template>
            </ClientOnly>
          </UFormField>

          <UFormField label="Statut" name="status">
            <USelectMenu
              v-model="state.status"
              :items="documentStatusItems"
              value-key="value"
              :search-input="false"
              class="w-full"
            />
          </UFormField>

          <div class="flex flex-wrap items-center justify-end gap-2">
            <UButton
              type="button"
              color="neutral"
              variant="soft"
              icon="i-lucide-panel-right-open"
              label="Contexte"
              @click="contextOpen = true"
            />
            <UButton
              v-if="showSubmitButton"
              type="submit"
              icon="i-lucide-save"
              :label="props.saving ? 'Enregistrement…' : resolvedSubmitLabel"
              :loading="props.saving"
              class="shrink-0"
            />
          </div>
        </div>

        <PosFormFeedback :saving="props.saving" :error="props.saveError" />

        <PosDocumentLinesEditor
          :editor="editor"
          :catalog-items="catalogItems"
        />

        <PosDocumentContextFields
          v-model:open="contextOpen"
          :editor="editor"
          :customers="customers"
          :fixed-customer-id="fixedCustomerId"
          :form-id="resolvedFormId"
          :saving="props.saving"
          :save-error="props.saveError"
          :submit-label="resolvedSubmitLabel"
        />
      </fieldset>
    </UForm>
  </div>
</template>
