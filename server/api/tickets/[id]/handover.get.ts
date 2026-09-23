import { requireCapability } from '~~/server/utils/auth/session'
import { numericIdParamsSchema } from '~~/shared/validation/api'
import { getHandover } from '~~/server/utils/pos/handover'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:read')
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  return getHandover(event, { kind: 'ticket', id: params.id })
})
