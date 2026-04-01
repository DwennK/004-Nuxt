import postalCodeDataset from '~~/server/data/ch-postal-codes.json'
import type { PostalCodeLookupResult } from '~~/shared/types/lookups'

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
