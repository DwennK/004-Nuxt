import { vacationEntryInputSchema } from '~~/shared/validation/pos'
import { createVacationEntry } from '~~/server/utils/pos/vacations'

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, vacationEntryInputSchema.parse)
  return createVacationEntry(body)
})
