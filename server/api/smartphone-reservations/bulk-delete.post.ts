import { deleteManySchema } from '~~/shared/validation/pos'
import { deleteSmartphoneReservations } from '~~/server/utils/smartphone-reservations'
import { requireCapability } from '~~/server/utils/auth/session'

export default eventHandler(async (event) => {
  await requireCapability(event, 'records:delete')
  const { ids } = await readValidatedBody(event, deleteManySchema.parse)
  const deleted = await deleteSmartphoneReservations(ids)

  return { deleted }
})
