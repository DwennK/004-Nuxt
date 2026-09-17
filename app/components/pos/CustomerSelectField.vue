<script setup lang="ts">
import type { CustomerFormValue, CustomerRecord } from '~~/shared/types/pos'
import type { CustomerSuggestionsResponse } from '~~/shared/types/lookups'

type CustomerSelectItem = CustomerRecord & {
  label: string
  description: string
}

const props = withDefaults(defineProps<{
  customers: CustomerRecord[]
  modelValue?: number | null
  disabled?: boolean
  placeholder?: string
}>(), {
  modelValue: null,
  disabled: false,
  placeholder: 'Choisir un client'
})

const emit = defineEmits<{
  'update:modelValue': [value: number | null]
  'created': [customer: CustomerRecord]
}>()

const toast = useToast()
const formId = `customer-inline-${useId()}`
const menuOpen = ref(false)
const createOpen = ref(false)
const customerSelect = useTemplateRef<{ inputRef?: HTMLInputElement }>('customerSelect')
const focusReturn = usePosFocusReturn(createOpen, () => customerSelect.value?.inputRef)
const isSaving = ref(false)
const saveError = ref<string | null>(null)
const searchTerm = ref('')
const createSearchTerm = ref('')
const createdCustomers = ref<CustomerRecord[]>([])

const remoteCustomers = ref<CustomerRecord[]>([])
const remoteSearchPending = ref(false)
const remoteSearchFailed = ref(false)

const customersList = computed(() => {
  const merged = new Map<number, CustomerRecord>()

  for (const customer of props.customers) {
    merged.set(customer.id, customer)
  }

  for (const customer of remoteCustomers.value) {
    merged.set(customer.id, customer)
  }

  for (const customer of createdCustomers.value) {
    merged.set(customer.id, customer)
  }

  return Array.from(merged.values()).sort((left, right) => {
    return left.displayName.localeCompare(right.displayName, 'fr', { sensitivity: 'base' })
  })
})

const customerItems = computed<CustomerSelectItem[]>(() => customersList.value.map((customer) => {
  const secondaryInfo = [
    customer.companyName && customer.companyName !== customer.displayName ? customer.companyName : null,
    customer.phone,
    customer.email
  ].filter(Boolean)

  return {
    ...customer,
    label: customer.displayName,
    description: secondaryInfo.join(' · ')
  }
}))

const trimmedSearch = computed(() => searchTerm.value.trim())
const debouncedSearch = refDebounced(trimmedSearch, 250)
const canSearch = computed(() => trimmedSearch.value.length >= 2)
const searchPending = computed(() => canSearch.value && (trimmedSearch.value !== debouncedSearch.value || remoteSearchPending.value))
const visibleCustomerItems = computed(() => canSearch.value ? customerItems.value : [])
const selectedCustomer = computed(() => customerItems.value.find(customer => customer.id === props.modelValue))

watch([debouncedSearch, trimmedSearch], async ([term, currentTerm], _previous, onCleanup) => {
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  remoteSearchPending.value = false
  remoteSearchFailed.value = false
  if (currentTerm.length < 2 || term !== currentTerm) return

  remoteSearchPending.value = true

  try {
    const response = await $fetch<CustomerSuggestionsResponse>('/api/customers/suggestions', {
      query: { search: term, pageSize: 20 },
      signal: controller.signal
    })
    if (controller.signal.aborted) return

    const merged = new Map(remoteCustomers.value.map(customer => [customer.id, customer]))

    for (const customer of response.items) {
      merged.set(customer.id, customer)
    }

    remoteCustomers.value = Array.from(merged.values())
  } catch {
    if (!controller.signal.aborted) remoteSearchFailed.value = true
  } finally {
    if (!controller.signal.aborted) remoteSearchPending.value = false
  }
})

const createActionLabel = computed(() => {
  return trimmedSearch.value ? `Créer "${trimmedSearch.value}"` : 'Créer un client'
})

const quickInitialValue = computed<CustomerFormValue>(() => {
  const query = createSearchTerm.value
  const emailMatch = query.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)
  const phoneMatch = query.match(/(?:\+|00)?\d[\d\s()./-]{5,}\d/)

  let remaining = query

  if (emailMatch?.[0]) {
    remaining = remaining.replace(emailMatch[0], ' ')
  }

  if (phoneMatch?.[0]) {
    remaining = remaining.replace(phoneMatch[0], ' ')
  }

  const displayName = remaining.replace(/\s+/g, ' ').trim()

  return {
    displayName,
    firstName: '',
    lastName: '',
    companyName: '',
    phone: phoneMatch?.[0]?.trim() || '',
    email: emailMatch?.[0]?.trim() || '',
    addressLine1: '',
    addressLine2: '',
    postalCode: '',
    city: '',
    notes: ''
  }
})

function openCreate() {
  if (props.disabled) {
    return
  }

  saveError.value = null
  createSearchTerm.value = trimmedSearch.value
  menuOpen.value = false
  createOpen.value = true
}

