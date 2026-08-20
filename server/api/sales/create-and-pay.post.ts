import { createAndPayDocumentSchema } from '~~/shared/validation/pos'
import { createAndPayDocumentRecord } from '~~/server/utils/pos/documents'
import { requireCapability } from '~~/server/utils/auth/session'
import { requireIdempotencyKey } from '~~/server/utils/idempotency'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:record')
  const idempotencyKey = requireIdempotencyKey(event)
  const body = await readValidatedBody(event, createAndPayDocumentSchema.parse)
  return createAndPayDocumentRecord(body.document, body.payment, idempotencyKey)
})
