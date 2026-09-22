import { localityLookupQuerySchema } from '~~/shared/validation/lookups'
import { suggestLocalities } from '~~/server/utils/postal-codes'

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, localityLookupQuerySchema.parse)
  return { items: suggestLocalities(query.search, query.field) }
})
