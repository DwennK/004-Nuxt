import { paymentInputSchema } from '~~/shared/validation/pos'
import { updatePaymentRecord } from '~~/server/utils/pos/payments'
import { numericIdParamsSchema } from '~~/shared/validation/api'
import { requireCapability } from '~~/server/utils/auth/session'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:adjust')
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const body = await readValidatedBody(event, paymentInputSchema.parse)
  return updatePaymentRecord(params.id, {
    ...body,
    customerId: body.customerId ?? null
  })
})
