import type { H3Event } from 'h3'
import { useTursoClient } from '~~/server/utils/turso'

// Limite les tentatives de connexion par couple (IP, e-mail) pour contrer le brute-force.
// Stocké dans Turso afin d'être partagé entre les isolates Cloudflare Workers.
const MAX_FAILURES = 5
const WINDOW_MS = 15 * 60 * 1000
const LOCKOUT_MS = 15 * 60 * 1000

let tableReady: Promise<void> | null = null

function ensureTable() {
  if (!tableReady) {
    tableReady = useTursoClient().execute(`
      CREATE TABLE IF NOT EXISTS login_attempts (
        key TEXT PRIMARY KEY,
        fail_count INTEGER NOT NULL DEFAULT 0,
        first_failed_at INTEGER NOT NULL DEFAULT 0,
        locked_until INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      )
    `).then(() => undefined).catch((error) => {
      tableReady = null
      throw error
    })
  }

  return tableReady
}

export function loginThrottleKey(event: H3Event, email: string) {
  const ip = getRequestHeader(event, 'cf-connecting-ip')
    || getRequestIP(event, { xForwardedFor: true })
    || 'unknown'

  return `${ip}:${email}`
}

export async function assertLoginAllowed(event: H3Event, key: string) {
  await ensureTable()

  const result = await useTursoClient().execute({
    sql: 'SELECT locked_until FROM login_attempts WHERE key = ?',
    args: [key]
  })

  const lockedUntil = Number(result.rows[0]?.locked_until ?? 0)
  const now = Date.now()

  if (lockedUntil > now) {
    setResponseHeader(event, 'Retry-After', Math.ceil((lockedUntil - now) / 1000))
    throw createError({
      statusCode: 429,
      statusMessage: 'Trop de tentatives de connexion. Réessayez plus tard.'
    })
  }
}

export async function registerLoginFailure(key: string) {
  await ensureTable()
  const client = useTursoClient()
  const now = Date.now()

  const result = await client.execute({
    sql: 'SELECT fail_count, first_failed_at FROM login_attempts WHERE key = ?',
    args: [key]
  })

  const row = result.rows[0]
  const windowOpen = row && now - Number(row.first_failed_at) <= WINDOW_MS
  const failCount = windowOpen ? Number(row!.fail_count) + 1 : 1
  const firstFailedAt = windowOpen ? Number(row!.first_failed_at) : now
  const lockedUntil = failCount >= MAX_FAILURES ? now + LOCKOUT_MS : 0

  await client.execute({
    sql: `
      INSERT INTO login_attempts (key, fail_count, first_failed_at, locked_until, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        fail_count = excluded.fail_count,
        first_failed_at = excluded.first_failed_at,
        locked_until = excluded.locked_until,
        updated_at = excluded.updated_at
    `,
    args: [key, failCount, firstFailedAt, lockedUntil, now]
  })
}

export async function clearLoginThrottle(key: string) {
  await ensureTable()
  await useTursoClient().execute({
    sql: 'DELETE FROM login_attempts WHERE key = ?',
    args: [key]
  })
}
