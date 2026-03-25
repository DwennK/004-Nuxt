<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { ticketStatusLabels, ticketStatuses } from '~~/shared/constants/pos'
import type { TicketStatus } from '~~/shared/types/pos'

const props = defineProps<{
  initialStatus: TicketStatus
  initialNotes?: string | null
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  updateStatus: [payload: { status: TicketStatus, internalNotes: string }]
  closeTicket: [payload: { internalNotes: string }]
}>()

const schema = z.object({
  status: z.enum(ticketStatuses),
  internalNotes: z.string().optional().default('')
})

type Schema = z.output<typeof schema>

const statusItems = ticketStatuses.map(status => ({
  label: ticketStatusLabels[status],
  value: status
}))

const state = reactive<Schema>({
  status: props.initialStatus,
  internalNotes: props.initialNotes || ''
})

watchEffect(() => {
  state.status = props.initialStatus
  state.internalNotes = props.initialNotes || ''
})

function submitStatus(event: FormSubmitEvent<Schema>) {
  emit('updateStatus', event.data)
}
</script>

<template>
  <USlideover
    v-model:open="open"
    title="Workflow actions"
    description="Update the ticket workflow separately from quotes, invoices, and payments."
    side="right"
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="submitStatus"
      >
        <UFormField label="Status" name="status">
          <USelectMenu
            v-model="state.status"
            :items="statusItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Internal notes" name="internalNotes">
          <UTextarea
            v-model="state.internalNotes"
            class="w-full"
            :rows="6"
            placeholder="Diagnosis, approval notes, parts status, pickup details"
          />
        </UFormField>

        <div class="flex flex-wrap justify-end gap-2">
          <UButton label="Apply status" type="submit" variant="subtle" />
          <UButton
            label="Close ticket"
            color="warning"
            @click="emit('closeTicket', { internalNotes: state.internalNotes })"
          />
        </div>
      </UForm>
    </template>
  </USlideover>
</template>
