import { shopifyPaymentSyncSchema } from '~~/shared/validation/shopify'
import { requireAdminSessionUser } from '~~/server/utils/auth/session'
import { syncShopifyPayments } from '~~/server/utils/shopify/import'

export default eventHandler(async (event) => {
  await requireAdminSessionUser(event)
  const input = await readValidatedBody(event, shopifyPaymentSyncSchema.parse)
  return syncShopifyPayments(input.documentId)
})
