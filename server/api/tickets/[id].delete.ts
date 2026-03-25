import { z } from 'zod'
import { deleteTicket } from '~~/server/utils/pos/tickets'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  return { deleted: await deleteTicket(params.id) }
})
