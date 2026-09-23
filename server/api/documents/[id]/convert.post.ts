import { readDossierWriteContext } from '~~/server/utils/pos/dossiers'
import { convertDocumentRecord } from '~~/server/utils/pos/documents'
import { requireCapability } from '~~/server/utils/auth/session'
import { requireIdempotencyKey } from '~~/server/utils/idempotency'
import { numericIdParamsSchema } from '~~/shared/validation/api'
import { documentConversionSchema } from '~~/shared/validation/pos'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:record')
  const key = requireIdempotencyKey(event)
  const { id } = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const { type } = await readValidatedBody(event, documentConversionSchema.parse)
  return convertDocumentRecord(id, type, key, readDossierWriteContext(event))
})
