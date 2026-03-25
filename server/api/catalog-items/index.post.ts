import { catalogItemInputSchema } from '~~/shared/validation/pos'
import { createCatalogItem } from '~~/server/utils/pos/catalog'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, catalogItemInputSchema.parse)
  return createCatalogItem(body)
})
