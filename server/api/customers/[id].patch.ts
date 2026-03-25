import { z } from 'zod'
import { updateCustomer } from '~~/server/utils/pos/customers'
import { customerInputSchema } from '~~/shared/validation/pos'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  const body = await readValidatedBody(event, customerInputSchema.parse)
  return updateCustomer(params.id, body)
})
