import { numericIdParamsSchema } from '~~/shared/validation/api'
import { savDetailsSchema } from '~~/shared/validation/sav'
import { requireCapability } from '~~/server/utils/auth/session'
import { readDossierWriteContext } from '~~/server/utils/pos/dossiers'
import { updateSavRecord } from '~~/server/utils/pos/sav'
import { getDocumentById } from '~~/server/utils/pos/documents'

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:record')
  const { id } = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const input = await readValidatedBody(event, savDetailsSchema.parse)
  await updateSavRecord(id, input, readDossierWriteContext(event))
  return getDocumentById(id)
})
