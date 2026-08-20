import { documentInputSchema } from '~~/shared/validation/pos'
import { createDocumentRecord } from '~~/server/utils/pos/documents'
import { requireCapability } from '~~/server/utils/auth/session'
import { requireIdempotencyKey } from '~~/server/utils/idempotency'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:record')
  const idempotencyKey = requireIdempotencyKey(event)
  const body = await readValidatedBody(event, documentInputSchema.parse)
  return createDocumentRecord(body, { key: idempotencyKey })
})
