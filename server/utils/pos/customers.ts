import { and, asc, eq, or, sql } from 'drizzle-orm'
import { searchEquals, searchLike } from './search'
import { foldSearchText } from '~~/shared/utils/search'
import { customers } from '~~/server/db/schema'
import { mapCustomer } from '~~/server/modules/customers/mapper'
import { normalizeOptionalText, normalizeRequiredText, splitLegacyName } from '~~/shared/lib/text'
import type { CustomerListResponse, CustomerUpsertInput } from '~~/shared/types/pos'
import type { CustomerSuggestionsResponse } from '~~/shared/types/lookups'
import { useDb } from '../turso'
import { ensurePosSchema } from '~~/server/utils/pos/schema'

function customerSearchQuery(search?: string) {
  const normalizedSearch = foldSearchText(search).trim()
  const searchPattern = normalizedSearch ? `%${normalizedSearch}%` : null

  const whereClause = and(
    searchPattern
      ? or(
          searchLike(customers.firstName, searchPattern),
          searchLike(customers.lastName, searchPattern),
          searchLike(sql`coalesce(${customers.companyName}, '')`, searchPattern),
          searchLike(customers.phone, searchPattern),
          searchLike(customers.email, searchPattern)
        )
      : undefined
  )
  const customerNameValue = sql<string>`trim(${customers.firstName} || ' ' || ${customers.lastName})`
  const relevanceOrder = normalizedSearch
    ? sql<number>`case
        when ${searchEquals(sql`trim(coalesce(${customers.companyName}, ''))`, normalizedSearch)} then 0
        when ${searchEquals(customerNameValue, normalizedSearch)} then 0
        when ${searchEquals(sql`trim(${customers.phone})`, normalizedSearch)} then 0
        when ${searchEquals(sql`trim(${customers.email})`, normalizedSearch)} then 0
        when ${searchLike(sql`trim(coalesce(${customers.companyName}, ''))`, `${normalizedSearch}%`)} then 1
        when ${searchLike(customerNameValue, `${normalizedSearch}%`)} then 1
        else 2
      end`
    : undefined

  return {
    whereClause,
    orderBy: [
      ...(relevanceOrder ? [relevanceOrder] : []),
      asc(customers.lastName),
      asc(customers.firstName),
      asc(customers.id)
    ]
  }
}

export async function suggestCustomers(filters: {
  search?: string
  pageSize?: number
} = {}): Promise<CustomerSuggestionsResponse> {
  await ensurePosSchema()
  const { whereClause, orderBy } = customerSearchQuery(filters.search)
  const rows = await useDb().select().from(customers)
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(Math.min(Math.max(filters.pageSize || 20, 1), 250))

  return { items: rows.map(mapCustomer) }
}

export async function listCustomers(filters?: {
  search?: string
  page?: number
  pageSize?: number
}): Promise<CustomerListResponse> {
  await ensurePosSchema()

  const db = useDb()
  const page = Math.max(filters?.page || 1, 1)
  const pageSize = Math.min(Math.max(filters?.pageSize || 50, 1), 250)
  const offset = (page - 1) * pageSize
  const { whereClause, orderBy } = customerSearchQuery(filters?.search)

  const [totalRows, rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(customers).where(whereClause),
    db.select()
      .from(customers)
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset(offset)
  ])

  return {
    items: rows.map(mapCustomer),
    page,
    pageSize,
    total: Number(totalRows[0]?.total || 0)
  }
}

export async function getCustomerById(id: number) {
  await ensurePosSchema()

  const db = useDb()
  const rows = await db.select().from(customers).where(eq(customers.id, id)).limit(1)
  const row = rows[0]

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Customer not found'
    })
  }

  return mapCustomer(row)
}

export function mapCustomerInput(input: CustomerUpsertInput) {
  const companyName = normalizeOptionalText(input.companyName)
  const displayName = normalizeOptionalText(input.displayName)
  const explicitFirstName = normalizeOptionalText(input.firstName)
  const explicitLastName = normalizeOptionalText(input.lastName)

  const personName = displayName || [explicitFirstName, explicitLastName].filter(Boolean).join(' ').trim() || null
  const splitName = personName ? splitLegacyName(personName) : { firstName: '', lastName: '' }

  return {
    firstName: normalizeRequiredText(explicitFirstName ?? splitName.firstName),
    lastName: normalizeRequiredText(explicitLastName ?? splitName.lastName),
    companyName,
    phone: normalizeRequiredText(input.phone ?? ''),
    email: normalizeRequiredText(input.email ?? ''),
    addressLine1: normalizeOptionalText(input.addressLine1),
    addressLine2: normalizeOptionalText(input.addressLine2),
    postalCode: normalizeOptionalText(input.postalCode),
    city: normalizeOptionalText(input.city),
    notes: normalizeOptionalText(input.notes)
  }
}

export async function createCustomer(input: CustomerUpsertInput) {
  await ensurePosSchema()

  const db = useDb()
  const now = new Date().toISOString()
  const values = mapCustomerInput(input)

  const rows = await db.insert(customers).values({
    ...values,
    createdAt: now,
    updatedAt: now
  }).returning()

  return mapCustomer(rows[0]!)
}

export async function updateCustomer(id: number, input: CustomerUpsertInput) {
  await ensurePosSchema()

  const db = useDb()
  const values = mapCustomerInput(input)
  const rows = await db.update(customers)
    .set({
      ...values,
      updatedAt: new Date().toISOString()
    })
    .where(eq(customers.id, id))
    .returning()

  const row = rows[0]

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Customer not found'
    })
  }

  return mapCustomer(row)
}

export async function deleteCustomer(id: number) {
  await ensurePosSchema()

  const db = useDb()
  const result = await db.delete(customers).where(eq(customers.id, id))

  return result.rowsAffected
}
