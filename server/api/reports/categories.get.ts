import { z } from 'zod'
import { isoDateSchema } from '~~/shared/validation/api'
import { getReportsCategories } from '~~/server/utils/pos/reports'
import { requireCapability } from '~~/server/utils/auth/session'

const querySchema = z.object({
  startDate: isoDateSchema,
  endDate: isoDateSchema
})

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:read')
  const { startDate, endDate } = await getValidatedQuery(event, querySchema.parse)
  return getReportsCategories(startDate, endDate)
})
