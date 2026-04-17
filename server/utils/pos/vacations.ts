import { asc, eq, and, gte, lte } from 'drizzle-orm'
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
import { countBusinessDays, countBusinessDaysInYear } from '~~/shared/utils/pos'
import { useDb } from '../turso'
import { ensurePosSchema, normalizeOptionalText } from './core'

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

export async function createVacationEntry(input: {
  employeeId: number
  startDate: string
  endDate: string
  type?: VacationEntryType
  status?: VacationEntryStatus
  notes?: string | null
}) {
  await ensurePosSchema()
  const db = useDb()
  const now = new Date().toISOString()

  const entryType: VacationEntryType = input.type || 'full_day'
  const entryStatus: VacationEntryStatus = input.status || 'pending'
  const businessDays = entryType === 'full_day'
    ? countBusinessDays(input.startDate, input.endDate)
    : 0.5

  const rows = await db.insert(vacationEntries).values({
    employeeId: input.employeeId,
    startDate: input.startDate,
    endDate: input.endDate,
    type: entryType,
    status: entryStatus,
    businessDays,
    notes: normalizeOptionalText(input.notes),
    createdAt: now,
    updatedAt: now
  }).returning()

  return mapVacationEntry(rows[0]!)
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
  const db = useDb()

  const existing = await db.select().from(vacationEntries).where(eq(vacationEntries.id, id)).limit(1)
  if (!existing[0]) {
    throw createError({ statusCode: 404, statusMessage: 'Vacation entry not found' })
  }

  const startDate = input.startDate ?? existing[0].startDate
  const endDate = input.endDate ?? existing[0].endDate
  const entryType: VacationEntryType = input.type ?? existing[0].type

  const businessDays = entryType === 'full_day'
    ? countBusinessDays(startDate, endDate)
    : 0.5

  const rows = await db.update(vacationEntries)
    .set({
      employeeId: input.employeeId ?? existing[0].employeeId,
      startDate,
      endDate,
      type: entryType,
      status: input.status ?? existing[0].status,
      businessDays,
      notes: input.notes !== undefined ? normalizeOptionalText(input.notes) : existing[0].notes,
      updatedAt: new Date().toISOString()
    })
    .where(eq(vacationEntries.id, id))
    .returning()

  return mapVacationEntry(rows[0]!)
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

  const entriesByEmployeeId = new Map<number, typeof entries>()

  for (const entry of entries) {
    const employeeEntries = entriesByEmployeeId.get(entry.employeeId)

    if (employeeEntries) {
      employeeEntries.push(entry)
      continue
    }

    entriesByEmployeeId.set(entry.employeeId, [entry])
  }

  return allEmployees.map((emp) => {
    const employeeEntries = entriesByEmployeeId.get(emp.id) ?? []
    const employee = mapEmployee(emp)

    let usedDays = 0
    let pendingDays = 0

    for (const entry of employeeEntries) {
      const type = entry.type as VacationEntryRecord['type']
      const daysInYear = type === 'full_day'
        ? countBusinessDaysInYear(entry.startDate, entry.endDate, year)
        : 0.5

      if (entry.status === 'approved') {
        usedDays += daysInYear
      } else if (entry.status === 'pending') {
        pendingDays += daysInYear
      }
    }

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
