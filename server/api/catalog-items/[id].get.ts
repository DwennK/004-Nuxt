import { getCatalogItemById } from '~~/server/utils/pos/catalog'
import { numericIdParamsSchema } from '~~/shared/validation/api'

export default eventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  return getCatalogItemById(params.id)
})
