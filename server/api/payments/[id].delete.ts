import { z } from 'zod'
import { deletePayment } from '~~/server/utils/pos/payments'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  return { deleted: await deletePayment(params.id) }
})
