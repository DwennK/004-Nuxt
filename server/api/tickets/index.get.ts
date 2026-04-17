import { z } from 'zod'
import { listTickets } from '~~/server/utils/pos/tickets'

const querySchema = z.object({
  q: z.string().trim().optional(),
  status: z.string().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(250).default(50)
})

export default eventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))
  return listTickets(query)
})
