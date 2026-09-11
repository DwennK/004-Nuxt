import { z } from 'zod'
import { queryBooleanSchema } from '~~/shared/validation/api'
import { getCatalogSummary } from '~~/server/utils/pos/catalog'

const querySchema = z.object({
  productSearch: z.string().optional(),
  productCategory: z.string().optional(),
  productActiveOnly: queryBooleanSchema.optional(),
  repairSearch: z.string().optional(),
  repairCategory: z.string().optional(),
  repairActiveOnly: queryBooleanSchema.optional(),
  serviceSearch: z.string().optional(),
  serviceCategory: z.string().optional(),
  serviceActiveOnly: queryBooleanSchema.optional()
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  return getCatalogSummary({
    product: { search: query.productSearch, category: query.productCategory, activeOnly: query.productActiveOnly },
    repair: { search: query.repairSearch, category: query.repairCategory, activeOnly: query.repairActiveOnly },
    service: { search: query.serviceSearch, category: query.serviceCategory, activeOnly: query.serviceActiveOnly }
  })
})
