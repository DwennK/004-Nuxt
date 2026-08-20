import { z } from 'zod'
import { getReportsOverview } from '~~/server/utils/pos/reports'
import { toDateInputValue } from '~~/shared/utils/pos'
import { requireCapability } from '~~/server/utils/auth/session'

const querySchema = z.object({
  date: z.string().optional()
})

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:read')
  const query = querySchema.parse(getQuery(event))
  return getReportsOverview(query.date || toDateInputValue())
})
