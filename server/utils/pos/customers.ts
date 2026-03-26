import { asc, eq, or, sql } from 'drizzle-orm'
import { customers } from '~~/server/db/schema'
import type { CustomerUpsertInput } from '~~/shared/types/pos'
import { useDb } from '../turso'
import { ensurePosSchema, mapCustomer, normalizeOptionalText, normalizeRequiredText, splitLegacyName } from './core'

export async function listCustomers(search?: string) {
  await ensurePosSchema()

  const db = useDb()
  const normalizedSearch = search?.trim().toLowerCase()

  const rows = await db.select()
    .from(customers)
    .where(normalizedSearch
      ? or(
          sql`lower(${customers.firstName}) like ${`%${normalizedSearch}%`}`,
          sql`lower(${customers.lastName}) like ${`%${normalizedSearch}%`}`,
          sql`lower(coalesce(${customers.companyName}, '')) like ${`%${normalizedSearch}%`}`,
          sql`lower(${customers.phone}) like ${`%${normalizedSearch}%`}`,
          sql`lower(${customers.email}) like ${`%${normalizedSearch}%`}`
        )
      : undefined)
    .orderBy(asc(customers.lastName), asc(customers.firstName), asc(customers.id))

  return rows.map(mapCustomer)
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

function mapCustomerInput(input: CustomerUpsertInput) {
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
