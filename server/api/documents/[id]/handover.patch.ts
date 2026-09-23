import { numericIdParamsSchema } from '~~/shared/validation/api'
import { handoverInputSchema } from '~~/shared/validation/handover'
import { requireCapability } from '~~/server/utils/auth/session'
import { readDossierWriteContext } from '~~/server/utils/pos/dossiers'
import { updateHandover } from '~~/server/utils/pos/handover'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:record')
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const body = await readValidatedBody(event, handoverInputSchema.parse)
  return updateHandover(event, { kind: 'document', id: params.id }, body.collected, readDossierWriteContext(event))
})
