<script setup lang="ts">
import type { CustomerFormValue } from '~~/shared/types/pos'

defineProps<{
  title: string
  description: string
  submitLabel: string
  initialValue?: Partial<CustomerFormValue>
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  save: [payload: CustomerFormValue]
}>()
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="title"
    :description="description"
    side="right"
    :ui="{ content: 'max-w-2xl' }"
  >
    <template #body>
      <PosCustomerForm
        :initial-value="initialValue"
        mode="full"
        :submit-label="submitLabel"
        @save="emit('save', $event)"
      />
    </template>
  </USlideover>
</template>
