import { z } from 'zod'
import { isoDateSchema } from '~~/shared/validation/api'
import { getReportsLeaders } from '~~/server/utils/pos/reports'
import { toDateInputValue } from '~~/shared/utils/pos'
import { requireCapability } from '~~/server/utils/auth/session'

const querySchema = z.object({
  startDate: isoDateSchema.optional(),
  endDate: isoDateSchema.optional()
})

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:read')
  const query = await getValidatedQuery(event, querySchema.parse)
  const today = toDateInputValue()

  return getReportsLeaders(query.startDate || today, query.endDate || today)
})
