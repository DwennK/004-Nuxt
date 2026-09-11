import { readFileSync } from 'node:fs'
import { createClient } from '@libsql/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseSchemaContract, verifyDatabaseSchemaContract } from '../../scripts/db/_schema-contract.mjs'
import { schemaPath } from '../../scripts/db/_shared.mjs'

describe('query read indexes', () => {
  const client = createClient({ url: 'file::memory:' })
  const contract = parseSchemaContract(readFileSync(schemaPath, 'utf8'), schemaPath)

  beforeAll(async () => {
    for (const [name, table] of Object.entries(contract) as [string, { columns: { name: string, type: string, primaryKey: boolean }[] }][]) {
      await client.execute(`CREATE TABLE "${name}" (${table.columns.map(column => `"${column.name}" ${column.type}${column.primaryKey ? ' PRIMARY KEY' : ''}`).join(', ')})`)
    }
    const migration = readFileSync(new URL('../../drizzle/20260911095852_query_read_indexes/migration.sql', import.meta.url), 'utf8')
    await client.batch(migration.split('--> statement-breakpoint').filter(Boolean), 'write')
  })

  afterAll(() => client.close())

  it.each([
    ['SELECT sum(amount) FROM payments WHERE status=\'paid\' AND paid_at >= \'2026-09-01\' AND paid_at < \'2026-10-01\'', 'payments_paid_period_idx'],
    ['SELECT sum(amount) FROM payments WHERE document_id=42 AND status=\'paid\'', 'payments_document_settlement_idx'],
    ['SELECT id FROM documents WHERE ticket_id=42 AND customer_id=8 AND type=\'invoice\' AND status!=\'cancelled\'', 'documents_settlement_scope_idx'],
    ['SELECT id FROM documents WHERE type=\'invoice\' ORDER BY issued_at DESC, id DESC LIMIT 50', 'documents_type_issued_at_id_idx'],
    ['SELECT id FROM customers WHERE lower(trim(email))=\'client@example.test\' LIMIT 2', 'customers_normalized_email_idx'],
    ['SELECT id FROM customers ORDER BY last_name, first_name, id LIMIT 50', 'customers_name_order_idx'],
    ['SELECT id FROM catalog_items WHERE type=\'repair\' ORDER BY category, name, id LIMIT 50', 'catalog_items_type_order_idx'],
    ['SELECT id FROM smartphone_stocks WHERE sold=0 ORDER BY id DESC LIMIT 10', 'smartphone_stocks_sold_id_idx'],
    ['SELECT id FROM smartphone_reservation_requests WHERE status=\'pending\' ORDER BY requested_at DESC, id DESC LIMIT 10', 'smartphone_reservation_requests_status_requested_at_id_idx'],
    ['SELECT count(*) FROM tickets WHERE status=\'closed\' AND closed_at>=\'2026-09-01\' AND closed_at<\'2026-10-01\'', 'tickets_status_closed_at_idx']
  ])('uses the intended index for %s', async (query, index) => {
    const plan = (await client.execute(`EXPLAIN QUERY PLAN ${query}`)).rows.map(row => String(row.detail)).join('\n')
    expect(plan).toContain(index)
    expect(plan).not.toContain('USE TEMP B-TREE FOR ORDER BY')
  })

  it.each(['lower(email)', 'lower(trim(email))'])('checks the complete index expression %s', async (expression) => {
    const probeClient = createClient({ url: 'file::memory:' })
    await probeClient.execute('CREATE TABLE expression_probe (id INTEGER PRIMARY KEY, email TEXT)')
    const probe = {
      expression_probe: {
        columns: [{ name: 'id', type: 'INTEGER', notNull: false, primaryKey: true }, { name: 'email', type: 'TEXT', notNull: false, primaryKey: false }],
        indexes: [{ name: 'expression_probe_idx', unique: false, columns: [null], expressions: ['lower(trim("email"))'] }],
        foreignKeys: []
      }
    }
    try {
      await probeClient.execute(`CREATE INDEX expression_probe_idx ON expression_probe (${expression})`)
      const violations = await verifyDatabaseSchemaContract(probeClient, probe, new Set(['expression_probe']))
      expect(violations).toEqual(expression === 'lower(trim(email))'
        ? []
        : [
            expect.objectContaining({ kind: 'index_expression', index: 'expression_probe_idx' })
          ])
    } finally {
      probeClient.close()
    }
  })
})
