import { z } from 'zod'
import { getPaymentById } from '~~/server/utils/pos/payments'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  return getPaymentById(params.id)
})
