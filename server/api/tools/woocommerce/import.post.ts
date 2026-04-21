import { wooCommerceImportSchema } from '~~/shared/validation/pos'
import { importWooOrderToInvoice } from '~~/server/utils/woocommerce'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, wooCommerceImportSchema.parse)
  return importWooOrderToInvoice(body.orderRef)
})
