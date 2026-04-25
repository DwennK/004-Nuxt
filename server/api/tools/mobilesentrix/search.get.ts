import { searchMobileSentrixProducts } from '~~/server/utils/mobilesentrix'
import { mobileSentrixSearchQuerySchema } from '~~/shared/validation/pos'

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, mobileSentrixSearchQuerySchema.parse)

  return searchMobileSentrixProducts(query)
})
