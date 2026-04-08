<script setup lang="ts">
import type { TableColumn, TabsItem } from '@nuxt/ui'
import { getPaginationRowModel } from '@tanstack/table-core'
import { CalendarDate } from '@internationalized/date'
import type {
  EmployeeRecord,
  EmployeeVacationSummary,
  VacationEntryListItem,
  VacationEntryRecord,
  VacationEntryStatus
} from '~~/shared/types/pos'
import { vacationEntryTypeLabels, vacationEntryStatusLabels, vacationEntryStatusColors } from '~~/shared/constants/pos'
import { formatDate, getSwissHolidayMap, getSwissHolidays } from '~~/shared/utils/pos'

const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const toast = useToast()

type EmployeeFormPayload = Pick<EmployeeRecord, 'firstName' | 'lastName' | 'color' | 'vacationDaysPerYear' | 'isActive'> & {
  email: string
}

type VacationEntryPayload = Pick<VacationEntryRecord, 'employeeId' | 'startDate' | 'endDate' | 'type' | 'status' | 'notes'>
type SelectItem<T> = { label: string, value: T }

const currentYear = new Date().getFullYear()
const selectedYear = ref(currentYear)
const yearOptions = computed(() => {
  const years = []
  for (let y = currentYear - 2; y <= currentYear + 1; y++) {
    years.push({ label: String(y), value: y })
  }
  return years
})

const tabs: TabsItem[] = [
  { label: 'Calendrier', icon: 'i-lucide-calendar', value: 'calendar', slot: 'calendar' },
  { label: 'Employés', icon: 'i-lucide-users', value: 'employees', slot: 'employees' },
  { label: 'Bilan annuel', icon: 'i-lucide-bar-chart-3', value: 'summary', slot: 'summary' }
]

// --- Data ---
const { data: employees, refresh: refreshEmployees } = await useFetch<EmployeeRecord[]>('/api/employees')
const { data: entries, refresh: refreshEntries } = await useFetch<VacationEntryListItem[]>('/api/vacations', {
  query: { year: selectedYear }
})
const { data: summaries, refresh: refreshSummaries } = await useFetch<EmployeeVacationSummary[]>('/api/vacations/summary', {
  query: { year: selectedYear }
})

async function refreshAll() {
  await Promise.all([refreshEmployees(), refreshEntries(), refreshSummaries()])
}

// --- Employee CRUD ---
const createEmployeeOpen = ref(false)
const editEmployeeOpen = ref(false)
const editingEmployee = ref<EmployeeRecord | null>(null)
const deleteConfirmOpen = ref(false)
const employeeToDelete = ref<EmployeeRecord | null>(null)

const employeePagination = ref({ pageIndex: 0, pageSize: 10 })
const employeeSorting = ref([{ id: 'displayName', desc: false }])

const editingEmployeeForm = computed(() => {
  if (!editingEmployee.value) return undefined
  return {
    firstName: editingEmployee.value.firstName,
    lastName: editingEmployee.value.lastName,
    email: editingEmployee.value.email,
    color: editingEmployee.value.color,
    vacationDaysPerYear: editingEmployee.value.vacationDaysPerYear,
    isActive: editingEmployee.value.isActive
  }
})

async function saveEmployee(payload: EmployeeFormPayload) {
  if (editingEmployee.value) {
    await $fetch(`/api/employees/${editingEmployee.value.id}`, { method: 'PATCH', body: payload })
    toast.add({ title: 'Employe mis a jour', color: 'success' })
    editEmployeeOpen.value = false
    editingEmployee.value = null
  } else {
    await $fetch('/api/employees', { method: 'POST', body: payload })
    toast.add({ title: 'Employe cree', color: 'success' })
    createEmployeeOpen.value = false
  }
  await refreshAll()
}

function confirmDeleteEmployee(emp: EmployeeRecord) {
  employeeToDelete.value = emp
  deleteConfirmOpen.value = true
}

