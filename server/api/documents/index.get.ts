import { z } from 'zod'
import { listDocuments } from '~~/server/utils/pos/documents'

const querySchema = z.object({
  q: z.string().trim().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  ticketId: z.coerce.number().int().positive().optional(),
  paymentState: z.enum(['all', 'due']).optional(),
  sortBy: z.enum(['issuedAt', 'balanceDue']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(250).default(50)
})

export default eventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))
  return listDocuments(query)
})
