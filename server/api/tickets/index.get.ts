import { z } from 'zod'
import { ticketStatuses } from '~~/shared/constants/pos'
import { listTickets } from '~~/server/utils/pos/tickets'
import { paginationQuerySchema } from '~~/shared/validation/api'

const querySchema = paginationQuerySchema.extend({
  q: z.string().trim().optional(),
  status: z.enum(ticketStatuses).optional(),
  customerId: z.coerce.number().int().positive().optional()
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  return listTickets(query)
})
