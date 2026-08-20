import { deleteCatalogItem } from '~~/server/utils/pos/catalog'
import { numericIdParamsSchema } from '~~/shared/validation/api'
import { requireCapability } from '~~/server/utils/auth/session'

export default eventHandler(async (event) => {
  await requireCapability(event, 'records:delete')
  const params = await getValidatedRouterParams(event, numericIdParamsSchema.parse)
  return { deleted: await deleteCatalogItem(params.id) }
})
