import { z } from 'zod'
import { listWooOrders } from '~~/server/utils/woocommerce'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional()
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  return listWooOrders(query)
})
