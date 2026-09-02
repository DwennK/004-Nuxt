import { sql } from 'drizzle-orm'
import { createError } from 'h3'
import { documents, numberSequences, tickets } from '~~/server/db/schema'
import { documentTypePrefixes } from '~~/shared/constants/pos'
import type { DocumentType } from '~~/shared/types/pos'
import type { PosDatabaseExecutor } from '../turso'
import { useDb } from '../turso'
import { ensurePosSchema } from './schema'

export async function generateTicketNumber(executor?: PosDatabaseExecutor) {
  if (!executor) {
    await ensurePosSchema()
  }

  const prefix = 'TIC-'
  const db = executor || useDb()
  const [result] = await db.insert(numberSequences).values({
    scope: 'ticket',
    lastValue: sql<number>`coalesce((
      select max(cast(substr(${tickets.ticketNumber}, length(${prefix}) + 1) as integer))
      from ${tickets}
      where ${tickets.ticketNumber} like ${`${prefix}%`}
    ), 0) + 1`
  }).onConflictDoUpdate({
    target: numberSequences.scope,
    set: { lastValue: sql`${numberSequences.lastValue} + 1` }
  }).returning({ lastValue: numberSequences.lastValue })

  const sequence = Number(result?.lastValue || 0)

  if (!sequence) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Could not generate ticket number'
    })
  }

  return `${prefix}${sequence}`
}

export async function generateDocumentNumber(type: DocumentType, executor?: PosDatabaseExecutor) {
  if (!executor) {
    await ensurePosSchema()
  }

  const prefix = `${documentTypePrefixes[type]}-`
  const db = executor || useDb()
  const [result] = await db.insert(numberSequences).values({
    scope: `document:${type}`,
    lastValue: sql<number>`coalesce((
      select max(cast(substr(${documents.documentNumber}, length(${prefix}) + 1) as integer))
      from ${documents}
      where ${documents.type} = ${type}
        and ${documents.documentNumber} like ${`${prefix}%`}
    ), 0) + 1`
  }).onConflictDoUpdate({
    target: numberSequences.scope,
    set: { lastValue: sql`${numberSequences.lastValue} + 1` }
  }).returning({ lastValue: numberSequences.lastValue })

  const sequence = Number(result?.lastValue || 0)

  if (!sequence) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Could not generate document number'
    })
  }

  return `${prefix}${sequence}`
}
