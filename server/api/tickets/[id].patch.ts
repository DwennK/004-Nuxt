import { ticketInputSchema } from '~~/shared/validation/pos'
import { updateTicket } from '~~/server/utils/pos/tickets'
import { numericIdParamsSchema } from '~~/shared/validation/api'

export default eventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const body = await readValidatedBody(event, ticketInputSchema.parse)
  return updateTicket(params.id, body)
})
