import { z } from 'zod'
import type { AddressSuggestion } from '~~/shared/types/lookups'

export const addressSearchResponseSchema = z.object({
  results: z.array(z.object({
    attrs: z.object({
      origin: z.string(),
      label: z.string().max(500)
    })
  })).max(50)
})

function decodeLabel(value: string) {
  const entities: Record<string, string> = { amp: '&', quot: '"', apos: '\'', lt: '<', gt: '>', nbsp: ' ' }
  return value.replace(/&(#\d+|#x[0-9a-f]+|amp|quot|apos|lt|gt|nbsp);/gi, (match, entity: string) => {
    if (!entity.startsWith('#')) return entities[entity.toLowerCase()] || match
    const code = entity[1]?.toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10)
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match
  })
}

/** SearchServer labels separate the street from the official postal locality with <b>. Never render its HTML. */
export function parseAddressSuggestions(payload: unknown): AddressSuggestion[] {
  const response = addressSearchResponseSchema.parse(payload)
  const items = new Map<string, AddressSuggestion>()
  for (const { attrs } of response.results) {
    if (attrs.origin !== 'address') continue
    const match = attrs.label.match(/^([^<>]+?)\s*<b>(\d{4})\s+([^<>]+)<\/b>$/)
    if (!match) continue
    const addressLine1 = decodeLabel(match[1]!).trim()
    const postalCode = match[2]!
    const city = decodeLabel(match[3]!).trim()
    // Some directory records have no building number (represented as '#').
    if (!addressLine1 || addressLine1.includes('#') || !city) continue
    const label = `${addressLine1}, ${postalCode} ${city}`
    items.set(label, { label, addressLine1, postalCode, city })
  }
  return [...items.values()].slice(0, 8)
}

export function buildAddressSearchText(search: string, postalCode: string, city: string) {
  // A complete NPA is a more precise context than a locality name.
  const context = postalCode.length === 4 ? postalCode : city
  return [search, context].filter(Boolean).join(' ').split(/\s+/).slice(0, 10).join(' ')
}
