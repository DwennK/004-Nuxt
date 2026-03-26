<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { CustomerFormValue, CustomerUpsertInput } from '~~/shared/types/pos'

const props = withDefaults(defineProps<{
  initialValue?: Partial<CustomerUpsertInput>
  formId?: string
  layout?: 'compact' | 'page'
  mode?: 'quick' | 'full'
  showSubmit?: boolean
  submitLabel?: string
}>(), {
  initialValue: () => ({}),
  formId: undefined,
  layout: 'compact',
  mode: 'full',
  showSubmit: true,
  submitLabel: 'Enregistrer le client'
})

const emit = defineEmits<{
  save: [payload: CustomerFormValue]
}>()

const optionalText = z.string().optional().default('')
const optionalEmail = z.string().trim().optional().default('').refine((value) => {
  if (!value) {
    return true
  }

  return z.email().safeParse(value).success
}, 'Un e-mail valide est obligatoire')

const baseSchema = z.object({
  displayName: z.string().optional().default(''),
  firstName: optionalText,
  lastName: optionalText,
  companyName: optionalText,
  phone: optionalText,
  email: optionalEmail,
  addressLine1: optionalText,
  addressLine2: optionalText,
  postalCode: optionalText,
  city: optionalText,
  notes: optionalText
})

const quickSchema = baseSchema.superRefine((value, ctx) => {
  if (!value.displayName.trim() && !value.companyName.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['displayName'],
      message: 'Le nom du client ou de la société est obligatoire'
    })
  }
})

const fullSchema = baseSchema.superRefine((value, ctx) => {
  if (!value.displayName.trim() && !value.companyName.trim() && !value.firstName.trim() && !value.lastName.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['firstName'],
      message: 'Renseignez un nom de client ou une société'
    })
  }
})

const schema = computed(() => props.mode === 'quick' ? quickSchema : fullSchema)

const state = reactive<CustomerFormValue>({
  displayName: '',
  firstName: '',
  lastName: '',
  companyName: '',
  phone: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  postalCode: '',
  city: '',
  notes: ''
})

watchEffect(() => {
  const displayName = props.initialValue.displayName
    || [props.initialValue.firstName, props.initialValue.lastName].filter(Boolean).join(' ').trim()
    || ''

  state.displayName = displayName
  state.firstName = props.initialValue.firstName || ''
  state.lastName = props.initialValue.lastName || ''
  state.companyName = props.initialValue.companyName || ''
  state.phone = props.initialValue.phone || ''
  state.email = props.initialValue.email || ''
  state.addressLine1 = props.initialValue.addressLine1 || ''
  state.addressLine2 = props.initialValue.addressLine2 || ''
  state.postalCode = props.initialValue.postalCode || ''
  state.city = props.initialValue.city || ''
  state.notes = props.initialValue.notes || ''
})

function onSubmit(_event: FormSubmitEvent<CustomerFormValue>) {
  emit('save', {
    ...state,
    displayName: state.displayName.trim(),
    firstName: state.firstName.trim(),
    lastName: state.lastName.trim(),
    companyName: state.companyName.trim(),
    phone: state.phone.trim(),
    email: state.email.trim(),
    addressLine1: state.addressLine1.trim(),
    addressLine2: state.addressLine2.trim(),
    postalCode: state.postalCode.trim(),
    city: state.city.trim(),
    notes: state.notes.trim()
  })
}
</script>

