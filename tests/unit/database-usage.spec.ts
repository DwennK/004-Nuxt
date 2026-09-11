import { describe, expect, it } from 'vitest'
import { summarizeUsage } from '../../scripts/db/usage.mjs'

describe('Turso usage budgeting', () => {
  it('keeps unavailable metrics distinct from zero', () => {
    const summary = summarizeUsage({}, { now: new Date('2026-09-11T12:00:00Z') })
    expect(summary.reads).toMatchObject({ used: null, remaining: null, projectedMonthTotal: null, status: 'unknown' })
    expect(summary.writes.used).toBeNull()
    expect(summary.storageBytes).toBeNull()
  })

  it('projects the current month and reports reads and writes independently', () => {
    const summary = summarizeUsage({ organization: { usage: { rows_read: 250_000_000, rows_written: 9_500_000 } } }, {
      now: new Date('2026-09-16T00:00:00Z')
    })
    expect(summary.reads).toMatchObject({ percentUsed: 50, remaining: 250_000_000, projectedMonthTotal: 500_000_000, status: 'within_budget' })
    expect(summary.writes).toMatchObject({ percentUsed: 95, status: 'critical' })
  })

  it('does not extrapolate the first hours and supports explicit budgets', () => {
    const summary = summarizeUsage({ organization: { usage: { rows_read: 110, rows_written: 0 } } }, {
      now: new Date('2026-09-01T01:00:00Z'), readLimit: 100, writeLimit: 10
    })
    expect(summary.reads).toMatchObject({ remaining: 0, projectedMonthTotal: null, percentUsed: 110, status: 'exceeded' })
    expect(summary.writes).toMatchObject({ used: 0, percentUsed: 0, status: 'within_budget' })
  })
})
