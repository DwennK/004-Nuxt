import { paymentInputSchema } from '~~/shared/validation/pos'
import { createPaymentRecord } from '~~/server/utils/pos/payments'
import { requireCapability } from '~~/server/utils/auth/session'
import { requireIdempotencyKey } from '~~/server/utils/idempotency'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:record')
  const idempotencyKey = requireIdempotencyKey(event)
  const body = await readValidatedBody(event, paymentInputSchema.parse)
  return createPaymentRecord({
    ...body,
    customerId: body.customerId ?? null
  }, idempotencyKey)
})
