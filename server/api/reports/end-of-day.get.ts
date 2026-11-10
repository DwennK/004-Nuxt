import { z } from 'zod'
import { isoDateSchema } from '~~/shared/validation/api'
import { getEndOfDaySummary } from '~~/server/utils/pos/reports'
import { toDateInputValue } from '~~/shared/utils/pos'
import { requireCapability } from '~~/server/utils/auth/session'

const querySchema = z.object({
  date: isoDateSchema.optional()
})

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:read')
  const query = await getValidatedQuery(event, querySchema.parse)
  return getEndOfDaySummary(query.date || toDateInputValue())
})
