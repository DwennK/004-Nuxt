import { getDocumentById } from '~~/server/utils/pos/documents'
import { numericIdParamsSchema } from '~~/shared/validation/api'
import { requireCapability } from '~~/server/utils/auth/session'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:read')
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  return getDocumentById(params.id)
})
