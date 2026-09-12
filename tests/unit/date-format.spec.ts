import { describe, expect, it } from 'vitest'
import { formatDate, formatDateTime, toDateInputValue } from '../../shared/utils/pos'
import { formatSentMailListDate } from '../../shared/utils/sent-email'

describe('POS display dates', () => {
  it('uses zero-padded days and months with a four-digit year', () => {
    expect(formatDate('2026-09-12')).toBe('12/09/2026')
    expect(formatDate('2026-01-02')).toBe('02/01/2026')
    expect(formatDate('2028-02-29')).toBe('29/02/2028')
  })

  it('keeps Zurich dates and hours across midnight and daylight saving changes', () => {
    expect(formatDate('2026-09-11T23:30:00Z')).toBe('12/09/2026')
    expect(formatDateTime('2026-09-11T23:30:00Z')).toBe('12/09/2026 01:30')
    expect(formatDateTime('2026-01-02T01:04:00Z')).toBe('02/01/2026 02:04')
    expect(formatDateTime('2026-03-29T01:30:00Z')).toBe('29/03/2026 03:30')
  })

  it('uses the same full date in the sent-email list', () => {
    expect(formatSentMailListDate('2026-09-12T12:04:00Z')).toBe('12/09/2026 14:04')
  })

  it('preserves input values and invalid-date fallbacks', () => {
    expect(toDateInputValue(new Date('2026-09-11T23:30:00Z'))).toBe('2026-09-12')
    expect(formatDate('')).toBe('')
    expect(formatDate('unknown')).toBe('unknown')
    expect(formatDateTime('unknown')).toBe('unknown')
    expect(formatDate(new Date(Number.NaN))).toBe('')
  })
})
