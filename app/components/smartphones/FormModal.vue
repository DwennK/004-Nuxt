<script setup lang="ts">
import type * as z from 'zod'
import { smartphoneSuppliers } from '~~/shared/constants/smartphones'
import { smartphoneStockFormSchema as schema } from '~~/shared/validation/smartphones'
import type { FormSubmitEvent } from '@nuxt/ui'
import { formatImei, getImeiWarning, normalizeImei } from '~~/shared/utils/pos'
import type { SmartphoneStock } from '~/types'

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
const supplierItems: string[] = [...smartphoneSuppliers]

type Schema = z.output<typeof schema>

const state = reactive<Schema>({
  model: '',
  imei: '',
  capacity: '',
  supplier: '',
  stockedAt: ''
})

const isEditing = computed(() => props.mode === 'edit')
const imeiWarning = computed(() => getImeiWarning(state.imei))

watch(() => open.value, (value) => {
  if (!value) {
    return
  }

  state.model = props.item?.model || ''
  state.imei = formatImei(props.item?.imei)
  state.capacity = props.item?.capacity || ''
  state.stockedAt = props.item?.stockedAt || new Date().toISOString().slice(0, 10)
  state.supplier = schema.shape.supplier.parse(props.item?.supplier || '')
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
    state.capacity = ''
    state.stockedAt = ''
    state.supplier = ''
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
          <UInput
            v-bind="posInputAttrs"
            v-model="state.model"
            class="w-full"
            placeholder="iPhone 13 Pro"
          />
        </UFormField>

        <UFormField label="IMEI" name="imei">
          <div class="space-y-1">
            <UInput
              v-bind="posInputAttrs"
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

        <UFormField label="Capacité" name="capacity">
          <UInput
            v-bind="posInputAttrs"
            v-model="state.capacity"
            class="w-full"
            placeholder="128 Go"
          />
        </UFormField>

        <UFormField label="Fournisseur" name="supplier">
          <USelect
            v-model="state.supplier"
            :items="supplierItems"
            placeholder="Choisir un fournisseur"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Entrée en stock" name="stockedAt">
          <UInput
            v-bind="posInputAttrs"
            v-model="state.stockedAt"
            type="date"
            class="w-full"
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
