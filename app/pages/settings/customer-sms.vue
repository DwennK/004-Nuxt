<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { CustomerSmsSettingsRecord } from '~~/shared/types/settings'
import { smsTemplatePlaceholders } from '~~/shared/utils/customer-sms'

type FormState = CustomerSmsSettingsRecord

const toast = useToast()
const schema = z.object({
  templates: z.array(z.object({
    id: z.string().trim().min(1, 'ID requis'),
    label: z.string().trim().min(1, 'Libelle requis'),
    body: z.string().trim().min(1, 'Message requis')
  }))
})

const { data: settings, refresh } = await useFetch<CustomerSmsSettingsRecord>('/api/settings/customer-sms')

const state = reactive<FormState>({
  templates: []
})

watchEffect(() => {
  state.templates = (settings.value?.templates || []).map(template => ({ ...template }))
})

function createTemplateId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `sms-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function addTemplate() {
  state.templates.push({
    id: createTemplateId(),
    label: 'Nouveau message',
    body: 'Bonjour {{client_name}}, concernant votre ticket {{ticket_number}}.'
  })
}

function removeTemplate(index: number) {
  state.templates.splice(index, 1)
}

function moveTemplate(index: number, direction: -1 | 1) {
  const nextIndex = index + direction

  if (nextIndex < 0 || nextIndex >= state.templates.length) {
    return
  }

  const current = state.templates[index]
  state.templates[index] = state.templates[nextIndex]!
  state.templates[nextIndex] = current!
}

async function onSubmit(event: FormSubmitEvent<FormState>) {
  await $fetch('/api/settings/customer-sms', {
    method: 'PATCH',
    body: {
      templates: event.data.templates.map(template => ({
        id: template.id,
        label: template.label,
        body: template.body
      }))
    }
  })

  toast.add({
    title: 'Messages client mis à jour',
    description: 'La liste des messages SMS a été enregistrée.',
    color: 'success',
    icon: 'i-lucide-check'
  })

  await refresh()
}
</script>

<template>
  <UForm
    id="customer-sms-settings"
    :schema="schema"
    :state="state"
    @submit="onSubmit"
  >
    <UPageCard
      title="Messages client"
      description="Modèles SMS proposés depuis un ticket. Le message libre reste toujours disponible sur l’iPhone."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <div class="flex flex-wrap items-center gap-2 lg:ms-auto">
        <UButton
          label="Ajouter un message"
          icon="i-lucide-plus"
          color="neutral"
          variant="soft"
          @click="addTemplate"
        />
        <UButton
          form="customer-sms-settings"
          label="Enregistrer"
          color="neutral"
          type="submit"
        />
      </div>
    </UPageCard>

    <div class="space-y-4">
      <UPageCard variant="subtle">
        <div class="space-y-3">
          <p class="text-sm font-medium text-highlighted">
            Variables disponibles
          </p>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="placeholder in smsTemplatePlaceholders"
              :key="placeholder"
              color="neutral"
              variant="soft"
            >
              {{ placeholder }}
            </UBadge>
            <UBadge color="warning" variant="soft">
              Message libre intégré
            </UBadge>
          </div>
          <p class="text-sm text-toned">
            `Message libre` n’est pas configurable ici. Il ouvre simplement l’app SMS avec le numéro du client.
          </p>
        </div>
      </UPageCard>

      <UPageCard
        v-for="(template, index) in state.templates"
        :key="template.id"
        variant="subtle"
      >
        <div class="space-y-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-sm font-medium text-highlighted">
                Message {{ index + 1 }}
              </p>
              <p class="text-xs text-toned">
                ID interne: {{ template.id }}
              </p>
            </div>

            <div class="flex items-center gap-1">
              <UButton
                icon="i-lucide-arrow-up"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="index === 0"
                @click="moveTemplate(index, -1)"
              />
              <UButton
                icon="i-lucide-arrow-down"
                color="neutral"
                variant="ghost"
                size="xs"
                :disabled="index === state.templates.length - 1"
                @click="moveTemplate(index, 1)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="xs"
                @click="removeTemplate(index)"
              />
            </div>
          </div>

          <UFormField :name="`templates.${index}.label`" label="Libelle" required>
            <UInput
              v-model="template.label"
              class="w-full"
              autocomplete="off"
            />
          </UFormField>

          <UFormField :name="`templates.${index}.body`" label="Message" required>
            <UTextarea
              v-model="template.body"
              :rows="5"
              autoresize
              class="w-full"
            />
          </UFormField>
        </div>
      </UPageCard>

      <UEmpty
        v-if="state.templates.length === 0"
        icon="i-lucide-message-square-more"
        title="Aucun message prédéfini"
        description="Ajoutez des modèles SMS. Le mode Message libre restera tout de même disponible depuis le ticket."
      />
    </div>
  </UForm>
</template>
