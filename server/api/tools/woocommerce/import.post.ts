import { wooCommerceImportSchema } from '~~/shared/validation/pos'
import { requireAdminSessionUser } from '~~/server/utils/auth/session'
import { importWooOrderToInvoice } from '~~/server/utils/woocommerce'

export default eventHandler(async (event) => {
  await requireAdminSessionUser(event)
  const body = await readValidatedBody(event, wooCommerceImportSchema.parse)
  return importWooOrderToInvoice(body.orderRef)
})
