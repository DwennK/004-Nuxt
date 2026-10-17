import { getMobileSentrixOrder } from '~~/server/utils/mobilesentrix'
import { mobileSentrixOrderParamsSchema } from '~~/shared/validation/mobilesentrix-orders'

export default eventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const { id } = await getValidatedRouterParams(event, mobileSentrixOrderParamsSchema.parse)
  return getMobileSentrixOrder(id)
})
