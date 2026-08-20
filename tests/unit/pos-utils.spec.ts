import { describe, expect, it } from 'vitest'
import {
  countBusinessDays,
  formatImei,
  getImeiWarning,
  isPayableDocumentType,
  isValidImei,
  normalizeImei,
  normalizeSearchText,
  parseCurrencyInput,
  sumMoney
} from '../../shared/utils/pos'

describe('POS money helpers', () => {
  it('converts localized TTC values to integer cents', () => {
    expect(parseCurrencyInput('CHF 12,35')).toBe(1235)
    expect(parseCurrencyInput('-12.50')).toBe(-1250)
    expect(parseCurrencyInput(8.1)).toBe(810)
  })

  it('sums nullable cent values without floating-point conversion', () => {
    expect(sumMoney([1200, null, -250, undefined, 50])).toBe(1000)
  })

  it('keeps the payable-document boundary explicit', () => {
    expect(isPayableDocumentType('invoice')).toBe(true)
    expect(isPayableDocumentType('customer_order')).toBe(true)
    expect(isPayableDocumentType('quote')).toBe(false)
  })
})

describe('POS identifiers and search', () => {
  it('normalizes and validates a standard IMEI', () => {
    const imei = '490154203237518'

    expect(normalizeImei('490 154 203 237 518')).toBe(imei)
    expect(formatImei(imei)).toBe('490 154 203 237 518')
    expect(isValidImei(imei)).toBe(true)
    expect(getImeiWarning(imei)).toBeNull()
  })

  it('reports invalid IMEI lengths before the checksum', () => {
    expect(getImeiWarning('123')).toBe('IMEI incomplet. 15 chiffres attendus.')
    expect(getImeiWarning('1234567890123456')).toBe('IMEI trop long. 15 chiffres attendus.')
  })

  it('normalizes accents and repeated whitespace for catalog search', () => {
    expect(normalizeSearchText('  Réparation Écran / iPhone  ')).toBe('reparation ecran / iphone')
  })
})

describe('Swiss business calendar', () => {
  it('excludes national holidays and Sundays while keeping store Saturdays', () => {
    expect(countBusinessDays('2026-07-31', '2026-08-03')).toBe(2)
  })
})
