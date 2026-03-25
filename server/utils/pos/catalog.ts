import { and, asc, eq, or, sql } from 'drizzle-orm'
import { catalogItems } from '~~/server/db/schema'
import type { CatalogItemRecord } from '~~/shared/types/pos'
import { useDb } from '../turso'
import { ensurePosSchema, normalizeOptionalText, normalizeRequiredText } from './core'

function mapCatalogItem(row: typeof catalogItems.$inferSelect): CatalogItemRecord {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    type: row.type,
    defaultPrice: row.defaultPrice,
    vatRate: row.vatRate,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export async function listCatalogItems(search?: string, activeOnly = false) {
  await ensurePosSchema()

  const db = useDb()
  const normalizedSearch = search?.trim().toLowerCase()

  const rows = await db.select()
    .from(catalogItems)
    .where(and(
      activeOnly ? eq(catalogItems.isActive, true) : undefined,
      normalizedSearch
        ? or(
            sql`lower(${catalogItems.name}) like ${`%${normalizedSearch}%`}`,
            sql`lower(coalesce(${catalogItems.sku}, '')) like ${`%${normalizedSearch}%`}`,
            sql`lower(${catalogItems.type}) like ${`%${normalizedSearch}%`}`
          )
        : undefined
    ))
    .orderBy(asc(catalogItems.name), asc(catalogItems.id))

  return rows.map(mapCatalogItem)
}

export async function getCatalogItemById(id: number) {
  await ensurePosSchema()

  const db = useDb()
  const rows = await db.select().from(catalogItems).where(eq(catalogItems.id, id)).limit(1)
  const row = rows[0]

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Catalog item not found'
    })
  }

  return mapCatalogItem(row)
}

export async function createCatalogItem(input: Omit<CatalogItemRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  await ensurePosSchema()

  const db = useDb()
  const now = new Date().toISOString()
  const rows = await db.insert(catalogItems).values({
    name: normalizeRequiredText(input.name),
    sku: normalizeOptionalText(input.sku),
    type: input.type,
    defaultPrice: input.defaultPrice,
    vatRate: input.vatRate,
    isActive: input.isActive,
    createdAt: now,
    updatedAt: now
  }).returning()

  return mapCatalogItem(rows[0]!)
}

export async function updateCatalogItem(id: number, input: Omit<CatalogItemRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  await ensurePosSchema()

  const db = useDb()
  const rows = await db.update(catalogItems)
    .set({
      name: normalizeRequiredText(input.name),
      sku: normalizeOptionalText(input.sku),
      type: input.type,
      defaultPrice: input.defaultPrice,
      vatRate: input.vatRate,
      isActive: input.isActive,
      updatedAt: new Date().toISOString()
    })
    .where(eq(catalogItems.id, id))
    .returning()

  const row = rows[0]

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Catalog item not found'
    })
  }

  return mapCatalogItem(row)
}

export async function deleteCatalogItem(id: number) {
  await ensurePosSchema()

  const db = useDb()
  const result = await db.delete(catalogItems).where(eq(catalogItems.id, id))

  return result.rowsAffected
}
