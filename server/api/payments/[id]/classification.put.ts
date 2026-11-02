import { numericIdParamsSchema } from '~~/shared/validation/api'
import { paymentClassificationSchema } from '~~/shared/validation/payment-categories'
import { requireCapability } from '~~/server/utils/auth/session'
import { updatePaymentClassification } from '~~/server/utils/pos/payment-classifications'

export default eventHandler(async (event) => {
  const auth = await requireCapability(event, 'financial:record')
  const { id } = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const body = await readValidatedBody(event, paymentClassificationSchema.parse)
  return updatePaymentClassification(id, body, auth.actor.userId)
})
