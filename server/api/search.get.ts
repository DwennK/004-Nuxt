import { z } from 'zod'
import { listCatalogItems } from '~~/server/utils/pos/catalog'
import { listCustomers } from '~~/server/utils/pos/customers'
import { listDocuments } from '~~/server/utils/pos/documents'
import { listTickets } from '~~/server/utils/pos/tickets'
import { requireCapability } from '~~/server/utils/auth/session'
import type { GlobalSearchResponse } from '~~/shared/types/pos'

const querySchema = z.object({
  q: z.string().trim().min(2).max(200),
  limit: z.coerce.number().int().min(1).max(20).default(5)
})

export default eventHandler(async (event): Promise<GlobalSearchResponse> => {
  await requireCapability(event, 'financial:read')
  const query = await getValidatedQuery(event, querySchema.parse)

  const [customers, tickets, documents, catalogItems] = await Promise.all([
    listCustomers({ search: query.q, pageSize: query.limit }),
    listTickets({ q: query.q, pageSize: query.limit }),
    listDocuments({ q: query.q, pageSize: query.limit }),
    listCatalogItems({ search: query.q, activeOnly: true, pageSize: query.limit })
  ])

  return {
    query: query.q,
    customers,
    tickets,
    documents,
    catalogItems
  }
})
