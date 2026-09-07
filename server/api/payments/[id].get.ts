import { readDossierRecord } from '~~/server/utils/pos/dossiers'
import { getPaymentById } from '~~/server/utils/pos/payments'
import { numericIdParamsSchema } from '~~/shared/validation/api'
import { requireCapability } from '~~/server/utils/auth/session'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:read')
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  return readDossierRecord({ kind: 'payment', id: params.id }, () => getPaymentById(params.id))
})
