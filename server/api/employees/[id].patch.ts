import { z } from 'zod'
import { updateEmployee } from '~~/server/utils/pos/vacations'
import { employeeInputSchema } from '~~/shared/validation/pos'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  const body = await readValidatedBody(event, employeeInputSchema.parse)
  return updateEmployee(params.id, body)
})
