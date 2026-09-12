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
  unsavedTarget?: string
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
const showTypeSelector = computed(() => !isExistingDocument.value && props.allowedTypes.length > 1)

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
  contextOpen.value = ['notes', 'dueDate'].includes(firstError?.name || '')

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
    <PosUnsavedChanges
      v-if="props.unsavedTarget"
      :to="props.unsavedTarget"
      :dirty="dirty"
      :snapshot="JSON.stringify(editor.serialize(), null, 2)"
      :saving="props.saving"
    />
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
          class="grid gap-3 rounded-lg border border-default bg-muted/30 p-3 sm:grid-cols-2 lg:items-end"
          :class="showTypeSelector ? 'lg:grid-cols-[9rem_minmax(12rem,1fr)_12rem_9rem]' : 'lg:grid-cols-[minmax(12rem,1fr)_12rem_9rem]'"
        >
          <UFormField v-if="showTypeSelector" label="Type" name="type">
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

          <div v-if="!isExistingDocument || showSubmitButton" class="col-span-full flex flex-wrap items-center justify-end gap-2">
            <UButton
              v-if="!isExistingDocument"
              type="button"
              color="neutral"
              variant="soft"
              icon="i-lucide-panel-right-open"
              :label="state.type === 'customer_order' ? 'Message client' : 'Dates et message client'"
              @click="contextOpen = true"
            />
            <div class="flex items-center gap-2">
              <PosUnsavedChanges
                v-if="!props.unsavedTarget"
                :dirty="dirty"
                :snapshot="JSON.stringify(editor.serialize(), null, 2)"
                :saving="props.saving"
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
        </div>

        <PosFormFeedback :saving="props.saving" :error="props.saveError" />

        <PosDocumentLinesEditor
          :editor="editor"
          :catalog-items="catalogItems"
        />

        <PosDocumentContextFields
          v-model:open="contextOpen"
          :editor="editor"
          :form-id="resolvedFormId"
          :saving="props.saving"
          :save-error="props.saveError"
          :submit-label="resolvedSubmitLabel"
        />
      </fieldset>
    </UForm>
  </div>
</template>
