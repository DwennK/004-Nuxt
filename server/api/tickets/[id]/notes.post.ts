import { numericIdParamsSchema } from '~~/shared/validation/api'
import { ticketNoteInputSchema } from '~~/shared/validation/pos'
import { getUseCaseContext } from '~~/server/utils/auth/session'
import { addTicketNote } from '~~/server/utils/pos/tickets'

export default eventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  const body = await readValidatedBody(event, ticketNoteInputSchema.parse)
  const { actor } = getUseCaseContext(event)

  return addTicketNote(params.id, body.note, {
    userId: actor.userId,
    name: actor.name
  })
})
