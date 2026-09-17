import { desc, eq, or, sql } from 'drizzle-orm'
import { searchEquals, searchLike } from './search'
import { foldSearchText } from '~~/shared/utils/search'
import { customers, documents, tickets } from '~~/server/db/schema'
import type { DocumentLookupItem, SuggestionsResponse } from '~~/shared/types/lookups'
import { useDb } from '../turso'
import { dossierReferenceSearch, dossierReferenceTerm } from './dossier-search'
import { ensurePosSchema } from './schema'

// Navigation only needs document identity and its stored total. Settlement is
// intentionally excluded; listDocuments remains the financial list endpoint.
export async function suggestDocuments(filters: {
  q?: string
  pageSize?: number
} = {}): Promise<SuggestionsResponse<DocumentLookupItem>> {
  await ensurePosSchema()
  const searchTerm = foldSearchText(filters.q).trim()
  const searchPattern = searchTerm ? `%${searchTerm}%` : null
  const referenceTerm = dossierReferenceTerm(searchTerm)
  const customerNameValue = sql<string>`coalesce(nullif(${customers.companyName}, ''), trim(${customers.firstName} || ' ' || ${customers.lastName}))`
  const referenceColumn = dossierReferenceSearch(sql`${tickets.ticketNumber}`)
  const relevanceOrder = searchTerm
    ? sql<number>`case
        when ${searchEquals(documents.documentNumber, searchTerm)} then 0
        when ${referenceColumn} = ${referenceTerm} then 0
        when ${searchEquals(customerNameValue, searchTerm)} then 0
        when ${searchLike(documents.documentNumber, `${searchTerm}%`)} then 1
        when ${referenceColumn} like ${`${referenceTerm}%`} then 1
        else 2
      end`
    : undefined

  const items = await useDb().select({
    id: documents.id,
    documentNumber: documents.documentNumber,
    total: documents.total,
    customerName: customerNameValue,
    ticketNumber: tickets.ticketNumber
  }).from(documents)
    .innerJoin(customers, eq(documents.customerId, customers.id))
    .leftJoin(tickets, eq(documents.ticketId, tickets.id))
    .where(searchPattern
      ? or(
          searchLike(documents.documentNumber, searchPattern),
          searchLike(customerNameValue, searchPattern),
          sql`${referenceColumn} like ${`%${referenceTerm}%`}`
        )
      : undefined)
    .orderBy(
      ...(relevanceOrder ? [relevanceOrder] : []),
      desc(documents.issuedAt),
      desc(documents.id)
    )
    .limit(Math.min(Math.max(filters.pageSize || 5, 1), 250))

  return { items }
}
