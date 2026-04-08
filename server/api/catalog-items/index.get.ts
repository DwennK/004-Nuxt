import { catalogItemTypes } from '~~/shared/constants/pos'
import { z } from 'zod'
import { listCatalogItems } from '~~/server/utils/pos/catalog'

const querySchema = z.object({
  search: z.string().optional(),
  activeOnly: z.coerce.boolean().optional(),
  type: z.enum(catalogItemTypes).optional(),
  category: z.string().optional()
})

export default eventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))
  return listCatalogItems({
    search: query.search,
    activeOnly: query.activeOnly ?? false,
    type: query.type,
    category: query.category
  })
})
