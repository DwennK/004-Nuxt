import { and, eq, inArray } from 'drizzle-orm'
import { documentImports } from '~~/server/db/schema'
import { ensurePosSchema } from '~~/server/utils/pos/core'
import { useDb } from './turso'

export type DocumentImportSource = typeof documentImports.$inferSelect.source

export async function getDocumentImportByExternalId(source: DocumentImportSource, externalId: string) {
  await ensurePosSchema()

  const db = useDb()
  const rows = await db.select()
    .from(documentImports)
    .where(and(
      eq(documentImports.source, source),
      eq(documentImports.externalId, externalId)
    ))
    .limit(1)

  return rows[0] || null
}

export async function listDocumentImportsByExternalIds(source: DocumentImportSource, externalIds: string[]) {
  await ensurePosSchema()

  if (!externalIds.length) {
    return []
  }

  const db = useDb()

  return db.select()
    .from(documentImports)
    .where(and(
      eq(documentImports.source, source),
      inArray(documentImports.externalId, externalIds)
    ))
}

export async function createDocumentImportRecord(input: {
  documentId: number
  source: DocumentImportSource
  externalId: string
  externalNumber: string
}) {
  await ensurePosSchema()

  const db = useDb()
  const now = new Date().toISOString()

  const rows = await db.insert(documentImports).values({
    documentId: input.documentId,
    source: input.source,
    externalId: input.externalId,
    externalNumber: input.externalNumber,
    createdAt: now
  }).returning()

  return rows[0] || null
}
