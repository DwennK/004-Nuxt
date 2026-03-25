<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { SmartphoneReservationRequest, SmartphoneReservationStatus } from '~/types'

const optionalText = (minLength: number, message: string) => z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const normalized = value.trim()
  return normalized === '' ? undefined : normalized
}, z.string().min(minLength, message).optional().default(''))

const props = withDefaults(defineProps<{
  item?: SmartphoneReservationRequest | null
  mode?: 'create' | 'edit'
  showTrigger?: boolean
}>(), {
  item: null,
  mode: 'create',
  showTrigger: true
})

const open = defineModel<boolean>('open', { default: false })
const toast = useToast()

const statusItems = [{
  label: 'En attente',
  value: 'pending'
}, {
  label: 'Contacte',
  value: 'contacted'
}, {
  label: 'Vendu',
  value: 'sold'
}] satisfies Array<{ label: string, value: SmartphoneReservationStatus }>

const schema = z.object({
  name: z.string().min(2, 'Nom trop court'),
  phone: z.string().min(6, 'Telephone invalide'),
  model: z.string().min(2, 'Modele invalide'),
  storage: z.string().min(2, 'Stockage invalide'),
  requestedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
  status: z.enum(['pending', 'contacted', 'sold']).default('pending'),
  notes: optionalText(2, 'Remarque trop courte')
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  name: '',
  phone: '',
  model: '',
  storage: '',
  requestedAt: '',
  status: 'pending',
  notes: ''
})

const isEditing = computed(() => props.mode === 'edit')

watch(() => open.value, (value) => {
  if (!value) {
    return
  }

  state.name = props.item?.name || ''
  state.phone = props.item?.phone || ''
  state.model = props.item?.model || ''
  state.storage = props.item?.storage || ''
  state.requestedAt = props.item?.requestedAt || new Date().toISOString().slice(0, 10)
  state.status = props.item?.status || 'pending'
  state.notes = props.item?.notes || ''
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  try {
    if (isEditing.value && props.item) {
      await $fetch('/api/smartphone-reservations', {
        method: 'PATCH',
        body: {
          id: props.item.id,
          ...event.data
        }
      })

      toast.add({
        title: 'Demande mise a jour',
        description: `${event.data.name} a ete modifie.`,
        color: 'success'
      })
    } else {
      await $fetch('/api/smartphone-reservations', {
        method: 'POST',
        body: event.data
      })

      toast.add({
        title: 'Demande ajoutee',
        description: `${event.data.name} a ete ajoute.`,
        color: 'success'
      })
    }

    open.value = false
    state.name = ''
    state.phone = ''
    state.model = ''
    state.storage = ''
    state.requestedAt = ''
    state.status = 'pending'
    state.notes = ''
    await refreshNuxtData('smartphone-reservation-requests')
  } catch (error) {
    const description = error instanceof Error ? error.message : 'Operation impossible'
    toast.add({
      title: 'Erreur',
      description,
      color: 'error'
    })
  }
}
</script>

<template>
  <USlideover
    v-model:open="open"
    :title="isEditing ? 'Modifier la demande' : 'Nouvelle demande'"
    :description="isEditing ? 'Mettre a jour une demande de reservation smartphone.' : 'Ajouter une nouvelle demande de reservation smartphone.'"
    side="right"
    :ui="{ content: 'max-w-xl' }"
  >
    <slot>
      <UButton
        v-if="props.showTrigger"
        :label="isEditing ? 'Modifier' : 'Nouvelle demande'"
        :icon="isEditing ? 'i-lucide-pencil' : 'i-lucide-plus'"
      />
    </slot>

    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField label="Nom" name="name">
          <UInput v-model="state.name" class="w-full" placeholder="Jean Dupont" />
        </UFormField>

        <UFormField label="Telephone" name="phone">
          <UInput v-model="state.phone" class="w-full" placeholder="+41 79 123 45 67" />
        </UFormField>

        <UFormField label="Modele" name="model">
          <UInput v-model="state.model" class="w-full" placeholder="iPhone 15 Pro" />
        </UFormField>

        <UFormField label="Stockage" name="storage">
          <UInput v-model="state.storage" class="w-full" placeholder="256 Go" />
        </UFormField>

        <UFormField label="Date de la demande" name="requestedAt">
          <UInput v-model="state.requestedAt" type="date" class="w-full" />
        </UFormField>

        <UFormField label="Etat" name="status">
          <USelectMenu
            v-model="state.status"
            :items="statusItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Remarques" name="notes">
          <UTextarea
            v-model="state.notes"
            class="w-full"
            :rows="4"
            placeholder="Informations utiles sur la reservation"
          />
        </UFormField>

        <div class="flex justify-end gap-2">
          <UButton
            label="Annuler"
            color="neutral"
            variant="subtle"
            @click="open = false"
          />
          <UButton
            :label="isEditing ? 'Enregistrer' : 'Creer'"
            color="primary"
            variant="solid"
            type="submit"
          />
        </div>
      </UForm>
    </template>
  </USlideover>
</template>
