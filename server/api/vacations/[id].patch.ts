import { z } from 'zod'
import { updateVacationEntry } from '~~/server/utils/pos/vacations'
import { vacationEntryInputSchema } from '~~/shared/validation/pos'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  const body = await readValidatedBody(event, vacationEntryInputSchema.parse)
  return updateVacationEntry(params.id, body)
})
