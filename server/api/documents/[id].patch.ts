import { z } from 'zod'
import { documentInputSchema } from '~~/shared/validation/pos'
import { updateDocumentRecord } from '~~/server/utils/pos/documents'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  const body = await readValidatedBody(event, documentInputSchema.parse)
  return updateDocumentRecord(params.id, body)
})
