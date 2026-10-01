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
    class="space-y-4"
    @submit="onSubmit"
  >
    <div class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b border-default bg-default py-3">
      <div>
        <h2 class="text-lg font-semibold text-highlighted">
          Société
        </h2>
        <p class="text-sm text-muted">
          Coordonnées et informations affichées sur vos documents.
        </p>
      </div>
      <UButton
        form="company-settings"
        label="Enregistrer"
        icon="i-lucide-save"
        type="submit"
      />
    </div>

    <div class="grid items-start gap-4 xl:grid-cols-2">
      <UCard :ui="{ body: 'space-y-4 sm:p-5', header: 'px-4 py-3 sm:px-5' }">
        <template #header>
          <h3 class="font-semibold text-highlighted">
            Coordonnées
          </h3>
        </template>
        <UFormField name="name" label="Nom commercial" required>
          <UInput v-bind="posInputAttrs" v-model="state.name" class="w-full" />
        </UFormField>
        <UFormField name="address" label="Adresse">
          <UInput v-bind="posInputAttrs" v-model="state.address" class="w-full" />
        </UFormField>
        <div class="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)]">
          <UFormField name="postalCode" label="Code postal">
            <UInput v-bind="posInputAttrs" v-model="state.postalCode" class="w-full" />
          </UFormField>
          <UFormField name="city" label="Ville">
            <UInput v-bind="posInputAttrs" v-model="state.city" class="w-full" />
          </UFormField>
          <UFormField name="countryCode" label="Pays" hint="ISO">
            <UInput
              v-bind="posInputAttrs"
              v-model="state.countryCode"
              maxlength="2"
              class="w-full uppercase"
            />
          </UFormField>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField name="phone" label="Téléphone">
            <UInput v-bind="posInputAttrs" v-model="state.phone" class="w-full" />
          </UFormField>
          <UFormField name="email" label="Email">
            <UInput
              v-bind="posInputAttrs"
              v-model="state.email"
              type="email"
              class="w-full"
            />
          </UFormField>
        </div>
        <UFormField name="website" label="Site web">
          <UInput
            v-bind="posInputAttrs"
            v-model="state.website"
            placeholder="https://..."
            class="w-full"
          />
        </UFormField>
      </UCard>

      <div class="min-w-0 space-y-4">
        <UCard :ui="{ body: 'space-y-4 sm:p-5', header: 'px-4 py-3 sm:px-5' }">
          <template #header>
            <h3 class="font-semibold text-highlighted">
              Facturation et banque
            </h3>
          </template>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField name="vatNumber" label="N° TVA / IDE">
              <UInput v-bind="posInputAttrs" v-model="state.vatNumber" class="w-full" />
            </UFormField>
            <UFormField name="bankName" label="Banque">
              <UInput v-bind="posInputAttrs" v-model="state.bankName" class="w-full" />
            </UFormField>
          </div>
          <UFormField name="iban" label="IBAN" help="IBAN CH ou LI requis pour la QR-facture suisse.">
            <UInput v-bind="posInputAttrs" v-model="state.iban" class="w-full" />
          </UFormField>
        </UCard>

        <UCard :ui="{ body: 'sm:p-5', header: 'px-4 py-3 sm:px-5' }">
          <template #header>
            <h3 class="font-semibold text-highlighted">
              Logo des documents
            </h3>
          </template>
          <UFormField name="logoDataUrl" label="Logo" :ui="{ label: 'sr-only' }">
            <div class="flex flex-wrap items-center gap-4">
              <div class="flex h-24 w-40 shrink-0 items-center justify-center rounded-md border border-default bg-muted/20 p-3">
                <img
                  v-if="state.logoDataUrl"
                  :src="state.logoDataUrl"
                  alt="Logo société"
                  class="max-h-full max-w-full object-contain"
                >
                <span v-else class="text-sm text-muted">Aucun logo</span>
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  label="Choisir un logo"
                  icon="i-lucide-image-up"
                  color="neutral"
                  variant="outline"
                  type="button"
                  @click="openFilePicker"
                />
                <UButton
                  v-if="state.logoDataUrl"
                  label="Supprimer le logo"
                  color="neutral"
                  variant="ghost"
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
            </div>
          </UFormField>
        </UCard>
      </div>
    </div>

    <UCard :ui="{ body: 'space-y-4 sm:p-5', header: 'px-4 py-3 sm:px-5' }">
      <template #header>
        <h3 class="font-semibold text-highlighted">
          Textes des documents
        </h3>
      </template>
      <UFormField name="paymentTerms" label="Conditions de paiement" help="Affichées sous les totaux.">
        <UTextarea
          v-bind="posInputAttrs"
          v-model="state.paymentTerms"
          :rows="2"
          autoresize
          class="w-full"
        />
      </UFormField>
      <UFormField name="footerNotes" label="Mentions de bas de page" help="Garanties et mentions commerciales ou légales.">
        <UTextarea
          v-bind="posInputAttrs"
          v-model="state.footerNotes"
          :rows="8"
          autoresize
          class="w-full"
        />
      </UFormField>
    </UCard>
  </UForm>
</template>
