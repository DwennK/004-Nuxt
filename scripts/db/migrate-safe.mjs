#!/usr/bin/env node

import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import {
  CliError,
  compareMigrationState,
  createDatabaseClient,
  migrationsFolder,
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
  node scripts/db/migrate-safe.mjs [options]

The default mode is a read-only plan. Nothing is applied without --apply.

Options:
  --apply                       Apply pending migrations
  --url <url>                   Override TURSO_URL
  --environment <name>         development|test|staging|production
  --confirm-target <host>       Required for every remote database
  --allow-production-read       Required for a production plan
  --allow-production-write      Required with --apply in production
  --backup-reference <value>    Required in production and for destructive DDL
  --allow-destructive           Required if pending SQL contains destructive DDL
  --help                        Show this help
`

const destructivePattern = /\b(?:DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE\s+TABLE|ALTER\s+TABLE[\s\S]{0,160}\bRENAME\s+TO)\b/i

function summarizeMigration(migration) {
  const destructiveStatements = migration.sql
    .map(statement => statement.trim())
    .filter(statement => statement && destructivePattern.test(statement))
    .map(statement => statement.replace(/\s+/g, ' ').slice(0, 240))

  return {
    name: migration.name,
    hash: migration.hash,
    statementCount: migration.sql.filter(statement => statement.trim()).length,
    destructiveStatements
  }
}

function isAdoptionOnlyBaseline(migration) {
  const source = migration.sql.join('\n')
  return source.includes('Current sql file was generated after introspecting the database')
    && source.includes('If you want to run this migration please uncomment this code')
}

async function existingApplicationTables(client) {
  const expectedTables = readExpectedTableNames()
  const existing = []

  for (const tableName of expectedTables) {
    if (await tableExists(client, tableName)) {
      existing.push(tableName)
    }
  }

  return existing
}

async function main() {
  const { options, positional } = parseCliArgs(process.argv.slice(2), {
    booleanFlags: [
      '--allow-destructive',
      '--allow-production-read',
      '--allow-production-write',
      '--apply',
      '--help'
    ],
    valueFlags: ['--backup-reference', '--confirm-target', '--environment', '--url']
  })

  if (options.help) {
    console.log(help)
    return
  }

  if (positional.length) {
    throw new CliError(`Unexpected arguments: ${positional.join(' ')}`)
  }

  const target = resolveDatabaseTarget(options, { access: options.apply ? 'write' : 'read' })

  if (options.apply && target.environment === 'production' && !options.backupReference) {
    throw new CliError('Production migration requires --backup-reference <value>')
  }

  const localMigrations = readLocalMigrations()

  if (!localMigrations.length) {
    throw new CliError('No committed migration found in drizzle/. Establish and review the baseline first.')
  }

  const client = createDatabaseClient(target)

  try {
    const ledgerExists = await tableExists(client, migrationsTable)
    const applicationTables = await existingApplicationTables(client)
    const databaseMigrations = await readDatabaseMigrations(client)

    if (!ledgerExists && !applicationTables.length && isAdoptionOnlyBaseline(localMigrations[0])) {
      throw new CliError(
        'The first migration is an adoption-only introspection baseline and cannot provision an empty database.'
      )
    }

    if (applicationTables.length && (!ledgerExists || !databaseMigrations.length)) {
      throw new CliError(
        `Existing database has no migration ledger. Baseline it before migration; found: ${applicationTables.join(', ')}`
      )
    }

    const comparison = compareMigrationState(localMigrations, databaseMigrations)

    if (comparison.diverged) {
      throw new CliError('Migration ledger diverges from committed migrations. Refusing to continue.')
    }

    const pendingSummary = comparison.pending.map(summarizeMigration)
    const destructive = pendingSummary.some(migration => migration.destructiveStatements.length > 0)

    if (options.apply && destructive && !options.allowDestructive) {
      throw new CliError('Pending migrations contain destructive DDL; --allow-destructive is required')
    }

    if (options.apply && destructive && !options.backupReference) {
      throw new CliError('Destructive migration requires --backup-reference <value>')
    }

    const plan = {
      mode: options.apply ? 'apply' : 'plan',
      target: {
        environment: target.environment,
        id: target.targetId,
        local: target.local
      },
      ledgerExists,
      appliedCount: databaseMigrations.length,
      pendingCount: pendingSummary.length,
      destructive,
      pendingMigrations: pendingSummary,
      backupReference: options.backupReference || null
    }

    if (!options.apply || !pendingSummary.length) {
      printJson({ ...plan, applied: false })
      return
    }

    const db = drizzle({ client })
    await migrate(db, { migrationsFolder, migrationsTable })

    const migrationsAfter = await readDatabaseMigrations(client)
    const comparisonAfter = compareMigrationState(localMigrations, migrationsAfter)

    if (comparisonAfter.diverged || comparisonAfter.pending.length) {
      throw new Error('Migration runner returned but the database ledger is not converged')
    }

    printJson({
      ...plan,
      applied: true,
      appliedMigrationCount: pendingSummary.length,
      finalLedgerCount: migrationsAfter.length
    })
  } finally {
    client.close()
  }
}

await runCli(main)
