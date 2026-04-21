import { z } from 'zod'
import { listSentEmails } from '~~/server/utils/sent-emails'

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(20),
  after: z.string().trim().min(1).optional(),
  before: z.string().trim().min(1).optional()
}).refine(query => !(query.after && query.before), {
  message: 'Utilisez soit "after" soit "before", pas les deux.'
})

export default eventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))

  return listSentEmails(query)
})
