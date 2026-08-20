#!/usr/bin/env node

import {
  createDatabaseClient,
  parseCliArgs,
  printJson,
  quoteIdentifier,
  readExpectedTableNames,
  resolveDatabaseTarget,
  runCli,
  toSerializable
} from './_shared.mjs'

const help = `Usage:
  node scripts/db/introspect.mjs [options]

Read-only schema introspection. This command never runs DDL or DML.

Options:
  --url <url>                  Override TURSO_URL
  --environment <name>        development|test|staging|production
  --confirm-target <host>      Required for every remote database
  --allow-production-read      Required for production
  --include-counts             Include SELECT COUNT(*) for each application table
  --help                       Show this help
`

async function main() {
  const { options, positional } = parseCliArgs(process.argv.slice(2), {
    booleanFlags: ['--allow-production-read', '--help', '--include-counts'],
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
    const schemaResult = await client.execute(`
      SELECT type, name, tbl_name, sql
      FROM sqlite_schema
      WHERE name NOT LIKE 'sqlite_%'
      ORDER BY type, name
    `)

    const tableNames = schemaResult.rows
      .filter(row => String(row.type) === 'table')
      .map(row => String(row.name))
      .sort()
    const expectedTables = readExpectedTableNames()
    const expectedTableSet = new Set(expectedTables)
    const tableDetails = []

    for (const tableName of tableNames) {
      const [columns, indexes, foreignKeys] = await Promise.all([
        client.execute(`PRAGMA table_info(${quoteIdentifier(tableName)})`),
        client.execute(`PRAGMA index_list(${quoteIdentifier(tableName)})`),
        client.execute(`PRAGMA foreign_key_list(${quoteIdentifier(tableName)})`)
      ])
      const count = options.includeCounts && expectedTableSet.has(tableName)
        ? Number((await client.execute(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)}`)).rows[0]?.count || 0)
        : null

      tableDetails.push({
        name: tableName,
        expectedByApplicationSchema: expectedTableSet.has(tableName),
        count,
        columns: toSerializable(columns.rows),
        indexes: toSerializable(indexes.rows),
        foreignKeys: toSerializable(foreignKeys.rows)
      })
    }

    printJson({
      generatedAt: new Date().toISOString(),
      target: {
        environment: target.environment,
        id: target.targetId,
        local: target.local
      },
      contract: {
        schemaFile: 'server/db/schema.ts',
        expectedTables,
        missingTables: expectedTables.filter(table => !tableNames.includes(table)),
        unexpectedTables: tableNames.filter(table => !expectedTableSet.has(table) && table !== '__drizzle_migrations')
      },
      objects: toSerializable(schemaResult.rows),
      tables: tableDetails
    })
  } finally {
    client.close()
  }
}

await runCli(main)
