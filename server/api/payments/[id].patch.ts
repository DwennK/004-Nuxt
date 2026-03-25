import { z } from 'zod'
import { paymentInputSchema } from '~~/shared/validation/pos'
import { updatePaymentRecord } from '~~/server/utils/pos/payments'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  const body = await readValidatedBody(event, paymentInputSchema.parse)
  return updatePaymentRecord(params.id, {
    ...body,
    customerId: body.customerId ?? null
  })
})
