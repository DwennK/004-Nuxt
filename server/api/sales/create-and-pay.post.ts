import { createAndPayDocumentSchema } from '~~/shared/validation/pos'
import { createAndPayDocumentRecord } from '~~/server/utils/pos/documents'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, createAndPayDocumentSchema.parse)
  return createAndPayDocumentRecord(body.document, body.payment)
})
