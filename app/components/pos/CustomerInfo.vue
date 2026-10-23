<script setup lang="ts">
import type { CustomerFormValue, CustomerRecord } from '~~/shared/types/pos'

const props = withDefaults(defineProps<{
  customer: CustomerRecord
  editable?: boolean
  disabled?: boolean
  compact?: boolean
}>(), {
  editable: true,
  disabled: false
})

const emit = defineEmits<{
  updated: [customer: CustomerRecord]
}>()

const $fetch = useDossierFetch()
const editOpen = ref(false)
const editingCustomer = ref<CustomerRecord | null>(null)
const { isSaving, saveError, save, clearSaveError } = useFormAction()
const initialValue = computed(() => {
  const customer = editingCustomer.value
  if (!customer) return undefined
  return {
    ...customer,
    companyName: customer.companyName || '',
    addressLine1: customer.addressLine1 || '',
    addressLine2: customer.addressLine2 || '',
    postalCode: customer.postalCode || '',
    city: customer.city || '',
    notes: customer.notes || ''
  }
})

watch(() => props.customer.id, () => {
  editOpen.value = false
})

function openEditor() {
  if (!props.editable || props.disabled || isSaving.value) return
  editingCustomer.value = { ...props.customer }
  clearSaveError()
  editOpen.value = true
}

async function saveCustomer(payload: CustomerFormValue) {
  const customerId = editingCustomer.value?.id
  if (!customerId || customerId !== props.customer.id || !props.editable || props.disabled) return

  const result = await save(() => $fetch<CustomerRecord>(`/api/customers/${customerId}`, {
    method: 'PATCH',
    body: payload
  }), { success: 'Client mis à jour' })
  if (!result?.ok || props.customer.id !== customerId) return

  emit('updated', result.data)
  editOpen.value = false
}

const address = computed(() => [
  props.customer.addressLine1,
  props.customer.addressLine2,
  [props.customer.postalCode, props.customer.city].filter(Boolean).join(' ')
].filter(Boolean).join(', '))
</script>

<template>
  <section aria-label="Informations du client" class="min-w-0">
    <div class="flex items-center gap-2 border-b border-default" :class="compact ? 'mb-1 min-h-7 pb-0.5' : 'mb-2 h-8 pb-1.5'">
      <h2 class="min-w-0 text-xs font-semibold uppercase tracking-wide text-toned">
        Informations du client
      </h2>
      <UTooltip v-if="editable" text="Modifier la fiche client">
        <UButton
          :disabled="disabled || isSaving"
          type="button"
          icon="i-lucide-pencil"
          aria-label="Modifier la fiche client"
          color="neutral"
          variant="ghost"
          size="xs"
          class="shrink-0"
          @click="openEditor"
        />
      </UTooltip>
      <slot name="actions" />
    </div>
    <div class="text-xs leading-5" :class="compact ? 'grid gap-x-3 gap-y-0.5 xl:grid-cols-2' : 'space-y-0.5'">
      <NuxtLink :to="`/customers/${customer.id}`" class="block w-fit max-w-full break-words font-semibold text-highlighted hover:text-primary hover:underline">
        {{ customer.displayName }}
      </NuxtLink>
      <div class="flex min-w-0 items-center gap-2">
        <UIcon name="i-lucide-phone" class="size-3.5 shrink-0 text-muted" />
        <a v-if="customer.phone" :href="`tel:${customer.phone.replace(/[^+\d]/g, '')}`" class="break-all hover:text-primary hover:underline">{{ customer.phone }}</a>
        <span v-else class="text-muted">Téléphone non renseigné</span>
      </div>
      <div class="flex min-w-0 items-center gap-2">
        <UIcon name="i-lucide-mail" class="size-3.5 shrink-0 text-muted" />
        <a v-if="customer.email" :href="`mailto:${customer.email}`" class="break-all hover:text-primary hover:underline">{{ customer.email }}</a>
        <span v-else class="text-muted">Email non renseigné</span>
      </div>
      <div class="flex min-w-0 items-start gap-2" :class="{ 'xl:col-span-2': compact }">
        <UIcon name="i-lucide-map-pin" class="mt-0.5 size-3.5 shrink-0 text-muted" />
        <address class="min-w-0 break-words not-italic" :class="address ? '' : 'text-muted'">
          {{ address || 'Adresse non renseignée' }}
        </address>
      </div>
    </div>
    <PosCustomerSlideover
      v-if="editingCustomer"
      v-model:open="editOpen"
      title="Modifier la fiche client"
      description="Les modifications sont enregistrées dans la fiche client."
      submit-label="Enregistrer le client"
      :initial-value="initialValue"
      :saving="isSaving"
      :save-error="saveError"
      @save="saveCustomer"
    />
  </section>
</template>
