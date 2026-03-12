import type { SmartphoneStock } from '~/types'
import { useTursoClient } from './turso'

type SmartphoneStockRow = {
  id: number | string
  model: string
  imei: string | null
  sku: string | null
  capacity: string
  stocked_at: string | null
  sold: number | boolean
}

function normalizeOptionalText(value: string) {
  const normalized = value.trim()
  return normalized ? normalized : null
}

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

function mapSmartphoneStock(row: SmartphoneStockRow): SmartphoneStock {
  return {
    id: Number(row.id),
    model: row.model,
    imei: row.imei || '',
    sku: row.sku || '',
    capacity: row.capacity,
    stockedAt: row.stocked_at || '',
    sold: Boolean(row.sold)
  }
}

export async function ensureSmartphoneStocksTable() {
  const db = useTursoClient()

  await db.execute(`
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

  const columns = await db.execute('PRAGMA table_info(smartphone_stocks)')
  const columnMap = new Map(columns.rows.map(row => [String(row.name), row]))
  const columnNames = new Set(columnMap.keys())

  if (!columnNames.has('imei')) {
    await db.execute('ALTER TABLE smartphone_stocks ADD COLUMN imei TEXT')
  }

  if (!columnNames.has('sku')) {
    await db.execute('ALTER TABLE smartphone_stocks ADD COLUMN sku TEXT')
  }

  if (!columnNames.has('stocked_at')) {
    await db.execute('ALTER TABLE smartphone_stocks ADD COLUMN stocked_at TEXT')
  }

  await db.execute(`
    UPDATE smartphone_stocks
    SET stocked_at = DATE('now')
    WHERE stocked_at IS NULL OR TRIM(stocked_at) = ''
  `)

  await db.execute(`
    UPDATE smartphone_stocks
    SET imei = NULL
    WHERE imei LIKE 'AUTOIMEI%'
  `)

  await db.execute(`
    UPDATE smartphone_stocks
    SET sku = NULL
    WHERE sku LIKE 'MW-AUTO-%'
  `)

  const imeiColumn = columnMap.get('imei')
  const skuColumn = columnMap.get('sku')
  const needsSchemaMigration = Number(imeiColumn?.notnull || 0) === 1 || Number(skuColumn?.notnull || 0) === 1

  if (needsSchemaMigration) {
    await db.batch([
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

  await db.batch([
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

  const result = await db.execute('SELECT COUNT(*) AS count FROM smartphone_stocks')
  const count = Number(result.rows[0]?.count || 0)

  if (count > 0) {
    return
  }

  await db.batch(seedSmartphoneStocks.map(stock => ({
    sql: `
      INSERT INTO smartphone_stocks (id, model, imei, sku, capacity, stocked_at, sold)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    args: [
      stock.id,
      stock.model,
      stock.imei,
      stock.sku,
      stock.capacity,
      stock.stockedAt,
      stock.sold ? 1 : 0
    ]
  })), 'write')
}

export async function listSmartphoneStocks() {
  await ensureSmartphoneStocksTable()

  const db = useTursoClient()
  const result = await db.execute(`
    SELECT id, model, imei, sku, capacity, stocked_at, sold
    FROM smartphone_stocks
    ORDER BY id ASC
  `)

  return result.rows.map(row => mapSmartphoneStock(row as unknown as SmartphoneStockRow))
}

export async function createSmartphoneStock(input: Omit<SmartphoneStock, 'id'>) {
  await ensureSmartphoneStocksTable()

  const db = useTursoClient()
  const result = await db.execute({
    sql: `
      INSERT INTO smartphone_stocks (model, imei, sku, capacity, stocked_at, sold)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id, model, imei, sku, capacity, stocked_at, sold
    `,
    args: [
      input.model,
      normalizeOptionalText(input.imei),
      normalizeOptionalText(input.sku),
      input.capacity,
      input.stockedAt,
      input.sold ? 1 : 0
    ]
  })

  return mapSmartphoneStock(result.rows[0] as unknown as SmartphoneStockRow)
}

export async function updateSmartphoneStock(input: SmartphoneStock) {
  await ensureSmartphoneStocksTable()

  const db = useTursoClient()
  const result = await db.execute({
    sql: `
      UPDATE smartphone_stocks
      SET model = ?, imei = ?, sku = ?, capacity = ?, stocked_at = ?, sold = ?
      WHERE id = ?
      RETURNING id, model, imei, sku, capacity, stocked_at, sold
    `,
    args: [
      input.model,
      normalizeOptionalText(input.imei),
      normalizeOptionalText(input.sku),
      input.capacity,
      input.stockedAt,
      input.sold ? 1 : 0,
      input.id
    ]
  })

  if (!result.rows.length) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Smartphone not found'
    })
  }

  return mapSmartphoneStock(result.rows[0] as unknown as SmartphoneStockRow)
}

export async function deleteSmartphoneStocks(ids: number[]) {
  if (!ids.length) {
    return 0
  }

  await ensureSmartphoneStocksTable()

  const db = useTursoClient()
  const placeholders = ids.map(() => '?').join(', ')
  const result = await db.execute({
    sql: `DELETE FROM smartphone_stocks WHERE id IN (${placeholders})`,
    args: ids
  })

  return result.rowsAffected
}