async function removeEmployee() {
  if (!employeeToDelete.value) return
  await $fetch(`/api/employees/${employeeToDelete.value.id}`, { method: 'DELETE' })
  toast.add({ title: 'Employe supprime', color: 'success' })
  deleteConfirmOpen.value = false
  employeeToDelete.value = null
  await refreshAll()
}

// --- Employee summaries lookup for table ---
const summaryByEmployeeId = computed(() => {
  const map = new Map<number, EmployeeVacationSummary>()
  for (const s of summaries.value || []) {
    map.set(s.employee.id, s)
  }
  return map
})

function getEmployeeRowItems(emp: EmployeeRecord) {
  return [[{
    label: 'Modifier',
    icon: 'i-lucide-pencil',
    onSelect() {
      editingEmployee.value = emp
      editEmployeeOpen.value = true
    }
  }, {
    label: 'Supprimer',
    icon: 'i-lucide-trash',
    color: 'error' as const,
    onSelect() {
      confirmDeleteEmployee(emp)
    }
  }]]
}

const employeeColumns: TableColumn<EmployeeRecord>[] = [
  {
    id: 'color',
    header: '',
    cell: ({ row }) => h('div', {
      class: 'size-4 rounded-full',
      style: { backgroundColor: row.original.color }
    })
  },
  {
    accessorKey: 'displayName',
    header: ({ column }) => h(UButton, {
      color: 'neutral',
      variant: 'ghost',
      label: 'Nom',
      icon: column.getIsSorted() === 'asc' ? 'i-lucide-arrow-up-az' : column.getIsSorted() === 'desc' ? 'i-lucide-arrow-down-az' : 'i-lucide-arrow-up-down',
      class: '-mx-2.5',
      onClick: () => column.toggleSorting(column.getIsSorted() === 'asc')
    }),
    cell: ({ row }) => h('span', { class: 'font-medium text-highlighted' }, row.original.displayName)
  },
  {
    accessorKey: 'email',
    header: 'E-mail',
    cell: ({ row }) => h('span', { class: 'text-toned' }, row.original.email || '-')
  },
  {
    accessorKey: 'vacationDaysPerYear',
    header: 'Jours/an',
    cell: ({ row }) => h('span', {}, `${row.original.vacationDaysPerYear}j`)
  },
  {
    id: 'remainingDays',
    header: 'Restant',
    cell: ({ row }) => {
      const summary = summaryByEmployeeId.value.get(row.original.id)
      if (!summary) return h('span', { class: 'text-toned' }, '-')
      const color = summary.remainingDays <= 0 ? 'text-error' : summary.remainingDays <= 5 ? 'text-warning' : 'text-success'
      return h('span', { class: `font-medium ${color}` }, `${summary.remainingDays}j`)
    }
  },
  {
    accessorKey: 'isActive',
    header: 'Statut',
    cell: ({ row }) => h(UBadge, {
      color: row.original.isActive ? 'success' : 'neutral',
      variant: 'subtle',
      label: row.original.isActive ? 'Actif' : 'Inactif'
    })
  },
  {
    id: 'actions',
    cell: ({ row }) => h('div', { class: 'text-right' }, h(
      UDropdownMenu,
      { content: { align: 'end' }, items: getEmployeeRowItems(row.original) },
      () => h(UButton, { icon: 'i-lucide-ellipsis-vertical', color: 'neutral', variant: 'ghost' })
    ))
  }
]

// --- Vacation Entry CRUD ---
const vacationModalOpen = ref(false)
const editingEntry = ref<VacationEntryListItem | null>(null)
const prefillDate = ref<string | null>(null)

function openNewVacation(date?: string) {
  editingEntry.value = null
  prefillDate.value = date || null
  vacationModalOpen.value = true
}

function openEditVacation(entry: VacationEntryListItem) {
  editingEntry.value = entry
  prefillDate.value = null
  vacationModalOpen.value = true
}

