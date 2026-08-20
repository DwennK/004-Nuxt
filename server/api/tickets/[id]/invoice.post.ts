import { createInvoiceFromTicket } from '~~/server/utils/pos/tickets'
import { numericIdParamsSchema } from '~~/shared/validation/api'
import { requireCapability } from '~~/server/utils/auth/session'
import { requireIdempotencyKey } from '~~/server/utils/idempotency'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:record')
  const idempotencyKey = requireIdempotencyKey(event)
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  return createInvoiceFromTicket(params.id, idempotencyKey)
})
