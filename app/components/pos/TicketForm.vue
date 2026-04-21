<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent, TabsItem } from '@nuxt/ui'
import { ticketStatusLabels, ticketStatuses, ticketTypeLabels, ticketTypes } from '~~/shared/constants/pos'
import type { CatalogItemRecord, CustomerRecord } from '~~/shared/types/pos'
import { formatCurrency, formatImei, getImeiWarning, normalizeImei, normalizeSearchText } from '~~/shared/utils/pos'
import { useCommercialLinesDraft, type EditableCommercialLinePayload } from '~~/app/composables/useCommercialLinesDraft'

const props = withDefaults(defineProps<{
  customers: CustomerRecord[]
  catalogItems?: CatalogItemRecord[]
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
    lines: EditableCommercialLinePayload[]
  }>
  formId?: string
  layout?: 'compact' | 'page' | 'intake'
  showSubmit?: boolean
  submitLabel?: string
}>(), {
  catalogItems: () => [],
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
    lines: EditableCommercialLinePayload[]
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

const intakeSection = ref<'lines' | 'details'>('lines')
const intakeSectionTabs: TabsItem[] = [
  { label: 'Lignes', value: 'lines' },
  { label: 'Détails', value: 'details' }
]

const toast = useToast()
const patternOpen = ref(false)
const {
  search: intakeQuery,
  searchOpen,
  highlightedItemIndex: highlightedSuggestionIndex,
  remoteSearchPending: remoteSuggestionsPending,
  searchPanelItems: remoteSuggestions,
  shouldShowSearchPanel,
  minSearchLength,
  searchCatalogItems,
  openSearchPanel,
  closeSearchPanel,
  scheduleSearchClose,
  cancelSearchClose,
  highlightNextResult,
  highlightPreviousResult
} = useCatalogItemSearch({
  filterItem: item => (item.type === 'repair' || item.type === 'service') && item.isActive
})

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

const lineEditor = useCommercialLinesDraft({
  initialLines: computed(() => props.initialValue.lines),
  catalogItems: computed(() => props.catalogItems || []),
  lineIdPrefix: 'ticket-line'
})

watchEffect(() => {
  state.customerId = props.initialValue.customerId ?? 0
  state.type = props.initialValue.type || 'repair'
  state.status = props.initialValue.status || 'new'
  state.brand = props.initialValue.brand || ''
  state.model = props.initialValue.model || ''
  state.serialNumber = props.initialValue.serialNumber || ''
  state.imei = formatImei(props.initialValue.imei)
  state.accessCode = props.initialValue.accessCode || ''
  state.simCode = props.initialValue.simCode || ''
  state.issueDescription = props.initialValue.issueDescription || ''
  state.internalNotes = props.initialValue.internalNotes || ''
  state.openedAt = toDateTimeLocal(props.initialValue.openedAt)
  state.closedAt = props.initialValue.closedAt ? toDateTimeLocal(props.initialValue.closedAt) : ''
})

function buildServiceSearchText(item: CatalogItemRecord) {
  return normalizeSearchText([
    item.name,
    item.category,
    item.brand,
    item.model,
    item.serviceKind,
    ...item.keywords
  ].filter(Boolean).join(' '))
}

function scoreCatalogService(item: CatalogItemRecord, normalizedQuery: string) {
  const tokens = normalizedQuery.split(' ').filter(Boolean)
  const searchText = buildServiceSearchText(item)

  if (!tokens.length || !tokens.every(token => searchText.includes(token))) {
    return null
  }

  const nameText = normalizeSearchText(item.name)
  const modelText = normalizeSearchText(item.model)
  const serviceKindText = normalizeSearchText(item.serviceKind)
  const keywordText = normalizeSearchText(item.keywords.join(' '))
  const deviceIssueText = normalizeSearchText([item.model, item.serviceKind].filter(Boolean).join(' '))
  const issueDeviceText = normalizeSearchText([item.serviceKind, item.model].filter(Boolean).join(' '))

  let score = 0

  if (nameText.includes(normalizedQuery)) {
    score += 220
  }

  if (deviceIssueText.includes(normalizedQuery) || issueDeviceText.includes(normalizedQuery)) {
    score += 180
  }

  if (modelText.includes(normalizedQuery)) {
    score += 120
  }

  if (serviceKindText.includes(normalizedQuery)) {
    score += 120
  }

  if (keywordText.includes(normalizedQuery)) {
    score += 90
  }

  for (const token of tokens) {
    if (nameText.includes(token)) {
      score += 24
    }

    if (modelText.includes(token)) {
      score += 20
    }

    if (serviceKindText.includes(token)) {
      score += 20
    }

    if (keywordText.includes(token)) {
      score += 16
    }
  }

  return score
}

function getCatalogServiceResult(query: string) {
  const normalizedQuery = normalizeSearchText(query)

  if (!normalizedQuery) {
    return {
      bestMatch: null as CatalogItemRecord | null,
      suggestedMatches: []
    }
  }

  const matches = remoteSuggestions.value
    .map(item => ({
      item,
      score: scoreCatalogService(item, normalizedQuery)
    }))
    .filter((match): match is { item: CatalogItemRecord, score: number } => match.score !== null)
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name))

  return {
    bestMatch: matches[0]?.item || null,
    suggestedMatches: matches.slice(0, 6).map(match => match.item)
  }
}

