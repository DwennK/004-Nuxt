import { asc, eq, inArray, sql } from 'drizzle-orm'
import type { Customer } from '~/types'
import { customers } from '../db/schema'
import { useDb, useTursoClient } from './turso'

type CustomerRow = typeof customers.$inferSelect

const seedCustomers: Customer[] = [{
  id: 1,
  name: 'Alex Smith',
  phone: '+41 79 555 10 01',
  email: 'alex.smith@example.com',
  address: 'Rue du Lac 10',
  postalCode: '1003',
  city: 'Lausanne',
  comment: 'Client interesse par les iPhone recents.'
}, {
  id: 2,
  name: 'Jordan Brown',
  phone: '+41 78 555 10 02',
  email: 'jordan.brown@example.com',
  address: 'Avenue Centrale 12',
  postalCode: '1201',
  city: 'Geneve',
  comment: ''
}, {
  id: 3,
  name: 'Taylor Green',
  phone: '+41 76 555 10 03',
  email: 'taylor.green@example.com',
  address: 'Chemin des Alpes 7',
  postalCode: '1950',
  city: 'Sion',
  comment: 'Prefere etre contacte par email.'
}]

function mapCustomer(row: CustomerRow): Customer {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone || '',
    email: row.email,
    address: row.address || '',
    postalCode: row.postalCode || '',
    city: row.city || '',
    comment: row.comment || ''
  }
}

function normalizeOptionalText(value: string) {
  const normalized = value.trim()
  return normalized ? normalized : null
}

export async function ensureCustomersTable() {
  const client = useTursoClient()

  await client.execute(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      address TEXT,
      postal_code TEXT,
      city TEXT,
      comment TEXT
    )
  `)

  const columns = await client.execute('PRAGMA table_info(customers)')
  const columnNames = new Set(columns.rows.map(row => String(row.name)))

  if (!columnNames.has('phone')) {
    await client.execute('ALTER TABLE customers ADD COLUMN phone TEXT')
  }

  if (!columnNames.has('address')) {
    await client.execute('ALTER TABLE customers ADD COLUMN address TEXT')
  }

  if (!columnNames.has('postal_code')) {
    await client.execute('ALTER TABLE customers ADD COLUMN postal_code TEXT')
  }

  if (!columnNames.has('city')) {
    await client.execute('ALTER TABLE customers ADD COLUMN city TEXT')
  }

  if (!columnNames.has('comment')) {
    await client.execute('ALTER TABLE customers ADD COLUMN comment TEXT')
  }

  if (columnNames.has('status') || columnNames.has('location') || columnNames.has('avatar_src')) {
    await client.batch([
      `
        CREATE TABLE customers_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT NOT NULL UNIQUE,
          phone TEXT,
          address TEXT,
          postal_code TEXT,
          city TEXT,
          comment TEXT
        )
      `,
      `
        INSERT INTO customers_migrated (id, name, email, phone, address, postal_code, city, comment)
        SELECT
          id,
          name,
          email,
          phone,
          address,
          postal_code,
          city,
          comment
        FROM customers
      `,
      'DROP TABLE customers',
      'ALTER TABLE customers_migrated RENAME TO customers'
    ], 'write')
  }

  await client.batch([
    `
      CREATE UNIQUE INDEX IF NOT EXISTS customers_email_idx
      ON customers(email)
    `,
    `
      CREATE INDEX IF NOT EXISTS customers_name_idx
      ON customers(name)
    `
  ], 'write')

  const db = useDb()
  const result = await db.select({ count: sql<number>`count(*)` }).from(customers)
  const count = Number(result[0]?.count || 0)

  if (count > 0) {
    return
  }

  await db.insert(customers).values(seedCustomers)
}

export async function listCustomers() {
  await ensureCustomersTable()

  const db = useDb()
  const result = await db.select().from(customers).orderBy(asc(customers.id))

  return result.map(mapCustomer)
}

export async function createCustomer(input: Omit<Customer, 'id'>) {
  await ensureCustomersTable()

  const db = useDb()
  const result = await db.insert(customers).values({
    name: input.name,
    phone: normalizeOptionalText(input.phone),
    email: input.email,
    address: normalizeOptionalText(input.address),
    postalCode: normalizeOptionalText(input.postalCode),
    city: normalizeOptionalText(input.city),
    comment: normalizeOptionalText(input.comment)
  }).returning()

  const row = result[0]

  if (!row) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Creation client impossible'
    })
  }

  return mapCustomer(row)
}

export async function updateCustomer(input: Customer) {
  await ensureCustomersTable()

  const db = useDb()
  const result = await db.update(customers)
    .set({
      name: input.name,
      phone: normalizeOptionalText(input.phone),
      email: input.email,
      address: normalizeOptionalText(input.address),
      postalCode: normalizeOptionalText(input.postalCode),
      city: normalizeOptionalText(input.city),
      comment: normalizeOptionalText(input.comment)
    })
    .where(eq(customers.id, input.id))
    .returning()

  if (!result.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Client introuvable'
    })
  }

  const row = result[0]

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Client introuvable'
    })
  }

  return mapCustomer(row)
}

export async function deleteCustomers(ids: number[]) {
  if (!ids.length) {
    return 0
  }

  await ensureCustomersTable()

  const db = useDb()
  const result = await db.delete(customers).where(inArray(customers.id, ids))

  return result.rowsAffected
}
