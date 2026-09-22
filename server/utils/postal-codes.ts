import postalCodeDataset from '~~/server/data/ch-postal-codes.json'
import { foldSearchText } from '~~/shared/utils/search'
import type { AddressSuggestion, PostalCodeLookupResult } from '~~/shared/types/lookups'

const postalCodeMap = Object.freeze(Object.fromEntries(
  Object.entries(postalCodeDataset).map(([postalCode, localities]) => {
    const uniqueLocalities = Array.from(new Set(localities
      .map(locality => locality.trim())
      .filter(Boolean)))

    return [postalCode, uniqueLocalities]
  })
)) as Readonly<Record<string, string[]>>

export function normalizePostalCode(value: string | null | undefined) {
  return String(value || '').replace(/\D+/g, '').slice(0, 4)
}

export function getPostalCodeLookupResult(postalCode: string): PostalCodeLookupResult {
  const normalizedPostalCode = normalizePostalCode(postalCode)

  return {
    postalCode: normalizedPostalCode,
    localities: [...(postalCodeMap[normalizedPostalCode] || [])]
  }
}

const localityEntries = Object.entries(postalCodeMap).flatMap(([postalCode, localities]) =>
  localities.map(city => ({ postalCode, city, label: `${postalCode} ${city}` }))
)

export function suggestLocalities(search: string, field: 'postalCode' | 'city'): AddressSuggestion[] {
  const query = foldSearchText(search.trim())
  if (query.length < 2) return []

  return localityEntries
    .filter(item => field === 'postalCode'
      ? item.postalCode.startsWith(query)
      : foldSearchText(item.city).includes(query))
    .sort((a, b) => {
      const rank = (city: string) => {
        const folded = foldSearchText(city)
        return folded === query ? 0 : folded.startsWith(query) ? 1 : 2
      }
      return (field === 'city' ? rank(a.city) - rank(b.city) : 0)
        || a.postalCode.localeCompare(b.postalCode)
        || a.city.localeCompare(b.city, 'fr')
    })
    .slice(0, 12)
}
