<script setup lang="ts">
import type { TableColumn, TabsItem } from '@nuxt/ui'
import { getPaginationRowModel } from '@tanstack/table-core'
import { CalendarDate } from '@internationalized/date'
import type { EmployeeRecord, EmployeeVacationSummary, VacationEntryListItem } from '~~/shared/types/pos'
import { vacationEntryTypeLabels, vacationEntryStatusLabels, vacationEntryStatusColors } from '~~/shared/constants/pos'
import { formatDate, getSwissHolidayMap, getSwissHolidays } from '~~/shared/utils/pos'

const UButton = resolveComponent('UButton')
const UBadge = resolveComponent('UBadge')
const UDropdownMenu = resolveComponent('UDropdownMenu')

const toast = useToast()

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

async function saveEmployee(payload: any) {
  if (editingEmployee.value) {
    await $fetch(`/api/employees/${editingEmployee.value.id}`, { method: 'PATCH', body: payload })
    toast.add({ title: 'Employé mis à jour', color: 'success' })
    editEmployeeOpen.value = false
    editingEmployee.value = null
  } else {
    await $fetch('/api/employees', { method: 'POST', body: payload })
    toast.add({ title: 'Employé créé', color: 'success' })
    createEmployeeOpen.value = false
  }
  await refreshAll()
}

async function removeEmployee(id: number) {
  await $fetch(`/api/employees/${id}`, { method: 'DELETE' })
  toast.add({ title: 'Employé supprimé', color: 'success' })
  await refreshAll()
}

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
    color: 'error',
    onSelect() {
      removeEmployee(emp.id)
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

function openNewVacation() {
  editingEntry.value = null
  vacationModalOpen.value = true
}

function openEditVacation(entry: VacationEntryListItem) {
  editingEntry.value = entry
  vacationModalOpen.value = true
}

async function saveVacationEntry(payload: any) {
  if (editingEntry.value) {
    await $fetch(`/api/vacations/${editingEntry.value.id}`, { method: 'PATCH', body: payload })
    toast.add({ title: 'Absence mise à jour', color: 'success' })
  } else {
    await $fetch('/api/vacations', { method: 'POST', body: payload })
    toast.add({ title: 'Absence créée', color: 'success' })
  }
  vacationModalOpen.value = false
  editingEntry.value = null
  await refreshAll()
}

async function removeVacationEntry(id: number) {
  await $fetch(`/api/vacations/${id}`, { method: 'DELETE' })
  toast.add({ title: 'Absence supprimée', color: 'success' })
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

// --- Summary helpers ---
function summaryColor(summary: EmployeeVacationSummary) {
  if (summary.remainingDays <= 0) return 'error'
  if (summary.remainingDays <= 5) return 'warning'
  return 'success'
}

// --- Entries list for calendar tab ---
const recentEntries = computed(() => {
  return (entries.value || []).slice(0, 20)
})
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
            @click="openNewVacation"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UTabs :items="tabs" :unmount-on-hide="false" default-value="calendar" class="w-full">
        <template #calendar>
          <div class="space-y-6 p-1">
            <div class="flex flex-col items-center">
              <UCalendar
                :default-placeholder="calendarPlaceholder"
                :number-of-months="2"
                :week-starts-on="1"
                fixed-weeks
                week-numbers
                readonly
                size="lg"
              >
                <template #day="{ day }">
                  <div class="flex flex-col items-center gap-px" :title="getHolidayName(day)">
                    <span :class="getHolidayName(day) ? 'text-error font-semibold' : ''">{{ day.day }}</span>
                    <div v-if="getHolidayName(day) && !getEntriesForDay(day).length" class="flex gap-px">
                      <span class="inline-block size-1.5 rounded-full bg-error/60" />
                    </div>
                    <div v-else-if="getEntriesForDay(day).length" class="flex gap-px">
                      <template v-for="(entry, i) in getEntriesForDay(day).slice(0, 3)" :key="entry.id">
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
            </div>

            <!-- Legend -->
            <div class="flex flex-wrap items-center justify-center gap-3">
              <div v-for="emp in (employees || []).filter(e => e.isActive)" :key="emp.id" class="flex items-center gap-1.5 text-xs">
                <span class="inline-block size-2.5 rounded-full" :style="{ backgroundColor: emp.color }" />
                {{ emp.displayName }}
              </div>
              <div class="flex items-center gap-1.5 text-xs">
                <span class="inline-block size-2.5 rounded-full bg-error/60" />
                Jour férié
              </div>
            </div>

            <!-- Swiss holidays list -->
            <div class="space-y-1">
              <h3 class="text-sm font-medium text-highlighted">Jours fériés {{ selectedYear }}</h3>
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

            <!-- Recent entries list -->
            <div v-if="recentEntries.length" class="space-y-2">
              <h3 class="text-sm font-medium text-highlighted">Absences {{ selectedYear }}</h3>
              <div class="divide-y divide-default rounded-lg border border-default">
                <div
                  v-for="entry in recentEntries"
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
                      <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" size="xs" />
                    </UDropdownMenu>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>

        <template #employees>
          <div class="space-y-4 p-1">
            <div class="flex justify-end">
              <UButton icon="i-lucide-user-plus" label="Nouvel employé" @click="createEmployeeOpen = true" />
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
                  <p class="text-sm text-toned">Aucun employé. Commencez par en ajouter un.</p>
                  <UButton label="Ajouter un employé" size="sm" @click="createEmployeeOpen = true" />
                </div>
              </template>
            </UTable>
          </div>
        </template>

        <template #summary>
          <div class="space-y-6 p-1">
            <div v-if="!summaries?.length" class="py-10 text-center text-sm text-toned">
              Aucun employé actif trouvé.
            </div>

            <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <UCard v-for="summary in summaries" :key="summary.employee.id" variant="subtle">
                <div class="space-y-3">
                  <div class="flex items-center gap-2">
                    <span
                      class="inline-block size-3 shrink-0 rounded-full"
                      :style="{ backgroundColor: summary.employee.color }"
                    />
                    <span class="font-medium text-highlighted">{{ summary.employee.displayName }}</span>
                  </div>

                  <UProgress
                    :model-value="summary.usedDays"
                    :max="summary.totalDays"
                    :color="summaryColor(summary)"
                    size="sm"
                    status
                  />

                  <div class="flex items-center justify-between text-xs text-toned">
                    <span>{{ summary.usedDays }} pris / {{ summary.totalDays }} jours</span>
                    <span>
                      {{ summary.remainingDays }} restant(s)
                      <template v-if="summary.pendingDays > 0">
                        · {{ summary.pendingDays }} en attente
                      </template>
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
    title="Nouvel employé"
    description="Ajoutez un employé pour gérer ses vacances."
    submit-label="Créer l'employé"
    @save="saveEmployee"
  />

  <PosEmployeeSlideover
    v-model:open="editEmployeeOpen"
    title="Modifier l'employé"
    description="Mettez à jour les informations de l'employé."
    submit-label="Enregistrer"
    :initial-value="editingEmployeeForm"
    @save="saveEmployee"
  />

  <PosVacationEntryModal
    v-model:open="vacationModalOpen"
    :employees="employees || []"
    :editing-entry="editingEntry"
    @save="saveVacationEntry"
  />
</template>
