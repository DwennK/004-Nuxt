import { describe, expect, it } from 'vitest'
import { normalizeOptionalText, normalizeRequiredText, nameInitials } from '../../shared/lib/text'

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

  it('derives initials without splitting or rewriting the stored name', () => {
    expect(nameInitials('')).toBe('?')
    expect(nameInitials('  Prince  ')).toBe('P')
    expect(nameInitials('Ada Byron Lovelace')).toBe('AL')
    expect(nameInitials('Élodie Müller')).toBe('ÉM')
  })
})
