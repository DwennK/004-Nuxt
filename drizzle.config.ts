import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

const url = process.env.TURSO_URL
const authToken = process.env.TURSO_TOKEN
const requestedEnvironment = process.env.DB_TARGET_ENV
const validEnvironments = new Set(['development', 'test', 'staging', 'production'])

function isLocalDatabase(rawUrl: string) {
  const parsed = new URL(rawUrl)
  return parsed.protocol === 'file:'
    || parsed.hostname === 'localhost'
    || parsed.hostname === '127.0.0.1'
    || parsed.hostname === '::1'
}

function remoteTargetId(rawUrl: string) {
  const parsed = new URL(rawUrl)
  const port = parsed.port ? `:${parsed.port}` : ''
  return `${parsed.hostname.toLowerCase()}${port}`
}

function remoteTargetAllowlist() {
  const rawValue = process.env.DB_REMOTE_TARGETS

  if (!rawValue) {
    return new Map<string, string>()
  }

  let parsed: unknown

  try {
    parsed = JSON.parse(rawValue)
  } catch {
    throw new Error('DB_REMOTE_TARGETS must be a JSON object mapping target IDs to environments')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('DB_REMOTE_TARGETS must be a JSON object mapping target IDs to environments')
  }

  const allowlist = new Map<string, string>()

  for (const [rawTargetId, environment] of Object.entries(parsed)) {
    const targetId = rawTargetId.trim().toLowerCase()

    if (!targetId || typeof environment !== 'string' || !validEnvironments.has(environment)) {
      throw new Error(
        'DB_REMOTE_TARGETS entries must map non-empty target IDs to development|test|staging|production'
      )
    }

    if (allowlist.has(targetId)) {
      throw new Error(`DB_REMOTE_TARGETS contains a duplicate target ID: ${targetId}`)
    }

    allowlist.set(targetId, environment)
  }

  return allowlist
}

if (url && !isLocalDatabase(url)) {
  const targetId = remoteTargetId(url)
  const environment = remoteTargetAllowlist().get(targetId)

  if (!environment) {
    throw new Error(`Remote target ${targetId} is not allowlisted in DB_REMOTE_TARGETS`)
  }

  if (requestedEnvironment && requestedEnvironment !== environment) {
    throw new Error(`Remote target ${targetId} is allowlisted as ${environment}, not ${requestedEnvironment}`)
  }

  if (process.env.DB_CONFIRM_TARGET !== targetId) {
    throw new Error(`Remote Drizzle target must be confirmed with DB_CONFIRM_TARGET=${targetId}`)
  }

  if (environment === 'production' && process.env.DB_ALLOW_PRODUCTION_DDL !== 'true') {
    throw new Error('Production Drizzle commands require DB_ALLOW_PRODUCTION_DDL=true')
  }

  if (!authToken) {
    throw new Error('Remote Drizzle commands require TURSO_TOKEN')
  }
}

export default defineConfig({
  schema: './server/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  ...(url
    ? {
        dbCredentials: {
          url,
          authToken: authToken || ''
        }
      }
    : {})
})
