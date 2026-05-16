import { deleteManySchema } from '~~/shared/validation/pos'
import { deleteSmartphoneReservations } from '~~/server/utils/smartphone-reservations'

export default eventHandler(async (event) => {
  const { ids } = await readValidatedBody(event, deleteManySchema.parse)
  const deleted = await deleteSmartphoneReservations(ids)

  return { deleted }
})
