import { getTicketById } from '~~/server/utils/pos/tickets'
import { numericIdParamsSchema } from '~~/shared/validation/api'

export default eventHandler(async (event) => {
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  return getTicketById(params.id)
})
