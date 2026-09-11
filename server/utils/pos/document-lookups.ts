import { desc, eq, or, sql } from 'drizzle-orm'
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
  const searchTerm = filters.q?.trim().toLowerCase()
  const searchPattern = searchTerm ? `%${searchTerm}%` : null
  const referenceTerm = dossierReferenceTerm(searchTerm)
  const customerNameValue = sql<string>`coalesce(nullif(${customers.companyName}, ''), trim(${customers.firstName} || ' ' || ${customers.lastName}))`
  const referenceColumn = dossierReferenceSearch(sql`${tickets.ticketNumber}`)
  const relevanceOrder = searchTerm
    ? sql<number>`case
        when lower(${documents.documentNumber}) = ${searchTerm} then 0
        when ${referenceColumn} = ${referenceTerm} then 0
        when lower(${customerNameValue}) = ${searchTerm} then 0
        when lower(${documents.documentNumber}) like ${`${searchTerm}%`} then 1
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
          sql`lower(${documents.documentNumber}) like ${searchPattern}`,
          sql`lower(${customerNameValue}) like ${searchPattern}`,
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
