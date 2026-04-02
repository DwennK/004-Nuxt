<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { ticketStatusLabels, ticketStatuses, ticketTypeLabels, ticketTypes } from '~~/shared/constants/pos'
import { defaultRepairSearches } from '~~/shared/constants/repair-suggestions'
import type { CustomerRecord, RepairSuggestion } from '~~/shared/types/pos'
import { formatCurrency } from '~~/shared/utils/pos'
import { getRepairSuggestionResult } from '~~/shared/utils/repair-suggestions'

const props = withDefaults(defineProps<{
  customers: CustomerRecord[]
  initialValue?: Partial<{
    customerId: number | null
    type: (typeof ticketTypes)[number]
    status: (typeof ticketStatuses)[number]
    brand: string | null
    model: string | null
    serialNumber: string | null
    imei: string | null
    accessCode: string | null
    simCode: string | null
    issueDescription: string | null
    internalNotes: string | null
    openedAt: string | null
    closedAt: string | null
  }>
  formId?: string
  layout?: 'compact' | 'page' | 'intake'
  showSubmit?: boolean
  submitLabel?: string
}>(), {
  initialValue: () => ({}),
  formId: undefined,
  layout: 'compact',
  showSubmit: true,
  submitLabel: 'Enregistrer le ticket'
})

const emit = defineEmits<{
  save: [payload: {
    customerId: number
    type: (typeof ticketTypes)[number]
    status: (typeof ticketStatuses)[number]
    brand: string
    model: string
    serialNumber: string
    imei: string
    accessCode: string
    simCode: string
    issueDescription: string
    internalNotes: string
    openedAt: string
    closedAt: string
  }]
}>()

const schema = z.object({
  customerId: z.coerce.number().int().positive(),
  type: z.enum(ticketTypes),
  status: z.enum(ticketStatuses),
  brand: z.string().optional().default(''),
  model: z.string().optional().default(''),
  serialNumber: z.string().optional().default(''),
  imei: z.string().optional().default(''),
  accessCode: z.string().optional().default(''),
  simCode: z.string().optional().default(''),
  issueDescription: z.string().trim().min(3, 'La description du problème est obligatoire'),
  internalNotes: z.string().optional().default(''),
  openedAt: z.string().min(1),
  closedAt: z.string().optional().default('')
})

type Schema = z.output<typeof schema>

