import { z } from 'zod'
import { markDocumentPaidSchema } from '~~/shared/validation/pos'
import { markDocumentAsPaid } from '~~/server/utils/pos/documents'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  const body = await readValidatedBody(event, markDocumentPaidSchema.parse)
  return markDocumentAsPaid(params.id, body)
})
