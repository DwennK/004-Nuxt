import { catalogItemTypes } from '~~/shared/constants/pos'
import { z } from 'zod'
import { listCatalogItems } from '~~/server/utils/pos/catalog'
import { paginationQuerySchema, queryBooleanSchema } from '~~/shared/validation/api'

const querySchema = paginationQuerySchema.extend({
  search: z.string().optional(),
  activeOnly: queryBooleanSchema.optional(),
  type: z.enum(catalogItemTypes).optional(),
  category: z.string().optional()
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  return listCatalogItems({
    search: query.search,
    activeOnly: query.activeOnly ?? false,
    type: query.type,
    category: query.category,
    page: query.page,
    pageSize: query.pageSize
  })
})
