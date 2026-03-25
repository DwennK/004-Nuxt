import { z } from 'zod'
import { getDocumentById } from '~~/server/utils/pos/documents'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  return getDocumentById(params.id)
})
