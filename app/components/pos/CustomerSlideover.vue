<script setup lang="ts">
import type { CustomerFormValue } from '~~/shared/types/pos'

defineProps<{
  title: string
  description: string
  saving?: boolean
  saveError?: string | null
  submitLabel: string
  initialValue?: Partial<CustomerFormValue>
}>()

const open = defineModel<boolean>('open', { default: false })
const focusReturn = usePosFocusReturn(open)

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
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <PosCustomerForm
        :initial-value="initialValue"
        :saving="saving"
        :save-error="saveError"
        mode="full"
        :submit-label="submitLabel"
        @save="emit('save', $event)"
      />
    </template>
  </USlideover>
</template>
