import { z } from 'zod'
import { getVacationSummariesByYear } from '~~/server/utils/pos/vacations'

const querySchema = z.object({
  year: z.coerce.number().int().default(() => new Date().getFullYear())
})

export default eventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))
  return getVacationSummariesByYear(query.year)
})
