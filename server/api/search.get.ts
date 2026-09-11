import { z } from 'zod'
import { suggestCatalogItems } from '~~/server/utils/pos/catalog'
import { suggestCustomers } from '~~/server/utils/pos/customers'
import { suggestDocuments } from '~~/server/utils/pos/document-lookups'
import { suggestTickets } from '~~/server/utils/pos/tickets'
import { requireCapability } from '~~/server/utils/auth/session'
import type { GlobalLookupResponse } from '~~/shared/types/lookups'

const querySchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(5)
})

export default eventHandler(async (event): Promise<GlobalLookupResponse> => {
  await requireCapability(event, 'financial:read')
  const query = await getValidatedQuery(event, querySchema.parse)

  const [customers, tickets, documents, catalogItems] = await Promise.all([
    suggestCustomers({ search: query.q, pageSize: query.limit }),
    suggestTickets({ q: query.q, pageSize: query.limit }),
    suggestDocuments({ q: query.q, pageSize: query.limit }),
    suggestCatalogItems({ search: query.q, activeOnly: true, pageSize: query.limit })
  ])

  return {
    query: query.q,
    customers,
    tickets,
    documents,
    catalogItems
  }
})