const serviceSearchResult = computed(() => getCatalogServiceResult(intakeQuery.value))
const bestSuggestedService = computed(() => serviceSearchResult.value.bestMatch)
const searchPanelItems = computed(() => {
  return intakeQuery.value.trim().length >= minSearchLength ? serviceSearchResult.value.suggestedMatches : []
})

const imeiWarning = computed(() => getImeiWarning(state.imei))

const searchPanelTitle = computed(() => {
  return 'Résultats atelier'
})

function applySuggestionContext(suggestion: CatalogItemRecord, force = false) {
  if (force || !state.brand) {
    state.brand = suggestion.brand || ''
  }

  if (force || !state.model) {
    state.model = suggestion.model || ''
  }

  if (force || !state.issueDescription.trim()) {
    state.issueDescription = suggestion.serviceKind || suggestion.name
  }

  if (force || state.type === 'repair') {
    state.type = suggestion.type === 'service' ? 'support' : 'repair'
  }
}

watch(bestSuggestedService, (suggestion) => {
  if (!suggestion || props.layout !== 'intake') {
    return
  }

  applySuggestionContext(suggestion)
}, { immediate: true })

watch(intakeQuery, (value) => {
  if (props.layout !== 'intake' || state.issueDescription.trim()) {
    return
  }

  state.issueDescription = value.trim()
})

function onSubmit(event: FormSubmitEvent<Schema>) {
  emit('save', {
    ...event.data,
    type: event.data.type,
    imei: normalizeImei(event.data.imei) || '',
    openedAt: new Date(event.data.openedAt).toISOString(),
    closedAt: event.data.closedAt ? new Date(event.data.closedAt).toISOString() : '',
    lines: lineEditor.serializeLines()
  })
}

function applyPattern(patternText: string) {
  state.accessCode = patternText
}

function setCustomer(value: number | null) {
  state.customerId = value || 0
}

function handleCustomerCreated(customer: CustomerRecord) {
  state.customerId = customer.id
}

function handleImeiInput(value: string | number) {
  state.imei = formatImei(String(value || ''))
}

function handleImeiScan(value: string) {
  state.imei = formatImei(value)
}

function applyCatalogSuggestion(item: CatalogItemRecord) {
  intakeQuery.value = item.name
  applySuggestionContext(item, true)
  lineEditor.addCatalogItem(item)
  closeSearchPanel()
}

