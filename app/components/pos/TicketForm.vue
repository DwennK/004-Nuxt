<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { ticketStatusColors, ticketStatusLabels, ticketStatuses, ticketTypeColors, ticketTypeLabels, ticketTypes } from '~~/shared/constants/pos'
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
  if (!value) {
    return new Date().toISOString().slice(0, 16)
  }

  return new Date(value).toISOString().slice(0, 16)
}

const ticketTypeItems = ticketTypes.map(type => ({
  label: ticketTypeLabels[type],
  value: type
}))

const statusItems = ticketStatuses.map(status => ({
  label: ticketStatusLabels[status],
  value: status
}))

const patternOpen = ref(false)
const advancedOpen = ref(false)
const intakeQuery = ref('')
const createdCustomer = ref<CustomerRecord | null>(null)

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
  state.type = props.initialValue.type || 'repair'
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
    return suggestedRepairMatches.value.map(suggestion => ({
      key: `${suggestion.model}-${suggestion.issueKey}`,
      label: `${suggestion.model} · ${suggestion.issueLabel}`,
      action: () => applyRepairSuggestion(suggestion)
    }))
  }

  return defaultRepairSearches.map(search => ({
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

const completionItems = computed(() => {
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
    },
    {
      label: 'Accès',
      done: Boolean(state.accessCode.trim() || state.simCode.trim()),
      value: state.accessCode.trim() || state.simCode.trim() || 'Aucun code renseigné'
    }
  ]
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

function onSubmit(event: FormSubmitEvent<Schema>) {
  emit('save', {
    ...event.data,
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

  if (!advancedOpen.value && props.layout === 'intake') {
    advancedOpen.value = true
  }
}

function applyRepairSuggestion(suggestion: RepairSuggestion) {
  intakeQuery.value = `${suggestion.model} ${suggestion.issueLabel}`
  state.brand = suggestion.brand
  state.model = suggestion.model
  state.type = 'repair'
  state.issueDescription = suggestion.issueLabel
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
      <div class="space-y-4">
        <UCard
          variant="subtle"
          :ui="{
            root: 'rounded-[2rem] shadow-sm',
            body: 'space-y-4 p-4 sm:p-4',
            header: 'p-4 pb-0 sm:p-4 sm:pb-0'
          }"
        >
          <template #header>
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-base font-semibold text-highlighted">
                    Saisie comptoir
                  </h2>
                  <UBadge color="warning" variant="subtle" size="sm">
                    Réparation rapide
                  </UBadge>
                  <UBadge :color="ticketStatusColors[state.status]" variant="soft" size="sm">
                    {{ ticketStatusLabels[state.status] }}
                  </UBadge>
                </div>
                <p class="text-sm text-toned">
                  Modèle + panne, puis client. Le reste vient après si nécessaire.
                </p>
              </div>

              <div class="flex flex-wrap gap-2">
                <UButton
                  type="button"
                  label="Pattern"
                  icon="i-lucide-grid-3x3"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  @click="patternOpen = true"
                />
                <UButton
                  type="button"
                  :label="advancedOpen ? 'Masquer avancé' : 'Afficher avancé'"
                  :icon="advancedOpen ? 'i-lucide-chevrons-up-down' : 'i-lucide-sliders-horizontal'"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  @click="advancedOpen = !advancedOpen"
                />
              </div>
            </div>
          </template>

          <UFormField
            label="Saisie rapide"
            name="intakeQuery"
            hint="Ex. iphone 14 ecran, s23 ultra batterie, iphone 15 port charge"
          >
            <UInput
              v-model="intakeQuery"
              icon="i-lucide-scan-search"
              size="xl"
              class="w-full"
              placeholder="iphone 14 ecran"
              autofocus
            />
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

          <div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_15rem]">
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
                  :rows="2"
                  autoresize
                  placeholder="Ex. écran fissuré, batterie faible, port de charge endommagé..."
                />
              </UFormField>
            </div>

            <div class="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
              <p class="text-[11px] uppercase tracking-[0.16em] text-primary/80">
                Prix suggéré
              </p>
              <p class="mt-2 text-2xl font-semibold text-highlighted">
                {{ quotedPrice }}
              </p>
              <p class="mt-1 text-sm text-toned">
                {{ bestRepairSuggestion?.issueLabel || 'Aucune suggestion fiable pour cette saisie.' }}
              </p>
              <p v-if="bestRepairSuggestion" class="mt-2 text-xs text-toned">
                {{ bestRepairSuggestion.model }} · {{ bestRepairSuggestion.brand }}
              </p>
            </div>
          </div>

          <div class="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_11rem_13rem]">
            <UFormField
              label="Client"
              name="customerId"
              required
            >
              <PosCustomerSelectField
                :model-value="state.customerId || null"
                :customers="props.customers"
                placeholder="Rechercher ou créer un client"
                @update:model-value="setCustomer"
                @created="handleCustomerCreated"
              />
            </UFormField>

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
          </div>

          <div
            v-if="advancedOpen"
            class="space-y-3 rounded-2xl border border-default/80 bg-muted/20 p-4"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="text-sm font-medium text-highlighted">
                  Champs avancés
                </h3>
                <p class="text-xs text-toned">
                  À ouvrir seulement pour IMEI, accès, notes ou diagnostic détaillé.
                </p>
              </div>
            </div>

            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              <UFormField label="Type" name="type" required>
                <USelect
                  v-model="state.type"
                  :items="ticketTypeItems"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>

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

              <UFormField label="Code SIM" name="simCode" hint="Optionnel">
                <UInput v-model="state.simCode" class="w-full" placeholder="PIN SIM" />
              </UFormField>
            </div>

            <div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_18rem]">
              <UFormField label="Code / accès appareil" name="accessCode" hint="Optionnel">
                <UInput
                  v-model="state.accessCode"
                  class="w-full"
                  placeholder="PIN, mot de passe ou Pattern 1-2-3-6-9"
                />
              </UFormField>

              <div class="rounded-xl border border-default bg-default/70 px-3 py-2.5">
                <p class="text-[11px] uppercase tracking-[0.14em] text-toned">
                  Saisie rapide
                </p>
                <p class="mt-1 text-xs text-toned">
                  IMEI scanné ou pattern Android si nécessaire.
                </p>
              </div>
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
          </div>
        </UCard>

        <div class="sticky bottom-3 z-10">
          <div class="rounded-2xl border border-default bg-default/95 p-3 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-default/80">
            <div class="flex flex-col gap-3 xl:flex-row xl:items-center">
              <div class="flex flex-wrap items-center gap-2 xl:min-w-[19rem]">
                <UBadge :color="ticketTypeColors[state.type]" variant="subtle">
                  {{ ticketTypeLabels[state.type] }}
                </UBadge>
                <UBadge :color="ticketStatusColors[state.status]" variant="subtle">
                  {{ ticketStatusLabels[state.status] }}
                </UBadge>
                <span class="text-xs text-toned">
                  {{ currentCustomer?.displayName || 'Client à sélectionner' }}
                </span>
                <span class="text-xs text-toned">
                  {{ bestRepairSuggestion ? quotedPrice : 'Tarif à confirmer' }}
                </span>
              </div>

              <div class="grid flex-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <div
                  v-for="item in completionItems"
                  :key="item.label"
                  class="flex items-center gap-2 rounded-xl border border-default/80 bg-default/70 px-2.5 py-2"
                >
                  <div
                    class="flex size-4 items-center justify-center rounded-full"
                    :class="item.done ? 'bg-success/12 text-success' : 'bg-neutral/12 text-toned'"
                  >
                    <UIcon :name="item.done ? 'i-lucide-check' : 'i-lucide-dot'" class="size-3" />
                  </div>
                  <div class="min-w-0">
                    <p class="text-[11px] font-medium text-highlighted">
                      {{ item.label }}
                    </p>
                    <p class="truncate text-[11px] text-toned">
                      {{ item.value }}
                    </p>
                  </div>
                </div>
              </div>

              <UButton
                v-if="props.showSubmit"
                type="submit"
                :label="props.submitLabel"
                icon="i-lucide-save"
                size="xl"
                class="w-full justify-center xl:w-auto xl:min-w-52"
              />
            </div>
          </div>
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
