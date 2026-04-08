<script setup lang="ts">
defineProps<{
  title: string
  description: string
  submitLabel: string
  initialValue?: {
    firstName?: string
    lastName?: string
    email?: string | null
    color?: string
    vacationDaysPerYear?: number
    isActive?: boolean
  }
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  save: [payload: any]
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
