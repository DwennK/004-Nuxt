import { z } from 'zod'
import { getTicketById } from '~~/server/utils/pos/tickets'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  return getTicketById(params.id)
})
