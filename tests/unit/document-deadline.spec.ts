import { describe, expect, it } from 'vitest'
import { documentDueDateSchema } from '../../shared/validation/pos'

describe('optional document calendar deadline', () => {
  it('distinguishes an omitted deadline from an explicit clear', () => {
    expect(documentDueDateSchema.parse(undefined)).toBeUndefined()
    expect(documentDueDateSchema.parse('')).toBeNull()
    expect(documentDueDateSchema.parse(null)).toBeNull()
  })

  it('accepts real calendar dates without converting time zones', () => {
    expect(documentDueDateSchema.parse('2028-02-29')).toBe('2028-02-29')
    expect(documentDueDateSchema.parse('2026-10-25')).toBe('2026-10-25')
  })

  it.each(['2026-02-29', '2026-04-31', '30.09.2026', '2026-09-30T00:00:00Z'])('rejects invalid date %s', (value) => {
    expect(documentDueDateSchema.safeParse(value).success).toBe(false)
  })
})
