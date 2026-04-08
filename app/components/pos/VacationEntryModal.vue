<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { CalendarDate } from '@internationalized/date'
import type { DateRange } from '@internationalized/date'
import { vacationEntryTypes, vacationEntryStatuses, vacationEntryTypeLabels, vacationEntryStatusLabels } from '~~/shared/constants/pos'
import type { EmployeeRecord, VacationEntryListItem } from '~~/shared/types/pos'
import { countBusinessDays } from '~~/shared/utils/pos'

const props = defineProps<{
  employees: EmployeeRecord[]
  editingEntry?: VacationEntryListItem | null
  prefillDate?: string | null
}>()

const open = defineModel<boolean>('open', { default: false })

const emit = defineEmits<{
  save: [payload: any]
}>()

const schema = z.object({
  employeeId: z.coerce.number().int().positive('Sélectionnez un employé'),
  type: z.enum(vacationEntryTypes),
  status: z.enum(vacationEntryStatuses)
})

const state = reactive({
  employeeId: 0,
  type: 'full_day' as (typeof vacationEntryTypes)[number],
  status: 'approved' as (typeof vacationEntryStatuses)[number],
  notes: ''
})

const dateRange = ref<DateRange>()
const singleDate = ref<CalendarDate>()

const typeItems = vacationEntryTypes.map(t => ({ label: vacationEntryTypeLabels[t], value: t }))
const statusItems = vacationEntryStatuses.map(s => ({ label: vacationEntryStatusLabels[s], value: s }))
const employeeItems = computed(() =>
  props.employees.filter(e => e.isActive).map(e => ({ label: e.displayName, value: e.id }))
)

const isHalfDay = computed(() => state.type !== 'full_day')

const previewDays = computed(() => {
  if (isHalfDay.value) return 0.5

  if (!dateRange.value?.start || !dateRange.value?.end) return 0

  const startStr = `${dateRange.value.start.year}-${String(dateRange.value.start.month).padStart(2, '0')}-${String(dateRange.value.start.day).padStart(2, '0')}`
  const endStr = `${dateRange.value.end.year}-${String(dateRange.value.end.month).padStart(2, '0')}-${String(dateRange.value.end.day).padStart(2, '0')}`

  return countBusinessDays(startStr, endStr)
})

function formatCalendarDate(d: CalendarDate) {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

function parseToCalendarDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new CalendarDate(y!, m!, d!)
}

watch([() => props.editingEntry, () => props.prefillDate], ([entry, prefill]) => {
  if (entry) {
    state.employeeId = entry.employeeId
    state.type = entry.type
    state.status = entry.status
    state.notes = entry.notes || ''

    const start = parseToCalendarDate(entry.startDate)
    const end = parseToCalendarDate(entry.endDate)

    if (entry.type === 'full_day') {
      dateRange.value = { start, end }
      singleDate.value = undefined
    } else {
      singleDate.value = start
      dateRange.value = undefined
    }
  } else {
    state.employeeId = 0
    state.type = 'full_day'
    state.status = 'approved'
    state.notes = ''

    if (prefill) {
      const d = parseToCalendarDate(prefill)
      dateRange.value = { start: d, end: d }
      singleDate.value = d
    } else {
      dateRange.value = undefined
      singleDate.value = undefined
    }
  }
}, { immediate: true })

function onSubmit(_event: FormSubmitEvent<any>) {
  let startDate: string
  let endDate: string

  if (isHalfDay.value) {
    if (!singleDate.value) return
    startDate = formatCalendarDate(singleDate.value)
    endDate = startDate
  } else {
    if (!dateRange.value?.start || !dateRange.value?.end) return
    startDate = formatCalendarDate(dateRange.value.start)
    endDate = formatCalendarDate(dateRange.value.end)
  }

  emit('save', {
    employeeId: state.employeeId,
    startDate,
    endDate,
    type: state.type,
    status: state.status,
    notes: state.notes || null
  })
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="editingEntry ? 'Modifier l\'absence' : 'Nouvelle absence'"
    :description="editingEntry ? 'Modifiez les détails de cette absence.' : 'Planifiez une absence pour un employé.'"
  >
    <template #body>
      <UForm :schema="schema" :state="state" class="space-y-5" @submit="onSubmit">
        <UFormField label="Employé" name="employeeId">
          <USelect
            v-model="state.employeeId"
            :items="employeeItems"
            value-key="value"
            placeholder="Sélectionner un employé"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Type" name="type">
          <USelect
            v-model="state.type"
            :items="typeItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField v-if="!isHalfDay" label="Période" name="dateRange">
          <UInputDate v-model="dateRange" range class="w-full" />
        </UFormField>

        <UFormField v-else label="Date" name="singleDate">
          <UInputDate v-model="singleDate" class="w-full" />
        </UFormField>

        <UFormField label="Statut" name="status">
          <USelect
            v-model="state.status"
            :items="statusItems"
            value-key="value"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Notes" name="notes" hint="Optionnel">
          <UInput v-model="state.notes" class="w-full" placeholder="Ex. Vacances d'été" />
        </UFormField>

        <div v-if="previewDays > 0" class="rounded-md bg-elevated p-3 text-sm">
          <span class="font-medium">{{ previewDays }}</span> jour(s) ouvré(s)
        </div>

        <div class="flex justify-end gap-2">
          <UButton label="Annuler" color="neutral" variant="ghost" @click="open = false" />
          <UButton type="submit" :label="editingEntry ? 'Enregistrer' : 'Créer'" icon="i-lucide-save" />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
