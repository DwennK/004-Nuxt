import { customerInputSchema } from '~~/shared/validation/pos'
import { createCustomer } from '~~/server/utils/pos/customers'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, customerInputSchema.parse)
  return createCustomer(body)
})
