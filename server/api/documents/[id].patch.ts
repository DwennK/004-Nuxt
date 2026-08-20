import { documentInputSchema } from '~~/shared/validation/pos'
import { updateDocumentRecord } from '~~/server/utils/pos/documents'
import { numericIdParamsSchema } from '~~/shared/validation/api'
import { requireCapability } from '~~/server/utils/auth/session'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:adjust')
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const body = await readValidatedBody(event, documentInputSchema.parse)
  return updateDocumentRecord(params.id, body)
})
