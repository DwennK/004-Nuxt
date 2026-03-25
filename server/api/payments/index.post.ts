import { paymentInputSchema } from '~~/shared/validation/pos'
import { createPaymentRecord } from '~~/server/utils/pos/payments'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, paymentInputSchema.parse)
  return createPaymentRecord({
    ...body,
    customerId: body.customerId ?? null
  })
})
