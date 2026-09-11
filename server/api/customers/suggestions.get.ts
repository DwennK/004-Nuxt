import { z } from 'zod'
import { suggestCustomers } from '~~/server/utils/pos/customers'

const querySchema = z.object({
  search: z.string().optional(),
  pageSize: z.coerce.number().int().positive().max(250).default(20)
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  return suggestCustomers(query)
})
