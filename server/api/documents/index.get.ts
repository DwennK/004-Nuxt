import { z } from 'zod'
import { documentStatuses, documentTypes } from '~~/shared/constants/pos'
import { listDocuments } from '~~/server/utils/pos/documents'
import { isoDateSchema, paginationQuerySchema } from '~~/shared/validation/api'
import { requireCapability } from '~~/server/utils/auth/session'

const querySchema = paginationQuerySchema.extend({
  q: z.string().trim().optional(),
  type: z.enum(documentTypes).optional(),
  status: z.enum(documentStatuses).optional(),
  dateFrom: isoDateSchema.optional(),
  dateTo: isoDateSchema.optional(),
  customerId: z.coerce.number().int().positive().optional(),
  ticketId: z.coerce.number().int().positive().optional(),
  paymentState: z.enum(['all', 'due']).optional(),
  sortBy: z.enum(['issuedAt', 'balanceDue']).optional()
})

export default eventHandler(async (event) => {
  await requireCapability(event, 'financial:read')
  const query = await getValidatedQuery(event, querySchema.parse)
  return listDocuments(query)
})
