import { postalCodeLookupQuerySchema } from '~~/shared/validation/lookups'
import { getPostalCodeLookupResult } from '~~/server/utils/postal-codes'

export default eventHandler((event) => {
  const query = postalCodeLookupQuerySchema.parse(getQuery(event))
  return getPostalCodeLookupResult(query.postalCode)
})
