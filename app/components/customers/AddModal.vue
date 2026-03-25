<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Customer } from '~/types'

const props = withDefaults(defineProps<{
  item?: Customer | null
  mode?: 'create' | 'edit'
  showTrigger?: boolean
}>(), {
  item: null,
  mode: 'create',
  showTrigger: true
})

const open = defineModel<boolean>('open', { default: false })
const toast = useToast()

const schema = z.object({
  name: z.string().min(2, 'Nom trop court'),
  phone: z.string().min(6, 'Telephone invalide'),
  email: z.string().email('Email invalide'),
  address: z.string().min(2, 'Adresse invalide'),
  postalCode: z.string().min(2, 'Code postal invalide'),
  city: z.string().min(2, 'Ville invalide'),
  comment: z.string().optional().default('')
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  name: '',
  phone: '',
  email: '',
  address: '',
  postalCode: '',
  city: '',
  comment: ''
})

const isEditing = computed(() => props.mode === 'edit')

watch(() => open.value, (value) => {
  if (!value) {
    return
  }

  state.name = props.item?.name || ''
  state.phone = props.item?.phone || ''
  state.email = props.item?.email || ''
  state.address = props.item?.address || ''
  state.postalCode = props.item?.postalCode || ''
  state.city = props.item?.city || ''
  state.comment = props.item?.comment || ''
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  try {
    if (isEditing.value && props.item) {
      await $fetch('/api/customers', {
        method: 'PATCH',
        body: {
          id: props.item.id,
          ...event.data
        }
      })

      toast.add({
        title: 'Client mis a jour',
        description: `${event.data.name} a ete modifie.`,
        color: 'success'
      })
    } else {
      await $fetch('/api/customers', {
        method: 'POST',
        body: event.data
      })

      toast.add({
        title: 'Client ajoute',
        description: `${event.data.name} a ete ajoute.`,
        color: 'success'
      })
    }

    open.value = false
    state.name = ''
    state.phone = ''
    state.email = ''
    state.address = ''
    state.postalCode = ''
    state.city = ''
    state.comment = ''
    await refreshNuxtData()
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
  <UModal
    v-model:open="open"
    :title="isEditing ? 'Modifier le client' : 'Nouveau client'"
    :description="isEditing ? 'Mettre a jour la fiche client.' : 'Ajouter un nouveau client a la base.'"
  >
    <slot>
      <UButton
        v-if="props.showTrigger"
        :label="isEditing ? 'Modifier' : 'Nouveau client'"
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
          <UInput v-model="state.name" class="w-full" />
        </UFormField>

        <UFormField label="Telephone" name="phone">
          <UInput v-model="state.phone" class="w-full" />
        </UFormField>

        <UFormField label="Email" name="email">
          <UInput v-model="state.email" type="email" class="w-full" />
        </UFormField>

        <UFormField label="Adresse" name="address">
          <UInput v-model="state.address" class="w-full" />
        </UFormField>

        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Code postal" name="postalCode">
            <UInput v-model="state.postalCode" class="w-full" />
          </UFormField>

          <UFormField label="Ville" name="city">
            <UInput v-model="state.city" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Commentaire" name="comment">
          <UTextarea v-model="state.comment" class="w-full" :rows="4" />
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
  </UModal>
</template>
