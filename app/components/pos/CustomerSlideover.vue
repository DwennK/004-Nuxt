<script setup lang="ts">
type CustomerPayload = {
  firstName: string
  lastName: string
  companyName: string
  phone: string
  email: string
  addressLine1: string
  addressLine2: string
  postalCode: string
  city: string
  notes: string
}

defineProps<{
  title: string
  description: string
  submitLabel: string
  initialValue?: Partial<CustomerPayload>
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  save: [payload: CustomerPayload]
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
        :submit-label="submitLabel"
        @save="emit('save', $event)"
      />
    </template>
  </USlideover>
</template>
