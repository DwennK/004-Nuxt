<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { TicketWorkflowAction } from '~~/shared/types/pos'

const props = defineProps<{
  action: TicketWorkflowAction | null
  initialNotes?: string | null
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  submit: [payload: { action: TicketWorkflowAction, internalNotes: string }]
}>()

const schema = z.object({
  internalNotes: z.string().optional().default('')
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  internalNotes: props.initialNotes || ''
})

watchEffect(() => {
  state.internalNotes = props.initialNotes || ''
})

function onSubmit(event: FormSubmitEvent<Schema>) {
  if (!props.action) {
    return
  }

  emit('submit', {
    action: props.action,
    internalNotes: event.data.internalNotes
  })
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="action?.label || 'Action de suivi'"
    :description="action?.description || 'Confirmez l’action de suivi et ajoutez une note si besoin.'"
    side="right"
    :ui="{ content: 'max-w-xl' }"
  >
    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-5"
        @submit="onSubmit"
      >
        <div v-if="action" class="rounded-2xl border border-default bg-muted/20 p-4">
          <div class="flex items-start gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <UIcon :name="action.icon" class="size-5" />
            </div>
            <div class="space-y-1">
              <p class="font-medium text-highlighted">
                {{ action.label }}
              </p>
              <p class="text-sm text-toned">
                {{ action.description }}
              </p>
            </div>
          </div>
        </div>

        <UFormField
          label="Note de suivi"
          name="internalNotes"
          hint="Optionnel"
        >
          <UTextarea
            v-model="state.internalNotes"
            class="w-full"
            :rows="6"
            placeholder="Diagnostic, accord client, blocage, détail de remise ou commentaire atelier..."
          />
        </UFormField>

        <div class="flex justify-end">
          <UButton
            type="submit"
            :label="action ? `Confirmer · ${action.label}` : 'Confirmer l’action'"
            :icon="action?.icon || 'i-lucide-check'"
            :color="action?.color || 'primary'"
            :disabled="!action"
          />
        </div>
      </UForm>
    </template>
  </USlideover>
</template>
