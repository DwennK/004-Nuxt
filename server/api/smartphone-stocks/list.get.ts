import { z } from 'zod'
import { smartphoneListQuerySchema } from '../../utils/smartphone-list'
import { listSmartphoneStocksPage } from '../../utils/smartphone-stocks'

const querySchema = smartphoneListQuerySchema.extend({
  sold: z.enum(['all', 'available', 'sold']).default('all')
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  return listSmartphoneStocksPage(query)
})
