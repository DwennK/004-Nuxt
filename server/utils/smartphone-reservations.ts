import { asc, eq, inArray } from 'drizzle-orm'
import type { SmartphoneReservationRequest, SmartphoneReservationStatus } from '~/types'
import { smartphoneReservationRequests } from '../db/schema'
import { useDb, useTursoClient } from './turso'

type SmartphoneReservationRow = typeof smartphoneReservationRequests.$inferSelect

function normalizeOptionalText(value: string) {
  const normalized = value.trim()
  return normalized ? normalized : null
}

function mapSmartphoneReservation(row: SmartphoneReservationRow): SmartphoneReservationRequest {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    model: row.model,
    storage: row.storage,
    requestedAt: row.requestedAt,
    status: row.status as SmartphoneReservationStatus,
    notes: row.notes || ''
  }
}

export async function ensureSmartphoneReservationsTable() {
  const client = useTursoClient()

  await client.execute(`
    CREATE TABLE IF NOT EXISTS smartphone_reservation_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      model TEXT NOT NULL,
      storage TEXT NOT NULL,
      requested_at TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      notes TEXT
    )
  `)

  const columns = await client.execute('PRAGMA table_info(smartphone_reservation_requests)')
  const columnNames = new Set(columns.rows.map(row => String(row.name)))

  if (!columnNames.has('requested_at')) {
    await client.execute('ALTER TABLE smartphone_reservation_requests ADD COLUMN requested_at TEXT')
  }

  await client.execute(`
    UPDATE smartphone_reservation_requests
    SET requested_at = DATE('now')
    WHERE requested_at IS NULL OR TRIM(requested_at) = ''
  `)

  await client.batch([
    `
      CREATE INDEX IF NOT EXISTS smartphone_reservation_requests_name_idx
      ON smartphone_reservation_requests(name)
    `,
    `
      CREATE INDEX IF NOT EXISTS smartphone_reservation_requests_status_idx
      ON smartphone_reservation_requests(status)
    `
  ], 'write')
}

export async function listSmartphoneReservations() {
  await ensureSmartphoneReservationsTable()

  const db = useDb()
  const result = await db.select().from(smartphoneReservationRequests).orderBy(asc(smartphoneReservationRequests.id))

  return result.map(mapSmartphoneReservation)
}

export async function createSmartphoneReservation(input: Omit<SmartphoneReservationRequest, 'id'>) {
  await ensureSmartphoneReservationsTable()

  const db = useDb()
  const result = await db.insert(smartphoneReservationRequests).values({
    name: input.name,
    phone: input.phone,
    model: input.model,
    storage: input.storage,
    requestedAt: input.requestedAt,
    status: input.status,
    notes: normalizeOptionalText(input.notes)
  }).returning()

  const row = result[0]

  if (!row) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Creation demande impossible'
    })
  }

  return mapSmartphoneReservation(row)
}

export async function createSmartphoneReservations(inputs: Array<Omit<SmartphoneReservationRequest, 'id'>>) {
  await ensureSmartphoneReservationsTable()

  if (!inputs.length) {
    return 0
  }

  const db = useDb()
  await db.insert(smartphoneReservationRequests).values(inputs.map(input => ({
    name: input.name,
    phone: input.phone,
    model: input.model,
    storage: input.storage,
    requestedAt: input.requestedAt,
    status: input.status,
    notes: normalizeOptionalText(input.notes)
  })))

  return inputs.length
}

export async function updateSmartphoneReservation(input: SmartphoneReservationRequest) {
  await ensureSmartphoneReservationsTable()

  const db = useDb()
  const result = await db.update(smartphoneReservationRequests)
    .set({
      name: input.name,
      phone: input.phone,
      model: input.model,
      storage: input.storage,
      requestedAt: input.requestedAt,
      status: input.status,
      notes: normalizeOptionalText(input.notes)
    })
    .where(eq(smartphoneReservationRequests.id, input.id))
    .returning()

  if (!result.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Demande introuvable'
    })
  }

  const row = result[0]

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Demande introuvable'
    })
  }

  return mapSmartphoneReservation(row)
}

export async function deleteSmartphoneReservations(ids: number[]) {
  if (!ids.length) {
    return 0
  }

  await ensureSmartphoneReservationsTable()

  const db = useDb()
  const result = await db.delete(smartphoneReservationRequests).where(inArray(smartphoneReservationRequests.id, ids))

  return result.rowsAffected
}
