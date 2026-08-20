import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { commercialLineInputSchema } from '../../shared/validation/pos'

describe('local libSQL POS persistence', () => {
  let client: ReturnType<typeof createClient>

  beforeEach(async () => {
    client = createClient({ url: 'file::memory:' })
    await client.batch([
      `CREATE TABLE documents (
        id INTEGER PRIMARY KEY,
        total INTEGER NOT NULL
      )`,
      `CREATE TABLE document_lines (
        id INTEGER PRIMARY KEY,
        document_id INTEGER NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price INTEGER NOT NULL,
        line_total INTEGER NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      )`
    ], 'write')
  })

  afterEach(() => {
    client.close()
  })

  it('persists integer-cent adjustments without a remote Turso environment', async () => {
    const line = commercialLineInputSchema.parse({
      label: 'Remise',
      quantity: '2',
      unitPrice: '-500',
      vatRate: '8.1'
    })
    const lineTotal = line.quantity * line.unitPrice

    await client.batch([{
      sql: 'INSERT INTO documents (id, total) VALUES (?, ?)',
      args: [1, lineTotal]
    }, {
      sql: `INSERT INTO document_lines (id, document_id, quantity, unit_price, line_total)
            VALUES (?, ?, ?, ?, ?)`,
      args: [1, 1, line.quantity, line.unitPrice, lineTotal]
    }], 'write')

    const result = await client.execute(`
      SELECT documents.total, SUM(document_lines.line_total) AS computed_total
      FROM documents
      JOIN document_lines ON document_lines.document_id = documents.id
      GROUP BY documents.id
    `)

    expect(Number(result.rows[0]?.total)).toBe(-1000)
    expect(Number(result.rows[0]?.computed_total)).toBe(-1000)
  })
})