<template>
  <UForm
    :id="formId"
    :schema="schema"
    :state="state"
    :class="props.mode === 'quick' ? 'space-y-5' : props.layout === 'page' ? 'space-y-4' : 'space-y-5'"
    @submit="onSubmit"
  >
    <template v-if="props.mode === 'quick'">
      <div class="space-y-5">
        <UFormField
          label="Nom du client"
          name="displayName"
          description="Nom du client ou de la société si vous allez au plus vite."
        >
          <UInput
            v-model="state.displayName"
            class="w-full"
            placeholder="Ex. Jean Martin ou Atelier Pixel"
            autofocus
          />
        </UFormField>

        <div class="grid gap-4 md:grid-cols-2">
          <UFormField
            label="Téléphone"
            name="phone"
            hint="Optionnel"
            description="Si le client accepte de le donner."
          >
            <UInput v-model="state.phone" class="w-full" placeholder="+41 ..." />
          </UFormField>

          <UFormField
            label="E-mail"
            name="email"
            hint="Optionnel"
            description="Pratique pour les devis et factures."
          >
            <UInput
              v-model="state.email"
              type="email"
              class="w-full"
              placeholder="client@example.ch"
            />
          </UFormField>
        </div>

        <UFormField
          label="Société"
          name="companyName"
          hint="Optionnel"
          description="Utile si vous facturez une entreprise ou un indépendant."
        >
          <UInput v-model="state.companyName" class="w-full" placeholder="Nom de la société" />
        </UFormField>
      </div>
    </template>

    <template v-else-if="props.layout === 'page'">
      <UPageCard
        title="Identité"
        description="Créez une fiche claire pour retrouver le client rapidement dans les tickets, documents et paiements."
        variant="subtle"
      >
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField
            label="Prénom"
            name="firstName"
            description="Optionnel si vous utilisez surtout la société ou un nom d’affichage."
          >
            <UInput v-model="state.firstName" class="w-full" />
          </UFormField>

          <UFormField
            label="Nom"
            name="lastName"
            description="Peut rester vide si la société est la référence principale."
          >
            <UInput v-model="state.lastName" class="w-full" />
          </UFormField>
        </div>
        <USeparator />
        <UFormField
          label="Société"
          name="companyName"
          description="Pratique pour les comptes professionnels ou si le client préfère n’utiliser que ce repère."
          hint="Optionnel"
          orientation="horizontal"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput v-model="state.companyName" class="w-full lg:max-w-sm" />
        </UFormField>
      </UPageCard>

      <UPageCard
        title="Coordonnées"
        description="À renseigner seulement si le client accepte de partager ses coordonnées."
        variant="subtle"
      >
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField
            label="Téléphone"
            name="phone"
            description="Numéro principal pour les validations et retraits."
            hint="Optionnel"
          >
            <UInput v-model="state.phone" class="w-full" />
          </UFormField>

          <UFormField
            label="E-mail"
            name="email"
            description="Adresse utile pour devis, factures et suivi."
            hint="Optionnel"
          >
            <UInput v-model="state.email" type="email" class="w-full" />
          </UFormField>
        </div>
        <USeparator />
        <UFormField
          label="Adresse ligne 1"
          name="addressLine1"
          description="Rue et numéro."
          hint="Optionnel"
          orientation="horizontal"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput v-model="state.addressLine1" class="w-full lg:max-w-sm" />
        </UFormField>
        <USeparator />
        <UFormField
          label="Adresse ligne 2"
          name="addressLine2"
          description="Complément d’adresse, étage ou entreprise."
          hint="Optionnel"
          orientation="horizontal"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput v-model="state.addressLine2" class="w-full lg:max-w-sm" />
        </UFormField>
        <USeparator />
        <div class="grid gap-4 md:grid-cols-2">
          <UFormField label="Code postal" name="postalCode" hint="Optionnel">
            <UInput v-model="state.postalCode" class="w-full" />
          </UFormField>

          <UFormField label="Ville" name="city" hint="Optionnel">
            <UInput v-model="state.city" class="w-full" />
          </UFormField>
        </div>
      </UPageCard>

      <UPageCard
        title="Notes"
        description="Conservez des infos de contexte utiles à l’équipe, sans les mettre sur les documents."
        variant="subtle"
      >
        <UFormField label="Notes internes" name="notes" hint="Optionnel">
          <UTextarea v-model="state.notes" class="w-full" :rows="5" />
        </UFormField>
      </UPageCard>
    </template>

    <template v-else>
      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Prénom" name="firstName">
          <UInput v-model="state.firstName" class="w-full" />
        </UFormField>

        <UFormField label="Nom" name="lastName">
          <UInput v-model="state.lastName" class="w-full" />
        </UFormField>
      </div>

      <UFormField label="Société" name="companyName" hint="Optionnel">
        <UInput v-model="state.companyName" class="w-full" />
      </UFormField>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Téléphone" name="phone" hint="Optionnel">
          <UInput v-model="state.phone" class="w-full" />
        </UFormField>

        <UFormField label="E-mail" name="email" hint="Optionnel">
          <UInput v-model="state.email" type="email" class="w-full" />
        </UFormField>
      </div>

      <UFormField label="Adresse ligne 1" name="addressLine1" hint="Optionnel">
        <UInput v-model="state.addressLine1" class="w-full" />
      </UFormField>

      <UFormField label="Adresse ligne 2" name="addressLine2" hint="Optionnel">
        <UInput v-model="state.addressLine2" class="w-full" />
      </UFormField>

      <div class="grid gap-4 md:grid-cols-2">
        <UFormField label="Code postal" name="postalCode" hint="Optionnel">
          <UInput v-model="state.postalCode" class="w-full" />
        </UFormField>

        <UFormField label="Ville" name="city" hint="Optionnel">
          <UInput v-model="state.city" class="w-full" />
        </UFormField>
      </div>

      <UFormField label="Notes" name="notes" hint="Optionnel">
        <UTextarea v-model="state.notes" class="w-full" :rows="5" />
      </UFormField>
    </template>

    <div v-if="props.showSubmit" class="flex justify-end">
      <UButton type="submit" :label="submitLabel" icon="i-lucide-save" />
    </div>
  </UForm>
</template>
