import { z } from 'zod'
import { isoDateSchema } from '~~/shared/validation/api'
import { getReportsOverview } from '~~/server/utils/pos/reports'
import { toDateInputValue } from '~~/shared/utils/pos'
import { requireCapability } from '~~/server/utils/auth/session'

const querySchema = z.object({
  date: isoDateSchema.optional(),
  includeLeaders: z.enum(['true', 'false']).transform(value => value === 'true').optional()
})

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:read')
  const query = await getValidatedQuery(event, querySchema.parse)
  return getReportsOverview(query.date || toDateInputValue(), { includeLeaders: query.includeLeaders })
})