function applyFirstSearchResult() {
  const suggestion = searchPanelItems.value[highlightedSuggestionIndex.value] || searchPanelItems.value[0]

  if (!suggestion) {
    return
  }

  applyCatalogSuggestion(suggestion)
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

async function handleIntakeScan(value: string) {
  const sanitizedValue = value.trim()

  if (!sanitizedValue) {
    return
  }

  const normalizedNumericValue = normalizeImei(sanitizedValue) || ''

  if (/^\d{8,}$/.test(normalizedNumericValue)) {
    handleImeiScan(normalizedNumericValue)
    toast.add({
      title: 'IMEI scanné',
      description: 'Renseigné dans les champs avancés du ticket.',
      color: 'success'
    })
    return
  }

  const normalizedQuery = normalizeSearchText(sanitizedValue)
  const match = (await searchCatalogItems(sanitizedValue))
    .map(item => ({
      item,
      score: scoreCatalogService(item, normalizedQuery)
    }))
    .filter((entry): entry is { item: CatalogItemRecord, score: number } => entry.score !== null)
    .sort((left, right) => right.score - left.score || left.item.name.localeCompare(right.item.name))[0]?.item || null

  if (match) {
    applyCatalogSuggestion(match)
    toast.add({
      title: 'Suggestion détectée',
      description: `${match.model || match.category} · ${match.serviceKind || match.name}`,
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
      <div class="space-y-3">
        <div class="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(24rem,0.9fr)]">
          <UCard
            variant="subtle"
            :ui="{
              root: `relative overflow-visible rounded-[1.5rem] border border-default/70 shadow-sm ${searchOpen ? 'z-20' : 'z-10'}`,
              body: 'space-y-3 p-3'
            }"
          >
            <div class="space-y-3">
              <div class="flex items-center gap-2">
                <h2 class="text-sm font-semibold text-highlighted">
                  Prise en charge
                </h2>
                <UBadge color="primary" variant="soft" size="sm">
                  Atelier
                </UBadge>
              </div>

              <UFormField label="Client" name="customerId" required>
                <PosCustomerSelectField
                  :model-value="state.customerId || null"
                  :customers="props.customers"
                  placeholder="Rechercher ou créer un client"
                  @update:model-value="setCustomer"
                  @created="handleCustomerCreated"
                />
              </UFormField>

              <div
                class="relative"
                :class="searchOpen ? 'z-30' : ''"
                @focusin="cancelSearchClose"
                @focusout="scheduleSearchClose"
                @pointerdown="openSearchPanel"
              >
                <UFormField label="Diagnostic rapide">
                  <div class="flex gap-2">
                    <UInput
                      v-model="intakeQuery"
                      icon="i-lucide-scan-search"
                      size="lg"
                      class="flex-1"
                      placeholder="iphone 14 ecran"
                      autofocus
                      @keydown="handleSearchKeydown"
                    />
                    <PosBarcodeScanner
                      title="Scanner une référence ou un IMEI"
                      description="Scannez un code-barres ou QR code pour pre-remplir la saisie rapide ou l’IMEI."
                      trigger-size="lg"
                      trigger-aria-label="Scanner une référence"
                      @scanned="handleIntakeScan"
                    />
                  </div>
                </UFormField>

                <div
                  v-if="shouldShowSearchPanel"
                  class="absolute inset-x-0 top-full z-50 mt-2 rounded-2xl border border-default bg-default p-2 shadow-lg"
                >
                  <div class="flex items-center justify-between gap-3 px-2 pb-2">
                    <p class="text-sm font-medium text-highlighted">
                      {{ searchPanelTitle }}
                    </p>
                    <span class="text-xs text-toned">
                      {{ searchPanelItems.length }} suggestion(s)
                    </span>
                  </div>

                  <div v-if="intakeQuery.trim().length < minSearchLength" class="rounded-xl border border-dashed border-default px-4 py-5 text-sm text-toned">
                    Tapez au moins {{ minSearchLength }} caractères.
                  </div>

                  <div v-else-if="searchPanelItems.length" class="max-h-[18rem] space-y-1 overflow-y-auto pr-1">
                    <button
                      v-for="(suggestion, index) in searchPanelItems"
                      :key="suggestion.id"
                      type="button"
                      class="flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left transition"
                      :class="index === highlightedSuggestionIndex
                        ? 'bg-primary/8 ring-1 ring-primary/20'
                        : 'hover:bg-muted/60'"
                      @mouseenter="highlightedSuggestionIndex = index"
                      @click="applyCatalogSuggestion(suggestion)"
                    >
                      <div class="min-w-0">
                        <p class="truncate text-sm font-medium text-highlighted">
                          {{ suggestion.name }}
                        </p>
                        <p class="truncate text-xs text-toned">
                          {{ suggestion.model || suggestion.category }} · {{ suggestion.serviceKind || 'Prestation atelier' }}
                        </p>
                      </div>
                      <span class="shrink-0 text-sm font-medium text-highlighted">
                        {{ formatCurrency(suggestion.defaultPrice) }}
                      </span>
                    </button>
                  </div>

                  <div v-else-if="remoteSuggestionsPending" class="rounded-xl border border-dashed border-default px-4 py-5 text-sm text-toned">
                    Recherche dans le catalogue...
                  </div>

                  <div v-else class="rounded-xl border border-dashed border-default px-4 py-5 text-sm text-toned">
                    Aucune suggestion trouvée pour cette saisie.
                  </div>
                </div>
              </div>
            </div>
          </UCard>

          <UCard
            variant="subtle"
            :ui="{
              root: 'rounded-[1.5rem] border border-default/70 shadow-sm',
              body: 'space-y-3 p-3'
            }"
          >
            <div class="flex items-center justify-between gap-2">
              <h2 class="text-sm font-semibold text-highlighted">
                Appareil
              </h2>
            </div>

            <div class="space-y-3">
              <UFormField label="Code / accès appareil" name="accessCode">
                <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <UInput
                    v-model="state.accessCode"
                    class="w-full"
                    placeholder="PIN, mot de passe ou pattern"
                  />
                  <UButton
                    type="button"
                    icon="i-lucide-grid-3x3"
                    label="Pattern"
                    color="neutral"
                    variant="soft"
                    size="sm"
                    tabindex="-1"
                    class="justify-center"
                    @click="patternOpen = true"
                  />
                </div>
              </UFormField>

              <UFormField label="Code SIM" name="simCode">
                <UInput v-model="state.simCode" class="w-full" placeholder="PIN SIM" />
              </UFormField>
            </div>
          </UCard>
        </div>

        <UTabs
          v-model="intakeSection"
          :items="intakeSectionTabs"
          variant="link"
          :content="false"
          class="w-full"
          :ui="{
            list: 'w-full border-b border-default',
            trigger: 'grow justify-center sm:grow-0'
          }"
        />

        <PosDocumentLinesEditor
          v-if="intakeSection === 'lines'"
          :editor="lineEditor"
          :catalog-items="catalogItems || []"
          mode="ticket"
        />

        <UCard
          v-if="intakeSection === 'details'"
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
                Détails du ticket
              </h2>
            </div>
          </template>

          <div class="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(18rem,1fr)]">
            <UFormField
              label="Description de la panne"
              name="issueDescription"
              required
            >
              <UInput
                v-model="state.issueDescription"
                class="w-full"
                placeholder="Ex. écran fissuré, batterie faible, port de charge endommagé..."
              />
            </UFormField>

            <UFormField label="IMEI" name="imei">
              <div class="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                <UInput
                  :model-value="state.imei"
                  class="w-full tabular-nums"
                  placeholder="356 789 123 456 789"
                  inputmode="numeric"
                  @update:model-value="handleImeiInput"
                />
                <PosBarcodeScanner
                  title="Scanner IMEI"
                  description="Scannez le code-barres IMEI situé sur l'appareil ou son emballage."
                  trigger-aria-label="Scanner IMEI"
                  @scanned="handleImeiScan"
                />
              </div>
            </UFormField>
          </div>

          <p v-if="imeiWarning" class="text-xs text-warning">
            {{ imeiWarning }}
          </p>

          <div class="grid gap-3 md:grid-cols-3">
            <UFormField label="Type de ticket" name="type" required>
              <USelect
                v-model="state.type"
                :items="ticketTypeItems"
                value-key="value"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Statut initial" name="status" required>
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
          </div>

          <div class="grid gap-3 md:grid-cols-3">
            <UFormField label="Marque" name="brand">
              <UInput v-model="state.brand" class="w-full" placeholder="Apple" />
            </UFormField>

            <UFormField label="Modèle" name="model">
              <UInput v-model="state.model" class="w-full" placeholder="iPhone 14" />
            </UFormField>

            <UFormField label="Numéro de série" name="serialNumber">
              <UInput v-model="state.serialNumber" class="w-full" placeholder="N° de série" />
            </UFormField>
          </div>

          <UFormField label="Notes internes" name="internalNotes">
            <UTextarea
              v-model="state.internalNotes"
              class="w-full"
              :rows="2"
              autoresize
              placeholder="Notes atelier, pièces à prévoir..."
            />
          </UFormField>
        </UCard>
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
            <div class="space-y-1">
              <div class="flex gap-2">
                <UInput
                  :model-value="state.imei"
                  class="flex-1"
                  placeholder="356 789 123 456 789"
                  inputmode="numeric"
                  @update:model-value="handleImeiInput"
                />
                <PosBarcodeScanner
                  title="Scanner IMEI / N° de série"
                  description="Scannez le code-barres IMEI situé sur l'appareil ou son emballage."
                  trigger-aria-label="Scanner IMEI"
                  @scanned="handleImeiScan"
                />
              </div>
              <p v-if="imeiWarning" class="text-xs text-warning">
                {{ imeiWarning }}
              </p>
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
                tabindex="-1"
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
          <div class="space-y-1">
            <div class="flex gap-2">
              <UInput
                :model-value="state.imei"
                class="flex-1"
                placeholder="356 789 123 456 789"
                inputmode="numeric"
                @update:model-value="handleImeiInput"
              />
              <PosBarcodeScanner
                title="Scanner IMEI / N° de série"
                description="Scannez le code-barres IMEI situé sur l'appareil ou son emballage."
                trigger-aria-label="Scanner IMEI"
                @scanned="handleImeiScan"
              />
            </div>
            <p v-if="imeiWarning" class="text-xs text-warning">
              {{ imeiWarning }}
            </p>
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
              tabindex="-1"
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

      <PosDocumentLinesEditor
        :editor="lineEditor"
        :catalog-items="catalogItems || []"
        mode="ticket"
      />
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
