import { z } from 'zod'
import { isoDateSchema } from '~~/shared/validation/api'
import { toDateInputValue } from '~~/shared/utils/pos'
import { requireCapability } from '~~/server/utils/auth/session'
import { getCommercialReport } from '~~/server/utils/pos/commercial-reports'
import { ensurePosSchema } from '~~/server/utils/pos/schema'
import { useDb } from '~~/server/utils/turso'

const querySchema = z.object({ date: isoDateSchema.optional(), period: z.enum(['day', 'month', 'year']).default('month') })

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:read')
  const query = await getValidatedQuery(event, querySchema.parse)
  await ensurePosSchema()
  return getCommercialReport(useDb(), query.date || toDateInputValue(), query.period)
})
