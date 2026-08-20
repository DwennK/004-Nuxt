#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  createDatabaseClient,
  parseCliArgs,
  printJson,
  resolveDatabaseTarget,
  runCli,
  schemaPath
} from './_shared.mjs'
import { documentLineTaxableBaseSql } from './_document-total-sql.mjs'
import { parseSchemaContract, verifyDatabaseSchemaContract } from './_schema-contract.mjs'

const help = `Usage:
  node scripts/db/verify.mjs [options]

Read-only integrity and POS invariant checks. This command never changes data.

Options:
  --url <url>                  Override TURSO_URL
  --environment <name>        development|test|staging|production
  --confirm-target <host>      Required for every remote database
  --allow-production-read      Required for production
  --help                       Show this help
`

export const checks = [
  {
    name: 'duplicate_document_numbers',
    tables: ['documents'],
    sql: `SELECT COUNT(*) AS violations FROM (
      SELECT document_number FROM documents GROUP BY document_number HAVING COUNT(*) > 1
    )`
  },
  {
    name: 'duplicate_ticket_numbers',
    tables: ['tickets'],
    sql: `SELECT COUNT(*) AS violations FROM (
      SELECT ticket_number FROM tickets GROUP BY ticket_number HAVING COUNT(*) > 1
    )`
  },
  {
    name: 'duplicate_catalog_skus',
    tables: ['catalog_items'],
    sql: `SELECT COUNT(*) AS violations FROM (
      SELECT sku FROM catalog_items
      WHERE sku IS NOT NULL AND TRIM(sku) != ''
      GROUP BY sku HAVING COUNT(*) > 1
    )`
  },
  {
    name: 'duplicate_stock_imeis',
    tables: ['smartphone_stocks'],
    sql: `SELECT COUNT(*) AS violations FROM (
      SELECT imei FROM smartphone_stocks
      WHERE imei IS NOT NULL AND TRIM(imei) != ''
      GROUP BY imei HAVING COUNT(*) > 1
    )`
  },
  {
    name: 'duplicate_stock_skus',
    tables: ['smartphone_stocks'],
    sql: `SELECT COUNT(*) AS violations FROM (
      SELECT sku FROM smartphone_stocks
      WHERE sku IS NOT NULL AND TRIM(sku) != ''
      GROUP BY sku HAVING COUNT(*) > 1
    )`
  },
  {
    name: 'invalid_document_line_quantities',
    tables: ['document_lines'],
    sql: `SELECT COUNT(*) AS violations FROM document_lines
      WHERE quantity <= 0 OR quantity != CAST(quantity AS INTEGER)`
  },
  {
    name: 'invalid_ticket_line_quantities',
    tables: ['ticket_lines'],
    sql: `SELECT COUNT(*) AS violations FROM ticket_lines
      WHERE quantity <= 0 OR quantity != CAST(quantity AS INTEGER)`
  },
  {
    name: 'incorrect_document_line_totals',
    tables: ['document_lines'],
    sql: `SELECT COUNT(*) AS violations FROM document_lines
      WHERE line_total != quantity * unit_price`
  },
  {
    name: 'incorrect_ticket_line_totals',
    tables: ['ticket_lines'],
    sql: `SELECT COUNT(*) AS violations FROM ticket_lines
      WHERE line_total != quantity * unit_price`
  },
  {
    name: 'incorrect_document_totals',
    tables: ['documents', 'document_lines'],
    sql: `SELECT COUNT(*) AS violations
      FROM documents d
      JOIN (
        SELECT
          document_id,
          CAST(SUM(${documentLineTaxableBaseSql}) AS INTEGER) AS computed_subtotal,
          CAST(SUM(
            line_total - (${documentLineTaxableBaseSql})
          ) AS INTEGER) AS computed_tax_amount,
          CAST(SUM(line_total) AS INTEGER) AS computed_total
        FROM document_lines
        GROUP BY document_id
      ) computed ON computed.document_id = d.id
      WHERE d.subtotal != computed.computed_subtotal
        OR d.tax_amount != computed.computed_tax_amount
        OR d.total != computed.computed_total`
  },
  {
    name: 'incorrect_document_components',
    tables: ['documents'],
    sql: `SELECT COUNT(*) AS violations FROM documents
      WHERE subtotal + tax_amount != total`
  },
  {
    name: 'negative_document_totals',
    tables: ['documents'],
    sql: 'SELECT COUNT(*) AS violations FROM documents WHERE total < 0'
  },
  {
    name: 'non_positive_payments',
    tables: ['payments'],
    sql: 'SELECT COUNT(*) AS violations FROM payments WHERE amount <= 0'
  },
  {
    name: 'overpaid_documents',
    tables: ['documents', 'payments'],
    sql: `SELECT COUNT(*) AS violations
      FROM documents d
      JOIN (
        SELECT document_id, SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS paid_amount
        FROM payments GROUP BY document_id
      ) p ON p.document_id = d.id
      WHERE p.paid_amount > d.total`
  },
  {
    name: 'paid_status_without_full_payment',
    tables: ['documents', 'payments'],
    sql: `SELECT COUNT(*) AS violations
      FROM documents d
      LEFT JOIN (
        SELECT document_id, SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) AS paid_amount
        FROM payments GROUP BY document_id
      ) p ON p.document_id = d.id
      WHERE d.status = 'paid' AND COALESCE(p.paid_amount, 0) < d.total`
  },
  {
    name: 'invalid_document_enums',
    tables: ['documents'],
    sql: `SELECT COUNT(*) AS violations FROM documents
      WHERE type NOT IN ('quote', 'customer_order', 'invoice')
        OR status NOT IN ('draft', 'issued', 'paid', 'cancelled')`
  },
  {
    name: 'invalid_ticket_enums',
    tables: ['tickets'],
    sql: `SELECT COUNT(*) AS violations FROM tickets
      WHERE type NOT IN ('repair', 'support')
        OR status NOT IN (
          'new', 'diagnosis', 'awaiting_customer_approval', 'approved', 'in_progress',
          'waiting_parts', 'ready_for_pickup', 'delivered', 'closed', 'cancelled'
        )`
  },
  {
    name: 'invalid_payment_enums',
    tables: ['payments'],
    sql: `SELECT COUNT(*) AS violations FROM payments
      WHERE method NOT IN ('cash', 'card_twint', 'bank_transfer', 'stripe')
        OR status NOT IN ('pending', 'paid', 'refunded', 'cancelled')`
  },
  {
    name: 'missing_company_settings',
    tables: ['company_settings'],
    sql: `SELECT CASE
      WHEN COUNT(*) = 1 AND SUM(CASE WHEN id = 1 THEN 1 ELSE 0 END) = 1 THEN 0
      ELSE 1 END AS violations
      FROM company_settings`
  },
  {
    name: 'missing_active_admin',
    tables: ['users'],
    sql: 'SELECT CASE WHEN COUNT(*) > 0 THEN 0 ELSE 1 END AS violations FROM users WHERE is_active = 1 AND is_admin = 1'
  },
  {
    name: 'document_number_sequence_behind',
    tables: ['documents', 'number_sequences'],
    sql: `SELECT COUNT(*) AS violations FROM (
      SELECT 'document:quote' AS scope, 'DE-' AS prefix
      UNION ALL SELECT 'document:customer_order', 'CO-'
      UNION ALL SELECT 'document:invoice', 'FA-'
    ) expected
    WHERE (SELECT last_value FROM number_sequences WHERE scope = expected.scope) IS NOT NULL
      AND (SELECT last_value FROM number_sequences WHERE scope = expected.scope) <
      COALESCE((
        SELECT MAX(CAST(SUBSTR(document_number, LENGTH(expected.prefix) + 1) AS INTEGER))
        FROM documents WHERE document_number LIKE expected.prefix || '%'
      ), 0)`
  },
  {
    name: 'ticket_number_sequence_behind',
    tables: ['tickets', 'number_sequences'],
    sql: `SELECT CASE WHEN
      (SELECT last_value FROM number_sequences WHERE scope = 'ticket') IS NOT NULL
      AND (SELECT last_value FROM number_sequences WHERE scope = 'ticket') <
      COALESCE((SELECT MAX(CAST(SUBSTR(ticket_number, 5) AS INTEGER)) FROM tickets WHERE ticket_number LIKE 'TIC-%'), 0)
      THEN 1 ELSE 0 END AS violations`
  }
]

