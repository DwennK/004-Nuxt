<script setup lang="ts">
import type { CustomerFormValue, CustomerRecord } from '~~/shared/types/pos'

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
const isSaving = ref(false)
const searchTerm = ref('')
const createdCustomers = ref<CustomerRecord[]>([])

const customersList = computed(() => {
  const merged = new Map<number, CustomerRecord>()

  for (const customer of props.customers) {
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

const createActionLabel = computed(() => {
  return trimmedSearch.value ? `Créer "${trimmedSearch.value}"` : 'Créer un client'
})

const createActionDescription = computed(() => {
  return trimmedSearch.value
    ? 'Aucun client ne correspond. Ouvrez une fiche rapide préremplie.'
    : 'Ajoutez un client sans quitter ce formulaire.'
})

const quickInitialValue = computed<CustomerFormValue>(() => {
  const query = trimmedSearch.value
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

  menuOpen.value = false
  createOpen.value = true
}

async function createCustomer(payload: CustomerFormValue) {
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
  } finally {
    isSaving.value = false
  }
}

function hardenSearchInput() {
  const input = document.querySelector<HTMLInputElement>('input[name="customer-lookup"]')

  if (!input) {
    return
  }

  input.setAttribute('autocomplete', 'off')
  input.setAttribute('data-bwignore', 'true')
  input.setAttribute('data-1p-ignore', 'true')
  input.setAttribute('data-lpignore', 'true')
  input.spellcheck = false
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

watch(menuOpen, async (open) => {
  if (!open) {
    return
  }

  await nextTick()
  requestAnimationFrame(() => {
    hardenSearchInput()
  })
})

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
    <USelectMenu
      v-model:open="menuOpen"
      v-model:search-term="searchTerm"
      :model-value="modelValue ?? undefined"
      :items="customerItems"
      value-key="id"
      label-key="label"
      description-key="description"
      :placeholder="placeholder"
      :search-input="{
        placeholder: 'Rechercher un client, un téléphone ou un e-mail',
        icon: 'i-lucide-search',
        name: 'customer-lookup',
        type: 'search',
        autocomplete: 'off'
      }"
      :filter-fields="['displayName', 'companyName', 'phone', 'email', 'label', 'description']"
      :clear="!disabled"
      :disabled="disabled"
      icon="i-lucide-user-round-search"
      class="w-full"
      :ui="{
        item: 'items-start gap-3 py-2.5',
        itemLabel: 'font-medium text-default',
        itemDescription: 'text-xs text-toned',
        content: 'overflow-hidden',
        empty: 'px-2 py-2'
      }"
      @update:model-value="emit('update:modelValue', $event ?? null)"
    >
      <template #item-leading="{ item }">
        <div class="mt-0.5 flex size-8 items-center justify-center rounded-full bg-primary/10 text-primary">
          <UIcon
            :name="item.companyName ? 'i-lucide-building-2' : 'i-lucide-user-round'"
            class="size-4"
          />
        </div>
      </template>

      <template #item-trailing>
        <span class="text-[11px] font-medium uppercase tracking-[0.12em] text-toned">
          Existant
        </span>
      </template>

      <template #empty>
        <div class="rounded-xl border border-dashed border-default bg-elevated/50 p-3">
          <p class="text-sm font-medium text-highlighted">
            {{ createActionLabel }}
          </p>
          <p class="mt-1 text-xs text-toned">
            {{ createActionDescription }}
          </p>
          <UButton
            class="mt-3"
            color="primary"
            variant="soft"
            icon="i-lucide-user-plus"
            :label="createActionLabel"
            @click="openCreate"
          />
        </div>
      </template>

      <template #content-bottom>
        <div v-if="!disabled" class="border-t border-default p-2">
          <UButton
            block
            color="neutral"
            variant="ghost"
            icon="i-lucide-user-plus"
            :label="createActionLabel"
            @click="openCreate"
          />
        </div>
      </template>
    </USelectMenu>

    <p v-if="!disabled" class="text-xs text-toned">
      Recherche d’abord, création rapide si le client n’existe pas encore.
    </p>

    <USlideover
      v-model:open="createOpen"
      title="Créer un client"
      description="Ajoutez une fiche légère puis continuez immédiatement votre ticket ou votre document."
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
            label="Créer et sélectionner"
            icon="i-lucide-user-plus"
            :loading="isSaving"
          />
        </div>
      </template>
    </USlideover>
  </div>
</template>
