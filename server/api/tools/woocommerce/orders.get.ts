import { z } from 'zod'
import { requireAdminSessionUser } from '~~/server/utils/auth/session'
import { listWooOrders } from '~~/server/utils/woocommerce'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(50).optional()
})

export default eventHandler(async (event) => {
  await requireAdminSessionUser(event)
  const query = await getValidatedQuery(event, querySchema.parse)
  return listWooOrders(query)
})
