import { z } from 'zod'
import { listCustomers } from '~~/server/utils/pos/customers'

const querySchema = z.object({
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(250).default(50)
})

export default eventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))
  return listCustomers(query)
})
