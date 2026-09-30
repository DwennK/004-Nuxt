import { describe, expect, it } from 'vitest'
import { smartphoneStockFormSchema, smartphoneStockSchema, updateSmartphoneStockSchema } from '../../shared/validation/smartphones'
import { formatSmartphoneIdentifier, matchesSmartphoneStock, normalizeSmartphoneIdentifier } from '../../shared/utils/smartphones'

const stock = { model: 'iPad Air Wi-Fi', capacity: '256 Go', stockedAt: '2026-09-30' }

describe('stock IMEI and serial numbers', () => {
  it('preserves letters and leading zeroes through form and API validation', () => {
    for (const imei of ['DMPX1234ABCD', '00ABC123XY', 'AB-0123-CD', 'ABCDEF', 'X490154203237518']) {
      const form = smartphoneStockFormSchema.parse({ ...stock, imei })
      expect(smartphoneStockSchema.parse(form).imei).toBe(imei)
      expect(updateSmartphoneStockSchema.parse({ ...form, id: 1 }).imei).toBe(imei)
      expect(formatSmartphoneIdentifier(imei)).toBe(imei)
    }
    expect(normalizeSmartphoneIdentifier(' dmpx 1234abcd\n')).toBe('DMPX1234ABCD')
  })

  it('keeps formatted IMEIs and optional identifiers compatible', () => {
    expect(smartphoneStockSchema.parse({ ...stock, imei: '490 154 203 237 518' }).imei).toBe('490154203237518')
    expect(formatSmartphoneIdentifier('490154203237518')).toBe('490 154 203 237 518')
    expect(smartphoneStockSchema.parse(stock).imei).toBe('')
    expect(formatSmartphoneIdentifier(null)).toBe('')
  })

  it('matches model names, serial numbers and formatted IMEIs without treating whitespace as an identifier', () => {
    expect(matchesSmartphoneStock({ ...stock, imei: 'DMPX1234ABCD' }, '1234abcd')).toBe(true)
    expect(matchesSmartphoneStock({ ...stock, imei: 'DMPX1234ABCD' }, 'ipad air')).toBe(true)
    expect(matchesSmartphoneStock({ ...stock, imei: '490154203237518' }, '490 154')).toBe(true)
    expect(matchesSmartphoneStock({ ...stock, imei: 'DMPX1234ABCD' }, '  ')).toBe(false)
  })
})
