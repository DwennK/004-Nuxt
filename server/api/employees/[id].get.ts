import { z } from 'zod'
import { getEmployeeById } from '~~/server/utils/pos/vacations'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  return getEmployeeById(params.id)
})
