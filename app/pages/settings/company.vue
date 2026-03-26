<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { CompanySettingsRecord } from '~~/shared/types/settings'
import { isValidIban } from '~~/shared/utils/iban'

const fileRef = ref<HTMLInputElement>()
const toast = useToast()

const schema = z.object({
  name: z.string().min(1, 'Le nom de la société est obligatoire'),
  address: z.string().optional().default(''),
  postalCode: z.string().optional().default(''),
  city: z.string().optional().default(''),
  countryCode: z.string().optional().default('CH'),
  phone: z.string().optional().default(''),
  email: z.union([z.string().email('Un e-mail valide est obligatoire'), z.literal('')]).default(''),
  website: z.string().optional().default(''),
  vatNumber: z.string().optional().default(''),
  bankName: z.string().optional().default(''),
  iban: z.union([
    z.literal(''),
    z.string().refine(value => isValidIban(value), 'Un IBAN valide est requis')
  ]).default(''),
  paymentTerms: z.string().optional().default(''),
  footerNotes: z.string().optional().default(''),
  logoDataUrl: z.string().optional().default('')
})

type FormState = z.output<typeof schema>

const { data: company, refresh } = await useFetch<CompanySettingsRecord>('/api/settings/company')

const state = reactive<FormState>({
  name: '',
  address: '',
  postalCode: '',
  city: '',
  countryCode: 'CH',
  phone: '',
  email: '',
  website: '',
  vatNumber: '',
  bankName: '',
  iban: '',
  paymentTerms: '',
  footerNotes: '',
  logoDataUrl: ''
})

watchEffect(() => {
  if (!company.value) {
    return
  }

  state.name = company.value.name
  state.address = company.value.address || ''
  state.postalCode = company.value.postalCode || ''
  state.city = company.value.city || ''
  state.countryCode = company.value.countryCode || 'CH'
  state.phone = company.value.phone || ''
  state.email = company.value.email || ''
  state.website = company.value.website || ''
  state.vatNumber = company.value.vatNumber || ''
  state.bankName = company.value.bankName || ''
  state.iban = company.value.iban || ''
  state.paymentTerms = company.value.paymentTerms || ''
  state.footerNotes = company.value.footerNotes || ''
  state.logoDataUrl = company.value.logoDataUrl || ''
})

function openFilePicker() {
  fileRef.value?.click()
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) {
    return
  }

  state.logoDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(new Error('Impossible de lire le logo'))
    reader.readAsDataURL(file)
  })
}

function removeLogo() {
  state.logoDataUrl = ''

  if (fileRef.value) {
    fileRef.value.value = ''
  }
}

async function onSubmit(event: FormSubmitEvent<FormState>) {
  await $fetch('/api/settings/company', {
    method: 'PATCH',
    body: {
      ...event.data,
      address: event.data.address || null,
      postalCode: event.data.postalCode || null,
      city: event.data.city || null,
      countryCode: event.data.countryCode || 'CH',
      phone: event.data.phone || null,
      email: event.data.email || null,
      website: event.data.website || null,
      vatNumber: event.data.vatNumber || null,
      bankName: event.data.bankName || null,
      iban: event.data.iban || null,
      paymentTerms: event.data.paymentTerms || null,
      footerNotes: event.data.footerNotes || null,
      logoDataUrl: event.data.logoDataUrl || null
    }
  })

  toast.add({
    title: 'Société mise à jour',
    description: 'Les informations de la société ont été enregistrées.',
    icon: 'i-lucide-check',
    color: 'success'
  })

  await refresh()
}
</script>

