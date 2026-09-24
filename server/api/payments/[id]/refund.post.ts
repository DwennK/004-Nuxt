import { readDossierWriteContext } from '~~/server/utils/pos/dossiers'
import { refundPaymentSchema } from '~~/shared/validation/pos'
import { refundPayment } from '~~/server/utils/pos/payment-corrections'
import { numericIdParamsSchema } from '~~/shared/validation/api'
import { requireCapability } from '~~/server/utils/auth/session'
import { requireIdempotencyKey } from '~~/server/utils/idempotency'

export default eventHandler(async (event) => {
  const auth = await requireCapability(event, 'financial:adjust')
  const key = requireIdempotencyKey(event)
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const body = await readValidatedBody(event, refundPaymentSchema.parse)
  return refundPayment(params.id, body, key, `${auth.actor.userId} · ${auth.actor.name}`, readDossierWriteContext(event))
})
