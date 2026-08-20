import { ticketStatusUpdateSchema } from '~~/shared/validation/pos'
import { updateTicketStatus } from '~~/server/utils/pos/tickets'
import { numericIdParamsSchema } from '~~/shared/validation/api'

export default eventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const body = await readValidatedBody(event, ticketStatusUpdateSchema.parse)
  return updateTicketStatus(params.id, body.status, body.internalNotes)
})
