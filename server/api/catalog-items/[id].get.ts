import { z } from 'zod'
import { getCatalogItemById } from '~~/server/utils/pos/catalog'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  return getCatalogItemById(params.id)
})
