<script setup lang="ts">
import type { EmployeeRecord } from '~~/shared/types/pos'

type EmployeeFormValue = Partial<Pick<EmployeeRecord, 'firstName' | 'lastName' | 'email' | 'color' | 'vacationDaysPerYear' | 'isActive'>>
type EmployeeFormPayload = Pick<EmployeeRecord, 'firstName' | 'lastName' | 'color' | 'vacationDaysPerYear' | 'isActive'> & {
  email: string
}

defineProps<{
  title: string
  description: string
  submitLabel: string
  initialValue?: EmployeeFormValue
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  save: [payload: EmployeeFormPayload]
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
      <PosEmployeeForm
        :initial-value="initialValue"
        :submit-label="submitLabel"
        @save="emit('save', $event)"
      />
    </template>
  </USlideover>
</template>
