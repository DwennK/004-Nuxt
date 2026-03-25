<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { ticketStatusLabels, ticketStatuses, ticketTypeLabels, ticketTypes } from '~~/shared/constants/pos'
import type { CustomerRecord } from '~~/shared/types/pos'

const props = withDefaults(defineProps<{
  customers: CustomerRecord[]
  initialValue?: Partial<{
    customerId: number | null
    type: (typeof ticketTypes)[number]
    status: (typeof ticketStatuses)[number]
    brand: string | null
    model: string | null
    serialNumber: string | null
    imei: string | null
    issueDescription: string | null
    internalNotes: string | null
    openedAt: string | null
    closedAt: string | null
  }>
  submitLabel?: string
}>(), {
  initialValue: () => ({}),
  submitLabel: 'Save ticket'
})

const emit = defineEmits<{
  save: [payload: {
    customerId: number
    type: (typeof ticketTypes)[number]
    status: (typeof ticketStatuses)[number]
    brand: string
    model: string
    serialNumber: string
    imei: string
    issueDescription: string
    internalNotes: string
    openedAt: string
    closedAt: string
  }]
}>()

const schema = z.object({
  customerId: z.coerce.number().int().positive(),
  type: z.enum(ticketTypes),
  status: z.enum(ticketStatuses),
  brand: z.string().optional().default(''),
  model: z.string().optional().default(''),
  serialNumber: z.string().optional().default(''),
  imei: z.string().optional().default(''),
  issueDescription: z.string().trim().min(3, 'Issue description is required'),
  internalNotes: z.string().optional().default(''),
  openedAt: z.string().min(1),
  closedAt: z.string().optional().default('')
})

type Schema = z.output<typeof schema>

function toDateTimeLocal(value?: string | null) {
  if (!value) {
    return new Date().toISOString().slice(0, 16)
  }

  return new Date(value).toISOString().slice(0, 16)
}

const customerItems = computed(() => props.customers.map(customer => ({
  label: customer.displayName,
  value: customer.id
})))

const ticketTypeItems = ticketTypes.map(type => ({
  label: ticketTypeLabels[type],
  value: type
}))

const statusItems = ticketStatuses.map(status => ({
  label: ticketStatusLabels[status],
  value: status
}))

const state = reactive<Schema>({
  customerId: 0,
  type: 'repair',
  status: 'new',
  brand: '',
  model: '',
  serialNumber: '',
  imei: '',
  issueDescription: '',
  internalNotes: '',
  openedAt: toDateTimeLocal(),
  closedAt: ''
})

watchEffect(() => {
  state.customerId = props.initialValue.customerId ?? props.customers[0]?.id ?? 0
  state.type = props.initialValue.type || 'repair'
  state.status = props.initialValue.status || 'new'
  state.brand = props.initialValue.brand || ''
  state.model = props.initialValue.model || ''
  state.serialNumber = props.initialValue.serialNumber || ''
  state.imei = props.initialValue.imei || ''
  state.issueDescription = props.initialValue.issueDescription || ''
  state.internalNotes = props.initialValue.internalNotes || ''
  state.openedAt = toDateTimeLocal(props.initialValue.openedAt)
  state.closedAt = props.initialValue.closedAt ? toDateTimeLocal(props.initialValue.closedAt) : ''
})

function onSubmit(event: FormSubmitEvent<Schema>) {
  emit('save', {
    ...event.data,
    openedAt: new Date(event.data.openedAt).toISOString(),
    closedAt: event.data.closedAt ? new Date(event.data.closedAt).toISOString() : ''
  })
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    class="space-y-5"
    @submit="onSubmit"
  >
    <div class="grid gap-4 lg:grid-cols-3">
      <UFormField label="Customer" name="customerId" class="lg:col-span-2">
        <USelectMenu
          v-model="state.customerId"
          :items="customerItems"
          value-key="value"
          placeholder="Select customer"
          :search-input="{ placeholder: 'Search customers' }"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Ticket type" name="type">
        <USelectMenu
          v-model="state.type"
          :items="ticketTypeItems"
          value-key="value"
          class="w-full"
        />
      </UFormField>
    </div>

    <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <UFormField label="Status" name="status">
        <USelectMenu
          v-model="state.status"
          :items="statusItems"
          value-key="value"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Brand" name="brand">
        <UInput v-model="state.brand" class="w-full" />
      </UFormField>

      <UFormField label="Model" name="model">
        <UInput v-model="state.model" class="w-full" />
      </UFormField>

      <UFormField label="IMEI" name="imei">
        <UInput v-model="state.imei" class="w-full" />
      </UFormField>
    </div>

    <div class="grid gap-4 md:grid-cols-2">
      <UFormField label="Serial number" name="serialNumber">
        <UInput v-model="state.serialNumber" class="w-full" />
      </UFormField>

      <UFormField label="Opened at" name="openedAt">
        <UInput v-model="state.openedAt" type="datetime-local" class="w-full" />
      </UFormField>
    </div>

    <UFormField label="Issue description" name="issueDescription">
      <UTextarea v-model="state.issueDescription" class="w-full" :rows="4" />
    </UFormField>

    <UFormField label="Internal notes" name="internalNotes">
      <UTextarea v-model="state.internalNotes" class="w-full" :rows="5" />
    </UFormField>

    <div class="flex justify-end">
      <UButton type="submit" :label="submitLabel" icon="i-lucide-save" />
    </div>
  </UForm>
</template>
