import { getPaymentById } from '~~/server/utils/pos/payments'
import { numericIdParamsSchema } from '~~/shared/validation/api'
import { requireCapability } from '~~/server/utils/auth/session'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:read')
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  return getPaymentById(params.id)
})
