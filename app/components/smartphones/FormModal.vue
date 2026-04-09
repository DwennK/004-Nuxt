<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { formatImei, getImeiWarning, normalizeImei } from '~~/shared/utils/pos'
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
  imei: z.string().optional().default(''),
  sku: optionalText(3, 'SKU invalide'),
  capacity: z.string().min(2, 'Capacité invalide'),
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
const imeiWarning = computed(() => getImeiWarning(state.imei))

watch(() => open.value, (value) => {
  if (!value) {
    return
  }

  state.model = props.item?.model || ''
  state.imei = formatImei(props.item?.imei)
  state.sku = props.item?.sku || ''
  state.capacity = props.item?.capacity || ''
  state.stockedAt = props.item?.stockedAt || new Date().toISOString().slice(0, 10)
  state.sold = props.item?.sold || false
})

function handleImeiInput(value: string | number) {
  state.imei = formatImei(String(value || ''))
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
  try {
    const payload = {
      ...event.data,
      imei: normalizeImei(event.data.imei) || ''
    }

    if (isEditing.value && props.item) {
      await $fetch('/api/smartphone-stocks', {
        method: 'PATCH',
        body: {
          id: props.item.id,
          ...payload
        }
      })

      toast.add({
        title: 'Smartphone mis à jour',
        description: `${payload.model} a été modifié.`,
        color: 'success'
      })
    } else {
      await $fetch('/api/smartphone-stocks', {
        method: 'POST',
        body: payload
      })

      toast.add({
        title: 'Smartphone ajouté',
        description: `${payload.model} a été ajouté au stock.`,
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
    const description = error instanceof Error ? error.message : 'Opération impossible'
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
    :title="isEditing ? 'Modifier le smartphone' : 'Nouveau smartphone'"
    :description="isEditing ? 'Mettre à jour une ligne du stock Microwest.' : 'Ajouter un smartphone reconditionné au stock Microwest.'"
    side="right"
    :ui="{ content: 'max-w-xl' }"
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
        <UFormField label="Modèle" name="model">
          <UInput v-model="state.model" class="w-full" placeholder="iPhone 13 Pro" />
        </UFormField>

        <UFormField label="IMEI" name="imei">
          <div class="space-y-1">
            <UInput
              :model-value="state.imei"
              class="w-full"
              placeholder="356 789 123 456 789"
              inputmode="numeric"
              @update:model-value="handleImeiInput"
            />
            <p v-if="imeiWarning" class="text-xs text-warning">
              {{ imeiWarning }}
            </p>
          </div>
        </UFormField>

        <UFormField label="SKU" name="sku">
          <UInput v-model="state.sku" class="w-full" placeholder="Optionnel" />
        </UFormField>

        <UFormField label="Capacité" name="capacity">
          <UInput v-model="state.capacity" class="w-full" placeholder="128 Go" />
        </UFormField>

        <UFormField label="Entrée en stock" name="stockedAt">
          <UInput v-model="state.stockedAt" type="date" class="w-full" />
        </UFormField>

        <UFormField label="Vendu" name="sold">
          <USwitch v-model="state.sold" label="Ce smartphone est déjà vendu" />
        </UFormField>

        <div class="flex justify-end gap-2">
          <UButton
            label="Annuler"
            color="neutral"
            variant="subtle"
            @click="open = false"
          />
          <UButton
            :label="isEditing ? 'Enregistrer' : 'Créer'"
            color="primary"
            variant="solid"
            type="submit"
          />
        </div>
      </UForm>
    </template>
  </USlideover>
</template>
