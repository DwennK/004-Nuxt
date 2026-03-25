import { asc, eq, inArray, sql } from 'drizzle-orm'
import type { SmartphoneStock } from '~/types'
import { smartphoneStocks } from '../db/schema'
import { useDb, useTursoClient } from './turso'

type SmartphoneStockRow = typeof smartphoneStocks.$inferSelect

const seedSmartphoneStocks: SmartphoneStock[] = [{
  id: 1,
  model: 'iPhone 12',
  imei: '356789012345670',
  sku: 'MW-IP12-128-001',
  capacity: '128 Go',
  stockedAt: '2026-01-08',
  sold: false
}, {
  id: 2,
  model: 'iPhone 13 Pro',
  imei: '356789012345671',
  sku: 'MW-IP13P-256-002',
  capacity: '256 Go',
  stockedAt: '2026-01-15',
  sold: true
}, {
  id: 3,
  model: 'Samsung Galaxy S22',
  imei: '356789012345672',
  sku: 'MW-SGS22-128-003',
  capacity: '128 Go',
  stockedAt: '2026-02-03',
  sold: false
}, {
  id: 4,
  model: 'Samsung Galaxy S23',
  imei: '356789012345673',
  sku: 'MW-SGS23-256-004',
  capacity: '256 Go',
  stockedAt: '2026-02-11',
  sold: false
}, {
  id: 5,
  model: 'Google Pixel 7',
  imei: '356789012345674',
  sku: 'MW-PIX7-128-005',
  capacity: '128 Go',
  stockedAt: '2026-02-19',
  sold: true
}, {
  id: 6,
  model: 'iPhone SE',
  imei: '356789012345675',
  sku: 'MW-IPSE-64-006',
  capacity: '64 Go',
  stockedAt: '2026-02-24',
  sold: false
}, {
  id: 7,
  model: 'Xiaomi 12',
  imei: '356789012345676',
  sku: 'MW-X12-256-007',
  capacity: '256 Go',
  stockedAt: '2026-03-02',
  sold: false
}, {
  id: 8,
  model: 'Samsung Galaxy A54',
  imei: '356789012345677',
  sku: 'MW-SGA54-128-008',
  capacity: '128 Go',
  stockedAt: '2026-03-09',
  sold: true
}]

function normalizeOptionalText(value: string) {
  const normalized = value.trim()
  return normalized ? normalized : null
}

function mapSmartphoneStock(row: SmartphoneStockRow): SmartphoneStock {
  return {
    id: row.id,
    model: row.model,
    imei: row.imei || '',
    sku: row.sku || '',
    capacity: row.capacity,
    stockedAt: row.stockedAt,
    sold: row.sold
  }
}

