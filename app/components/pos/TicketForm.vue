<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { ticketStatusColors, ticketStatusLabels, ticketStatuses, ticketTypeColors, ticketTypeLabels, ticketTypes } from '~~/shared/constants/pos'
import type { CustomerRecord } from '~~/shared/types/pos'

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

const deviceSummary = computed(() => {
  const value = [state.brand.trim(), state.model.trim()].filter(Boolean).join(' ')
  return value || 'Appareil à préciser'
})

const openedAtSummary = computed(() => {
  if (!state.openedAt) {
    return 'À définir'
  }

  const date = new Date(state.openedAt)

  if (Number.isNaN(date.getTime())) {
    return 'À définir'
  }

  return new Intl.DateTimeFormat('fr-CH', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(date)
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
      label: 'Accès',
      done: Boolean(state.accessCode.trim() || state.simCode.trim()),
      value: state.accessCode.trim() || state.simCode.trim() || 'Aucun code renseigné'
    }
  ]
})

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
</script>

<template>
  <UForm
    :id="formId"
    :schema="schema"
    :state="state"
    :class="props.layout === 'page' ? 'space-y-4' : 'space-y-5'"
    @submit="onSubmit"
  >
    <template v-if="props.layout === 'intake'">
      <div class="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-6">
        <div class="space-y-5">
          <UCard
            variant="subtle"
            :ui="{
              root: 'rounded-3xl',
              body: 'space-y-5 p-4 sm:p-5',
              header: 'p-4 pb-0 sm:p-5 sm:pb-0'
            }"
          >
            <template #header>
              <div class="space-y-1">
                <div class="flex flex-wrap items-center gap-2">
                  <h2 class="text-base font-semibold text-highlighted">
                    Client et suivi
                  </h2>
                  <UBadge color="neutral" variant="subtle" size="sm">
                    Ticket atelier
                  </UBadge>
                </div>
                <p class="text-sm text-toned">
                  Associez le bon client et posez le cadre de traitement dès l’arrivée.
                </p>
              </div>
            </template>

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

            <div class="grid gap-4 md:grid-cols-3">
              <UFormField label="Type" name="type" required>
                <USelect
                  v-model="state.type"
                  :items="ticketTypeItems"
                  value-key="value"
                  class="w-full"
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
          </UCard>

          <UCard
            variant="subtle"
            :ui="{
              root: 'rounded-3xl',
              body: 'space-y-4 p-4 sm:p-5',
              header: 'p-4 pb-0 sm:p-5 sm:pb-0'
            }"
          >
            <template #header>
              <div class="space-y-1">
                <h2 class="text-base font-semibold text-highlighted">
                  Appareil
                </h2>
                <p class="text-sm text-toned">
                  Identifiez le téléphone avant le diagnostic ou la commande de pièces.
                </p>
              </div>
            </template>

            <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <UFormField label="Marque" name="brand" hint="Optionnel">
                <UInput v-model="state.brand" class="w-full" placeholder="Apple, Samsung..." />
              </UFormField>

              <UFormField label="Modèle" name="model" hint="Optionnel">
                <UInput v-model="state.model" class="w-full" placeholder="iPhone 14, Galaxy S23..." />
              </UFormField>

              <UFormField label="IMEI" name="imei" hint="Optionnel">
                <UInput v-model="state.imei" class="w-full" placeholder="356..." />
              </UFormField>

              <UFormField label="N° de série" name="serialNumber" hint="Optionnel">
                <UInput v-model="state.serialNumber" class="w-full" placeholder="Numéro de série" />
              </UFormField>
            </div>
          </UCard>

          <UCard
            variant="subtle"
            :ui="{
              root: 'rounded-3xl',
              body: 'space-y-4 p-4 sm:p-5',
              header: 'p-4 pb-0 sm:p-5 sm:pb-0'
            }"
          >
            <template #header>
              <div class="flex flex-wrap items-start justify-between gap-3">
                <div class="space-y-1">
                  <h2 class="text-base font-semibold text-highlighted">
                    Accès
                  </h2>
                  <p class="text-sm text-toned">
                    Notez le code d’ouverture si le client l’accepte, ou dessinez le pattern Android.
                  </p>
                </div>

                <UButton
                  type="button"
                  label="Pattern Android"
                  icon="i-lucide-grid-3x3"
                  color="neutral"
                  variant="soft"
                  size="sm"
                  @click="patternOpen = true"
                />
              </div>
            </template>

            <div class="grid gap-4 md:grid-cols-[minmax(0,1fr)_16rem]">
              <UFormField label="Code / accès appareil" name="accessCode" hint="Optionnel">
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
          </UCard>

          <UCard
            variant="subtle"
            :ui="{
              root: 'rounded-3xl',
              body: 'space-y-4 p-4 sm:p-5',
              header: 'p-4 pb-0 sm:p-5 sm:pb-0'
            }"
          >
            <template #header>
              <div class="space-y-1">
                <h2 class="text-base font-semibold text-highlighted">
                  Intervention
                </h2>
                <p class="text-sm text-toned">
                  Décrivez le symptôme client puis gardez les remarques atelier en dessous.
                </p>
              </div>
            </template>

            <UFormField
              label="Problème constaté"
              name="issueDescription"
              required
            >
              <UTextarea
                v-model="state.issueDescription"
                class="w-full"
                :rows="5"
                placeholder="Ex. écran fissuré, Face ID inactif, batterie qui chauffe..."
              />
            </UFormField>

            <UFormField
              label="Notes internes"
              name="internalNotes"
              hint="Optionnel"
            >
              <UTextarea
                v-model="state.internalNotes"
                class="w-full"
                :rows="4"
                placeholder="Diagnostic initial, accessoires laissés, pièces à commander..."
              />
            </UFormField>
          </UCard>
        </div>

        <div class="lg:sticky lg:top-4">
          <UCard
            variant="subtle"
            :ui="{
              root: 'rounded-3xl shadow-sm',
              body: 'space-y-5 p-4 sm:p-5',
              header: 'p-4 pb-0 sm:p-5 sm:pb-0',
              footer: 'p-4 pt-0 sm:p-5 sm:pt-0'
            }"
          >
            <template #header>
              <div class="space-y-3">
                <div class="flex flex-wrap items-center gap-2">
                  <UBadge :color="ticketTypeColors[state.type]" variant="subtle">
                    {{ ticketTypeLabels[state.type] }}
                  </UBadge>
                  <UBadge :color="ticketStatusColors[state.status]" variant="subtle">
                    {{ ticketStatusLabels[state.status] }}
                  </UBadge>
                </div>

                <div>
                  <h2 class="text-lg font-semibold text-highlighted">
                    Prêt à créer
                  </h2>
                  <p class="text-sm text-toned">
                    Le ticket reste sous vos yeux pendant toute la saisie.
                  </p>
                </div>
              </div>
            </template>

            <div class="space-y-3">
              <div class="rounded-2xl border border-default bg-default/70 p-4">
                <p class="text-xs uppercase tracking-[0.14em] text-toned">
                  Client
                </p>
                <p class="mt-1 text-sm font-medium text-highlighted">
                  {{ currentCustomer?.displayName || 'Aucun client sélectionné' }}
                </p>
                <p v-if="currentCustomer?.phone || currentCustomer?.email" class="mt-1 text-xs text-toned">
                  {{ [currentCustomer?.phone, currentCustomer?.email].filter(Boolean).join(' · ') }}
                </p>
              </div>

              <div class="rounded-2xl border border-default bg-default/70 p-4">
                <p class="text-xs uppercase tracking-[0.14em] text-toned">
                  Appareil
                </p>
                <p class="mt-1 text-sm font-medium text-highlighted">
                  {{ deviceSummary }}
                </p>
                <p class="mt-1 text-xs text-toned">
                  {{ state.imei.trim() || state.serialNumber.trim() || 'Sans IMEI ni numéro de série pour l’instant' }}
                </p>
              </div>

              <div class="rounded-2xl border border-default bg-default/70 p-4">
                <p class="text-xs uppercase tracking-[0.14em] text-toned">
                  Entrée atelier
                </p>
                <p class="mt-1 text-sm font-medium text-highlighted">
                  {{ openedAtSummary }}
                </p>
              </div>
            </div>

            <div class="space-y-2">
              <div
                v-for="item in completionItems"
                :key="item.label"
                class="flex items-start gap-3 rounded-2xl border border-default/80 bg-muted/20 px-3 py-2.5"
              >
                <div
                  class="mt-0.5 flex size-5 items-center justify-center rounded-full"
                  :class="item.done ? 'bg-success/12 text-success' : 'bg-neutral/12 text-toned'"
                >
                  <UIcon :name="item.done ? 'i-lucide-check' : 'i-lucide-dot'" class="size-3.5" />
                </div>
                <div class="min-w-0">
                  <p class="text-sm font-medium text-highlighted">
                    {{ item.label }}
                  </p>
                  <p class="truncate text-xs text-toned">
                    {{ item.value }}
                  </p>
                </div>
              </div>
            </div>

            <template #footer>
              <div class="space-y-3">
                <UButton
                  v-if="props.showSubmit"
                  type="submit"
                  :label="props.submitLabel"
                  icon="i-lucide-save"
                  size="xl"
                  class="w-full justify-center"
                />

                <UButton
                  type="button"
                  label="Dessiner un pattern Android"
                  icon="i-lucide-grid-3x3"
                  color="neutral"
                  variant="soft"
                  class="w-full justify-center"
                  @click="patternOpen = true"
                />
              </div>
            </template>
          </UCard>
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
            <UInput v-model="state.imei" class="w-full" />
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
          <UInput v-model="state.imei" class="w-full" />
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
