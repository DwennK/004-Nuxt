import { createClient } from '@libsql/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { checks, runCountChecks } from '../../scripts/db/verify.mjs'
import { verifyDatabaseSchemaContract } from '../../scripts/db/_schema-contract.mjs'

function getCheck(name: string) {
  const check = checks.find(candidate => candidate.name === name)

  if (!check) {
    throw new Error(`Missing database verification check: ${name}`)
  }

  return check
}

describe('database verification invariants', () => {
  let client: ReturnType<typeof createClient>

  beforeEach(async () => {
    client = createClient({ url: 'file::memory:' })
    await client.batch([
      `CREATE TABLE documents (
        id INTEGER PRIMARY KEY,
        document_number TEXT NOT NULL,
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
      `CREATE TABLE number_sequences (
        scope TEXT PRIMARY KEY,
        last_value INTEGER NOT NULL
      )`
    ], 'write')
  })

  afterEach(() => {
    client.close()
  })

  it('detects a customer-order sequence behind the maximum CO number', async () => {
    await client.batch([
      `INSERT INTO documents (id, document_number, subtotal, tax_amount, total)
        VALUES (1, 'CO-42', 0, 0, 0)`,
      `INSERT INTO number_sequences (scope, last_value)
        VALUES ('document:customer_order', 41)`
    ], 'write')

    const [behind] = await runCountChecks(
      client,
      new Set(['documents', 'number_sequences']),
      [getCheck('document_number_sequence_behind')],
      'violations'
    )
    expect(behind).toMatchObject({ skipped: false, violations: 1 })

    await client.execute(`UPDATE number_sequences
      SET last_value = 42
      WHERE scope = 'document:customer_order'`)
    const [caughtUp] = await runCountChecks(
      client,
      new Set(['documents', 'number_sequences']),
      [getCheck('document_number_sequence_behind')],
      'violations'
    )
    expect(caughtUp).toMatchObject({ skipped: false, violations: 0 })
  })

  it('detects incorrect VAT allocation even when stored components still add up', async () => {
    await client.batch([
      `INSERT INTO documents (id, document_number, subtotal, tax_amount, total)
        VALUES (2, 'FA-1', 900, 181, 1081)`,
      'INSERT INTO document_lines (id, document_id, vat_rate, line_total) VALUES (1, 2, 8.1, 1081)'
    ], 'write')

    const results = await runCountChecks(
      client,
      new Set(['documents', 'document_lines']),
      [getCheck('incorrect_document_totals'), getCheck('incorrect_document_components')],
      'violations'
    )

    expect(results).toEqual([
      { name: 'incorrect_document_totals', skipped: false, violations: 1 },
      { name: 'incorrect_document_components', skipped: false, violations: 0 }
    ])
  })

  it('uses Math.round semantics for negative taxable half values', async () => {
    await client.batch([
      `INSERT INTO documents (id, document_number, subtotal, tax_amount, total)
        VALUES (3, 'FA-2', -1, -2, -3)`,
      'INSERT INTO document_lines (id, document_id, vat_rate, line_total) VALUES (2, 3, 100, -3)'
    ], 'write')

    const [result] = await runCountChecks(
      client,
      new Set(['documents', 'document_lines']),
      [getCheck('incorrect_document_totals')],
      'violations'
    )

    expect(result).toMatchObject({ skipped: false, violations: 0 })
  })

  it('reports column, index and foreign-key shape drift', async () => {
    await client.batch([
      'CREATE TABLE shape_parents (id INTEGER PRIMARY KEY)',
      'CREATE TABLE shape_children (id INTEGER PRIMARY KEY, parent_id TEXT)',
      'CREATE INDEX shape_children_parent_id_idx ON shape_children(id)'
    ], 'write')

    const violations = await verifyDatabaseSchemaContract(client, {
      shape_parents: {
        columns: [{ name: 'id', type: 'INTEGER', notNull: false, primaryKey: true }],
        indexes: [],
        foreignKeys: []
      },
      shape_children: {
        columns: [
          { name: 'id', type: 'INTEGER', notNull: false, primaryKey: true },
          { name: 'parent_id', type: 'INTEGER', notNull: true, primaryKey: false }
        ],
        indexes: [{
          name: 'shape_children_parent_id_idx',
          unique: false,
          columns: ['parent_id']
        }],
        foreignKeys: [{
          from: ['parent_id'],
          table: 'shape_parents',
          to: ['id'],
          onDelete: 'CASCADE'
        }]
      }
    }, new Set(['shape_parents', 'shape_children']))

    expect(violations.map(violation => violation.kind)).toEqual(expect.arrayContaining([
      'column_type',
      'column_nullability',
      'index_columns',
      'missing_foreign_key'
    ]))
  })

  it('accepts a matching column, index and foreign-key contract', async () => {
    await client.batch([
      'CREATE TABLE shape_ok_parents (id INTEGER PRIMARY KEY)',
      `CREATE TABLE shape_ok_children (
        id INTEGER PRIMARY KEY,
        parent_id INTEGER NOT NULL REFERENCES shape_ok_parents(id) ON DELETE CASCADE
      )`,
      'CREATE INDEX shape_ok_children_parent_id_idx ON shape_ok_children(parent_id)'
    ], 'write')

    const violations = await verifyDatabaseSchemaContract(client, {
      shape_ok_parents: {
        columns: [{ name: 'id', type: 'INTEGER', notNull: false, primaryKey: true }],
        indexes: [],
        foreignKeys: []
      },
      shape_ok_children: {
        columns: [
          { name: 'id', type: 'INTEGER', notNull: false, primaryKey: true },
          { name: 'parent_id', type: 'INTEGER', notNull: true, primaryKey: false }
        ],
        indexes: [{
          name: 'shape_ok_children_parent_id_idx',
          unique: false,
          columns: ['parent_id']
        }],
        foreignKeys: [{
          from: ['parent_id'],
          table: 'shape_ok_parents',
          to: ['id'],
          onDelete: 'CASCADE'
        }]
      }
    }, new Set(['shape_ok_parents', 'shape_ok_children']))

    expect(violations).toEqual([])
  })
})
