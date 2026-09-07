import { readDossierRecord } from '~~/server/utils/pos/dossiers'
import { getTicketById } from '~~/server/utils/pos/tickets'
import { numericIdParamsSchema } from '~~/shared/validation/api'

export default eventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  return readDossierRecord({ kind: 'ticket', id: params.id }, () => getTicketById(params.id))
})
