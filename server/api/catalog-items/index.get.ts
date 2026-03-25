import { z } from 'zod'
import { listCatalogItems } from '~~/server/utils/pos/catalog'

const querySchema = z.object({
  search: z.string().optional(),
  activeOnly: z.coerce.boolean().optional()
})

export default eventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))
  return listCatalogItems(query.search, query.activeOnly ?? false)
})
