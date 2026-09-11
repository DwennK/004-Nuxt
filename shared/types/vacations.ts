import type { EmployeeRecord, EmployeeVacationSummary, VacationEntryListItem } from './pos'

export interface VacationYearData {
  year: number
  employees: EmployeeRecord[]
  entries: VacationEntryListItem[]
  summaries: EmployeeVacationSummary[]
}
