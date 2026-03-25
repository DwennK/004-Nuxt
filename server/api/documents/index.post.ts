import { documentInputSchema } from '~~/shared/validation/pos'
import { createDocumentRecord } from '~~/server/utils/pos/documents'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, documentInputSchema.parse)
  return createDocumentRecord(body)
})
