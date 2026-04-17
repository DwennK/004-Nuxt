import { and, asc, eq, or, sql } from 'drizzle-orm'
import { catalogItems } from '~~/server/db/schema'
import type { CatalogItemInput, CatalogItemListResponse, CatalogItemRecord, CatalogItemType } from '~~/shared/types/pos'
import { useDb } from '../turso'
import { ensurePosSchema, normalizeOptionalText, normalizeRequiredText } from './core'

type ListCatalogItemsOptions = {
  search?: string
  activeOnly?: boolean
  type?: CatalogItemType
  category?: string
  page?: number
  pageSize?: number
}

function normalizeKeywords(value: string[] | null | undefined) {
  const normalized = value
    ?.map(keyword => normalizeOptionalText(keyword))
    .filter((keyword): keyword is string => Boolean(keyword))
    ?? []

  return Array.from(new Set(normalized))
}

function serializeKeywords(value: string[]) {
  const keywords = normalizeKeywords(value)
  return keywords.length ? JSON.stringify(keywords) : null
}

function parseKeywords(value: string | null) {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed)
      ? normalizeKeywords(parsed.filter(keyword => typeof keyword === 'string'))
      : []
  } catch {
    return []
  }
}

function normalizeCatalogItemInput(input: CatalogItemInput) {
  const type = input.type
  const isRepair = type === 'repair'
  const isService = type === 'service'

  return {
    name: normalizeRequiredText(input.name),
    sku: normalizeOptionalText(input.sku),
    type,
    category: normalizeRequiredText(input.category),
    brand: isRepair ? normalizeOptionalText(input.brand) : null,
    model: isRepair ? normalizeOptionalText(input.model) : null,
    serviceKind: (isRepair || isService) ? normalizeOptionalText(input.serviceKind) : null,
    keywordsJson: (isRepair || isService) ? serializeKeywords(input.keywords) : null,
    defaultPrice: input.defaultPrice,
    vatRate: input.vatRate,
    isActive: input.isActive
  }
}

function mapCatalogItem(row: typeof catalogItems.$inferSelect): CatalogItemRecord {
  return {
    id: row.id,
    name: row.name,
    sku: row.sku,
    type: row.type,
    category: row.category,
    brand: row.brand,
    model: row.model,
    serviceKind: row.serviceKind,
    keywords: parseKeywords(row.keywordsJson),
    defaultPrice: row.defaultPrice,
    vatRate: row.vatRate,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export async function listCatalogItems(options: ListCatalogItemsOptions = {}): Promise<CatalogItemListResponse> {
  await ensurePosSchema()

  const db = useDb()
  const normalizedSearch = options.search?.trim().toLowerCase()
  const normalizedCategory = options.category?.trim()
  const searchPattern = normalizedSearch ? `%${normalizedSearch}%` : null
  const page = Math.max(options.page || 1, 1)
  const pageSize = Math.min(Math.max(options.pageSize || 50, 1), 250)
  const offset = (page - 1) * pageSize

  const whereClause = and(
    options.activeOnly ? eq(catalogItems.isActive, true) : undefined,
    options.type ? eq(catalogItems.type, options.type) : undefined,
    normalizedCategory ? eq(catalogItems.category, normalizedCategory) : undefined,
    searchPattern
      ? or(
          sql`lower(${catalogItems.name}) like ${searchPattern}`,
          sql`lower(coalesce(${catalogItems.sku}, '')) like ${searchPattern}`,
          sql`lower(${catalogItems.type}) like ${searchPattern}`,
          sql`lower(${catalogItems.category}) like ${searchPattern}`,
          sql`lower(coalesce(${catalogItems.brand}, '')) like ${searchPattern}`,
          sql`lower(coalesce(${catalogItems.model}, '')) like ${searchPattern}`,
          sql`lower(coalesce(${catalogItems.serviceKind}, '')) like ${searchPattern}`,
          sql`lower(coalesce(${catalogItems.keywordsJson}, '')) like ${searchPattern}`
        )
      : undefined
  )

  const [totalRows, rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(catalogItems).where(whereClause),
    db.select()
      .from(catalogItems)
      .where(whereClause)
      .orderBy(asc(catalogItems.category), asc(catalogItems.name), asc(catalogItems.id))
      .limit(pageSize)
      .offset(offset)
  ])

  return {
    items: rows.map(mapCatalogItem),
    page,
    pageSize,
    total: Number(totalRows[0]?.total || 0)
  }
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

export async function createCatalogItem(input: CatalogItemInput) {
  await ensurePosSchema()

  const db = useDb()
  const now = new Date().toISOString()
  const normalized = normalizeCatalogItemInput(input)
  const rows = await db.insert(catalogItems).values({
    ...normalized,
    createdAt: now,
    updatedAt: now
  }).returning()

  return mapCatalogItem(rows[0]!)
}

export async function updateCatalogItem(id: number, input: CatalogItemInput) {
  await ensurePosSchema()

  const db = useDb()
  const normalized = normalizeCatalogItemInput(input)
  const rows = await db.update(catalogItems)
    .set({
      ...normalized,
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
