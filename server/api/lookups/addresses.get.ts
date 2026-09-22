import { addressLookupQuerySchema } from '~~/shared/validation/lookups'
import type { AddressSuggestionsResponse } from '~~/shared/types/lookups'
import { buildAddressSearchText, parseAddressSuggestions } from '~~/server/utils/address-lookup'

export default eventHandler(async (event): Promise<AddressSuggestionsResponse> => {
  const query = await getValidatedQuery(event, addressLookupQuerySchema.parse)
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  try {
    const response: unknown = await $fetch<unknown>('https://api3.geo.admin.ch/rest/services/ech/SearchServer', {
      query: {
        searchText: buildAddressSearchText(query.search, query.postalCode, query.city),
        type: 'locations',
        origins: 'address',
        limit: 8,
        returnGeometry: false
      },
      timeout: 3500,
      retry: 0
    })
    return { items: parseAddressSuggestions(response) }
  } catch {
    throw createError({ statusCode: 502, message: 'Suggestions indisponibles. Saisissez votre adresse librement.' })
  }
})
