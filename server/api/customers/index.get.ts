import { z } from 'zod'
import { listCustomers } from '~~/server/utils/pos/customers'

const querySchema = z.object({
  search: z.string().optional()
})

export default eventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))
  return listCustomers(query.search)
})
