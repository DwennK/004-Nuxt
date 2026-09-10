<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent, TabsItem } from '@nuxt/ui'
import { ticketStatusLabels, ticketStatuses, ticketTypeLabels, ticketTypes } from '~~/shared/constants/pos'
import { ticketStatusTransitions } from '~~/shared/domain/tickets/workflow'
import type { CatalogItemRecord, CustomerRecord } from '~~/shared/types/pos'
import { formatImei, getImeiWarning, normalizeImei } from '~~/shared/utils/pos'
import { useCommercialLinesDraft, type EditableCommercialLinePayload } from '~~/app/composables/useCommercialLinesDraft'
import { ticketInputSchema } from '~~/shared/validation/pos'

const props = withDefaults(defineProps<{
  customers: CustomerRecord[]
  catalogItems?: CatalogItemRecord[]
  initialValue?: Partial<{
    id: number
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
  unsavedTarget?: string
  formId?: string
  layout?: 'compact' | 'page' | 'intake'
  showSubmit?: boolean
  disabled?: boolean
  saving?: boolean
  saveError?: string | null
  submitLabel?: string
}>(), {
  catalogItems: () => [],
  initialValue: () => ({}),
  formId: undefined,
  layout: 'compact',
  showSubmit: true,
  submitLabel: 'Enregistrer le dossier'
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
  customerId: ticketInputSchema.shape.customerId,
  type: z.enum(ticketTypes),
  status: z.enum(ticketStatuses),
  brand: z.string().optional().default(''),
  model: z.string().optional().default(''),
  serialNumber: z.string().optional().default(''),
  imei: z.string().optional().default(''),
  accessCode: z.string().optional().default(''),
  simCode: z.string().optional().default(''),
  issueDescription: z.string().trim().optional().default(''),
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

const statusItems = computed(() => {
  const initialStatus = props.initialValue.status
  const allowedStatuses: Array<(typeof ticketStatuses)[number]> = initialStatus
    ? [initialStatus, ...ticketStatusTransitions[initialStatus]]
    : ['new']

  return allowedStatuses.map(status => ({
    label: ticketStatusLabels[status],
    value: status
  }))
})

const intakeSection = ref<'lines' | 'details'>('lines')
const intakeSectionTabs: TabsItem[] = [
  { label: 'Prestations et articles', value: 'lines' },
  { label: 'Détails', value: 'details' }
]

const patternOpen = ref(false)
watch(() => props.disabled, (disabled) => {
  if (disabled) patternOpen.value = false
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
  lineIdPrefix: 'ticket-line',
  draftKey: computed(() => props.initialValue.id)
})

const ticketDraftBaseline = ref('')
let ticketDraftOwner: number | undefined
let ticketDraftInitialized = false
watch(() => props.initialValue, () => {
  const nextOwner = props.initialValue.id
  if (ticketDraftInitialized && nextOwner === ticketDraftOwner && JSON.stringify(state) !== ticketDraftBaseline.value) return
  ticketDraftInitialized = true
  ticketDraftOwner = nextOwner
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
  ticketDraftBaseline.value = JSON.stringify(state)
}, { immediate: true, deep: true })

const dirty = defineModel<boolean>('dirty', { default: false })
const draftSnapshot = computed(() => JSON.stringify({ ...state, lines: lineEditor.state.lines }, null, 2))
watch(() => JSON.stringify(state) !== ticketDraftBaseline.value || lineEditor.isDirty.value, (value) => {
  dirty.value = value
}, { immediate: true, flush: 'sync' })

const imeiWarning = computed(() => getImeiWarning(state.imei))

function handleCatalogItemAdded(item: CatalogItemRecord) {
  if (item.type !== 'repair' && item.type !== 'service') return

  if (!state.brand.trim()) state.brand = item.brand || ''
  if (!state.model.trim()) state.model = item.model || ''
}

function onSubmit(event: FormSubmitEvent<Schema>) {
  if (props.saving || props.disabled) return
  const lines = lineEditor.serializeLines().filter((line) => {
    return line.catalogItemId !== null
      || Boolean(line.label.trim())
      || line.quantity !== 1
      || line.unitPrice !== 0
      || line.vatRate !== 8.1
      || line.categoryHint !== null
  })

  emit('save', {
    ...event.data,
    type: event.data.type,
    imei: normalizeImei(event.data.imei) || '',
    openedAt: new Date(event.data.openedAt).toISOString(),
    closedAt: event.data.closedAt ? new Date(event.data.closedAt).toISOString() : '',
    lines
  })
}

function applyPattern(patternText: string) {
  if (props.disabled) return
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
</script>

<template>
  <UForm
    :id="formId"
    :schema="schema"
    :disabled="props.saving || props.disabled"
    :aria-busy="props.saving"
    :state="state"
    :class="props.layout === 'page' ? 'space-y-4' : props.layout === 'intake' ? 'space-y-4' : 'space-y-5'"
    @submit="onSubmit"
  >
    <fieldset :disabled="props.saving || props.disabled" class="min-w-0 space-y-4">
      <template v-if="props.layout === 'intake'">
        <div class="space-y-3">
          <div class="grid gap-3 xl:grid-cols-[minmax(0,1.25fr)_minmax(24rem,0.9fr)]">
            <UCard
              variant="soft"
              :ui="{
                root: 'overflow-visible rounded-md border border-default bg-elevated shadow-none',
                body: 'space-y-3 p-3 sm:p-3'
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

                <UFormField label="Problème signalé" name="issueDescription" hint="Facultatif">
                  <UTextarea
                    v-model="state.issueDescription"
                    class="w-full"
                    :rows="2"
                    :maxrows="4"
                    autoresize
                    placeholder="Ex. écran cassé après une chute, tactile encore fonctionnel."
                  />
                </UFormField>
              </div>
            </UCard>

            <UCard
              variant="soft"
              :ui="{
                root: 'rounded-md border border-default bg-elevated shadow-none',
                body: 'space-y-3 p-3 sm:p-3'
              }"
            >
              <div class="flex items-center justify-between gap-2">
                <h2 class="text-sm font-semibold text-highlighted">
                  Appareil
                </h2>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <UFormField label="Marque" name="brand">
                  <UInput v-model="state.brand" class="w-full" placeholder="Apple" />
                </UFormField>
                <UFormField label="Modèle" name="model">
                  <UInput v-model="state.model" class="w-full" placeholder="iPhone 14" />
                </UFormField>
              </div>

              <div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_8rem]">
                <UFormField label="Code / accès appareil" name="accessCode">
                  <div class="flex items-center gap-2">
                    <UInput
                      v-model="state.accessCode"
                      class="min-w-0 flex-1"
                      placeholder="PIN ou mot de passe"
                    />
                    <UButton
                      type="button"
                      icon="i-lucide-grid-3x3"
                      label="Pattern"
                      color="neutral"
                      variant="soft"
                      size="sm"
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
            @catalog-item-added="handleCatalogItemAdded"
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
                  Détails du dossier
                </h2>
              </div>
            </template>

            <div class="grid gap-3 md:grid-cols-2">
              <UFormField label="Numéro de série" name="serialNumber">
                <UInput v-model="state.serialNumber" class="w-full" placeholder="N° de série" />
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
              <UFormField label="Type de dossier" name="type" required>
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
          description="Associez le dossier au bon client et définissez son cadre opérationnel."
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
              label="Type de dossier"
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
            description="Visible dans le suivi opérateur, si renseignée."
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

          <UFormField label="Type de dossier" name="type" required>
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

        <UFormField label="Description du problème" name="issueDescription">
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

      <PosFormFeedback :saving="props.saving" :error="props.saveError" />

      <div v-if="props.showSubmit && props.layout !== 'intake'" class="flex flex-wrap items-center justify-end gap-2">
        <PosUnsavedChanges
          v-if="!props.unsavedTarget"
          :dirty="dirty"
          :snapshot="draftSnapshot"
          :saving="props.saving"
        />
        <UButton
          type="submit"
          :label="props.saving ? 'Enregistrement…' : props.submitLabel"
          :loading="props.saving"
          icon="i-lucide-save"
        />
      </div>
    </fieldset>
    <PosUnsavedChanges
      v-if="props.unsavedTarget"
      :to="props.unsavedTarget"
      :dirty="dirty"
      :snapshot="draftSnapshot"
      :saving="props.saving"
    />
  </UForm>

  <PosAndroidPatternSlideover
    v-model:open="patternOpen"
    :model-value="state.accessCode"
    @save="applyPattern"
  />
</template>
