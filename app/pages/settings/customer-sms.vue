<script setup lang="ts">
import * as z from 'zod'
import type { FormErrorEvent, FormSubmitEvent } from '@nuxt/ui'
import type { CustomerSmsSettingsRecord } from '~~/shared/types/settings'
import { smsTemplatePlaceholders } from '~~/shared/utils/customer-sms'

type FormState = CustomerSmsSettingsRecord

const toast = useToast()
const selectedId = ref('')
const selectedIndex = computed(() => state.templates.findIndex(template => template.id === selectedId.value))
const selectedTemplate = computed(() => state.templates[selectedIndex.value])
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

watch(() => state.templates.map(template => template.id), (ids) => {
  if (!ids.includes(selectedId.value)) selectedId.value = ids[0] || ''
}, { immediate: true })

async function onError(event: FormErrorEvent) {
  const firstError = event.errors[0]
  const index = Number(firstError?.name?.split('.')[1])
  const template = state.templates[index]
  if (!template) return
  selectedId.value = template.id
  await nextTick()
  document.getElementById(firstError?.name?.endsWith('.label') ? 'sms-template-label' : 'sms-template-body')?.focus()
}

function createTemplateId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `sms-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function addTemplate() {
  const id = createTemplateId()
  state.templates.push({
    id,
    label: 'Nouveau message',
    body: 'Bonjour {{client_name}}, concernant votre dossier {{dossier_number}}.'
  })
  selectedId.value = id
}

function removeTemplate(index: number) {
  if (state.templates[index]?.id === selectedId.value) {
    selectedId.value = state.templates[index + 1]?.id || state.templates[index - 1]?.id || ''
  }
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
    class="space-y-4"
    @submit="onSubmit"
    @error="onError"
  >
    <div class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-default bg-default py-3">
      <div>
        <h2 class="text-lg font-semibold text-highlighted">
          Messages client
        </h2>
        <p class="text-sm text-muted">
          Modèles SMS proposés depuis un dossier.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <UButton
          label="Ajouter un message"
          icon="i-lucide-plus"
          color="neutral"
          variant="outline"
          type="button"
          @click="addTemplate"
        />
        <UButton
          form="customer-sms-settings"
          label="Enregistrer"
          icon="i-lucide-save"
          type="submit"
        />
      </div>
    </div>

    <div v-if="selectedTemplate" class="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <UCard :ui="{ body: 'p-2 sm:p-2', header: 'px-4 py-3' }">
        <template #header>
          <div class="flex items-center justify-between gap-2">
            <h3 class="font-semibold text-highlighted">
              Modèles
            </h3>
            <UBadge :label="String(state.templates.length)" color="neutral" variant="subtle" />
          </div>
        </template>
        <nav aria-label="Modèles de messages" class="max-h-56 space-y-1 overflow-y-auto lg:max-h-[calc(100dvh-19rem)]">
          <button
            v-for="(template, index) in state.templates"
            :key="template.id"
            type="button"
            :aria-current="selectedId === template.id ? 'true' : undefined"
            :class="selectedId === template.id ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-elevated'"
            class="block w-full min-w-0 rounded-md border px-3 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-primary"
            @click="selectedId = template.id"
          >
            <span class="block truncate text-sm font-medium text-highlighted">{{ index + 1 }}. {{ template.label || 'Sans libellé' }}</span>
            <span class="mt-1 block truncate text-xs text-muted">{{ template.body || 'Message vide' }}</span>
          </button>
        </nav>
      </UCard>

      <UCard :ui="{ body: 'space-y-4 sm:p-5', header: 'px-4 py-3 sm:px-5' }" class="min-w-0">
        <template #header>
          <div class="flex items-center justify-between gap-3">
            <h3 class="font-semibold text-highlighted">
              Modifier le message
            </h3>
            <div class="flex items-center gap-1">
              <UButton
                icon="i-lucide-arrow-up"
                aria-label="Monter le message"
                color="neutral"
                variant="ghost"
                type="button"
                :disabled="selectedIndex === 0"
                @click="moveTemplate(selectedIndex, -1)"
              />
              <UButton
                icon="i-lucide-arrow-down"
                aria-label="Descendre le message"
                color="neutral"
                variant="ghost"
                type="button"
                :disabled="selectedIndex === state.templates.length - 1"
                @click="moveTemplate(selectedIndex, 1)"
              />
              <UButton
                icon="i-lucide-trash-2"
                aria-label="Supprimer le message"
                color="error"
                variant="ghost"
                type="button"
                @click="removeTemplate(selectedIndex)"
              />
            </div>
          </div>
        </template>
        <UFormField
          :key="`${selectedTemplate.id}-label`"
          :name="`templates.${selectedIndex}.label`"
          label="Libellé"
          required
        >
          <UInput
            id="sms-template-label"
            v-bind="posInputAttrs"
            v-model="selectedTemplate.label"
            class="w-full"
          />
        </UFormField>
        <UFormField
          :key="`${selectedTemplate.id}-body`"
          :name="`templates.${selectedIndex}.body`"
          label="Message"
          required
        >
          <UTextarea
            id="sms-template-body"
            v-bind="posInputAttrs"
            v-model="selectedTemplate.body"
            :rows="10"
            autoresize
            class="w-full"
          />
        </UFormField>
        <div class="space-y-2">
          <p class="text-sm font-medium text-highlighted">
            Variables disponibles
          </p>
          <div class="flex flex-wrap gap-2">
            <UBadge
              v-for="placeholder in smsTemplatePlaceholders"
              :key="placeholder"
              color="neutral"
              variant="subtle"
            >
              {{ placeholder }}
            </UBadge>
          </div>
        </div>
        <p class="break-all text-xs text-muted">
          ID interne : {{ selectedTemplate.id }}
        </p>
      </UCard>
    </div>

    <UEmpty
      v-else
      icon="i-lucide-message-square-more"
      title="Aucun message prédéfini"
      description="Ajoutez un modèle pour préparer vos messages client."
      :actions="[{ label: 'Ajouter un message', icon: 'i-lucide-plus', onClick: addTemplate }]"
    />
    <p class="text-sm text-muted">
      Le message libre reste disponible depuis le dossier et ouvre l’app SMS avec le numéro du client.
    </p>
  </UForm>
</template>
