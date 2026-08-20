import { listPayments } from '~~/server/utils/pos/payments'
import { requireCapability } from '~~/server/utils/auth/session'
import { paymentListQuerySchema } from '~~/shared/validation/pos'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:read')
  const query = await getValidatedQuery(event, paymentListQuerySchema.parse)
  return listPayments(query)
})
