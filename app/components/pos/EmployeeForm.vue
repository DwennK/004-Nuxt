<script setup lang="ts">
import { z } from 'zod'
import { employeeColorPalette } from '~~/shared/constants/pos'
import type { EmployeeRecord } from '~~/shared/types/pos'

type EmployeeFormValue = Partial<Pick<EmployeeRecord, 'firstName' | 'lastName' | 'email' | 'color' | 'vacationDaysPerYear' | 'isActive'>>
type EmployeeFormState = Pick<EmployeeRecord, 'firstName' | 'lastName' | 'color' | 'vacationDaysPerYear' | 'isActive'> & {
  email: string
}

const props = withDefaults(defineProps<{
  initialValue?: EmployeeFormValue
  submitLabel?: string
}>(), {
  initialValue: () => ({}),
  submitLabel: 'Enregistrer'
})

const emit = defineEmits<{
  save: [payload: EmployeeFormState]
}>()

const schema = z.object({
  firstName: z.string().trim().min(1, 'Le prénom est obligatoire'),
  lastName: z.string().trim().min(1, 'Le nom est obligatoire'),
  email: z.string().optional().default(''),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Couleur invalide'),
  vacationDaysPerYear: z.coerce.number().int().min(0).max(365).default(25),
  isActive: z.coerce.boolean().default(true)
})

const state = reactive<EmployeeFormState>({
  firstName: '',
  lastName: '',
  email: '',
  color: employeeColorPalette[0]!,
  vacationDaysPerYear: 25,
  isActive: true
})

watchEffect(() => {
  state.firstName = props.initialValue.firstName || ''
  state.lastName = props.initialValue.lastName || ''
  state.email = props.initialValue.email || ''
  state.color = props.initialValue.color || employeeColorPalette[0]!
  state.vacationDaysPerYear = props.initialValue.vacationDaysPerYear ?? 25
  state.isActive = props.initialValue.isActive ?? true
})

function onSubmit() {
  emit('save', { ...state })
}
</script>

<template>
  <UForm
    :schema="schema"
    :state="state"
    class="space-y-5"
    @submit="onSubmit"
  >
    <div class="grid gap-4 md:grid-cols-2">
      <UFormField label="Prénom" name="firstName">
        <UInput v-model="state.firstName" class="w-full" autofocus />
      </UFormField>

      <UFormField label="Nom" name="lastName">
        <UInput v-model="state.lastName" class="w-full" />
      </UFormField>
    </div>

    <UFormField label="E-mail" name="email" hint="Optionnel">
      <UInput v-model="state.email" type="email" class="w-full" />
    </UFormField>

    <UFormField label="Couleur" name="color">
      <div class="flex flex-wrap gap-2">
        <button
          v-for="c in employeeColorPalette"
          :key="c"
          type="button"
          class="size-8 rounded-full border-2 transition-all"
          :class="state.color === c ? 'border-highlighted scale-110' : 'border-transparent'"
          :style="{ backgroundColor: c }"
          @click="state.color = c"
        />
      </div>
    </UFormField>

    <div class="grid gap-4 md:grid-cols-2">
      <UFormField label="Jours de vacances / an" name="vacationDaysPerYear">
        <UInput
          v-model.number="state.vacationDaysPerYear"
          type="number"
          :min="0"
          :max="365"
          class="w-full"
        />
      </UFormField>

      <UFormField label="Statut" name="isActive">
        <USelect
          v-model="state.isActive"
          :items="[{ label: 'Actif', value: true }, { label: 'Inactif', value: false }]"
          value-key="value"
          class="w-full"
        />
      </UFormField>
    </div>

    <div class="flex justify-end">
      <UButton type="submit" :label="submitLabel" icon="i-lucide-save" />
    </div>
  </UForm>
</template>
