import { z } from 'zod'
import { listTickets } from '~~/server/utils/pos/tickets'

const querySchema = z.object({
  status: z.string().optional(),
  customerId: z.coerce.number().int().positive().optional()
})

export default eventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))
  return listTickets(query)
})
