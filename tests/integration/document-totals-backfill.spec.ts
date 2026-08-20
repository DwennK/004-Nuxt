import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  countDocumentTotalMismatches,
  processBackfillWindow
} from '../../scripts/db/backfill-document-totals.mjs'

describe('bounded document totals backfill', () => {
  let client: ReturnType<typeof createClient>

  beforeEach(async () => {
    client = createClient({ url: 'file::memory:' })
    await client.batch([
      `CREATE TABLE documents (
        id INTEGER PRIMARY KEY,
        subtotal INTEGER NOT NULL,
        tax_amount INTEGER NOT NULL,
        total INTEGER NOT NULL
      )`,
      `CREATE TABLE document_lines (
        id INTEGER PRIMARY KEY,
        document_id INTEGER NOT NULL,
        vat_rate REAL NOT NULL,
        line_total INTEGER NOT NULL
      )`,
      'CREATE TABLE document_update_audit (document_id INTEGER NOT NULL)',
      `CREATE TRIGGER audit_document_updates AFTER UPDATE ON documents
        BEGIN
          INSERT INTO document_update_audit (document_id) VALUES (NEW.id);
        END`,
      'INSERT INTO documents (id, subtotal, tax_amount, total) VALUES (1, 1000, 81, 1081)',
      'INSERT INTO documents (id, subtotal, tax_amount, total) VALUES (2, 0, 0, 0)',
      'INSERT INTO documents (id, subtotal, tax_amount, total) VALUES (3, 999, 0, 999)',
      'INSERT INTO documents (id, subtotal, tax_amount, total) VALUES (4, 7, 0, 7)',
      'INSERT INTO document_lines (id, document_id, vat_rate, line_total) VALUES (1, 1, 8.1, 1081)',
      'INSERT INTO document_lines (id, document_id, vat_rate, line_total) VALUES (2, 2, 8.1, 1081)',
      'INSERT INTO document_lines (id, document_id, vat_rate, line_total) VALUES (3, 3, 0, 1000)',
      'INSERT INTO document_lines (id, document_id, vat_rate, line_total) VALUES (4, 3, 0, -200)'
    ], 'write')
  })

  afterEach(() => {
    client.close()
  })

  it('updates only one mismatched document per bounded batch and resumes by ID', async () => {
    expect(await countDocumentTotalMismatches(client)).toBe(2)

    const plan = await processBackfillWindow(client, {
      afterId: 0,
      batchSize: 2,
      maxBatches: 1,
      maxDocuments: 2
    })

    expect(plan).toMatchObject({
      lastProcessedId: 2,
      processedBatches: 1,
      scannedDocuments: 2,
      mismatchedDocuments: 1,
      updatedDocuments: 0,
      hasMore: true
    })

    const first = await processBackfillWindow(client, {
      afterId: 0,
      batchSize: 2,
      maxBatches: 1,
      maxDocuments: 2
    }, { apply: true })

    expect(first).toMatchObject({
      lastProcessedId: 2,
      scannedDocuments: 2,
      mismatchedDocuments: 1,
      updatedDocuments: 1,
      hasMore: true
    })
    expect(await countDocumentTotalMismatches(client)).toBe(1)

    const second = await processBackfillWindow(client, {
      afterId: first.lastProcessedId!,
      batchSize: 2,
      maxBatches: 1,
      maxDocuments: 2
    }, { apply: true })

    expect(second).toMatchObject({
      lastProcessedId: 4,
      scannedDocuments: 2,
      mismatchedDocuments: 1,
      updatedDocuments: 1,
      hasMore: false
    })
    expect(await countDocumentTotalMismatches(client)).toBe(0)

    const replay = await processBackfillWindow(client, {
      afterId: 0,
      batchSize: 2,
      maxBatches: 2,
      maxDocuments: 4
    }, { apply: true })
    expect(replay).toMatchObject({
      scannedDocuments: 4,
      mismatchedDocuments: 0,
      updatedDocuments: 0
    })

    const audit = await client.execute('SELECT document_id FROM document_update_audit ORDER BY document_id')
    expect(audit.rows.map(row => Number(row.document_id))).toEqual([2, 3])

    const documents = await client.execute('SELECT id, subtotal, tax_amount, total FROM documents ORDER BY id')
    expect(documents.rows.map(row => ({
      id: Number(row.id),
      subtotal: Number(row.subtotal),
      taxAmount: Number(row.tax_amount),
      total: Number(row.total)
    }))).toEqual([
      { id: 1, subtotal: 1000, taxAmount: 81, total: 1081 },
      { id: 2, subtotal: 1000, taxAmount: 81, total: 1081 },
      { id: 3, subtotal: 800, taxAmount: 0, total: 800 },
      { id: 4, subtotal: 7, taxAmount: 0, total: 7 }
    ])
  })

  it('matches Math.round for negative taxable half values', async () => {
    await client.batch([
      'DELETE FROM document_lines',
      'DELETE FROM documents',
      'DELETE FROM document_update_audit',
      'INSERT INTO documents (id, subtotal, tax_amount, total) VALUES (10, 0, 0, 0)',
      'INSERT INTO document_lines (id, document_id, vat_rate, line_total) VALUES (10, 10, 100, -3)'
    ], 'write')

    const result = await processBackfillWindow(client, {
      afterId: 0,
      batchSize: 10,
      maxBatches: 1,
      maxDocuments: 10
    }, { apply: true })

    expect(result).toMatchObject({ mismatchedDocuments: 1, updatedDocuments: 1 })

    const document = await client.execute('SELECT subtotal, tax_amount, total FROM documents WHERE id = 10')
    expect(document.rows[0]).toMatchObject({ subtotal: -1, tax_amount: -2, total: -3 })
    expect(await countDocumentTotalMismatches(client)).toBe(0)
  })
})
