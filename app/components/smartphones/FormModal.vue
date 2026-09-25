<script setup lang="ts">
import type * as z from 'zod'
import { smartphoneSuppliers } from '~~/shared/constants/smartphones'
import { smartphoneStockFormSchema as schema } from '~~/shared/validation/smartphones'
import type { FormSubmitEvent } from '@nuxt/ui'
import { formatImei, getImeiWarning, isValidImei, normalizeImei } from '~~/shared/utils/pos'
import type { SmartphoneImeiLookup } from '~~/shared/types/smartphones'
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
const lookupPending = ref(false)
const lookupResult = ref<SmartphoneImeiLookup | null>(null)
let lookupTimer: ReturnType<typeof setTimeout> | undefined
let lookupController: AbortController | undefined
let lookupVersion = 0
let modelVersion = 0
let automaticModel: string | null = null

const lookupMessage = computed(() => {
  if (lookupPending.value) return 'Recherche du modèle…'
  const result = lookupResult.value
  if (!result) return 'Le modèle est recherché automatiquement à partir de l’IMEI.'
  if (result.status === 'found') {
    return state.model === result.model
      ? 'Modèle identifié. Vérifiez la capacité sur l’appareil.'
      : `Modèle identifié : ${result.model}.`
  }
  const messages = {
    not_found: 'Modèle non trouvé. Renseignez-le manuellement.',
    unavailable: 'Recherche momentanément indisponible. Renseignez le modèle manuellement.'
  }
  return messages[result.status]
})

function cancelLookup() {
  clearTimeout(lookupTimer)
  lookupController?.abort()
  lookupVersion += 1
  lookupPending.value = false
  lookupResult.value = null
}

function handleModelInput(value: string | number) {
  modelVersion += 1
  automaticModel = null
  state.model = String(value || '')
}

function applyDetectedModel() {
  if (lookupResult.value?.status !== 'found') return
  state.model = lookupResult.value.model
  automaticModel = state.model
}

async function lookupModel(imei: string, version: number, initialModelVersion: number) {
  lookupController = new AbortController()
  try {
    const result = await $fetch('/api/smartphone-stocks/imei-lookup', {
      method: 'POST',
      body: { imei },
      signal: lookupController.signal,
      retry: 0,
      timeout: 10_000
    })
    if (version !== lookupVersion || !open.value) return
    lookupResult.value = result
    if (result.status === 'found' && modelVersion === initialModelVersion && !state.model.trim()) {
      applyDetectedModel()
    }
  } catch {
    if (version === lookupVersion && open.value) lookupResult.value = { status: 'unavailable' }
  } finally {
    if (version === lookupVersion) lookupPending.value = false
  }
}

onBeforeUnmount(cancelLookup)

watch(() => open.value, (value) => {
  cancelLookup()
  automaticModel = null
  modelVersion += 1
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
  const previousImei = normalizeImei(state.imei)
  state.imei = formatImei(String(value || ''))
  const imei = normalizeImei(state.imei)
  if (imei === previousImei) return
  cancelLookup()
  if (automaticModel !== null && state.model === automaticModel) state.model = ''
  automaticModel = null
  if (!open.value || !imei || !isValidImei(imei)) return
  lookupPending.value = true
  const version = lookupVersion
  const initialModelVersion = modelVersion
  lookupTimer = setTimeout(() => lookupModel(imei, version, initialModelVersion), 450)
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
        <UFormField label="IMEI" name="imei">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <UInput
                v-bind="posInputAttrs"
                :model-value="state.imei"
                :loading="lookupPending"
                class="min-w-0 flex-1"
                placeholder="356 789 123 456 789"
                inputmode="numeric"
                @update:model-value="handleImeiInput"
              />
              <PosBarcodeScanner
                title="Scanner un IMEI"
                description="Scannez le code-barres IMEI de l’appareil ou de son emballage."
                trigger-aria-label="Scanner un IMEI"
                @scanned="handleImeiInput"
              />
            </div>
            <p v-if="imeiWarning" class="text-xs text-warning">
              {{ imeiWarning }}
            </p>
            <p class="text-xs text-muted" role="status" aria-live="polite">
              {{ lookupMessage }}
            </p>
          </div>
        </UFormField>

        <UFormField label="Modèle" name="model">
          <UInput
            v-bind="posInputAttrs"
            :model-value="state.model"
            class="w-full"
            placeholder="iPhone 13 Pro"
            @update:model-value="handleModelInput"
          />
          <UButton
            v-if="lookupResult?.status === 'found' && state.model !== lookupResult.model"
            :label="`Utiliser ${lookupResult.model}`"
            variant="link"
            size="xs"
            class="px-0"
            @click="applyDetectedModel"
          />
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
