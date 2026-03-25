import { z } from 'zod'
import { listPayments } from '~~/server/utils/pos/payments'

const querySchema = z.object({
  method: z.string().optional(),
  status: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  documentId: z.coerce.number().int().positive().optional(),
  customerId: z.coerce.number().int().positive().optional()
})

export default eventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))
  return listPayments(query)
})
