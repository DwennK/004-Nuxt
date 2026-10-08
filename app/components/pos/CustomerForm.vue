<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { CustomerFormValue, CustomerUpsertInput } from '~~/shared/types/pos'
import type { AddressSuggestion, PostalCodeLookupResult } from '~~/shared/types/lookups'

const props = withDefaults(defineProps<{
  initialValue?: Partial<CustomerUpsertInput>
  formId?: string
  showSubmit?: boolean
  saving?: boolean
  saveError?: string | null
  submitLabel?: string
}>(), {
  initialValue: () => ({}),
  formId: undefined,
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
  name: optionalText,
  companyName: optionalText,
  phone: optionalText,
  email: optionalEmail,
  addressLine1: optionalText,
  addressLine2: optionalText,
  postalCode: optionalText,
  city: optionalText,
  notes: optionalText
})

const schema = baseSchema.superRefine((value, ctx) => {
  if (!value.name.trim() && !value.companyName.trim()) {
    ctx.addIssue({
      code: 'custom',
      path: ['name'],
      message: 'Le nom du client ou de la société est obligatoire'
    })
  }
})

const state = reactive<CustomerFormValue>({
  name: '',
  companyName: '',
  phone: '',
  email: '',
  addressLine1: '',
  addressLine2: '',
  postalCode: '',
  city: '',
  notes: ''
})

const lastAutoFilledCity = ref<string | null>(null)
const normalizedPostalCode = computed(() => state.postalCode.replace(/\D+/g, '').slice(0, 4))

watchEffect(() => {
  state.name = props.initialValue.name || ''
  state.companyName = props.initialValue.companyName || ''
  state.phone = props.initialValue.phone || ''
  state.email = props.initialValue.email || ''
  state.addressLine1 = props.initialValue.addressLine1 || ''
  state.addressLine2 = props.initialValue.addressLine2 || ''
  state.postalCode = props.initialValue.postalCode || ''
  state.city = props.initialValue.city || ''
  state.notes = props.initialValue.notes || ''
})

watch(() => state.postalCode, (value) => {
  const sanitizedPostalCode = value.replace(/\D+/g, '').slice(0, 4)

  if (value !== sanitizedPostalCode) {
    state.postalCode = sanitizedPostalCode
  }
})

watch(() => state.city, (value) => {
  if (lastAutoFilledCity.value && value !== lastAutoFilledCity.value) {
    lastAutoFilledCity.value = null
  }
})

watch(normalizedPostalCode, (postalCode, _previous, onCleanup) => {
  if (postalCode.length !== 4) {
    if (lastAutoFilledCity.value && state.city === lastAutoFilledCity.value) {
      state.city = ''
      lastAutoFilledCity.value = null
    }
    return
  }

  const controller = new AbortController()
  const timer = setTimeout(async () => {
    try {
      const result = await $fetch<PostalCodeLookupResult>('/api/lookups/postal-codes', {
        query: { postalCode },
        signal: controller.signal
      })
      if (controller.signal.aborted) return
      const currentCity = state.city.trim()
      if (result.localities.length === 1 && (!currentCity || currentCity === lastAutoFilledCity.value)) {
        state.city = result.localities[0]!
        lastAutoFilledCity.value = state.city
      } else if (currentCity && currentCity === lastAutoFilledCity.value && !result.localities.includes(currentCity)) {
        state.city = ''
        lastAutoFilledCity.value = null
      }
    } catch {
      // Postal lookup is optional; keep all manually entered values on failure.
    }
  }, 200)
  onCleanup(() => {
    clearTimeout(timer)
    controller.abort()
  })
}, { immediate: true })

function applyAddressSuggestion(suggestion: AddressSuggestion) {
  lastAutoFilledCity.value = null
  if (suggestion.addressLine1) state.addressLine1 = suggestion.addressLine1
  state.postalCode = suggestion.postalCode
  state.city = suggestion.city
}

function onSubmit(_event: FormSubmitEvent<CustomerFormValue>) {
  if (props.saving) return
  emit('save', {
    ...state,
    name: state.name.trim(),
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
    :disabled="props.saving"
    :aria-busy="props.saving"
    :state="state"
    class="space-y-5"
    @submit="onSubmit"
  >
    <UFormField
      label="Nom"
      name="name"
    >
      <UInput
        v-bind="posInputAttrs"
        v-model="state.name"
        class="w-full"
        placeholder="Ex. Jean Martin ou Atelier Pixel"
        autofocus
      />
    </UFormField>

    <UFormField
      label="Téléphone"
      name="phone"
      hint="Optionnel"
    >
      <UInput
        v-bind="posInputAttrs"
        v-model="state.phone"
        class="w-full"
        placeholder="+41 ..."
      />
    </UFormField>

    <UFormField label="Adresse" name="addressLine1" hint="Optionnel">
      <PosAddressLookupInput
        v-model="state.addressLine1"
        field="address"
        :postal-code="state.postalCode"
        :city="state.city"
        :disabled="props.saving"
        class="w-full"
        placeholder="Rue et numéro"
        @select="applyAddressSuggestion"
      />
    </UFormField>

    <div class="grid grid-cols-[6rem_minmax(0,1fr)] gap-4">
      <UFormField label="NPA" name="postalCode">
        <PosAddressLookupInput
          v-model="state.postalCode"
          field="postalCode"
          :disabled="props.saving"
          class="w-full"
          inputmode="numeric"
          maxlength="4"
          placeholder="1003"
          @select="applyAddressSuggestion"
        />
      </UFormField>

      <UFormField label="Localité" name="city">
        <PosAddressLookupInput
          v-model="state.city"
          field="city"
          :disabled="props.saving"
          @select="applyAddressSuggestion"
        />
      </UFormField>
    </div>

    <USeparator />

    <UFormField
      label="E-mail"
      name="email"
      hint="Optionnel"
    >
      <UInput
        v-bind="posInputAttrs"
        v-model="state.email"
        type="email"
        class="w-full"
        placeholder="client@example.ch"
      />
    </UFormField>

    <UFormField
      label="Société"
      name="companyName"
      hint="Optionnel"
    >
      <UInput
        v-bind="posInputAttrs"
        v-model="state.companyName"
        class="w-full"
        placeholder="Nom de la société"
      />
    </UFormField>

    <PosFormFeedback :saving="props.saving" :error="props.saveError" />

    <div v-if="props.showSubmit" class="flex justify-end">
      <UButton
        type="submit"
        :label="props.saving ? 'Enregistrement…' : submitLabel"
        :loading="props.saving"
        icon="i-lucide-save"
      />
    </div>
  </UForm>
</template>
