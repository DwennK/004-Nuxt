import { listMobileSentrixOrders } from '~~/server/utils/mobilesentrix'
import { mobileSentrixOrdersQuerySchema } from '~~/shared/validation/mobilesentrix-orders'

export default eventHandler(async (event) => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const query = await getValidatedQuery(event, mobileSentrixOrdersQuerySchema.parse)
  return listMobileSentrixOrders(query)
})
