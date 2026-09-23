<script setup lang="ts">
import type { HandoverState } from '~~/shared/types/handover'

const props = defineProps<{
  kind: 'ticket' | 'document'
  recordId: number
  revision?: number
  disabled?: boolean
}>()
const $fetch = useDossierFetch()
const { can } = useCapabilities()
const endpoint = computed(() => `/api/${props.kind === 'ticket' ? 'tickets' : 'documents'}/${props.recordId}/handover`)
const { data: state, error: loadError, status, refresh } = await useFetch<HandoverState>(endpoint, { server: false })
const mounted = ref(false)
onMounted(() => {
  mounted.value = true
})
const saving = ref(false)
const saveError = ref<string | null>(null)
const cancelOpen = ref(false)
const toast = useToast()
const message = computed(() => saveError.value || (loadError.value ? 'État de livraison indisponible.' : null))
const busy = computed(() => saving.value || status.value === 'pending' || state.value?.pending)
watch(() => props.revision, () => {
  if (!saving.value) void refresh()
})

async function update(collected: boolean) {
  if (busy.value || props.disabled || !can('financial:record')) return
  saving.value = true
  saveError.value = null
  const url = endpoint.value
  try {
    const result = await $fetch<HandoverState>(url, { method: 'PATCH', body: { collected }, retry: 0 })
    if (endpoint.value !== url) return
    state.value = result
    cancelOpen.value = false
    toast.add({ title: collected ? 'Appareil récupéré / livré' : 'Récupération / livraison annulée', description: result.shopify ? 'Traitement Shopify mis à jour.' : undefined, color: 'success' })
  } catch (error) {
    if (endpoint.value !== url) return
    const failure = error as { data?: { message?: string, statusMessage?: string } }
    saveError.value = failure.data?.message || failure.data?.statusMessage || 'La livraison n’a pas pu être mise à jour.'
    await refresh()
  } finally {
    saving.value = false
  }
}
function toggle(value: boolean | 'indeterminate') {
  if (value === 'indeterminate') return
  if (!value && state.value?.shopify) cancelOpen.value = true
  else void update(value)
}
</script>

<template>
  <div class="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-default px-4 py-2 sm:px-6" data-testid="device-handover">
    <UCheckbox
      :model-value="state?.partial ? 'indeterminate' : (state?.collected ?? false)"
      label="Appareil récupéré / livré"
      :disabled="disabled || busy || !state || !!loadError || !can('financial:record')"
      @update:model-value="toggle"
    />
    <UIcon
      v-if="mounted && busy"
      name="i-lucide-loader-circle"
      class="size-4 animate-spin text-muted"
      aria-label="Synchronisation en cours"
    />
    <span v-if="state?.shopify" class="text-xs text-muted">Shopify {{ state.shopify.orderName }}<template v-if="state.partial"> · Partiellement traité</template></span>
    <UButton
      v-if="state?.partial"
      label="Annuler les traitements"
      size="xs"
      color="neutral"
      variant="link"
      :disabled="disabled || busy || !can('financial:record')"
      @click="cancelOpen = true"
    />
    <p v-if="message" role="alert" class="text-xs text-error">
      {{ message }}
    </p>
    <UButton
      v-if="message || state?.pending"
      label="Actualiser"
      size="xs"
      color="neutral"
      variant="link"
      :loading="status === 'pending'"
      @click="refresh()"
    />
  </div>
  <UModal v-model:open="cancelOpen" title="Annuler la livraison ?" :description="`Les traitements de la commande Shopify ${state?.shopify?.orderName || ''} seront annulés. La commande et ses paiements seront conservés.`">
    <template v-if="saveError" #body>
      <p role="alert" class="text-sm text-error">
        {{ saveError }}
      </p>
    </template>
    <template #footer>
      <UButton
        label="Conserver la livraison"
        color="neutral"
        variant="outline"
        :disabled="saving"
        @click="cancelOpen = false"
      />
      <UButton
        label="Annuler la livraison"
        color="error"
        :loading="saving"
        :disabled="disabled || busy && !saving"
        @click="update(false)"
      />
    </template>
  </UModal>
</template>
