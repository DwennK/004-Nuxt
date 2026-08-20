import { markDocumentPaidSchema } from '~~/shared/validation/pos'
import { markDocumentAsPaid } from '~~/server/utils/pos/documents'
import { numericIdParamsSchema } from '~~/shared/validation/api'
import { requireCapability } from '~~/server/utils/auth/session'
import { requireIdempotencyKey } from '~~/server/utils/idempotency'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:record')
  const idempotencyKey = requireIdempotencyKey(event)
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const body = await readValidatedBody(event, markDocumentPaidSchema.parse)
  return markDocumentAsPaid(params.id, body, idempotencyKey)
})
