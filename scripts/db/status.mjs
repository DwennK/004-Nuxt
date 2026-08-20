#!/usr/bin/env node

import {
  compareMigrationState,
  createDatabaseClient,
  migrationsTable,
  parseCliArgs,
  printJson,
  readDatabaseMigrations,
  readExpectedTableNames,
  readLocalMigrations,
  resolveDatabaseTarget,
  runCli,
  tableExists
} from './_shared.mjs'

const help = `Usage:
  node scripts/db/status.mjs [options]

Compare committed migrations with the read-only database migration ledger.

Options:
  --local-only                 List local migrations without opening a database
  --url <url>                  Override TURSO_URL
  --environment <name>        development|test|staging|production
  --confirm-target <host>      Required for every remote database
  --allow-production-read      Required for production
  --help                       Show this help
`

function summarizeMigration(migration) {
  return {
    name: migration.name,
    hash: migration.hash,
    createdAt: new Date(migration.folderMillis).toISOString(),
    statementCount: migration.sql.filter(statement => statement.trim()).length
  }
}

async function main() {
  const { options, positional } = parseCliArgs(process.argv.slice(2), {
    booleanFlags: ['--allow-production-read', '--help', '--local-only'],
    valueFlags: ['--confirm-target', '--environment', '--url']
  })

  if (options.help) {
    console.log(help)
    return
  }

  if (positional.length) {
    throw new Error(`Unexpected arguments: ${positional.join(' ')}`)
  }

  const localMigrations = readLocalMigrations()

  if (options.localOnly) {
    printJson({
      ok: localMigrations.length > 0,
      baselineRequired: localMigrations.length === 0,
      migrationsFolder: 'drizzle',
      localMigrations: localMigrations.map(summarizeMigration)
    })

    if (!localMigrations.length) {
      process.exitCode = 1
    }
    return
  }

  const target = resolveDatabaseTarget(options, { access: 'read' })
  const client = createDatabaseClient(target)

  try {
    const ledgerExists = await tableExists(client, migrationsTable)
    const databaseMigrations = await readDatabaseMigrations(client)
    const expectedTables = readExpectedTableNames()
    const applicationTables = []

    for (const tableName of expectedTables) {
      if (await tableExists(client, tableName)) {
        applicationTables.push(tableName)
      }
    }

    const comparison = compareMigrationState(localMigrations, databaseMigrations)
    const baselineRequired = !localMigrations.length
      || (applicationTables.length > 0 && (!ledgerExists || !databaseMigrations.length))
    const ok = !baselineRequired && !comparison.diverged && comparison.pending.length === 0

    printJson({
      ok,
      checkedAt: new Date().toISOString(),
      target: {
        environment: target.environment,
        id: target.targetId,
        local: target.local
      },
      ledgerExists,
      baselineRequired,
      existingApplicationTables: applicationTables,
      diverged: comparison.diverged,
      localMigrations: localMigrations.map(summarizeMigration),
      databaseMigrations,
      pendingMigrations: comparison.pending.map(summarizeMigration),
      unknownDatabaseMigrations: comparison.unknownDatabaseMigrations,
      nameHashMismatches: comparison.nameHashMismatches,
      orderMismatches: comparison.orderMismatches
    })

    if (!ok) {
      process.exitCode = 1
    }
  } finally {
    client.close()
  }
}

await runCli(main)
