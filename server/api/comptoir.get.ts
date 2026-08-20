import { getCounterOverviewReadModel } from '~~/server/utils/pos/read-models'
import type { CounterOverviewResponse } from '~~/shared/types/pos'
import { toDateInputValue } from '~~/shared/utils/pos'
import { requireCapability } from '~~/server/utils/auth/session'

export default eventHandler(async (event): Promise<CounterOverviewResponse> => {
  await requireCapability(event, 'financial:read')
  return getCounterOverviewReadModel(toDateInputValue())
})
