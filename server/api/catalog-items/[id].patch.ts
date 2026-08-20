import { catalogItemInputSchema } from '~~/shared/validation/pos'
import { updateCatalogItem } from '~~/server/utils/pos/catalog'
import { numericIdParamsSchema } from '~~/shared/validation/api'

export default eventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const body = await readValidatedBody(event, catalogItemInputSchema.parse)
  return updateCatalogItem(params.id, body)
})
