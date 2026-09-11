import { z } from 'zod'
import { catalogItemTypes } from '~~/shared/constants/pos'
import { queryBooleanSchema } from '~~/shared/validation/api'
import { suggestCatalogItems } from '~~/server/utils/pos/catalog'

const querySchema = z.object({
  search: z.string().optional(),
  activeOnly: queryBooleanSchema.optional(),
  type: z.enum(catalogItemTypes).optional(),
  category: z.string().optional(),
  pageSize: z.coerce.number().int().positive().max(250).default(25)
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  return suggestCatalogItems(query)
})
