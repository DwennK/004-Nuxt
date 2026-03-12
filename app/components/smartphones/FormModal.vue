<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { SmartphoneStock } from '~/types'

const optionalText = (minLength: number, message: string) => z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const normalized = value.trim()
  return normalized === '' ? undefined : normalized
}, z.string().min(minLength, message).optional().default(''))

const props = withDefaults(defineProps<{
  item?: SmartphoneStock | null
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
  model: z.string().min(2, 'Trop court'),
  imei: optionalText(8, 'IMEI invalide'),
  sku: optionalText(3, 'SKU invalide'),
  capacity: z.string().min(2, 'Capacite invalide'),
  stockedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide'),
  sold: z.boolean().default(false)
})

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  model: '',
  imei: '',
  sku: '',
  capacity: '',
  stockedAt: '',
  sold: false
})

const isEditing = computed(() => props.mode === 'edit')

watch(() => open.value, (value) => {
  if (!value) {
    return
  }

  state.model = props.item?.model || ''
  state.imei = props.item?.imei || ''
  state.sku = props.item?.sku || ''
  state.capacity = props.item?.capacity || ''
  state.stockedAt = props.item?.stockedAt || new Date().toISOString().slice(0, 10)
  state.sold = props.item?.sold || false
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  try {
    if (isEditing.value && props.item) {
      await $fetch('/api/smartphone-stocks', {
        method: 'PATCH',
        body: {
          id: props.item.id,
          ...event.data
        }
      })

      toast.add({
        title: 'Smartphone mis a jour',
        description: `${event.data.model} a ete modifie.`,
        color: 'success'
      })
    } else {
      await $fetch('/api/smartphone-stocks', {
        method: 'POST',
        body: event.data
      })

      toast.add({
        title: 'Smartphone ajoute',
        description: `${event.data.model} a ete ajoute au stock.`,
        color: 'success'
      })
    }

    open.value = false
    state.model = ''
    state.imei = ''
    state.sku = ''
    state.capacity = ''
    state.stockedAt = ''
    state.sold = false
    await refreshNuxtData('smartphone-stocks')
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
    :title="isEditing ? 'Modifier le smartphone' : 'Nouveau smartphone'"
    :description="isEditing ? 'Mettre a jour une ligne du stock Microwest.' : 'Ajouter un smartphone reconditionne au stock Microwest.'"
  >
    <slot>
      <UButton
        v-if="props.showTrigger"
        :label="isEditing ? 'Modifier' : 'Nouveau smartphone'"
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
        <UFormField label="Modele" name="model">
          <UInput v-model="state.model" class="w-full" placeholder="iPhone 13 Pro" />
        </UFormField>

        <UFormField label="IMEI" name="imei">
          <UInput v-model="state.imei" class="w-full" placeholder="Optionnel" />
        </UFormField>

        <UFormField label="SKU" name="sku">
          <UInput v-model="state.sku" class="w-full" placeholder="Optionnel" />
        </UFormField>

        <UFormField label="Capacite" name="capacity">
          <UInput v-model="state.capacity" class="w-full" placeholder="128 Go" />
        </UFormField>

        <UFormField label="Entree en stock" name="stockedAt">
          <UInput v-model="state.stockedAt" type="date" class="w-full" />
        </UFormField>

        <UFormField label="Vendu" name="sold">
          <UCheckbox
            v-model="state.sold"
            label="Ce smartphone est deja vendu"
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
  </UModal>
</template>
