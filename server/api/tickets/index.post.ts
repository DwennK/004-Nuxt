import { ticketInputSchema } from '~~/shared/validation/pos'
import { createTicket } from '~~/server/utils/pos/tickets'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, ticketInputSchema.parse)
  return createTicket(body)
})