async function createCustomer(payload: CustomerFormValue) {
  if (isSaving.value) return
  saveError.value = null
  isSaving.value = true

  try {
    const customer = await $fetch<CustomerRecord>('/api/customers', {
      method: 'POST',
      body: payload
    })

    createdCustomers.value = [...createdCustomers.value.filter(item => item.id !== customer.id), customer]
    emit('update:modelValue', customer.id)
    emit('created', customer)
    createOpen.value = false
    searchTerm.value = ''

    toast.add({
      title: 'Client créé',
      color: 'success'
    })
  } catch (error) {
    saveError.value = getRequestErrorMessage(error) || 'Vérifiez la connexion puis réessayez.'
    toast.add({
      title: 'Création du client impossible',
      description: getRequestErrorMessage(error) || 'Vérifiez la connexion puis réessayez.',
      color: 'error'
    })
  } finally {
    isSaving.value = false
  }
}

function releasePageScrollIfSafe() {
  if (typeof document === 'undefined') {
    return
  }

  const hasOpenDialog = Boolean(document.querySelector('[role="dialog"][data-state="open"]'))

  if (hasOpenDialog) {
    return
  }

  document.body.style.removeProperty('overflow')
  document.body.style.removeProperty('padding-right')
  document.documentElement.style.removeProperty('overflow')
}

watch(createOpen, async (open) => {
  if (open) {
    return
  }

  await nextTick()
  requestAnimationFrame(() => {
    releasePageScrollIfSafe()
  })
})

onBeforeUnmount(() => {
  releasePageScrollIfSafe()
})
</script>

<template>
  <div class="space-y-2">
    <UInputMenu
      v-bind="posInputAttrs"
      :key="createdCustomers.length"
      ref="customerSelect"
      v-model:open="menuOpen"
      v-model:search-term="searchTerm"
      :model-value="selectedCustomer ?? null"
      :items="visibleCustomerItems"
      by="id"
      label-key="label"
      description-key="description"
      :placeholder="placeholder"
      name="customer-lookup"
      :spellcheck="false"
      :filter-fields="['displayName', 'companyName', 'phone', 'email', 'label', 'description']"
      :clear="!disabled"
      :disabled="disabled"
      :loading="searchPending"
      icon="i-lucide-user-round-search"
      class="w-full"
      :ui="{
        item: 'min-h-9 items-center gap-2 py-1.5',
        itemWrapper: 'flex-row items-center gap-1.5',
        itemLabel: 'min-w-0 shrink-0 max-w-full not-last:max-w-[60%] font-medium text-default',
        itemDescription: 'min-w-0 text-xs text-muted before:mr-1.5 before:content-[\'·\']',
        content: 'overflow-hidden',
        empty: 'px-2 py-2'
      }"
      @input="($event.target as HTMLInputElement).value === '' && emit('update:modelValue', null)"
      @update:model-value="emit('update:modelValue', $event?.id ?? null)"
    >
      <template #item-leading="{ item }">
        <UIcon
          :name="item.companyName ? 'i-lucide-building-2' : 'i-lucide-user-round'"
          class="size-4 shrink-0 text-primary"
        />
      </template>

      <template #item-label="{ item }">
        <span :title="item.label">{{ item.label }}</span>
      </template>

      <template #empty>
        <p class="px-2 py-3 text-sm text-muted" role="status">
          <template v-if="!trimmedSearch">
            Tapez un nom, un téléphone ou un e-mail
          </template>
          <template v-else-if="!canSearch">
            Saisissez au moins 2 caractères.
          </template>
          <template v-else-if="searchPending">
            Recherche en cours…
          </template>
          <template v-else-if="remoteSearchFailed">
            Recherche indisponible. Réessayez.
          </template>
          <template v-else>
            Aucun client trouvé.
          </template>
        </p>
      </template>

      <template #content-bottom>
        <div v-if="!disabled" class="border-t border-default">
          <UButton
            block
            color="neutral"
            variant="ghost"
            icon="i-lucide-user-plus"
            :label="createActionLabel"
            class="h-9 rounded-none"
            :ui="{ leadingIcon: 'size-4', label: 'truncate' }"
            @pointerdown.prevent
            @click="openCreate"
          />
        </div>
      </template>
    </UInputMenu>

    <USlideover
      v-model:open="createOpen"
      :content="focusReturn"
      title="Créer un client"
      description="Ajoutez une fiche légère puis continuez immédiatement votre dossier ou votre document."
      side="right"
      :dismissible="!isSaving"
      :close="!isSaving"
      :ui="{
        content: 'max-w-lg',
        body: 'space-y-5 overflow-y-auto',
        footer: 'border-t border-default bg-default/95 backdrop-blur supports-[backdrop-filter]:bg-default/80'
      }"
    >
      <template #body>
        <div class="rounded-2xl border border-default bg-elevated/50 px-4 py-3">
          <p class="text-xs uppercase tracking-[0.14em] text-toned">
            Saisie rapide
          </p>
          <p class="mt-1 text-sm text-default">
            Le nom suffit. Ajoutez le téléphone ou l’e-mail seulement si le client accepte de les partager.
          </p>
        </div>

        <PosCustomerForm
          :form-id="formId"
          :saving="isSaving"
          :save-error="saveError"
          mode="quick"
          :show-submit="false"
          submit-label="Créer et sélectionner"
          :initial-value="quickInitialValue"
          @save="createCustomer"
        />
      </template>

      <template #footer>
        <div class="flex items-center justify-end gap-3">
          <UButton
            label="Annuler"
            color="neutral"
            variant="ghost"
            :disabled="isSaving"
            @click="createOpen = false"
          />
          <UButton
            :form="formId"
            type="submit"
            :label="isSaving ? 'Enregistrement…' : 'Créer et sélectionner'"
            icon="i-lucide-user-plus"
            :loading="isSaving"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>
