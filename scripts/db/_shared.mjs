import 'dotenv/config'

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@libsql/client'
import { readMigrationFiles } from 'drizzle-orm/migrator'

export const projectRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))
export const migrationsFolder = resolve(projectRoot, 'drizzle')
export const migrationsTable = '__drizzle_migrations'
export const schemaPath = resolve(projectRoot, 'server/db/schema.ts')

const environments = new Set(['development', 'test', 'staging', 'production'])
const remoteTargetAllowlistVariable = 'DB_REMOTE_TARGETS'

export class CliError extends Error {}

function optionName(flag) {
  return flag.replace(/^--/, '').replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())
}

export function parseCliArgs(argv, { booleanFlags = [], valueFlags = [] } = {}) {
  const booleanNames = new Set(booleanFlags)
  const valueNames = new Set(valueFlags)
  const options = {}
  const positional = []

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]

    if (!argument.startsWith('--')) {
      positional.push(argument)
      continue
    }

    const separatorIndex = argument.indexOf('=')
    const flag = separatorIndex === -1 ? argument : argument.slice(0, separatorIndex)
    const inlineValue = separatorIndex === -1 ? null : argument.slice(separatorIndex + 1)

    if (booleanNames.has(flag)) {
      if (inlineValue !== null) {
        throw new CliError(`${flag} does not accept a value`)
      }

      options[optionName(flag)] = true
      continue
    }

    if (valueNames.has(flag)) {
      const value = inlineValue ?? argv[index + 1]

      if (!value || (inlineValue === null && value.startsWith('--'))) {
        throw new CliError(`${flag} requires a value`)
      }

      options[optionName(flag)] = value
      if (inlineValue === null) {
        index += 1
      }
      continue
    }

    throw new CliError(`Unknown option: ${flag}`)
  }

  return { options, positional }
}

function parseDatabaseUrl(rawUrl) {
  try {
    return new URL(rawUrl)
  } catch {
    throw new CliError('TURSO_URL must be a valid URL')
  }
}

function isLocalUrl(url) {
  return url.protocol === 'file:'
    || url.hostname === 'localhost'
    || url.hostname === '127.0.0.1'
    || url.hostname === '::1'
}

function targetIdFromUrl(url) {
  if (url.protocol === 'file:') {
    return `file:${resolve(decodeURIComponent(url.pathname))}`
  }

  const port = url.port ? `:${url.port}` : ''
  return `${url.hostname.toLowerCase()}${port}`
}

export function parseRemoteTargetAllowlist(rawValue = process.env[remoteTargetAllowlistVariable]) {
  if (!rawValue) {
    return new Map()
  }

  let parsed

  try {
    parsed = JSON.parse(rawValue)
  } catch {
    throw new CliError(`${remoteTargetAllowlistVariable} must be a JSON object mapping target IDs to environments`)
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new CliError(`${remoteTargetAllowlistVariable} must be a JSON object mapping target IDs to environments`)
  }

  const allowlist = new Map()

  for (const [rawTargetId, environment] of Object.entries(parsed)) {
    const targetId = rawTargetId.trim().toLowerCase()

    if (!targetId || typeof environment !== 'string' || !environments.has(environment)) {
      throw new CliError(
        `${remoteTargetAllowlistVariable} entries must map non-empty target IDs to development|test|staging|production`
      )
    }

    if (allowlist.has(targetId)) {
      throw new CliError(`${remoteTargetAllowlistVariable} contains a duplicate target ID: ${targetId}`)
    }

    allowlist.set(targetId, environment)
  }

  return allowlist
}

function resolveRemoteEnvironment(targetId, requestedEnvironment) {
  const environment = parseRemoteTargetAllowlist().get(targetId)

  if (!environment) {
    throw new CliError(
      `Remote target ${targetId} is not allowlisted in ${remoteTargetAllowlistVariable}; remote access is refused`
    )
  }

  if (requestedEnvironment && requestedEnvironment !== environment) {
    throw new CliError(
      `Remote target ${targetId} is allowlisted as ${environment}, not ${requestedEnvironment}`
    )
  }

  return environment
}

