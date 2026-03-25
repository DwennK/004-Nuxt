import { z } from 'zod'
import { catalogItemInputSchema } from '~~/shared/validation/pos'
import { updateCatalogItem } from '~~/server/utils/pos/catalog'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  const body = await readValidatedBody(event, catalogItemInputSchema.parse)
  return updateCatalogItem(params.id, body)
})
