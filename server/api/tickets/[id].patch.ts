import { z } from 'zod'
import { ticketInputSchema } from '~~/shared/validation/pos'
import { updateTicket } from '~~/server/utils/pos/tickets'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  const body = await readValidatedBody(event, ticketInputSchema.parse)
  return updateTicket(params.id, body)
})