export function resolveDatabaseTarget(options, { access = 'read' } = {}) {
  const rawUrl = options.url || process.env.TURSO_URL

  if (!rawUrl) {
    throw new CliError('Missing TURSO_URL (or --url)')
  }

  const url = parseDatabaseUrl(rawUrl)
  const local = isLocalUrl(url)
  const requestedEnvironment = options.environment || process.env.DB_TARGET_ENV || null

  if (requestedEnvironment && !environments.has(requestedEnvironment)) {
    throw new CliError('Database environment must be development|test|staging|production')
  }

  const targetId = targetIdFromUrl(url)
  const environment = local
    ? (requestedEnvironment || 'development')
    : resolveRemoteEnvironment(targetId, requestedEnvironment)
  const explicitConfirmation = options.confirmTarget

  if (!local && explicitConfirmation !== targetId) {
    throw new CliError(`Refusing remote target. Re-run with --confirm-target ${targetId}`)
  }

  if (environment === 'production') {
    if (access === 'write' && !options.allowProductionWrite) {
      throw new CliError('Production writes require --allow-production-write')
    }

    if (access === 'read' && !options.allowProductionRead) {
      throw new CliError('Production reads require --allow-production-read')
    }
  }

  const authToken = process.env.TURSO_TOKEN

  if (!local && !authToken) {
    throw new CliError('Missing TURSO_TOKEN')
  }

  return {
    authToken,
    environment,
    local,
    targetId,
    url: rawUrl
  }
}

export function createDatabaseClient(target) {
  return createClient({
    url: target.url,
    ...(target.authToken ? { authToken: target.authToken } : {})
  })
}

export function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`
}

export function toSerializable(value) {
  if (typeof value === 'bigint') {
    return value.toString()
  }

  if (Array.isArray(value)) {
    return value.map(toSerializable)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toSerializable(item)]))
  }

  return value
}

export function printJson(value) {
  console.log(JSON.stringify(toSerializable(value), null, 2))
}

export function readExpectedTableNames() {
  const source = readFileSync(schemaPath, 'utf8')
  return [...source.matchAll(/sqliteTable\(\s*['"]([^'"]+)['"]/g)]
    .map(match => match[1])
    .sort()
}

export function readLocalMigrations() {
  if (!existsSync(migrationsFolder)) {
    return []
  }

  return readMigrationFiles({ migrationsFolder })
}

export async function tableExists(client, tableName) {
  const result = await client.execute({
    sql: 'SELECT 1 FROM sqlite_schema WHERE type = ? AND name = ? LIMIT 1',
    args: ['table', tableName]
  })

  return result.rows.length > 0
}

export async function readDatabaseMigrations(client) {
  if (!await tableExists(client, migrationsTable)) {
    return []
  }

  const columnResult = await client.execute(`PRAGMA table_info(${quoteIdentifier(migrationsTable)})`)
  const columns = new Set(columnResult.rows.map(row => String(row.name)))
  const nameExpression = columns.has('name') ? 'name' : 'NULL AS name'
  const appliedAtExpression = columns.has('applied_at') ? 'applied_at' : 'NULL AS applied_at'
  const result = await client.execute(`
    SELECT id, hash, created_at, ${nameExpression}, ${appliedAtExpression}
    FROM ${quoteIdentifier(migrationsTable)}
    ORDER BY created_at, id
  `)

  return result.rows.map(row => ({
    id: Number(row.id),
    hash: String(row.hash),
    createdAt: Number(row.created_at),
    name: row.name === null ? null : String(row.name),
    appliedAt: row.applied_at === null ? null : String(row.applied_at)
  }))
}

export function compareMigrationState(localMigrations, databaseMigrations) {
  const localByHash = new Map(localMigrations.map(migration => [migration.hash, migration]))
  const databaseHashes = new Set(databaseMigrations.map(migration => migration.hash))
  const pending = localMigrations.filter(migration => !databaseHashes.has(migration.hash))
  const unknownDatabaseMigrations = databaseMigrations.filter(migration => !localByHash.has(migration.hash))
  const orderMismatches = databaseMigrations.flatMap((databaseMigration, index) => {
    const expectedMigration = localMigrations[index]

    if (!expectedMigration || expectedMigration.hash === databaseMigration.hash) {
      return []
    }

    return [{
      position: index + 1,
      databaseName: databaseMigration.name,
      databaseHash: databaseMigration.hash,
      expectedName: expectedMigration.name,
      expectedHash: expectedMigration.hash
    }]
  })
  const nameHashMismatches = databaseMigrations.flatMap((databaseMigration) => {
    if (!databaseMigration.name) {
      return []
    }

    const localMigration = localMigrations.find(migration => migration.name === databaseMigration.name)
    return localMigration && localMigration.hash !== databaseMigration.hash
      ? [{ name: databaseMigration.name, databaseHash: databaseMigration.hash, localHash: localMigration.hash }]
      : []
  })

  return {
    baselineRequired: databaseMigrations.length === 0,
    diverged: unknownDatabaseMigrations.length > 0
      || nameHashMismatches.length > 0
      || orderMismatches.length > 0,
    nameHashMismatches,
    orderMismatches,
    pending,
    unknownDatabaseMigrations
  }
}

export async function runCli(main) {
  try {
    await main()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(error instanceof CliError ? message : `Unexpected error: ${message}`)
    process.exitCode = 1
  }
}
