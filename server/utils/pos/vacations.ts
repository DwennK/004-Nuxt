import { createError } from 'h3'
import { asc, eq, and, gte, lte, ne } from 'drizzle-orm'
import { employees, vacationEntries } from '~~/server/db/schema'
import { employeeColorPalette } from '~~/shared/constants/pos'
import type {
  EmployeeRecord,
  EmployeeVacationSummary,
  VacationEntryListItem,
  VacationEntryRecord,
  VacationEntryStatus,
  VacationEntryType
} from '~~/shared/types/pos'
import type { VacationYearData } from '~~/shared/types/vacations'
import { getSwissHolidaySet, isWorkingDay } from '~~/shared/utils/pos'
import type { PosDatabaseExecutor } from '../turso'
import { useDb } from '../turso'
import { ensurePosSchema } from '~~/server/utils/pos/schema'
import { normalizeOptionalText } from '~~/shared/lib/text'

function mapEmployee(row: typeof employees.$inferSelect): EmployeeRecord {
  const displayName = [row.firstName, row.lastName].filter(Boolean).join(' ').trim() || 'Employé'
  const initials = ((row.firstName?.[0] || '') + (row.lastName?.[0] || '')).toUpperCase() || '?'

  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    color: row.color,
    displayName,
    initials,
    vacationDaysPerYear: row.vacationDaysPerYear,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function mapVacationEntry(row: typeof vacationEntries.$inferSelect): VacationEntryRecord {
  return {
    id: row.id,
    employeeId: row.employeeId,
    startDate: row.startDate,
    endDate: row.endDate,
    type: row.type as VacationEntryRecord['type'],
    status: row.status as VacationEntryRecord['status'],
    businessDays: row.businessDays,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

// --- Employees ---

export async function listEmployees() {
  await ensurePosSchema()
  const db = useDb()

  const rows = await db.select()
    .from(employees)
    .orderBy(asc(employees.lastName), asc(employees.firstName))

  return rows.map(mapEmployee)
}

export async function getEmployeeById(id: number) {
  await ensurePosSchema()
  const db = useDb()

  const rows = await db.select().from(employees).where(eq(employees.id, id)).limit(1)
  const row = rows[0]

  if (!row) {
    throw createError({ statusCode: 404, statusMessage: 'Employee not found' })
  }

  return mapEmployee(row)
}

export async function createEmployee(input: {
  firstName: string
  lastName: string
  email?: string | null
  color: string
  vacationDaysPerYear?: number
  isActive?: boolean
}) {
  await ensurePosSchema()
  const db = useDb()
  const now = new Date().toISOString()

  const rows = await db.insert(employees).values({
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    email: normalizeOptionalText(input.email),
    color: input.color,
    vacationDaysPerYear: input.vacationDaysPerYear ?? 25,
    isActive: input.isActive ?? true,
    createdAt: now,
    updatedAt: now
  }).returning()

  return mapEmployee(rows[0]!)
}

export async function updateEmployee(id: number, input: {
  firstName?: string
  lastName?: string
  email?: string | null
  color?: string
  vacationDaysPerYear?: number
  isActive?: boolean
}) {
  await ensurePosSchema()
  const db = useDb()

  const existing = await db.select().from(employees).where(eq(employees.id, id)).limit(1)
  if (!existing[0]) {
    throw createError({ statusCode: 404, statusMessage: 'Employee not found' })
  }

  const rows = await db.update(employees)
    .set({
      firstName: input.firstName?.trim() ?? existing[0].firstName,
      lastName: input.lastName?.trim() ?? existing[0].lastName,
      email: input.email !== undefined ? normalizeOptionalText(input.email) : existing[0].email,
      color: input.color ?? existing[0].color,
      vacationDaysPerYear: input.vacationDaysPerYear ?? existing[0].vacationDaysPerYear,
      isActive: input.isActive ?? existing[0].isActive,
      updatedAt: new Date().toISOString()
    })
    .where(eq(employees.id, id))
    .returning()

  return mapEmployee(rows[0]!)
}

export async function deleteEmployee(id: number) {
  await ensurePosSchema()
  const db = useDb()
  const result = await db.delete(employees).where(eq(employees.id, id))
  return result.rowsAffected
}

export async function getNextEmployeeColor(): Promise<string> {
  await ensurePosSchema()
  const db = useDb()
  const rows = await db.select({ id: employees.id }).from(employees)
  return employeeColorPalette[rows.length % employeeColorPalette.length]!
}

// --- Vacation Entries ---

export async function listVacationEntries(filters?: { year?: number, employeeId?: number }) {
  await ensurePosSchema()
  const db = useDb()

  const conditions = []

  if (filters?.year) {
    conditions.push(lte(vacationEntries.startDate, `${filters.year}-12-31`))
    conditions.push(gte(vacationEntries.endDate, `${filters.year}-01-01`))
  }

  if (filters?.employeeId) {
    conditions.push(eq(vacationEntries.employeeId, filters.employeeId))
  }

  const rows = await db.select({
    entry: vacationEntries,
    employeeFirstName: employees.firstName,
    employeeLastName: employees.lastName,
    employeeColor: employees.color
  })
    .from(vacationEntries)
    .innerJoin(employees, eq(vacationEntries.employeeId, employees.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(vacationEntries.startDate))

  return rows.map((row): VacationEntryListItem => {
    const name = [row.employeeFirstName, row.employeeLastName].filter(Boolean).join(' ').trim()
    const initials = ((row.employeeFirstName?.[0] || '') + (row.employeeLastName?.[0] || '')).toUpperCase()

    return {
      ...mapVacationEntry(row.entry),
      employeeName: name,
      employeeColor: row.employeeColor,
      employeeInitials: initials
    }
  })
}

type VacationDates = Pick<VacationEntryRecord, 'startDate' | 'endDate' | 'type'>

function vacationSlots(entry: VacationDates, year?: number) {
  const start = year ? [entry.startDate, `${year}-01-01`].sort()[1]! : entry.startDate
  const end = year ? [entry.endDate, `${year}-12-31`].sort()[0]! : entry.endDate
  const slots = new Set<string>()
  const holidays = new Map<number, Set<string>>()
  for (const current = new Date(`${start}T12:00:00`); current <= new Date(`${end}T12:00:00`); current.setDate(current.getDate() + 1)) {
    const currentYear = current.getFullYear()
    if (!holidays.has(currentYear)) holidays.set(currentYear, getSwissHolidaySet(currentYear))
    if (!isWorkingDay(current, holidays.get(currentYear))) continue
    const day = `${currentYear}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`
    if (entry.type !== 'half_day_pm') slots.add(`${day}:am`)
    if (entry.type !== 'half_day_am') slots.add(`${day}:pm`)
  }
  return slots
}

async function assertVacationAvailable(db: PosDatabaseExecutor, entry: VacationDates & {
  employeeId: number
  status: VacationEntryStatus
}, excludeId?: number) {
  if (entry.status === 'rejected') return
  const candidates = await db.select().from(vacationEntries).where(and(
    eq(vacationEntries.employeeId, entry.employeeId),
    ne(vacationEntries.status, 'rejected'),
    lte(vacationEntries.startDate, entry.endDate),
    gte(vacationEntries.endDate, entry.startDate),
    excludeId === undefined ? undefined : ne(vacationEntries.id, excludeId)
  ))
  const requested = vacationSlots(entry)
  if (candidates.some(candidate => [...vacationSlots(candidate)].some(slot => requested.has(slot)))) {
    throw createError({ statusCode: 409, statusMessage: 'Une absence existe déjà pour cet employé sur cette période.' })
  }
}

export async function createVacationEntry(input: {
  employeeId: number
  startDate: string
  endDate: string
  type?: VacationEntryType
  status?: VacationEntryStatus
  notes?: string | null
}) {
  await ensurePosSchema()
  return useDb().transaction(async (tx) => {
    const now = new Date().toISOString()
    const entry = { ...input, type: input.type || 'full_day', status: input.status || 'pending' } as const
    await assertVacationAvailable(tx, entry)
    const rows = await tx.insert(vacationEntries).values({
      ...entry,
      businessDays: vacationSlots(entry).size / 2,
      notes: normalizeOptionalText(input.notes),
      createdAt: now,
      updatedAt: now
    }).returning()
    return mapVacationEntry(rows[0]!)
  })
}

export async function updateVacationEntry(id: number, input: {
  employeeId?: number
  startDate?: string
  endDate?: string
  type?: VacationEntryType
  status?: VacationEntryStatus
  notes?: string | null
}) {
  await ensurePosSchema()
  return useDb().transaction(async (tx) => {
    const [existing] = await tx.select().from(vacationEntries).where(eq(vacationEntries.id, id)).limit(1)
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Vacation entry not found' })
    const entry = {
      employeeId: input.employeeId ?? existing.employeeId,
      startDate: input.startDate ?? existing.startDate,
      endDate: input.endDate ?? existing.endDate,
      type: input.type ?? existing.type,
      status: input.status ?? existing.status
    }
    await assertVacationAvailable(tx, entry, id)
    const rows = await tx.update(vacationEntries).set({
      ...entry,
      businessDays: vacationSlots(entry).size / 2,
      notes: input.notes !== undefined ? normalizeOptionalText(input.notes) : existing.notes,
      updatedAt: new Date().toISOString()
    }).where(eq(vacationEntries.id, id)).returning()
    return mapVacationEntry(rows[0]!)
  })
}

export async function deleteVacationEntry(id: number) {
  await ensurePosSchema()
  const db = useDb()
  const result = await db.delete(vacationEntries).where(eq(vacationEntries.id, id))
  return result.rowsAffected
}

export async function getVacationSummariesByYear(year: number): Promise<EmployeeVacationSummary[]> {
  await ensurePosSchema()
  const db = useDb()

  const allEmployees = await db.select().from(employees).where(eq(employees.isActive, true)).orderBy(asc(employees.lastName))
  const entries = await db.select()
    .from(vacationEntries)
    .where(and(
      lte(vacationEntries.startDate, `${year}-12-31`),
      gte(vacationEntries.endDate, `${year}-01-01`)
    ))

  return summarizeVacationEntries(year, allEmployees, entries)
}

function summarizeVacationEntries(
  year: number,
  employeeRows: (typeof employees.$inferSelect)[],
  entries: (typeof vacationEntries.$inferSelect)[]
): EmployeeVacationSummary[] {
  const entriesByEmployeeId = new Map<number, typeof entries>()

  for (const entry of entries) {
    const employeeEntries = entriesByEmployeeId.get(entry.employeeId)

    if (employeeEntries) {
      employeeEntries.push(entry)
      continue
    }

    entriesByEmployeeId.set(entry.employeeId, [entry])
  }

  return employeeRows.filter(employee => employee.isActive).map((emp) => {
    const employeeEntries = entriesByEmployeeId.get(emp.id) ?? []
    const employee = mapEmployee(emp)

    // Count each working half-day once, including overlapping legacy entries.
    const approved = new Set<string>()
    const pending = new Set<string>()
    for (const entry of employeeEntries) {
      if (entry.status === 'rejected') continue
      const target = entry.status === 'approved' ? approved : pending
      for (const slot of vacationSlots(entry, year)) target.add(slot)
    }
    const usedDays = approved.size / 2
    const pendingDays = [...pending].filter(slot => !approved.has(slot)).length / 2

    return {
      employee,
      year,
      totalDays: emp.vacationDaysPerYear,
      usedDays,
      pendingDays,
      remainingDays: emp.vacationDaysPerYear - usedDays
    }
  })
}

export async function getVacationYearData(year: number): Promise<VacationYearData> {
  await ensurePosSchema()
  const db = useDb()

  // The calendar, employee table and annual balances share these two reads.
  // A batch also keeps them on the same snapshot during concurrent edits.
  const [employeeRows, entryRows] = await db.batch([
    db.select().from(employees).orderBy(asc(employees.lastName), asc(employees.firstName)),
    db.select().from(vacationEntries)
      .where(and(
        lte(vacationEntries.startDate, `${year}-12-31`),
        gte(vacationEntries.endDate, `${year}-01-01`)
      ))
      .orderBy(asc(vacationEntries.startDate))
  ])

  const employeeById = new Map(employeeRows.map(employee => [employee.id, employee]))
  const entries: VacationEntryListItem[] = []

  for (const entry of entryRows) {
    const employee = employeeById.get(entry.employeeId)
    // Match the existing list endpoint's inner join, including inactive employees.
    if (!employee) continue

    entries.push({
      ...mapVacationEntry(entry),
      employeeName: [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim(),
      employeeColor: employee.color,
      employeeInitials: ((employee.firstName?.[0] || '') + (employee.lastName?.[0] || '')).toUpperCase()
    })
  }

  return {
    year,
    employees: employeeRows.map(mapEmployee),
    entries,
    summaries: summarizeVacationEntries(year, employeeRows, entryRows)
  }
}
