import { z } from 'zod'
import { closeTicket } from '~~/server/utils/pos/tickets'

const paramsSchema = z.object({
  id: z.coerce.number().int().positive()
})

const bodySchema = z.object({
  internalNotes: z.string().optional().nullable()
})

export default eventHandler(async (event) => {
  const params = paramsSchema.parse(event.context.params)
  const body = await readValidatedBody(event, bodySchema.parse)
  return closeTicket(params.id, body.internalNotes)
})