<template>
  <UForm
    id="company-settings"
    :schema="schema"
    :state="state"
    @submit="onSubmit"
  >
    <UPageCard
      title="Société"
      description="Informations de l’entreprise utilisées sur les documents commerciaux."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <UButton
        form="company-settings"
        label="Enregistrer"
        color="neutral"
        type="submit"
        class="w-fit lg:ms-auto"
      />
    </UPageCard>

    <UPageCard variant="subtle">
      <UFormField
        name="name"
        label="Nom"
        description="Nom commercial affiché sur les devis, factures, reçus et avoirs."
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput v-model="state.name" autocomplete="off" />
      </UFormField>
      <USeparator />
      <UFormField
        name="address"
        label="Adresse"
        description="Adresse principale structurée, utilisée sur les documents et la QR-facture."
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput v-model="state.address" autocomplete="off" />
      </UFormField>
      <USeparator />
      <div class="grid gap-4 md:grid-cols-3">
        <UFormField
          name="postalCode"
          label="Code postal"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput v-model="state.postalCode" autocomplete="off" />
        </UFormField>
        <UFormField
          name="city"
          label="Ville"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput v-model="state.city" autocomplete="off" />
        </UFormField>
        <UFormField
          name="countryCode"
          label="Pays"
          description="Code ISO à 2 lettres pour la QR-facture."
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput
            v-model="state.countryCode"
            autocomplete="off"
            maxlength="2"
            class="uppercase"
          />
        </UFormField>
      </div>
      <USeparator />
      <div class="grid gap-4 md:grid-cols-2">
        <UFormField
          name="phone"
          label="Téléphone"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput v-model="state.phone" autocomplete="off" />
        </UFormField>
        <UFormField
          name="email"
          label="Email"
          class="flex max-sm:flex-col justify-between items-start gap-4"
        >
          <UInput v-model="state.email" type="email" autocomplete="off" />
        </UFormField>
      </div>
      <USeparator />
      <UFormField
        name="website"
        label="Site web"
        description="Affiché dans le pied de page ou l’en-tête du document."
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput v-model="state.website" autocomplete="off" placeholder="https://..." />
      </UFormField>
      <USeparator />
      <UFormField
        name="vatNumber"
        label="TVA"
        description="Numéro de TVA / IDE si applicable."
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput v-model="state.vatNumber" autocomplete="off" />
      </UFormField>
      <USeparator />
      <UFormField
        name="bankName"
        label="Banque"
        description="Établissement bancaire affiché pour les virements."
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput v-model="state.bankName" autocomplete="off" />
      </UFormField>
      <USeparator />
      <UFormField
        name="iban"
        label="IBAN"
        description="Un IBAN valide est requis. La QR-facture suisse n’est générée qu’avec un IBAN CH ou LI."
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput v-model="state.iban" autocomplete="off" />
      </UFormField>
      <USeparator />
      <UFormField
        name="paymentTerms"
        label="Conditions de paiement"
        description="Texte court affiché sous les totaux du document."
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UTextarea v-model="state.paymentTerms" :rows="4" class="w-full" />
      </UFormField>
      <USeparator />
      <UFormField
        name="footerNotes"
        label="Mentions de bas de page"
        description="Mentions commerciales ou légales visibles en pied de page."
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UTextarea v-model="state.footerNotes" :rows="4" class="w-full" />
      </UFormField>
      <USeparator />
      <UFormField
        name="logoDataUrl"
        label="Logo"
        description="Stocké dans Turso pour être réutilisé sur les documents."
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <div class="w-full space-y-3">
          <div class="flex flex-wrap items-center gap-3">
            <UButton
              label="Choisir un logo"
              color="neutral"
              type="button"
              @click="openFilePicker"
            />
            <UButton
              v-if="state.logoDataUrl"
              label="Supprimer le logo"
              color="neutral"
              variant="soft"
              type="button"
              @click="removeLogo"
            />
          </div>

          <input
            ref="fileRef"
            type="file"
            class="hidden"
            accept=".jpg,.jpeg,.png,.svg,.webp"
            @change="onFileChange"
          >

          <div
            v-if="state.logoDataUrl"
            class="flex min-h-28 items-center justify-center rounded-lg border border-default bg-muted/20 p-4"
          >
            <img :src="state.logoDataUrl" alt="Logo société" class="max-h-24 max-w-full object-contain">
          </div>
          <div v-else class="rounded-lg border border-dashed border-default p-4 text-sm text-toned">
            Aucun logo enregistré.
          </div>
        </div>
      </UFormField>
    </UPageCard>
  </UForm>
</template>
