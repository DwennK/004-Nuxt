import { z } from 'zod'
import { getReportsLeaders } from '~~/server/utils/pos/reports'
import { toDateInputValue } from '~~/shared/utils/pos'

const querySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional()
})

export default eventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))
  const today = toDateInputValue()

  return getReportsLeaders(query.startDate || today, query.endDate || today)
})
