import { describe, expect, it } from 'vitest'
import { normalizeOptionalText, normalizeRequiredText, splitLegacyName } from '../../shared/lib/text'

describe('shared text normalization', () => {
  it('normalizes optional text without inventing a value', () => {
    expect(normalizeOptionalText(undefined)).toBeNull()
    expect(normalizeOptionalText(null)).toBeNull()
    expect(normalizeOptionalText('   ')).toBeNull()
    expect(normalizeOptionalText('  Microwest  ')).toBe('Microwest')
  })

  it('trims required text while preserving an empty result', () => {
    expect(normalizeRequiredText('  Client  ')).toBe('Client')
    expect(normalizeRequiredText('   ')).toBe('')
  })

  it('keeps the legacy first-name and last-name split behavior', () => {
    expect(splitLegacyName(null)).toEqual({ firstName: '', lastName: 'Customer' })
    expect(splitLegacyName('  Prince  ')).toEqual({ firstName: '', lastName: 'Prince' })
    expect(splitLegacyName('Ada Byron Lovelace')).toEqual({
      firstName: 'Ada Byron',
      lastName: 'Lovelace'
    })
  })
})