function toDateTimeLocal(value?: string | null) {
  const date = value ? new Date(value) : new Date()

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const pad = (part: number) => String(part).padStart(2, '0')

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join('-') + `T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const ticketTypeItems = ticketTypes.map(type => ({
  label: ticketTypeLabels[type],
  value: type
}))

const statusItems = ticketStatuses.map(status => ({
  label: ticketStatusLabels[status],
  value: status
}))

const toast = useToast()
const patternOpen = ref(false)
const intakeQuery = ref('')
const createdCustomer = ref<CustomerRecord | null>(null)
const searchOpen = ref(false)
const highlightedSuggestionIndex = ref(0)
let searchCloseTimeout: ReturnType<typeof setTimeout> | null = null

const state = reactive<Schema>({
  customerId: 0,
  type: 'repair',
  status: 'new',
  brand: '',
  model: '',
  serialNumber: '',
  imei: '',
  accessCode: '',
  simCode: '',
  issueDescription: '',
  internalNotes: '',
  openedAt: toDateTimeLocal(),
  closedAt: ''
})

watchEffect(() => {
  state.customerId = props.initialValue.customerId ?? 0
  state.type = props.layout === 'intake' ? 'repair' : (props.initialValue.type || 'repair')
  state.status = props.initialValue.status || 'new'
  state.brand = props.initialValue.brand || ''
  state.model = props.initialValue.model || ''
  state.serialNumber = props.initialValue.serialNumber || ''
  state.imei = props.initialValue.imei || ''
  state.accessCode = props.initialValue.accessCode || ''
  state.simCode = props.initialValue.simCode || ''
  state.issueDescription = props.initialValue.issueDescription || ''
  state.internalNotes = props.initialValue.internalNotes || ''
  state.openedAt = toDateTimeLocal(props.initialValue.openedAt)
  state.closedAt = props.initialValue.closedAt ? toDateTimeLocal(props.initialValue.closedAt) : ''
})

const currentCustomer = computed(() => {
  return props.customers.find(customer => customer.id === state.customerId)
    || (createdCustomer.value?.id === state.customerId ? createdCustomer.value : null)
})

const repairSuggestionResult = computed(() => getRepairSuggestionResult(intakeQuery.value))
const bestRepairSuggestion = computed(() => repairSuggestionResult.value.bestMatch)
const suggestedRepairMatches = computed(() => repairSuggestionResult.value.suggestedMatches)
const quotedPrice = computed(() => bestRepairSuggestion.value ? formatCurrency(bestRepairSuggestion.value.priceCents) : 'À confirmer')
const repairSearchButtons = computed(() => {
  if (suggestedRepairMatches.value.length) {
    return suggestedRepairMatches.value.slice(0, 6).map(suggestion => ({
      key: `${suggestion.model}-${suggestion.issueKey}`,
      label: `${suggestion.model} · ${suggestion.issueLabel}`,
      action: () => applyRepairSuggestion(suggestion)
    }))
  }

  return defaultRepairSearches.slice(0, 5).map(search => ({
    key: search,
    label: search,
    action: () => {
      intakeQuery.value = search
    }
  }))
})

const deviceSummary = computed(() => {
  const value = [state.brand.trim(), state.model.trim()].filter(Boolean).join(' ')
  return value || 'Appareil à préciser'
})

const intakeSummaryItems = computed(() => {
  return [
    {
      label: 'Client',
      done: Boolean(state.customerId),
      value: currentCustomer.value?.displayName || 'À sélectionner'
    },
    {
      label: 'Appareil',
      done: Boolean(state.brand.trim() || state.model.trim() || state.imei.trim() || state.serialNumber.trim()),
      value: deviceSummary.value
    },
    {
      label: 'Problème',
      done: state.issueDescription.trim().length >= 3,
      value: state.issueDescription.trim() || 'Description à saisir'
    },
    {
      label: 'Prix annoncé',
      done: Boolean(bestRepairSuggestion.value),
      value: bestRepairSuggestion.value ? quotedPrice.value : 'Aucune suggestion'
    }
  ]
})

const searchPanelTitle = computed(() => {
  return intakeQuery.value.trim() ? 'Résultats atelier' : 'Raccourcis atelier'
})

watch(bestRepairSuggestion, (suggestion) => {
  if (!suggestion || props.layout !== 'intake') {
    return
  }

  state.brand = suggestion.brand
  state.model = suggestion.model
  state.type = 'repair'
  state.issueDescription = suggestion.issueLabel
}, { immediate: true })

watch(suggestedRepairMatches, (items) => {
  if (!items.length) {
    highlightedSuggestionIndex.value = 0
    return
  }

  if (highlightedSuggestionIndex.value >= items.length) {
    highlightedSuggestionIndex.value = 0
  }
})

watch(intakeQuery, (value) => {
  highlightedSuggestionIndex.value = 0

  if (value.trim()) {
    openSearchPanel()
    return
  }

  cancelSearchClose()
})

function onSubmit(event: FormSubmitEvent<Schema>) {
  emit('save', {
    ...event.data,
    type: props.layout === 'intake' ? 'repair' : event.data.type,
    openedAt: new Date(event.data.openedAt).toISOString(),
    closedAt: event.data.closedAt ? new Date(event.data.closedAt).toISOString() : ''
  })
}

function applyPattern(patternText: string) {
  state.accessCode = patternText
}

function setCustomer(value: number | null) {
  state.customerId = value || 0
}

function handleCustomerCreated(customer: CustomerRecord) {
  createdCustomer.value = customer
}

function handleImeiScan(value: string) {
  state.imei = value
}

function applyRepairSuggestion(suggestion: RepairSuggestion) {
  intakeQuery.value = `${suggestion.model} ${suggestion.issueLabel}`
  state.brand = suggestion.brand
  state.model = suggestion.model
  state.type = 'repair'
  state.issueDescription = suggestion.issueLabel
  closeSearchPanel()
}

function openSearchPanel() {
  cancelSearchClose()
  searchOpen.value = true
}

function closeSearchPanel() {
  cancelSearchClose()
  searchOpen.value = false
  highlightedSuggestionIndex.value = 0
}

function scheduleSearchClose() {
  cancelSearchClose()
  searchCloseTimeout = setTimeout(() => {
    searchOpen.value = false
    highlightedSuggestionIndex.value = 0
  }, 120)
}

function cancelSearchClose() {
  if (searchCloseTimeout) {
    clearTimeout(searchCloseTimeout)
    searchCloseTimeout = null
  }
}

function highlightNextResult() {
  if (!suggestedRepairMatches.value.length) {
    return
  }

  highlightedSuggestionIndex.value = (highlightedSuggestionIndex.value + 1) % suggestedRepairMatches.value.length
}

function highlightPreviousResult() {
  if (!suggestedRepairMatches.value.length) {
    return
  }

  highlightedSuggestionIndex.value = highlightedSuggestionIndex.value <= 0
    ? suggestedRepairMatches.value.length - 1
    : highlightedSuggestionIndex.value - 1
}

function applyFirstSearchResult() {
  const suggestion = suggestedRepairMatches.value[highlightedSuggestionIndex.value] || suggestedRepairMatches.value[0]

  if (!suggestion) {
    return
  }

  applyRepairSuggestion(suggestion)
}

function handleSearchKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    openSearchPanel()
    highlightNextResult()
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    openSearchPanel()
    highlightPreviousResult()
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    closeSearchPanel()
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    applyFirstSearchResult()
  }
}

function handleIntakeScan(value: string) {
  const sanitizedValue = value.trim()

  if (!sanitizedValue) {
    return
  }

  const normalizedNumericValue = sanitizedValue.replace(/\s+/g, '')

  if (/^\d{8,}$/.test(normalizedNumericValue)) {
    handleImeiScan(normalizedNumericValue)
    toast.add({
      title: 'IMEI scanné',
      description: 'Renseigné dans les champs avancés du ticket.',
      color: 'success'
    })
    return
  }

  const match = getRepairSuggestionResult(sanitizedValue).bestMatch

  if (match) {
    applyRepairSuggestion(match)
    toast.add({
      title: 'Réparation détectée',
      description: `${match.model} · ${match.issueLabel}`,
      color: 'success'
    })
    return
  }

  intakeQuery.value = sanitizedValue
  openSearchPanel()
  toast.add({
    title: 'Code scanné',
    description: `Aucune correspondance directe pour "${sanitizedValue}". Suggestions filtrées.`,
    color: 'warning'
  })
}
</script>

<template>
  <UForm
    :id="formId"
    :schema="schema"
    :state="state"
    :class="props.layout === 'page' ? 'space-y-4' : props.layout === 'intake' ? 'space-y-4' : 'space-y-5'"
    @submit="onSubmit"
  >
    <template v-if="props.layout === 'intake'">
      <div class="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div class="space-y-4">
          <UCard
            variant="subtle"
            :ui="{
              root: 'rounded-[1.75rem] shadow-sm',
              body: 'space-y-4 p-4',
              header: 'p-4 pb-0'
            }"
          >
            <template #header>
              <div class="space-y-1">
                <h2 class="text-base font-semibold text-highlighted">
                  Saisie rapide
                </h2>
                <p class="text-sm text-toned">
                  Modèle + panne, puis client. Le ticket de réparation se prépare ici, le reste suit.
                </p>
              </div>
            </template>

            <UFormField
              label="Recherche atelier"
              name="intakeQuery"
              hint="Ex. iphone 14 ecran, s23 ultra batterie, iphone 15 port charge"
            >
              <div
                class="relative"
                @focusin="cancelSearchClose"
                @focusout="scheduleSearchClose"
                @pointerdown="openSearchPanel"
              >
                <div class="flex gap-2">
                  <UInput
                    v-model="intakeQuery"
                    icon="i-lucide-scan-search"
                    size="xl"
                    class="flex-1"
                    placeholder="iphone 14 ecran"
                    autofocus
                    @keydown="handleSearchKeydown"
                  />
                  <PosBarcodeScanner
                    title="Scanner une référence ou un IMEI"
                    description="Scannez un code-barres ou QR code pour préremplir la saisie rapide ou l’IMEI."
                    trigger-size="lg"
                    trigger-aria-label="Scanner une référence"
                    @scanned="handleIntakeScan"
                  />
                </div>

                <div
                  v-if="searchOpen"
                  class="absolute inset-x-0 top-full z-20 mt-2 rounded-2xl border border-default bg-default p-2 shadow-lg"
                >
                  <div class="flex items-center justify-between gap-3 px-2 pb-2">
                    <p class="text-sm font-medium text-highlighted">
                      {{ searchPanelTitle }}
                    </p>
                    <span class="text-xs text-toned">
                      {{ suggestedRepairMatches.length }} suggestion(s)
                    </span>
                  </div>

                  <div v-if="suggestedRepairMatches.length" class="max-h-[18rem] space-y-1 overflow-y-auto pr-1">
                    <button
                      v-for="(suggestion, index) in suggestedRepairMatches"
                      :key="`${suggestion.model}-${suggestion.issueKey}`"
                      type="button"
                      class="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition"
                      :class="index === highlightedSuggestionIndex
                        ? 'bg-primary/8 ring-1 ring-primary/20'
                        : 'hover:bg-muted/60'"
                      @mouseenter="highlightedSuggestionIndex = index"
                      @click="applyRepairSuggestion(suggestion)"
                    >
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium text-highlighted">
                          {{ suggestion.model }}
                        </p>
                        <p class="truncate text-xs text-toned">
                          {{ suggestion.issueLabel }} · {{ suggestion.brand }}
                        </p>
                      </div>
                      <span class="shrink-0 text-sm font-medium text-highlighted">
                        {{ formatCurrency(suggestion.priceCents) }}
                      </span>
                    </button>
                  </div>

                  <div v-else class="rounded-xl border border-dashed border-default px-4 py-5 text-sm text-toned">
                    Aucune suggestion trouvée pour cette saisie.
                  </div>
                </div>
              </div>
            </UFormField>

            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="hint in repairSearchButtons"
                :key="hint.key"
                type="button"
                color="neutral"
                variant="soft"
                size="xs"
                :label="hint.label"
                @click="hint.action()"
              />
            </div>
          </UCard>

          <UCard
            variant="subtle"
            :ui="{
              root: 'rounded-[1.75rem] shadow-sm',
              body: 'space-y-4 p-4',
              header: 'p-4 pb-0'
            }"
          >
            <template #header>
              <div class="space-y-1">
                <h2 class="text-base font-semibold text-highlighted">
                  Réparation
                </h2>
                <p class="text-sm text-toned">
                  Les champs principaux doivent rester rapides à lire et à corriger.
                </p>
              </div>
            </template>

            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Marque" name="brand" hint="Auto ou manuel">
                <UInput v-model="state.brand" class="w-full" placeholder="Apple, Samsung..." />
              </UFormField>

              <UFormField label="Modèle" name="model" hint="Auto ou manuel">
                <UInput v-model="state.model" class="w-full" placeholder="iPhone 14, Galaxy S23..." />
              </UFormField>

              <UFormField
                label="Problème constaté"
                name="issueDescription"
                required
                class="md:col-span-2"
              >
                <UTextarea
                  v-model="state.issueDescription"
                  class="w-full"
                  :rows="3"
                  autoresize
                  placeholder="Ex. écran fissuré, batterie faible, port de charge endommagé..."
                />
              </UFormField>
            </div>
          </UCard>

          <UCard
            variant="subtle"
            :ui="{
              root: 'rounded-[1.75rem] shadow-sm',
              body: 'space-y-4 p-4',
              header: 'p-4 pb-0'
            }"
          >
            <template #header>
              <div>
                <h2 class="text-base font-semibold text-highlighted">
                  Client
                </h2>
              </div>
            </template>

            <UFormField label="Client" name="customerId" required>
              <PosCustomerSelectField
                :model-value="state.customerId || null"
                :customers="props.customers"
                placeholder="Rechercher ou créer un client"
                @update:model-value="setCustomer"
                @created="handleCustomerCreated"
              />
            </UFormField>
          </UCard>

          <UCard
            variant="subtle"
            :ui="{
              root: 'rounded-[1.75rem] shadow-sm',
              body: 'space-y-4 p-4',
              header: 'p-4 pb-0'
            }"
          >
            <template #header>
              <div class="space-y-1">
                <h2 class="text-base font-semibold text-highlighted">
                  Données appareil
                </h2>
                <p class="text-sm text-toned">
                  IMEI, accès et notes restent visibles, mais passent après la saisie cœur.
                </p>
              </div>
            </template>

            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <UFormField label="IMEI" name="imei" hint="Optionnel">
                <div class="flex gap-2">
                  <UInput v-model="state.imei" class="flex-1" placeholder="356..." />
                  <PosBarcodeScanner
                    title="Scanner IMEI / N° de série"
                    description="Scannez le code-barres IMEI situé sur l'appareil ou son emballage."
                    trigger-aria-label="Scanner IMEI"
                    @scanned="handleImeiScan"
                  />
                </div>
              </UFormField>

              <UFormField label="N° de série" name="serialNumber" hint="Optionnel">
                <UInput v-model="state.serialNumber" class="w-full" placeholder="Numéro de série" />
              </UFormField>

              <UFormField
                label="Code / accès appareil"
                name="accessCode"
                hint="Optionnel"
                class="xl:col-span-2"
              >
                <UInput
                  v-model="state.accessCode"
                  class="w-full"
                  placeholder="PIN, mot de passe ou Pattern 1-2-3-6-9"
                />
              </UFormField>

              <UFormField label="Code SIM" name="simCode" hint="Optionnel">
                <UInput v-model="state.simCode" class="w-full" placeholder="PIN SIM" />
              </UFormField>
            </div>

            <UFormField
              label="Notes internes"
              name="internalNotes"
              hint="Optionnel"
            >
              <UTextarea
                v-model="state.internalNotes"
                class="w-full"
                :rows="3"
                autoresize
                placeholder="Diagnostic initial, accessoires laissés, pièces à commander..."
              />
            </UFormField>
          </UCard>
        </div>

        <div class="space-y-4 xl:sticky xl:top-4">
          <UCard
            variant="subtle"
            :ui="{
              root: 'rounded-[1.75rem] border-primary/20 shadow-sm',
              body: 'space-y-3 p-4'
            }"
          >
            <div class="space-y-1">
              <p class="text-[11px] uppercase tracking-[0.16em] text-primary/80">
                Prix suggéré
              </p>
              <p class="text-3xl font-semibold text-highlighted">
                {{ quotedPrice }}
              </p>
            </div>

            <p class="text-sm text-highlighted">
              {{ bestRepairSuggestion?.issueLabel || 'Aucune suggestion fiable pour cette saisie.' }}
            </p>

            <p class="text-xs text-toned">
              {{ bestRepairSuggestion ? `${bestRepairSuggestion.model} · ${bestRepairSuggestion.brand}` : 'Le montant reste à confirmer avant devis ou annonce client.' }}
            </p>
          </UCard>

          <UCard
            variant="subtle"
            :ui="{
              root: 'rounded-[1.75rem] shadow-sm',
              body: 'space-y-4 p-4',
              header: 'p-4 pb-0'
            }"
          >
            <template #header>
              <div class="space-y-1">
                <h2 class="text-base font-semibold text-highlighted">
                  Suivi
                </h2>
                <p class="text-sm text-toned">
                  Ce qui pilote le ticket pendant la saisie.
                </p>
              </div>
            </template>

            <UFormField label="Statut" name="status" required>
              <USelect
                v-model="state.status"
                :items="statusItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Ouvert le" name="openedAt" required>
              <UInput v-model="state.openedAt" type="datetime-local" class="w-full" />
            </UFormField>

            <UButton
              type="button"
              label="Pattern Android"
              icon="i-lucide-grid-3x3"
              color="neutral"
              variant="soft"
              block
              class="justify-center"
              @click="patternOpen = true"
            />
          </UCard>

          <UCard
            variant="subtle"
            :ui="{
              root: 'rounded-[1.75rem] shadow-sm',
              body: 'space-y-3 p-4',
              header: 'p-4 pb-0'
            }"
          >
            <template #header>
              <div class="space-y-1">
                <h2 class="text-base font-semibold text-highlighted">
                  Résumé
                </h2>
                <p class="text-sm text-toned">
                  Vérification rapide avant création.
                </p>
              </div>
            </template>

            <div
              v-for="item in intakeSummaryItems"
              :key="item.label"
              class="flex items-start gap-3 rounded-xl border border-default/70 bg-default/70 px-3 py-2.5"
            >
              <div
                class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full"
                :class="item.done ? 'bg-success/12 text-success' : 'bg-neutral/12 text-toned'"
              >
                <UIcon :name="item.done ? 'i-lucide-check' : 'i-lucide-dot'" class="size-3" />
              </div>
              <div class="min-w-0">
                <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                  {{ item.label }}
                </p>
                <p class="mt-1 text-sm font-medium text-highlighted">
                  {{ item.value }}
                </p>
              </div>
            </div>
          </UCard>

          <UButton
            v-if="props.showSubmit"
            type="submit"
            :label="props.submitLabel"
            icon="i-lucide-save"
            size="xl"
            block
            class="justify-center rounded-2xl"
          />
        </div>
      </div>
    </template>

    <template v-if="props.layout === 'page'">
      <UPageCard
        title="Contexte"
        description="Associez le ticket au bon client et définissez son cadre opérationnel."
        variant="subtle"
      >
        <UFormField
          label="Client"
          name="customerId"
          description="Sélection principale pour rattacher tous les futurs documents et paiements."
          required
        >
          <PosCustomerSelectField
            :model-value="state.customerId || null"
            :customers="props.customers"
            placeholder="Choisir un client"
            @update:model-value="setCustomer"
            @created="handleCustomerCreated"
          />
        </UFormField>
        <USeparator />
        <div class="grid gap-4 md:grid-cols-3">
          <UFormField
            label="Type de ticket"
            name="type"
            description="Détermine le flux atelier ou support."
            required
          >
            <USelect
              v-model="state.type"
              :items="ticketTypeItems"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Statut"
            name="status"
            description="Point de départ du suivi."
            required
          >
            <USelect
              v-model="state.status"
              :items="statusItems"
              value-key="value"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Ouvert le"
            name="openedAt"
            description="Date et heure d’entrée."
            required
          >
            <UInput v-model="state.openedAt" type="datetime-local" class="w-full" />
          </UFormField>
        </div>
      </UPageCard>

      <UPageCard
        title="Appareil"
        description="Ajoutez les infos nécessaires pour identifier précisément le matériel concerné."
        variant="subtle"
      >
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <UFormField label="Marque" name="brand" hint="Optionnel">
            <UInput v-model="state.brand" class="w-full" />
          </UFormField>

          <UFormField label="Modèle" name="model" hint="Optionnel">
            <UInput v-model="state.model" class="w-full" />
          </UFormField>

          <UFormField label="IMEI" name="imei" hint="Optionnel">
            <div class="flex gap-2">
              <UInput v-model="state.imei" class="flex-1" />
              <PosBarcodeScanner
                title="Scanner IMEI / N° de série"
                description="Scannez le code-barres IMEI situé sur l'appareil ou son emballage."
                trigger-aria-label="Scanner IMEI"
                @scanned="handleImeiScan"
              />
            </div>
          </UFormField>

          <UFormField label="Numéro de série" name="serialNumber" hint="Optionnel">
            <UInput v-model="state.serialNumber" class="w-full" />
          </UFormField>

          <UFormField
            label="Code / accès appareil"
            name="accessCode"
            hint="Optionnel"
            class="xl:col-span-2"
          >
            <div class="space-y-2">
              <UInput
                v-model="state.accessCode"
                class="w-full"
                placeholder="PIN, mot de passe ou Pattern 1-2-3-6-9"
              />
              <UButton
                type="button"
                label="Dessiner un pattern Android"
                icon="i-lucide-grid-3x3"
                color="neutral"
                variant="soft"
                @click="patternOpen = true"
              />
            </div>
          </UFormField>

          <UFormField label="Code SIM" name="simCode" hint="Optionnel">
            <UInput v-model="state.simCode" class="w-full" placeholder="PIN SIM" />
          </UFormField>
        </div>
      </UPageCard>

      <UPageCard
        title="Intervention"
        description="Documentez le problème constaté et les informations internes utiles au traitement."
        variant="subtle"
      >
        <UFormField
          label="Description du problème"
          name="issueDescription"
          description="Visible dans le suivi opérateur et indispensable pour lancer le traitement."
          required
        >
          <UTextarea v-model="state.issueDescription" class="w-full" :rows="4" />
        </UFormField>
        <USeparator />
        <UFormField
          label="Notes internes"
          name="internalNotes"
          description="Réservé à l’équipe: diagnostic, remarques atelier, pièces attendues."
          hint="Optionnel"
        >
          <UTextarea v-model="state.internalNotes" class="w-full" :rows="5" />
        </UFormField>
      </UPageCard>
    </template>

    <template v-else-if="props.layout !== 'intake'">
      <div class="grid gap-4 lg:grid-cols-3">
        <UFormField
          label="Client"
          name="customerId"
          class="lg:col-span-2"
          required
        >
          <PosCustomerSelectField
            :model-value="state.customerId || null"
            :customers="props.customers"
            placeholder="Choisir un client"
            @update:model-value="setCustomer"
            @created="handleCustomerCreated"
          />
        </UFormField>

        <UFormField label="Type de ticket" name="type" required>
          <USelect
            v-model="state.type"
            :items="ticketTypeItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>
      </div>

      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <UFormField label="Statut" name="status" required>
          <USelect
            v-model="state.status"
            :items="statusItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Marque" name="brand" hint="Optionnel">
          <UInput v-model="state.brand" class="w-full" />
        </UFormField>

        <UFormField label="Modèle" name="model" hint="Optionnel">
          <UInput v-model="state.model" class="w-full" />
        </UFormField>

        <UFormField label="IMEI" name="imei" hint="Optionnel">
          <div class="flex gap-2">
            <UInput v-model="state.imei" class="flex-1" />
            <PosBarcodeScanner
              title="Scanner IMEI / N° de série"
              description="Scannez le code-barres IMEI situé sur l'appareil ou son emballage."
              trigger-aria-label="Scanner IMEI"
              @scanned="handleImeiScan"
            />
          </div>
        </UFormField>
      </div>

      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <UFormField label="Numéro de série" name="serialNumber" hint="Optionnel">
          <UInput v-model="state.serialNumber" class="w-full" />
        </UFormField>

        <UFormField label="Code / accès appareil" name="accessCode" hint="Optionnel">
          <div class="space-y-2">
            <UInput
              v-model="state.accessCode"
              class="w-full"
              placeholder="PIN, mot de passe ou Pattern 1-2-3-6-9"
            />
            <UButton
              type="button"
              label="Dessiner un pattern Android"
              icon="i-lucide-grid-3x3"
              color="neutral"
              variant="soft"
              @click="patternOpen = true"
            />
          </div>
        </UFormField>

        <UFormField label="Code SIM" name="simCode" hint="Optionnel">
          <UInput v-model="state.simCode" class="w-full" placeholder="PIN SIM" />
        </UFormField>

        <UFormField label="Ouvert le" name="openedAt" required>
          <UInput v-model="state.openedAt" type="datetime-local" class="w-full" />
        </UFormField>
      </div>

      <UFormField label="Description du problème" name="issueDescription" required>
        <UTextarea v-model="state.issueDescription" class="w-full" :rows="4" />
      </UFormField>

      <UFormField label="Notes internes" name="internalNotes" hint="Optionnel">
        <UTextarea v-model="state.internalNotes" class="w-full" :rows="5" />
      </UFormField>
    </template>

    <div v-if="props.showSubmit && props.layout !== 'intake'" class="flex justify-end">
      <UButton type="submit" :label="props.submitLabel" icon="i-lucide-save" />
    </div>
  </UForm>

  <PosAndroidPatternSlideover
    v-model:open="patternOpen"
    :model-value="state.accessCode"
    @save="applyPattern"
  />
</template>
