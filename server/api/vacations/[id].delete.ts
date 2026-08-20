import { z } from 'zod'
import { deleteVacationEntry } from '~~/server/utils/pos/vacations'
import { requireCapability } from '~~/server/utils/auth/session'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  await requireCapability(event, 'records:delete')
  const params = paramsSchema.parse(event.context.params)
  return { deleted: await deleteVacationEntry(params.id) }
})
