import { z } from 'zod'
import { deleteVacationEntry } from '~~/server/utils/pos/vacations'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  return { deleted: await deleteVacationEntry(params.id) }
})
