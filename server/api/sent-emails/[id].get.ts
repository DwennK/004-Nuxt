import { z } from 'zod'
import { getSentEmail } from '~~/server/utils/sent-emails'

const paramsSchema = z.object({
  id: z.string().trim().min(1)
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)

  return getSentEmail(params.id)
})
