import { requireAdminSessionUser } from '~~/server/utils/auth/session'
import { getShopifyConnection } from '~~/server/utils/shopify/client'

export default eventHandler(async (event) => {
  await requireAdminSessionUser(event)
  return getShopifyConnection()
})
