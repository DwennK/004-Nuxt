import { z } from 'zod'
import { getHomeOverview } from '~~/server/utils/pos/home'
import { toDateInputValue } from '~~/shared/utils/pos'

const querySchema = z.object({
  date: z.string().optional()
})

export default eventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))
  return getHomeOverview(query.date || toDateInputValue())
})
