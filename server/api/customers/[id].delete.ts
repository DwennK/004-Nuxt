import { z } from 'zod'
import { deleteCustomer } from '~~/server/utils/pos/customers'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  return { deleted: await deleteCustomer(params.id) }
})
