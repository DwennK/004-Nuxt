import { z } from 'zod'
import { listVacationEntries } from '~~/server/utils/pos/vacations'

const querySchema = z.object({
  year: z.coerce.number().int().optional(),
  employeeId: z.coerce.number().int().positive().optional()
})

export default eventHandler(async (event) => {
  const query = querySchema.parse(getQuery(event))
  return listVacationEntries(query)
})
