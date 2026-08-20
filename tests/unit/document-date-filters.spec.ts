import { describe, expect, it } from 'vitest'
import {
  normalizeDocumentDateFrom,
  normalizeDocumentDateTo
} from '../../server/utils/pos/documents'

describe('document date filters', () => {
  it('expands date-only bounds to the full Europe/Zurich business day', () => {
    expect(normalizeDocumentDateFrom('2026-08-20')).toBe('2026-08-19T22:00:00.000Z')
    expect(normalizeDocumentDateTo('2026-08-20')).toBe('2026-08-20T21:59:59.999Z')
  })

  it('preserves explicit timestamps', () => {
    const timestamp = '2026-08-20T12:30:00.000Z'

    expect(normalizeDocumentDateFrom(timestamp)).toBe(timestamp)
    expect(normalizeDocumentDateTo(timestamp)).toBe(timestamp)
  })
})
