import { readDossierRecord } from '~~/server/utils/pos/dossiers'
import { getDocumentById } from '~~/server/utils/pos/documents'
import { numericIdParamsSchema } from '~~/shared/validation/api'
import { requireCapability } from '~~/server/utils/auth/session'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:read')
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  return readDossierRecord({ kind: 'document', id: params.id }, () => getDocumentById(params.id))
})