export async function ensureSmartphoneStocksTable() {
  const client = useTursoClient()

  await client.execute(`
    CREATE TABLE IF NOT EXISTS smartphone_stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model TEXT NOT NULL,
      imei TEXT UNIQUE,
      sku TEXT UNIQUE,
      capacity TEXT NOT NULL,
      stocked_at TEXT NOT NULL,
      sold INTEGER NOT NULL DEFAULT 0
    )
  `)

  const columns = await client.execute('PRAGMA table_info(smartphone_stocks)')
  const columnMap = new Map(columns.rows.map(row => [String(row.name), row]))
  const columnNames = new Set(columnMap.keys())

  if (!columnNames.has('imei')) {
    await client.execute('ALTER TABLE smartphone_stocks ADD COLUMN imei TEXT')
  }

  if (!columnNames.has('sku')) {
    await client.execute('ALTER TABLE smartphone_stocks ADD COLUMN sku TEXT')
  }

  if (!columnNames.has('stocked_at')) {
    await client.execute('ALTER TABLE smartphone_stocks ADD COLUMN stocked_at TEXT')
  }

  await client.execute(`
    UPDATE smartphone_stocks
    SET stocked_at = DATE('now')
    WHERE stocked_at IS NULL OR TRIM(stocked_at) = ''
  `)

  await client.execute(`
    UPDATE smartphone_stocks
    SET imei = NULL
    WHERE imei LIKE 'AUTOIMEI%'
  `)

  await client.execute(`
    UPDATE smartphone_stocks
    SET sku = NULL
    WHERE sku LIKE 'MW-AUTO-%'
  `)

  const imeiColumn = columnMap.get('imei')
  const skuColumn = columnMap.get('sku')
  const needsSchemaMigration = Number(imeiColumn?.notnull || 0) === 1 || Number(skuColumn?.notnull || 0) === 1

  if (needsSchemaMigration) {
    await client.batch([
      `
        CREATE TABLE smartphone_stocks_migrated (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          model TEXT NOT NULL,
          imei TEXT UNIQUE,
          sku TEXT UNIQUE,
          capacity TEXT NOT NULL,
          stocked_at TEXT NOT NULL,
          sold INTEGER NOT NULL DEFAULT 0
        )
      `,
      `
        INSERT INTO smartphone_stocks_migrated (id, model, imei, sku, capacity, stocked_at, sold)
        SELECT
          id,
          model,
          CASE
            WHEN imei IS NULL OR TRIM(imei) = '' OR imei LIKE 'AUTOIMEI%'
              THEN NULL
            ELSE TRIM(imei)
          END,
          CASE
            WHEN sku IS NULL OR TRIM(sku) = '' OR sku LIKE 'MW-AUTO-%'
              THEN NULL
            ELSE TRIM(sku)
          END,
          capacity,
          stocked_at,
          sold
        FROM smartphone_stocks
      `,
      'DROP TABLE smartphone_stocks',
      'ALTER TABLE smartphone_stocks_migrated RENAME TO smartphone_stocks'
    ], 'write')
  }

  await client.batch([
    `
      CREATE INDEX IF NOT EXISTS smartphone_stocks_model_idx
      ON smartphone_stocks(model)
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS smartphone_stocks_imei_idx
      ON smartphone_stocks(imei)
    `,
    `
      CREATE UNIQUE INDEX IF NOT EXISTS smartphone_stocks_sku_idx
      ON smartphone_stocks(sku)
    `
  ], 'write')

  const db = useDb()
  const result = await db.select({ count: sql<number>`count(*)` }).from(smartphoneStocks)
  const count = Number(result[0]?.count || 0)

  if (count > 0) {
    return
  }

  await db.insert(smartphoneStocks).values(seedSmartphoneStocks)
}

export async function listSmartphoneStocks() {
  await ensureSmartphoneStocksTable()

  const db = useDb()
  const result = await db.select().from(smartphoneStocks).orderBy(asc(smartphoneStocks.id))

  return result.map(mapSmartphoneStock)
}

export async function createSmartphoneStock(input: Omit<SmartphoneStock, 'id'>) {
  await ensureSmartphoneStocksTable()

  const db = useDb()
  const result = await db.insert(smartphoneStocks).values({
    model: input.model,
    imei: normalizeOptionalText(input.imei),
    sku: normalizeOptionalText(input.sku),
    capacity: input.capacity,
    stockedAt: input.stockedAt,
    sold: input.sold
  }).returning()

  const row = result[0]

  if (!row) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Creation smartphone impossible'
    })
  }

  return mapSmartphoneStock(row)
}

export async function updateSmartphoneStock(input: SmartphoneStock) {
  await ensureSmartphoneStocksTable()

  const db = useDb()
  const result = await db.update(smartphoneStocks)
    .set({
      model: input.model,
      imei: normalizeOptionalText(input.imei),
      sku: normalizeOptionalText(input.sku),
      capacity: input.capacity,
      stockedAt: input.stockedAt,
      sold: input.sold
    })
    .where(eq(smartphoneStocks.id, input.id))
    .returning()

  if (!result.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Smartphone not found'
    })
  }

  const row = result[0]

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Smartphone not found'
    })
  }

  return mapSmartphoneStock(row)
}

export async function deleteSmartphoneStocks(ids: number[]) {
  if (!ids.length) {
    return 0
  }

  await ensureSmartphoneStocksTable()

  const db = useDb()
  const result = await db.delete(smartphoneStocks).where(inArray(smartphoneStocks.id, ids))

  return result.rowsAffected
}
