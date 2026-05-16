import { deleteManySchema } from '~~/shared/validation/pos'
import { deleteSmartphoneStocks } from '~~/server/utils/smartphone-stocks'

export default eventHandler(async (event) => {
  const { ids } = await readValidatedBody(event, deleteManySchema.parse)
  const deleted = await deleteSmartphoneStocks(ids)

  return { deleted }
})
