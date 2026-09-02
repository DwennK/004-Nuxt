import { shopifyOrderRefSchema } from '~~/shared/validation/shopify'
import { requireAdminSessionUser } from '~~/server/utils/auth/session'
import { importShopifyOrder } from '~~/server/utils/shopify/import'

export default eventHandler(async (event) => {
  await requireAdminSessionUser(event)
  const input = await readValidatedBody(event, shopifyOrderRefSchema.parse)
  return importShopifyOrder(event, input.orderRef)
})
