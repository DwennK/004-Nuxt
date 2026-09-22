import { describe, expect, it } from 'vitest'
import { buildAddressSearchText, parseAddressSuggestions } from '../../server/utils/address-lookup'
import { suggestLocalities } from '../../server/utils/postal-codes'
import { addressLookupQuerySchema, localityLookupQuerySchema } from '../../shared/validation/lookups'

const result = (label: string, origin = 'address') => ({ attrs: { label, origin } })

describe('Swiss address suggestions', () => {
  it('extracts street, number, postal code and locality without returning provider markup', () => {
    expect(parseAddressSuggestions({ results: [
      result('Rue du Seyon 5a <b>2000 Neuchâtel</b>'),
      result('Rue de l&#39;Église 12 <b>1000 Lausanne 25</b>')
    ] })).toEqual([
      { addressLine1: 'Rue du Seyon 5a', postalCode: '2000', city: 'Neuchâtel', label: 'Rue du Seyon 5a, 2000 Neuchâtel' },
      { addressLine1: 'Rue de l\'Église 12', postalCode: '1000', city: 'Lausanne 25', label: 'Rue de l\'Église 12, 1000 Lausanne 25' }
    ])
  })

  it('ignores incomplete addresses, unexpected markup and other origins; deduplicates results', () => {
    expect(parseAddressSuggestions({ results: [
      result('Rue du Seyon # <b>2000 Neuchâtel</b>'),
      result('Rue <img src=x> <b>2000 Neuchâtel</b>'),
      result('2000 Neuchâtel', 'zipcode'),
      result('Rue du Seyon 5 <b>2000 Neuchâtel</b>'),
      result('Rue du Seyon 5 <b>2000 Neuchâtel</b>')
    ] })).toEqual([{ addressLine1: 'Rue du Seyon 5', postalCode: '2000', city: 'Neuchâtel', label: 'Rue du Seyon 5, 2000 Neuchâtel' }])
    expect(() => parseAddressSuggestions({ results: null })).toThrow()
  })

  it('uses a full postal code as context, otherwise the locality, within provider word limits', () => {
    expect(buildAddressSearchText('Seyon 5', '2000', 'Neuchâtel')).toBe('Seyon 5 2000')
    expect(buildAddressSearchText('Seyon 5', '20', 'Neuchâtel')).toBe('Seyon 5 Neuchâtel')
    expect(buildAddressSearchText('un deux trois quatre cinq six sept huit neuf dix', '', 'Neuchâtel').split(' ')).toHaveLength(10)
  })

  it('finds localities without accents and prioritizes an exact name over partial matches', () => {
    expect(suggestLocalities('neuchatel', 'city')[0]).toEqual({ postalCode: '2000', city: 'Neuchâtel', label: '2000 Neuchâtel' })
    expect(suggestLocalities('Laus', 'city')).toEqual(expect.arrayContaining([expect.objectContaining({ city: 'Lausanne 25', postalCode: '1000' })]))
  })

  it('supports partial postal codes and keeps multiple localities for the same NPA', () => {
    expect(suggestLocalities('20', 'postalCode').every(item => item.postalCode.startsWith('20'))).toBe(true)
    expect(suggestLocalities('1000', 'postalCode').map(item => item.city)).toEqual(['Lausanne 25', 'Lausanne 26', 'Lausanne 27'])
    expect(suggestLocalities('2', 'postalCode')).toEqual([])
    expect(suggestLocalities('zzzzunknown', 'city')).toEqual([])
    expect(suggestLocalities('La', 'city').length).toBeLessThanOrEqual(12)
  })

  it('bounds public request parameters', () => {
    expect(addressLookupQuerySchema.safeParse({ search: 'ab' }).success).toBe(false)
    expect(addressLookupQuerySchema.safeParse({ search: 'word '.repeat(11) }).success).toBe(false)
    expect(addressLookupQuerySchema.safeParse({ search: 'Seyon', postalCode: 'abc' }).success).toBe(false)
    expect(localityLookupQuerySchema.safeParse({ search: 'Laus', field: 'other' }).success).toBe(false)
  })
})
