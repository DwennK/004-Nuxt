import { z } from 'zod'
import { getCustomerById } from '~~/server/utils/pos/customers'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  return getCustomerById(params.id)
})
