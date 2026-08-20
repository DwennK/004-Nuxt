import { z } from 'zod'
import { closeTicket } from '~~/server/utils/pos/tickets'
import { numericIdParamsSchema } from '~~/shared/validation/api'

const bodySchema = z.object({
  internalNotes: z.string().optional().nullable()
})

export default eventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const body = await readValidatedBody(event, bodySchema.parse)
  return closeTicket(params.id, body.internalNotes)
})
