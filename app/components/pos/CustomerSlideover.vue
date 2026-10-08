<script setup lang="ts">
import type { CustomerFormValue, CustomerUpsertInput } from '~~/shared/types/pos'

const props = withDefaults(defineProps<{
  title: string
  description?: string
  saving?: boolean
  saveError?: string | null
  submitLabel: string
  initialValue?: Partial<CustomerUpsertInput>
  submitIcon?: string
  returnFocus?: () => HTMLElement | null | undefined
}>(), {
  submitIcon: 'i-lucide-save'
})

const open = defineModel<boolean>('open', { default: false })
const focusReturn = usePosFocusReturn(open, () => props.returnFocus?.())
const formId = `customer-form-${useId()}`

const emit = defineEmits<{
  save: [payload: CustomerFormValue]
}>()
</script>

<template>
  <USlideover
    v-model:open="open"
    :content="focusReturn"
    :title="title"
    :dismissible="!saving"
    :close="!saving"
    :description="description"
    side="right"
    :ui="{
      content: 'max-w-lg',
      description: 'sr-only',
      body: 'space-y-5 overflow-y-auto',
      footer: 'border-t border-default bg-default/95 backdrop-blur supports-[backdrop-filter]:bg-default/80'
    }"
  >
    <template #body>
      <PosCustomerForm
        :form-id="formId"
        :initial-value="initialValue"
        :saving="saving"
        :save-error="saveError"
        :show-submit="false"
        :submit-label="submitLabel"
        @save="emit('save', $event)"
      />
    </template>
    <template #footer>
      <div class="flex items-center justify-end gap-3">
        <UButton
          label="Annuler"
          color="neutral"
          variant="ghost"
          :disabled="saving"
          @click="open = false"
        />
        <UButton
          :form="formId"
          type="submit"
          :label="saving ? 'Enregistrement…' : submitLabel"
          :icon="submitIcon"
          :loading="saving"
        />
      </div>
    </template>
  </USlideover>
</template>
