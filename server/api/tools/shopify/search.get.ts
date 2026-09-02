import { shopifyOrderRefSchema } from '~~/shared/validation/shopify'
import { requireAdminSessionUser } from '~~/server/utils/auth/session'
import { searchShopifyOrder } from '~~/server/utils/shopify/import'

export default eventHandler(async (event) => {
  await requireAdminSessionUser(event)
  const input = await getValidatedQuery(event, shopifyOrderRefSchema.parse)
  return searchShopifyOrder(event, input.orderRef)
})
