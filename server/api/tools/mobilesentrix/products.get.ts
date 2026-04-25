import { listMobileSentrixProducts } from '~~/server/utils/mobilesentrix'
import { mobileSentrixProductsQuerySchema } from '~~/shared/validation/pos'

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, mobileSentrixProductsQuerySchema.parse)

  return listMobileSentrixProducts(query)
})