const warnings = [
  {
    name: 'runtime_demo_customers',
    tables: ['customers'],
    sql: `SELECT COUNT(*) AS matches FROM customers
      WHERE email IN ('alex.martin@example.com', 'sofia.rossi@example.com', 'contact@atelierpixel.example.com')`
  },
  {
    name: 'report_fixture_rows',
    tables: ['customers', 'documents', 'payments'],
    sql: `SELECT
      (SELECT COUNT(*) FROM customers WHERE notes LIKE '[codex-report-fixture]%') +
      (SELECT COUNT(*) FROM documents WHERE notes LIKE '[codex-report-fixture]%') +
      (SELECT COUNT(*) FROM payments WHERE notes LIKE '[codex-report-fixture]%') AS matches`
  }
]

export async function runCountChecks(client, tableSet, definitions, field) {
  const results = []

  for (const definition of definitions) {
    const missingTables = definition.tables.filter(table => !tableSet.has(table))

    if (missingTables.length) {
      results.push({ name: definition.name, skipped: true, missingTables })
      continue
    }

    const result = await client.execute(definition.sql)
    results.push({
      name: definition.name,
      skipped: false,
      [field]: Number(result.rows[0]?.[field] || 0)
    })
  }

  return results
}

async function main() {
  const { options, positional } = parseCliArgs(process.argv.slice(2), {
    booleanFlags: ['--allow-production-read', '--help'],
    valueFlags: ['--confirm-target', '--environment', '--url']
  })

  if (options.help) {
    console.log(help)
    return
  }

  if (positional.length) {
    throw new Error(`Unexpected arguments: ${positional.join(' ')}`)
  }

  const target = resolveDatabaseTarget(options, { access: 'read' })
  const client = createDatabaseClient(target)

  try {
    const tableResult = await client.execute(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `)
    const tableSet = new Set(tableResult.rows.map(row => String(row.name)))
    const schemaContract = parseSchemaContract(readFileSync(schemaPath, 'utf8'), schemaPath)
    const expectedTables = Object.keys(schemaContract).sort()
    const missingTables = expectedTables.filter(table => !tableSet.has(table))
    const shapeViolations = await verifyDatabaseSchemaContract(client, schemaContract, tableSet)
    const integrityResult = await client.execute('PRAGMA integrity_check')
    const integrityMessages = integrityResult.rows.map(row => String(Object.values(row)[0]))
    const foreignKeyResult = await client.execute('PRAGMA foreign_key_check')
    const invariantResults = await runCountChecks(client, tableSet, checks, 'violations')
    const warningResults = await runCountChecks(client, tableSet, warnings, 'matches')
    const failedChecks = invariantResults.filter(result => !result.skipped && result.violations > 0)
    const ok = missingTables.length === 0
      && shapeViolations.length === 0
      && integrityMessages.length === 1
      && integrityMessages[0] === 'ok'
      && foreignKeyResult.rows.length === 0
      && failedChecks.length === 0

    printJson({
      ok,
      checkedAt: new Date().toISOString(),
      target: {
        environment: target.environment,
        id: target.targetId,
        local: target.local
      },
      schema: {
        source: 'server/db/schema.ts',
        expectedTables,
        missingTables,
        shapeViolations
      },
      sqlite: {
        integrityMessages,
        foreignKeyViolations: foreignKeyResult.rows
      },
      invariants: invariantResults,
      warnings: warningResults
    })

    if (!ok) {
      process.exitCode = 1
    }
  } finally {
    client.close()
  }
}

const isDirectExecution = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isDirectExecution) {
  await runCli(main)
}
