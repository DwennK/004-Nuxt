import { z } from 'zod'
import { smartphoneListQuerySchema } from '../../utils/smartphone-list'
import { listSmartphoneReservationsPage } from '../../utils/smartphone-reservations'

const querySchema = smartphoneListQuerySchema.extend({
  status: z.enum(['all', 'pending', 'contacted', 'sold']).default('pending')
})

export default eventHandler(async (event) => {
  const query = await getValidatedQuery(event, querySchema.parse)
  return listSmartphoneReservationsPage(query)
})
