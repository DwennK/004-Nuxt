import { z } from 'zod'
import { deleteDocument } from '~~/server/utils/pos/documents'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  return { deleted: await deleteDocument(params.id) }
})
