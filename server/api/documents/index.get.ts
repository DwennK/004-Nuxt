import { z } from 'zod'
import { listDocuments } from '~~/server/utils/pos/documents'

const querySchema = z.object({
  type: z.string().optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  ticketId: z.coerce.number().int().positive().optional()
})

export default eventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))
  return listDocuments(query)
})