async function saveVacationEntry(payload: VacationEntryPayload) {
  if (editingEntry.value) {
    await $fetch(`/api/vacations/${editingEntry.value.id}`, { method: 'PATCH', body: payload })
    toast.add({ title: 'Absence mise a jour', color: 'success' })
  } else {
    await $fetch('/api/vacations', { method: 'POST', body: payload })
    toast.add({ title: 'Absence creee', color: 'success' })
  }
  vacationModalOpen.value = false
  editingEntry.value = null
  prefillDate.value = null
  await refreshAll()
}

async function removeVacationEntry(id: number) {
  await $fetch(`/api/vacations/${id}`, { method: 'DELETE' })
  toast.add({ title: 'Absence supprimee', color: 'success' })
  await refreshAll()
}

// --- Calendar ---
const calendarPlaceholder = computed(() => new CalendarDate(selectedYear.value, new Date().getMonth() + 1, 1))

const holidayMap = computed(() => getSwissHolidayMap(selectedYear.value))

const entriesByDay = computed(() => {
  const map = new Map<string, VacationEntryListItem[]>()
  for (const entry of entries.value || []) {
    const start = new Date(entry.startDate + 'T00:00:00')
    const end = new Date(entry.endDate + 'T00:00:00')
    const current = new Date(start)
    while (current <= end) {
      if (current.getDay() !== 0) {
        const key = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
        if (!map.has(key)) map.set(key, [])
        map.get(key)!.push(entry)
      }
      current.setDate(current.getDate() + 1)
    }
  }
  return map
})

function getEntriesForDay(day: { year: number, month: number, day: number }) {
  const key = `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`
  return entriesByDay.value.get(key) || []
}

function getHolidayName(day: { year: number, month: number, day: number }): string | undefined {
  const key = `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`
  return holidayMap.value.get(key)
}

function formatDayKey(day: { year: number, month: number, day: number }) {
  return `${day.year}-${String(day.month).padStart(2, '0')}-${String(day.day).padStart(2, '0')}`
}

function isSunday(day: { year: number, month: number, day: number }) {
  return new Date(day.year, day.month - 1, day.day).getDay() === 0
}

// --- Day popover ---
const popoverDay = ref<{ year: number, month: number, day: number } | null>(null)
const popoverOpen = ref(false)

function openDayPopover(day: { year: number, month: number, day: number }) {
  if (isSunday(day)) return
  popoverDay.value = day
  popoverOpen.value = true
}

const popoverEntries = computed(() => popoverDay.value ? getEntriesForDay(popoverDay.value) : [])
const popoverHoliday = computed(() => popoverDay.value ? getHolidayName(popoverDay.value) : undefined)
const popoverDateStr = computed(() => popoverDay.value ? formatDayKey(popoverDay.value) : '')

// --- Overlap warnings ---
const overlapDays = computed(() => {
  const days: { date: string, count: number, names: string[] }[] = []
  for (const [key, dayEntries] of entriesByDay.value) {
    const uniqueEmployees = [...new Set(dayEntries.map(e => e.employeeId))]
    if (uniqueEmployees.length > 1) {
      days.push({
        date: key,
        count: uniqueEmployees.length,
        names: [...new Set(dayEntries.map(e => e.employeeName))]
      })
    }
  }
  return days.sort((a, b) => a.date.localeCompare(b.date))
})

// --- Entries list with filters, sort, pagination ---
const filterEmployee = ref<number | null>(null)
const filterStatus = ref<VacationEntryStatus | null>(null)
const entriesPagination = ref({ pageIndex: 0, pageSize: 15 })

const employeeFilterItems = computed<SelectItem<number | null>[]>(() => [
  { label: 'Tous les employes', value: null },
  ...(employees.value || []).filter(e => e.isActive).map(e => ({ label: e.displayName, value: e.id }))
])

const statusFilterItems: SelectItem<VacationEntryStatus | null>[] = [
  { label: 'Tous les statuts', value: null },
  { label: 'Approuve', value: 'approved' },
  { label: 'En attente', value: 'pending' },
  { label: 'Refuse', value: 'rejected' }
]

