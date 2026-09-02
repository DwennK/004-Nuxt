import { shopifyOrderListSchema } from '~~/shared/validation/shopify'
import { requireAdminSessionUser } from '~~/server/utils/auth/session'
import { listShopifyOrders } from '~~/server/utils/shopify/import'

export default eventHandler(async (event) => {
  await requireAdminSessionUser(event)
  const input = await getValidatedQuery(event, shopifyOrderListSchema.parse)
  return listShopifyOrders(input.after)
})
