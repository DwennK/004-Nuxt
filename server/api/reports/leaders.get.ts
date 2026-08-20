import { z } from 'zod'
import { getReportsLeaders } from '~~/server/utils/pos/reports'
import { toDateInputValue } from '~~/shared/utils/pos'
import { requireCapability } from '~~/server/utils/auth/session'

const querySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional()
})

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:read')
  const query = querySchema.parse(getQuery(event))
  const today = toDateInputValue()

  return getReportsLeaders(query.startDate || today, query.endDate || today)
})
