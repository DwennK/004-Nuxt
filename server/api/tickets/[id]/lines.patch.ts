import { readDossierWriteContext } from '~~/server/utils/pos/dossiers'
import { updateTicketLines } from '~~/server/utils/pos/tickets'
import { numericIdParamsSchema } from '~~/shared/validation/api'
import { ticketLinesInputSchema } from '~~/shared/validation/pos'

export default eventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const body = await readValidatedBody(event, ticketLinesInputSchema.parse)
  return updateTicketLines(params.id, body.lines, readDossierWriteContext(event))
})
