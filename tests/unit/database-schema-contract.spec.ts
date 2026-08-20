import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { schemaPath } from '../../scripts/db/_shared.mjs'
import { parseSchemaContract } from '../../scripts/db/_schema-contract.mjs'

describe('database schema contract extraction', () => {
  it('derives columns, indexes and foreign keys from the Drizzle source', () => {
    const contract = parseSchemaContract(readFileSync(schemaPath, 'utf8'), schemaPath)

    expect(contract.documents.columns).toEqual(expect.arrayContaining([
      { name: 'id', type: 'INTEGER', notNull: false, primaryKey: true },
      { name: 'subtotal', type: 'INTEGER', notNull: true, primaryKey: false },
      { name: 'tax_amount', type: 'INTEGER', notNull: true, primaryKey: false }
    ]))
    expect(contract.documents.indexes).toContainEqual({
      name: 'documents_document_number_idx',
      unique: true,
      columns: ['document_number']
    })
    expect(contract.documents.foreignKeys).toEqual(expect.arrayContaining([
      { from: ['customer_id'], table: 'customers', to: ['id'], onDelete: 'RESTRICT' },
      { from: ['ticket_id'], table: 'tickets', to: ['id'], onDelete: 'SET NULL' }
    ]))
    expect(contract.document_lines.foreignKeys).toContainEqual({
      from: ['document_id'],
      table: 'documents',
      to: ['id'],
      onDelete: 'CASCADE'
    })
  })
})
