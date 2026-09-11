import { and, asc, eq, or, sql } from 'drizzle-orm'
import { catalogItems } from '~~/server/db/schema'
import { normalizeSearchText } from '~~/shared/utils/pos'
import type { CatalogItemInput, CatalogItemListResponse, CatalogItemRecord, CatalogItemType } from '~~/shared/types/pos'
import type { CatalogSuggestionsResponse, CatalogSummaryResponse } from '~~/shared/types/lookups'
import { useDb } from '../turso'
import { ensurePosSchema } from '~~/server/utils/pos/schema'
import { normalizeOptionalText, normalizeRequiredText } from '~~/shared/lib/text'
import { catalogMobileSentrixSchema } from '~~/shared/validation/pos'

type ListCatalogItemsOptions = {
  search?: string
  activeOnly?: boolean
  type?: CatalogItemType
  category?: string
  page?: number
  pageSize?: number
}

function parseMobileSentrix(value: string | null) {
  if (!value) return null
  try {
    const result = catalogMobileSentrixSchema.safeParse(JSON.parse(value))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

function mobileSentrixUpdate(input: CatalogItemInput, previous?: CatalogItemRecord['mobileSentrix']) {
  if (input.mobileSentrix === undefined) return {}
  const value = input.mobileSentrix
  const fields = ['status', 'sku', 'productId', 'url', 'note'] as const
  if (value && previous && fields.every(key => value[key] === previous[key])) return {}
  // Keep an explicit manual removal so future automatic matching cannot restore it.
  return {
    mobileSentrixJson: JSON.stringify({
      ...(value || { status: 'unlinked', sku: null, productId: null, url: null, note: null }),
      source: 'manual',
      verifiedAt: null
    })
  }
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
    mobileSentrix: parseMobileSentrix(row.mobileSentrixJson),
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

function catalogSearchQuery(options: ListCatalogItemsOptions) {
  const normalizedSearch = normalizeSearchText(options.search)
  const searchTokens = normalizedSearch.split(' ').filter(Boolean)
  const normalizedCategory = options.category?.trim()
  const descriptiveColumns = [
    sql`lower(${catalogItems.name})`,
    sql`lower(coalesce(${catalogItems.brand}, ''))`,
    sql`lower(coalesce(${catalogItems.model}, ''))`,
    sql`lower(coalesce(${catalogItems.serviceKind}, ''))`,
    sql`lower(coalesce(${catalogItems.keywordsJson}, ''))`
  ] as const
  const searchableColumns = [
    ...descriptiveColumns,
    sql`lower(coalesce(${catalogItems.sku}, ''))`,
    sql`lower(coalesce(json_extract(${catalogItems.mobileSentrixJson}, '$.sku'), ''))`,
    sql`lower(${catalogItems.type})`,
    sql`lower(${catalogItems.category})`
  ] as const
  const searchClause = searchTokens.length
    ? and(...searchTokens.map(token => or(
        ...searchableColumns.map(column => sql`${column} like ${`%${token}%`}`)
      )))
    : undefined

  const whereClause = and(
    options.activeOnly ? eq(catalogItems.isActive, true) : undefined,
    options.type ? eq(catalogItems.type, options.type) : undefined,
    normalizedCategory ? eq(catalogItems.category, normalizedCategory) : undefined,
    searchClause
  )
  // Rank device/service matches before technical references such as SERV-*.
  // This must happen before LIMIT: the intake form only receives one page.
  const descriptiveMatch = searchTokens.length
    ? and(...searchTokens.map(token => or(
        ...descriptiveColumns.map(column => sql`${column} like ${`%${token}%`}`)
      )))
    : undefined
  const matchOrder = normalizedSearch
    ? sql<number>`case
        when lower(coalesce(${catalogItems.sku}, '')) = ${normalizedSearch}
          or lower(coalesce(json_extract(${catalogItems.mobileSentrixJson}, '$.sku'), '')) = ${normalizedSearch} then 0
        when ${descriptiveMatch} then 1
        else 2
      end`
    : undefined

  const relevanceOrder = normalizedSearch
    ? sql<number>`case
        when lower(coalesce(${catalogItems.sku}, '')) = ${normalizedSearch} then 0
        when lower(coalesce(${catalogItems.model}, '')) = ${normalizedSearch} then 1
        when lower(${catalogItems.name}) like ${`${normalizedSearch}%`} then 2
        when lower(coalesce(${catalogItems.keywordsJson}, '')) like ${`%${normalizedSearch}%`} then 3
        else 4
      end`
    : undefined

  return {
    whereClause,
    orderBy: [
      ...(matchOrder ? [matchOrder] : []),
      ...(relevanceOrder ? [relevanceOrder] : []),
      asc(catalogItems.category),
      asc(catalogItems.name),
      asc(catalogItems.id)
    ]
  }
}

export async function suggestCatalogItems(options: Omit<ListCatalogItemsOptions, 'page'> = {}): Promise<CatalogSuggestionsResponse> {
  await ensurePosSchema()
  const { whereClause, orderBy } = catalogSearchQuery(options)
  const rows = await useDb().select().from(catalogItems)
    .where(whereClause)
    .orderBy(...orderBy)
    .limit(Math.min(Math.max(options.pageSize || 25, 1), 250))

  return { items: rows.map(mapCatalogItem) }
}

export async function getCatalogSummary(filters: Partial<Record<CatalogItemType, Pick<ListCatalogItemsOptions, 'search' | 'category' | 'activeOnly'>>> = {}): Promise<CatalogSummaryResponse> {
  await ensurePosSchema()
  const types = ['product', 'repair', 'service'] as const
  const rows = await useDb().select({ type: catalogItems.type, total: sql<number>`count(*)` })
    .from(catalogItems)
    .where(or(...types.map(type => catalogSearchQuery({ ...filters[type], type }).whereClause)))
    .groupBy(catalogItems.type)
  const totals: CatalogSummaryResponse = { product: 0, repair: 0, service: 0 }
  for (const row of rows) totals[row.type] = Number(row.total)
  return totals
}

export async function listCatalogItems(options: ListCatalogItemsOptions = {}): Promise<CatalogItemListResponse> {
  await ensurePosSchema()

  const db = useDb()
  const page = Math.max(options.page || 1, 1)
  const pageSize = Math.min(Math.max(options.pageSize || 50, 1), 250)
  const offset = (page - 1) * pageSize
  const { whereClause, orderBy } = catalogSearchQuery(options)

  const [totalRows, rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(catalogItems).where(whereClause),
    db.select()
      .from(catalogItems)
      .where(whereClause)
      .orderBy(...orderBy)
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
    ...mobileSentrixUpdate(input),
    createdAt: now,
    updatedAt: now
  }).returning()

  return mapCatalogItem(rows[0]!)
}

export async function updateCatalogItem(id: number, input: CatalogItemInput) {
  await ensurePosSchema()

  const db = useDb()
  const normalized = normalizeCatalogItemInput(input)
  const current = input.mobileSentrix === undefined ? null : await getCatalogItemById(id)
  const rows = await db.update(catalogItems)
    .set({
      ...normalized,
      ...mobileSentrixUpdate(input, current?.mobileSentrix),
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
