import { deleteDocument } from '~~/server/utils/pos/documents'
import { numericIdParamsSchema } from '~~/shared/validation/api'
import { requireCapability } from '~~/server/utils/auth/session'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:adjust')
  await requireCapability(event, 'records:delete')
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  return { deleted: await deleteDocument(params.id) }
})
