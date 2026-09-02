import { asc, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { counterCustomer, customers } from '~~/server/db/schema'
import type { PosTransaction } from '../turso'

// The financial transaction owns resolution, creation and the stable singleton link.
export async function resolveCounterCustomer(tx: PosTransaction): Promise<number> {
  const [assigned] = await tx.select({ id: customers.id })
    .from(counterCustomer)
    .innerJoin(customers, eq(customers.id, counterCustomer.customerId))
    .where(eq(counterCustomer.id, 1))
    .limit(1)

  if (assigned) {
    return assigned.id
  }

  // Adopt the oldest matching walk-in identity, without merging or editing legacy rows.
  const [legacy] = await tx.select({ id: customers.id }).from(customers)
    .where(sql`trim(${customers.firstName} || ' ' || ${customers.lastName}) = 'Client comptoir'
      and trim(coalesce(${customers.companyName}, '')) = ''
      and trim(${customers.phone}) = '' and trim(${customers.email}) = ''`)
    .orderBy(asc(customers.id))
    .limit(1)

  let customerId = legacy?.id
  if (!customerId) {
    const now = new Date().toISOString()
    const [created] = await tx.insert(customers).values({
      firstName: 'Client', lastName: 'comptoir', phone: '', email: '',
      notes: 'Client créé automatiquement pour les ventes rapides sans client nominatif.',
      createdAt: now, updatedAt: now
    }).returning({ id: customers.id })
    customerId = created?.id
  }

  if (!customerId) {
    throw createError({ statusCode: 500, statusMessage: 'Could not resolve counter customer' })
  }

  await tx.insert(counterCustomer).values({ id: 1, customerId })
  return customerId
}