const filteredEntries = computed(() => {
  let list = entries.value || []

  if (filterEmployee.value) {
    list = list.filter(e => e.employeeId === filterEmployee.value)
  }
  if (filterStatus.value) {
    list = list.filter(e => e.status === filterStatus.value)
  }

  return [...list].sort((a, b) => b.startDate.localeCompare(a.startDate))
})

const paginatedEntries = computed(() => {
  const start = entriesPagination.value.pageIndex * entriesPagination.value.pageSize
  return filteredEntries.value.slice(start, start + entriesPagination.value.pageSize)
})

const totalEntryPages = computed(() => Math.ceil(filteredEntries.value.length / entriesPagination.value.pageSize))

// --- Summary helpers ---
function summaryColor(summary: EmployeeVacationSummary) {
  if (summary.remainingDays <= 0) return 'error'
  if (summary.remainingDays <= 5) return 'warning'
  return 'success'
}

// --- Summary click to filter ---
const selectedTab = ref('calendar')

function showEmployeeAbsences(employeeId: number) {
  filterEmployee.value = employeeId
  filterStatus.value = null
  entriesPagination.value.pageIndex = 0
  selectedTab.value = 'calendar'
}

// --- CSV export ---
function exportCSV() {
  if (!summaries.value?.length) return

  const headers = ['Employe', 'Jours total', 'Jours pris', 'Jours en attente', 'Jours restants']
  const rows = summaries.value.map(s => [
    s.employee.displayName,
    s.totalDays,
    s.usedDays,
    s.pendingDays,
    s.remainingDays
  ])

  const csv = [
    headers.join(';'),
    ...rows.map(r => r.join(';'))
  ].join('\n')

  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `bilan-vacances-${selectedYear.value}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

const calendarRef = ref()
</script>

<template>
  <UDashboardPanel id="vacances">
    <template #header>
      <UDashboardNavbar title="Vacances">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>

        <template #right>
          <USelect
            v-model="selectedYear"
            :items="yearOptions"
            value-key="value"
            class="w-24"
          />
          <UButton
            icon="i-lucide-plus"
            label="Nouvelle absence"
            @click="openNewVacation()"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTabs
        v-model="selectedTab"
        :items="tabs"
        :unmount-on-hide="false"
        class="w-full"
      >
        <template #calendar>
          <div class="space-y-6 p-1">
            <!-- Overlap warnings -->
            <div v-if="overlapDays.length" class="rounded-lg border border-warning/50 bg-warning/5 p-3">
              <div class="flex items-center gap-2 text-sm font-medium text-warning mb-2">
                <UIcon name="i-lucide-alert-triangle" class="size-4" />
                Chevauchements detectes ({{ overlapDays.length }} jour(s))
              </div>
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="overlap in overlapDays.slice(0, 10)"
                  :key="overlap.date"
                  color="warning"
                  variant="subtle"
                  size="xs"
                >
                  {{ formatDate(overlap.date) }} : {{ overlap.names.join(', ') }}
                </UBadge>
                <UBadge
                  v-if="overlapDays.length > 10"
                  color="warning"
                  variant="subtle"
                  size="xs"
                >
                  +{{ overlapDays.length - 10 }} autres
                </UBadge>
              </div>
            </div>

            <div class="flex flex-col items-center">
              <!-- Today button -->
              <div class="mb-3">
                <UButton
                  icon="i-lucide-calendar-check"
                  label="Aujourd'hui"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  @click="selectedYear = new Date().getFullYear()"
                />
              </div>

              <UCalendar
                ref="calendarRef"
                :default-placeholder="calendarPlaceholder"
                :number-of-months="2"
                :week-starts-on="1"
                fixed-weeks
                readonly
                size="lg"
                class="hidden md:block"
              >
                <template #day="{ day }">
                  <div
                    class="flex flex-col items-center gap-px w-full rounded-md px-1 py-0.5 transition-colors"
                    :class="[
                      isSunday(day) ? 'opacity-30 cursor-default' : 'hover:bg-elevated cursor-pointer',
                      getHolidayName(day) ? 'bg-error/5' : ''
                    ]"
                    @click.capture.stop.prevent="!isSunday(day) && openDayPopover(day)"
                  >
                    <span :class="[getHolidayName(day) ? 'text-error font-semibold' : '', isSunday(day) ? 'line-through' : '']">{{ day.day }}</span>
                    <div v-if="getHolidayName(day) && !getEntriesForDay(day).length" class="flex gap-px">
                      <span class="inline-block size-1.5 rounded-full bg-error/60" />
                    </div>
                    <div v-else-if="getEntriesForDay(day).length" class="flex gap-px">
                      <template v-for="entry in getEntriesForDay(day).slice(0, 3)" :key="entry.id">
                        <span
                          class="inline-block size-1.5 rounded-full"
                          :style="{ backgroundColor: entry.employeeColor }"
                          :title="entry.employeeName"
                        />
                      </template>
                      <span
                        v-if="getEntriesForDay(day).length > 3"
                        class="text-[8px] text-toned leading-none"
                      >
                        +{{ getEntriesForDay(day).length - 3 }}
                      </span>
                    </div>
                  </div>
                </template>
              </UCalendar>

              <!-- Mobile: single month -->
              <UCalendar
                :default-placeholder="calendarPlaceholder"
                :number-of-months="1"
                :week-starts-on="1"
                fixed-weeks
                readonly
                size="lg"
                class="md:hidden"
              >
                <template #day="{ day }">
                  <div
                    class="flex flex-col items-center gap-px w-full rounded-md px-1 py-0.5 transition-colors"
                    :class="[
                      isSunday(day) ? 'opacity-30 cursor-default' : 'hover:bg-elevated cursor-pointer',
                      getHolidayName(day) ? 'bg-error/5' : ''
                    ]"
                    @click.capture.stop.prevent="!isSunday(day) && openDayPopover(day)"
                  >
                    <span :class="[getHolidayName(day) ? 'text-error font-semibold' : '', isSunday(day) ? 'line-through' : '']">{{ day.day }}</span>
                    <div v-if="getHolidayName(day) && !getEntriesForDay(day).length" class="flex gap-px">
                      <span class="inline-block size-1.5 rounded-full bg-error/60" />
                    </div>
                    <div v-else-if="getEntriesForDay(day).length" class="flex gap-px">
                      <template v-for="entry in getEntriesForDay(day).slice(0, 3)" :key="entry.id">
                        <span
                          class="inline-block size-1.5 rounded-full"
                          :style="{ backgroundColor: entry.employeeColor }"
                        />
                      </template>
                      <span v-if="getEntriesForDay(day).length > 3" class="text-[8px] text-toned leading-none">
                        +{{ getEntriesForDay(day).length - 3 }}
                      </span>
                    </div>
                  </div>
                </template>
              </UCalendar>
            </div>

            <!-- Legend -->
            <div class="flex flex-wrap items-center justify-center gap-3">
              <div v-for="emp in (employees || []).filter(e => e.isActive)" :key="emp.id" class="flex items-center gap-1.5 text-xs">
                <span class="inline-block size-2.5 rounded-full" :style="{ backgroundColor: emp.color }" />
                {{ emp.displayName }}
              </div>
              <div class="flex items-center gap-1.5 text-xs">
                <span class="inline-block size-2.5 rounded-full bg-error/60" />
                Jour ferie
              </div>
            </div>

            <!-- Swiss holidays list -->
            <div class="space-y-1">
              <h3 class="text-sm font-medium text-highlighted">
                Jours feries {{ selectedYear }}
              </h3>
              <div class="flex flex-wrap gap-2">
                <UBadge
                  v-for="holiday in getSwissHolidays(selectedYear)"
                  :key="holiday.date"
                  color="error"
                  variant="subtle"
                  size="xs"
                >
                  {{ formatDate(holiday.date) }} · {{ holiday.name }}
                </UBadge>
              </div>
            </div>

            <!-- Entries list with filters -->
            <div class="space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <h3 class="text-sm font-medium text-highlighted">
                  Absences {{ selectedYear }}
                  <span v-if="filteredEntries.length" class="text-toned font-normal">({{ filteredEntries.length }})</span>
                </h3>
                <div class="flex items-center gap-2">
                  <USelect
                    v-model="filterEmployee"
                    :items="employeeFilterItems"
                    value-key="value"
                    placeholder="Employe"
                    class="w-44"
                    size="sm"
                  />
                  <USelect
                    v-model="filterStatus"
                    :items="statusFilterItems"
                    value-key="value"
                    placeholder="Statut"
                    class="w-36"
                    size="sm"
                  />
                </div>
              </div>

              <div v-if="paginatedEntries.length" class="divide-y divide-default rounded-lg border border-default">
                <div
                  v-for="entry in paginatedEntries"
                  :key="entry.id"
                  class="flex items-center justify-between gap-3 px-4 py-2.5"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <span
                      class="inline-block size-3 shrink-0 rounded-full"
                      :style="{ backgroundColor: entry.employeeColor }"
                    />
                    <div class="min-w-0">
                      <p class="truncate text-sm font-medium text-highlighted">
                        {{ entry.employeeName }}
                      </p>
                      <p class="text-xs text-toned">
                        {{ formatDate(entry.startDate) }}
                        <template v-if="entry.startDate !== entry.endDate">
                          — {{ formatDate(entry.endDate) }}
                        </template>
                        · {{ vacationEntryTypeLabels[entry.type] }}
                        · {{ entry.businessDays }}j
                      </p>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    <UBadge
                      :color="vacationEntryStatusColors[entry.status]"
                      variant="subtle"
                      :label="vacationEntryStatusLabels[entry.status]"
                      size="xs"
                    />
                    <UDropdownMenu
                      :content="{ align: 'end' }"
                      :items="[[
                        { label: 'Modifier', icon: 'i-lucide-pencil', onSelect: () => openEditVacation(entry) },
                        { label: 'Supprimer', icon: 'i-lucide-trash', color: 'error', onSelect: () => removeVacationEntry(entry.id) }
                      ]]"
                    >
                      <UButton
                        icon="i-lucide-ellipsis-vertical"
                        color="neutral"
                        variant="ghost"
                        size="xs"
                      />
                    </UDropdownMenu>
                  </div>
                </div>
              </div>
              <div v-else class="py-6 text-center text-sm text-toned">
                Aucune absence trouvee.
              </div>

              <!-- Pagination -->
              <div v-if="totalEntryPages > 1" class="flex items-center justify-between pt-2">
                <span class="text-xs text-toned">
                  Page {{ entriesPagination.pageIndex + 1 }} / {{ totalEntryPages }}
                </span>
                <div class="flex gap-1">
                  <UButton
                    icon="i-lucide-chevron-left"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :disabled="entriesPagination.pageIndex === 0"
                    @click="entriesPagination.pageIndex--"
                  />
                  <UButton
                    icon="i-lucide-chevron-right"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    :disabled="entriesPagination.pageIndex >= totalEntryPages - 1"
                    @click="entriesPagination.pageIndex++"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>

        <template #employees>
          <div class="space-y-4 p-1">
            <div class="flex justify-end">
              <UButton icon="i-lucide-user-plus" label="Nouvel employe" @click="createEmployeeOpen = true" />
            </div>

            <UTable
              v-model:pagination="employeePagination"
              v-model:sorting="employeeSorting"
              :pagination-options="{ getPaginationRowModel: getPaginationRowModel() }"
              :data="employees || []"
              :columns="employeeColumns"
              sticky="header"
              class="shrink-0"
              :ui="{
                base: 'table-fixed border-separate border-spacing-0',
                thead: '[&>tr]:bg-elevated/60 [&>tr]:after:content-none',
                tbody: '[&>tr]:last:[&>td]:border-b-0',
                th: 'py-1.5 first:rounded-l-lg last:rounded-r-lg border-y border-default first:border-l last:border-r text-xs',
                td: 'border-b border-default py-2 align-middle text-sm',
                separator: 'h-0'
              }"
            >
              <template #empty>
                <div class="flex flex-col items-center gap-2 py-10 text-center">
                  <UIcon name="i-lucide-users" class="size-8 text-dimmed" />
                  <p class="text-sm text-toned">
                    Aucun employe. Commencez par en ajouter un.
                  </p>
                  <UButton label="Ajouter un employe" size="sm" @click="createEmployeeOpen = true" />
                </div>
              </template>
            </UTable>
          </div>
        </template>

        <template #summary>
          <div class="space-y-6 p-1">
            <div class="flex items-center justify-between">
              <div v-if="!summaries?.length" class="text-sm text-toned">
                Aucun employe actif trouve.
              </div>
              <div v-else />
              <UButton
                v-if="summaries?.length"
                icon="i-lucide-download"
                label="Exporter CSV"
                color="neutral"
                variant="soft"
                size="sm"
                @click="exportCSV"
              />
            </div>

            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <UCard
                v-for="summary in summaries"
                :key="summary.employee.id"
                variant="subtle"
                class="cursor-pointer transition-shadow hover:shadow-md"
                @click="showEmployeeAbsences(summary.employee.id)"
              >
                <div class="space-y-3">
                  <div class="flex items-center gap-2">
                    <span
                      class="inline-block size-3 shrink-0 rounded-full"
                      :style="{ backgroundColor: summary.employee.color }"
                    />
                    <span class="font-medium text-highlighted">{{ summary.employee.displayName }}</span>
                  </div>

                  <!-- Double progress bar: used (solid) + pending (lighter) -->
                  <div class="space-y-1">
                    <div class="relative h-2 w-full overflow-hidden rounded-full bg-accented">
                      <div
                        class="absolute inset-y-0 left-0 rounded-full transition-all"
                        :class="{
                          'bg-success': summaryColor(summary) === 'success',
                          'bg-warning': summaryColor(summary) === 'warning',
                          'bg-error': summaryColor(summary) === 'error'
                        }"
                        :style="{ width: `${Math.min((summary.usedDays / summary.totalDays) * 100, 100)}%` }"
                      />
                      <div
                        v-if="summary.pendingDays > 0"
                        class="absolute inset-y-0 rounded-full transition-all opacity-40"
                        :class="{
                          'bg-success': summaryColor(summary) === 'success',
                          'bg-warning': summaryColor(summary) === 'warning',
                          'bg-error': summaryColor(summary) === 'error'
                        }"
                        :style="{
                          left: `${Math.min((summary.usedDays / summary.totalDays) * 100, 100)}%`,
                          width: `${Math.min((summary.pendingDays / summary.totalDays) * 100, 100 - (summary.usedDays / summary.totalDays) * 100)}%`
                        }"
                      />
                    </div>
                    <div class="flex items-center justify-between text-[10px] text-toned">
                      <div class="flex items-center gap-2">
                        <span class="flex items-center gap-1">
                          <span
                            class="inline-block size-1.5 rounded-full"
                            :class="{
                              'bg-success': summaryColor(summary) === 'success',
                              'bg-warning': summaryColor(summary) === 'warning',
                              'bg-error': summaryColor(summary) === 'error'
                            }"
                          />
                          {{ summary.usedDays }}j pris
                        </span>
                        <span v-if="summary.pendingDays > 0" class="flex items-center gap-1">
                          <span
                            class="inline-block size-1.5 rounded-full opacity-40"
                            :class="{
                              'bg-success': summaryColor(summary) === 'success',
                              'bg-warning': summaryColor(summary) === 'warning',
                              'bg-error': summaryColor(summary) === 'error'
                            }"
                          />
                          {{ summary.pendingDays }}j en attente
                        </span>
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center justify-between text-xs text-toned">
                    <span>{{ summary.usedDays + summary.pendingDays }} / {{ summary.totalDays }} jours</span>
                    <span
                      :class="{
                        'text-success font-medium': summary.remainingDays > 5,
                        'text-warning font-medium': summary.remainingDays > 0 && summary.remainingDays <= 5,
                        'text-error font-medium': summary.remainingDays <= 0
                      }"
                    >
                      {{ summary.remainingDays }} restant(s)
                    </span>
                  </div>
                </div>
              </UCard>
            </div>
          </div>
        </template>
      </UTabs>
    </template>
  </UDashboardPanel>

  <PosEmployeeSlideover
    v-model:open="createEmployeeOpen"
    title="Nouvel employe"
    description="Ajoutez un employe pour gerer ses vacances."
    submit-label="Creer l'employe"
    @save="saveEmployee"
  />

  <PosEmployeeSlideover
    v-model:open="editEmployeeOpen"
    title="Modifier l'employe"
    description="Mettez a jour les informations de l'employe."
    submit-label="Enregistrer"
    :initial-value="editingEmployeeForm"
    @save="saveEmployee"
  />

  <PosVacationEntryModal
    v-model:open="vacationModalOpen"
    :employees="employees || []"
    :editing-entry="editingEntry"
    :prefill-date="prefillDate"
    @save="saveVacationEntry"
  />

  <!-- Day detail popover modal -->
  <UModal v-model:open="popoverOpen" :title="popoverDateStr ? formatDate(popoverDateStr) : ''">
    <template #body>
      <div class="space-y-3">
        <UBadge v-if="popoverHoliday" color="error" variant="subtle">
          {{ popoverHoliday }}
        </UBadge>

        <div v-if="popoverEntries.length" class="space-y-2">
          <div
            v-for="entry in popoverEntries"
            :key="entry.id"
            class="flex items-center justify-between gap-2 rounded-md bg-elevated/50 px-3 py-2"
          >
            <div class="flex items-center gap-2 text-sm">
              <span
                class="inline-block size-2.5 shrink-0 rounded-full"
                :style="{ backgroundColor: entry.employeeColor }"
              />
              <span class="font-medium">{{ entry.employeeName }}</span>
            </div>
            <div class="flex items-center gap-2">
              <UBadge :color="vacationEntryStatusColors[entry.status]" variant="subtle" size="xs">
                {{ vacationEntryTypeLabels[entry.type] }}
              </UBadge>
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="popoverOpen = false; openEditVacation(entry)"
              />
            </div>
          </div>
        </div>
        <p v-else class="text-sm text-toned">
          Aucune absence ce jour.
        </p>

        <UButton
          icon="i-lucide-plus"
          label="Ajouter une absence"
          size="sm"
          variant="soft"
          block
          @click="popoverOpen = false; openNewVacation(popoverDateStr)"
        />
      </div>
    </template>
  </UModal>

  <!-- Delete confirmation modal -->
  <UModal v-model:open="deleteConfirmOpen" title="Supprimer l'employe ?">
    <template #body>
      <p class="text-sm text-toned">
        Etes-vous sur de vouloir supprimer <strong>{{ employeeToDelete?.displayName }}</strong> ?
        Toutes ses absences seront egalement supprimees. Cette action est irreversible.
      </p>
      <div class="flex justify-end gap-2 mt-4">
        <UButton
          label="Annuler"
          color="neutral"
          variant="ghost"
          @click="deleteConfirmOpen = false"
        />
        <UButton
          label="Supprimer"
          color="error"
          icon="i-lucide-trash"
          @click="removeEmployee"
        />
      </div>
    </template>
  </UModal>
</template>
