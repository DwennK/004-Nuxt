import { deleteManySchema } from '~~/shared/validation/pos'
import { deleteSmartphoneStocks } from '~~/server/utils/smartphone-stocks'
import { requireCapability } from '~~/server/utils/auth/session'

export default eventHandler(async (event) => {
  await requireCapability(event, 'records:delete')
  const { ids } = await readValidatedBody(event, deleteManySchema.parse)
  const deleted = await deleteSmartphoneStocks(ids)

  return { deleted }
})
