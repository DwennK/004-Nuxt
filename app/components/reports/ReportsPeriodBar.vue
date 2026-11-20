<script setup lang="ts">
import { parseDate, type DateValue } from '@internationalized/date'
import { formatDate, toDateInputValue } from '~~/shared/utils/pos'

const props = withDefaults(defineProps<{
  type?: 'date' | 'month' | 'year'
  rollingWeek?: boolean
  loading?: boolean
}>(), { type: 'date' })

const date = defineModel<string>('date')
const range = defineModel<{ startDate: string, endDate: string }>('range')
const emit = defineEmits<{ refresh: [] }>()
const open = ref(false)
type CalendarRange = { start: DateValue | undefined, end: DateValue | undefined }
const draft = shallowRef<CalendarRange | null>(null)
const selectedDate = computed(() => date.value ? parseDate(date.value) : undefined)
const shortcuts = [
  { label: '7 jours', accessibleLabel: '7 derniers jours', days: 7 },
  { label: '30 jours', accessibleLabel: '30 derniers jours', days: 30 },
  { label: 'Mois en cours', accessibleLabel: 'Mois en cours', days: 0 }
]

const label = computed(() => {
  const start = range.value?.startDate || (props.rollingWeek ? selectedDate.value?.subtract({ days: 6 }).toString() : date.value)
  const end = range.value?.endDate || date.value
  if (!start || !end) return 'Choisir une période'
  if (props.type === 'year') return end.slice(0, 4)
  if (props.type === 'month') {
    return new Intl.DateTimeFormat('fr-CH', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(end + 'T12:00:00Z'))
  }
  return start === end ? formatDate(end) : `${formatDate(start)} – ${formatDate(end)}`
})

function setOpen(value: boolean) {
  if (value && range.value) {
    draft.value = { start: parseDate(range.value.startDate), end: parseDate(range.value.endDate) }
  }
  open.value = value
}

function applyDate(value?: DateValue | CalendarRange | DateValue[] | null) {
  if (!value || !('year' in value)) return
  date.value = value.toString()
  open.value = false
}

function shiftPeriod(direction: number) {
  const value = selectedDate.value
  if (!value) return
  const offset = props.type === 'year'
    ? { years: direction }
    : props.type === 'month'
      ? { months: direction }
      : { days: direction * (props.rollingWeek ? 7 : 1) }
  date.value = value.add(offset).toString()
}

function selectShortcut(days: number) {
  const today = parseDate(toDateInputValue())
  const start = days ? today.subtract({ days: days - 1 }) : today.set({ day: 1 })
  applyRange({ start, end: today })
}

function applyRange(value: CalendarRange | null) {
  if (!value?.start || !value.end) return
  range.value = { startDate: value.start.toString(), endDate: value.end.toString() }
  open.value = false
}
</script>

<template>
  <div class="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 rounded-lg border border-default bg-default px-3 py-2.5 sm:flex sm:flex-wrap">
    <div class="contents sm:flex sm:min-w-0 sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
      <span class="col-start-1 row-start-1 text-sm font-semibold text-highlighted">{{ rollingWeek ? '7 jours glissants' : 'Période' }}</span>
      <div v-if="$slots.default" class="col-span-2">
        <slot />
      </div>
      <div class="col-span-2 flex max-w-full items-center gap-1">
        <UButton
          v-if="date"
          icon="i-lucide-chevron-left"
          aria-label="Période précédente"
          color="neutral"
          size="sm"
          variant="ghost"
          @click="shiftPeriod(-1)"
        />
        <UPopover :open="open" :content="{ align: 'start', collisionPadding: 12 }" @update:open="setOpen">
          <UButton
            icon="i-lucide-calendar-days"
            trailing-icon="i-lucide-chevron-down"
            color="neutral"
            variant="outline"
            :aria-label="`${rollingWeek ? 'Modifier la date de fin' : 'Modifier la période'}, ${label}`"
            :label="label"
            class="min-w-0 text-xs tabular-nums data-[state=open]:bg-elevated sm:text-sm"
          />
          <template #content>
            <div v-if="range" class="w-72 max-w-[calc(100vw-1.5rem)]">
              <div class="flex flex-wrap gap-1 border-b border-default p-2">
                <UButton
                  v-for="shortcut in shortcuts"
                  :key="shortcut.label"
                  :label="shortcut.label"
                  :aria-label="shortcut.accessibleLabel"
                  size="xs"
                  color="neutral"
                  variant="soft"
                  @click="selectShortcut(shortcut.days)"
                />
              </div>
              <div class="space-y-2 p-3">
                <p class="text-xs text-muted">
                  Choisissez le premier et le dernier jour.
                </p>
                <UCalendar
                  v-model="draft"
                  range
                  locale="fr-CH"
                  :week-starts-on="1"
                  :year-controls="false"
                  variant="soft"
                  class="w-full"
                  :ui="{ cellTrigger: 'rounded-md data-[selection-start]:bg-primary data-[selection-start]:text-inverted data-[selection-end]:bg-primary data-[selection-end]:text-inverted' }"
                />
              </div>
              <div class="flex justify-end gap-2 border-t border-default p-2">
                <UButton
                  label="Annuler"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  @click="setOpen(false)"
                />
                <UButton
                  label="Appliquer"
                  size="sm"
                  :disabled="!draft?.start || !draft.end"
                  @click="applyRange(draft)"
                />
              </div>
            </div>
            <div v-else class="w-72 max-w-[calc(100vw-1.5rem)] space-y-2 p-3">
              <p v-if="rollingWeek" class="text-xs text-muted">
                Choisissez le dernier jour de la période.
              </p>
              <UCalendar
                :type="type"
                :model-value="selectedDate"
                locale="fr-CH"
                :week-starts-on="1"
                :year-controls="false"
                prevent-deselect
                class="w-full"
                @update:model-value="applyDate"
              />
            </div>
          </template>
        </UPopover>
        <UButton
          v-if="date"
          icon="i-lucide-chevron-right"
          aria-label="Période suivante"
          color="neutral"
          size="sm"
          variant="ghost"
          @click="shiftPeriod(1)"
        />
      </div>
    </div>
    <UButton
      label="Actualiser"
      icon="i-lucide-refresh-cw"
      color="neutral"
      variant="ghost"
      :loading="loading"
      class="col-start-2 row-start-1 ml-auto"
      @click="emit('refresh')"
    />
  </div>
</template>
