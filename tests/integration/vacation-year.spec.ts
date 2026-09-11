import { createClient } from '@libsql/client'
import { defineRelations } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/libsql'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as schema from '../../server/db/schema'
import {
  createEmployee,
  createVacationEntry,
  getVacationSummariesByYear,
  getVacationYearData,
  listEmployees,
  listVacationEntries,
  updateEmployee,
  updateVacationEntry
} from '../../server/utils/pos/vacations'

const context = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('../../server/utils/turso', () => ({ useDb: () => context.db }))
vi.mock('../../server/utils/pos/schema', () => ({ ensurePosSchema: async () => {} }))

describe('shared annual vacation data', () => {
  let client: ReturnType<typeof createClient>

  beforeEach(async () => {
    client = createClient({ url: 'file::memory:' })
    context.db = drizzle({ client, relations: defineRelations(schema) })
    await client.batch([
      `CREATE TABLE employees (
        id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT NOT NULL, last_name TEXT NOT NULL,
        email TEXT, color TEXT NOT NULL, vacation_days_per_year INTEGER NOT NULL,
        is_active INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
      )`,
      `CREATE TABLE vacation_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT, employee_id INTEGER NOT NULL,
        start_date TEXT NOT NULL, end_date TEXT NOT NULL, type TEXT NOT NULL,
        status TEXT NOT NULL, business_days REAL NOT NULL, notes TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE
      )`,
      'CREATE INDEX vacation_entries_start_date_idx ON vacation_entries(start_date)',
      'CREATE INDEX vacation_entries_end_date_idx ON vacation_entries(end_date)'
    ], 'write')
  })

  afterEach(() => {
    client.close()
  })

  async function seedYear() {
    const inactive = await createEmployee({ firstName: 'Zoé', lastName: 'Zulu', color: '#666666', isActive: false })
    const active = await createEmployee({ firstName: 'Ada', lastName: 'Alpha', color: '#008000', vacationDaysPerYear: 20 })
    const withoutAbsences = await createEmployee({ firstName: 'Bruno', lastName: 'Bravo', color: '#0088ff' })

    const spanningYear = await createVacationEntry({ employeeId: active.id, startDate: '2025-12-29', endDate: '2026-01-05', status: 'approved' })
    const halfDay = await createVacationEntry({ employeeId: active.id, startDate: '2026-02-03', endDate: '2026-02-03', type: 'half_day_am', status: 'pending' })
    await createVacationEntry({ employeeId: active.id, startDate: '2026-02-04', endDate: '2026-02-04', type: 'half_day_pm', status: 'approved' })
    await createVacationEntry({ employeeId: active.id, startDate: '2026-02-05', endDate: '2026-02-05', status: 'rejected' })
    await createVacationEntry({ employeeId: inactive.id, startDate: '2026-02-06', endDate: '2026-02-06', status: 'approved' })
    await createVacationEntry({ employeeId: active.id, startDate: '2024-01-08', endDate: '2024-01-08', status: 'approved' })
    await createVacationEntry({ employeeId: active.id, startDate: '2027-01-08', endDate: '2027-01-08', status: 'approved' })

    return { inactive, active, withoutAbsences, spanningYear, halfDay }
  }

  it('returns the existing three projections using one two-statement batch without employee joins', async () => {
    await seedYear()
    const expectedEmployees = await listEmployees()
    const expectedEntries = await listVacationEntries({ year: 2026 })
    const expectedSummaries = await getVacationSummariesByYear(2026)
    const batchSpy = vi.spyOn(client, 'batch')
    const executeSpy = vi.spyOn(client, 'execute')

    const result = await getVacationYearData(2026)

    expect(result).toEqual({ year: 2026, employees: expectedEmployees, entries: expectedEntries, summaries: expectedSummaries })
    expect(batchSpy).toHaveBeenCalledOnce()
    expect(batchSpy.mock.calls[0]?.[0]).toHaveLength(2)
    expect(JSON.stringify(batchSpy.mock.calls[0]?.[0])).not.toMatch(/join/i)
    expect(executeSpy).not.toHaveBeenCalled()
  })

  it('preserves half days, year overlap, rejected absences and inactive calendar entries', async () => {
    const { active, inactive, withoutAbsences, spanningYear } = await seedYear()
    const result = await getVacationYearData(2026)

    expect(result.employees.map(employee => employee.id)).toEqual([active.id, withoutAbsences.id, inactive.id])
    expect(result.entries).toHaveLength(5)
    expect(result.entries[0]).toMatchObject({ id: spanningYear.id, businessDays: 5, startDate: '2025-12-29', endDate: '2026-01-05' })
    expect(result.entries.some(entry => entry.status === 'rejected')).toBe(true)
    expect(result.entries.some(entry => entry.employeeId === inactive.id)).toBe(true)
    expect(result.summaries).toHaveLength(2)
    // January 1-2 are holidays and January 4 is a Sunday; Saturday still counts.
    expect(result.summaries[0]).toMatchObject({ employee: { id: active.id }, totalDays: 20, usedDays: 2.5, pendingDays: 0.5, remainingDays: 17.5 })
    expect(result.summaries[1]).toMatchObject({ employee: { id: withoutAbsences.id }, totalDays: 25, usedDays: 0, pendingDays: 0, remainingDays: 25 })

    const previousYear = await getVacationYearData(2025)
    expect(previousYear.entries.map(entry => entry.id)).toEqual([spanningYear.id])
    expect(previousYear.summaries[0]).toMatchObject({ usedDays: 3, remainingDays: 17 })
  })

  it('returns fresh names, colors, allowances and absence balances after writes', async () => {
    const { active, halfDay } = await seedYear()
    await getVacationYearData(2026)
    await updateEmployee(active.id, { firstName: 'Aline', color: '#ff0000', vacationDaysPerYear: 30 })
    await updateVacationEntry(halfDay.id, { status: 'approved' })

    const result = await getVacationYearData(2026)

    expect(result.employees[0]).toMatchObject({ firstName: 'Aline', color: '#ff0000', vacationDaysPerYear: 30 })
    expect(result.entries.find(entry => entry.id === halfDay.id)).toMatchObject({ employeeName: 'Aline Alpha', employeeColor: '#ff0000', status: 'approved' })
    expect(result.summaries[0]).toMatchObject({ totalDays: 30, usedDays: 3, pendingDays: 0, remainingDays: 27 })
  })

  it('keeps the individual list filters and handles a year with no employees', async () => {
    expect(await getVacationYearData(2026)).toEqual({ year: 2026, employees: [], entries: [], summaries: [] })
    const { inactive } = await seedYear()
    const result = await listVacationEntries({ year: 2026, employeeId: inactive.id })
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ employeeId: inactive.id, employeeName: 'Zoé Zulu' })
  })
})
