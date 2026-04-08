import { employeeInputSchema } from '~~/shared/validation/pos'
import { createEmployee } from '~~/server/utils/pos/vacations'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, employeeInputSchema.parse)
  return createEmployee(body)
})
