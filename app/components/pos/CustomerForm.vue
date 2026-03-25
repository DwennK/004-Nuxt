<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const props = withDefaults(defineProps<{
  initialValue?: Partial<{
    firstName: string | null
    lastName: string | null
    companyName: string | null
    phone: string | null
    email: string | null
    addressLine1: string | null
    addressLine2: string | null
    postalCode: string | null
    city: string | null
    notes: string | null
  }>
  submitLabel?: string
}>(), {
  initialValue: () => ({}),
  submitLabel: 'Save customer'
})

const emit = defineEmits<{
  save: [payload: {
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
  }]
}>()

const schema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  companyName: z.string().optional().default(''),
  phone: z.string().trim().min(3, 'Phone is required'),
  email: z.string().trim().email('Valid email is required'),
  addressLine1: z.string().optional().default(''),
  addressLine2: z.string().optional().default(''),
  postalCode: z.string().optional().default(''),
  city: z.string().optional().default(''),
  notes: z.string().optional().default('')
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  firstName: '',
  lastName: '',
  companyName: '',
  phone: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  postalCode: '',
  city: '',
  notes: ''
})

watchEffect(() => {
  state.firstName = props.initialValue.firstName || ''
  state.lastName = props.initialValue.lastName || ''
  state.companyName = props.initialValue.companyName || ''
  state.phone = props.initialValue.phone || ''
  state.email = props.initialValue.email || ''
  state.addressLine1 = props.initialValue.addressLine1 || ''
  state.addressLine2 = props.initialValue.addressLine2 || ''
  state.postalCode = props.initialValue.postalCode || ''
  state.city = props.initialValue.city || ''
  state.notes = props.initialValue.notes || ''
})

function onSubmit(event: FormSubmitEvent<Schema>) {
  emit('save', event.data)
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    class="space-y-5"
    @submit="onSubmit"
  >
    <div class="grid gap-4 md:grid-cols-2">
      <UFormField label="First name" name="firstName">
        <UInput v-model="state.firstName" class="w-full" />
      </UFormField>

      <UFormField label="Last name" name="lastName">
        <UInput v-model="state.lastName" class="w-full" />
      </UFormField>
    </div>

    <UFormField label="Company name" name="companyName">
      <UInput v-model="state.companyName" class="w-full" />
    </UFormField>

    <div class="grid gap-4 md:grid-cols-2">
      <UFormField label="Phone" name="phone">
        <UInput v-model="state.phone" class="w-full" />
      </UFormField>

      <UFormField label="Email" name="email">
        <UInput v-model="state.email" type="email" class="w-full" />
      </UFormField>
    </div>

    <UFormField label="Address line 1" name="addressLine1">
      <UInput v-model="state.addressLine1" class="w-full" />
    </UFormField>

    <UFormField label="Address line 2" name="addressLine2">
      <UInput v-model="state.addressLine2" class="w-full" />
    </UFormField>

    <div class="grid gap-4 md:grid-cols-2">
      <UFormField label="Postal code" name="postalCode">
        <UInput v-model="state.postalCode" class="w-full" />
      </UFormField>

      <UFormField label="City" name="city">
        <UInput v-model="state.city" class="w-full" />
      </UFormField>
    </div>

    <UFormField label="Notes" name="notes">
      <UTextarea v-model="state.notes" class="w-full" :rows="5" />
    </UFormField>

    <div class="flex justify-end">
      <UButton type="submit" :label="submitLabel" icon="i-lucide-save" />
    </div>
  </UForm>
</template>
