import { createClient, type Client, type Row } from '@libsql/client'
import type { H3Event } from 'h3'
import { createError, getHeader, getRequestURL, setResponseHeader } from 'h3'
import type { BackupRun, BackupStatus } from '~~/shared/types/backups'
import { isBackupKeyValid, decryptBackupToken } from './crypto'
import { BackupError, dropboxToken, uploadBackup, type DropboxConfig } from './dropbox'
import { generateSqliteBackup, type TursoExportConfig } from './sqlite-export'

export const BACKUP_CRON = '0 2 * * *'
export const BACKUP_TIMEOUT = 10 * 60 * 1000
const LEASE_DURATION = 15 * 60 * 1000

export function backupContext(event?: H3Event, bindings?: unknown) {
  const config = useRuntimeConfig(event)
  const env = (bindings || event?.context.cloudflare?.env || {}) as Record<string, unknown>
  const value = (name: string, fallback: unknown) => String(env[name] || fallback || '')
  const dropbox: DropboxConfig = {
    appKey: value('NUXT_DROPBOX_APP_KEY', config.dropboxAppKey),
    appSecret: value('NUXT_DROPBOX_APP_SECRET', config.dropboxAppSecret),
    redirectUri: value('NUXT_DROPBOX_REDIRECT_URI', config.dropboxRedirectUri),
    encryptionKey: value('NUXT_BACKUP_ENCRYPTION_KEY', config.backupEncryptionKey)
  }
  const turso: TursoExportConfig = {
    url: value('TURSO_URL', env.NUXT_TURSO_URL || config.tursoUrl),
    authToken: value('TURSO_TOKEN', env.NUXT_TURSO_TOKEN || config.tursoToken)
  }
  const client = createClient({ ...turso, intMode: 'string' })
  return { client, dropbox, turso }
}

export function backupConfigured(config: DropboxConfig) {
  try {
    const url = new URL(config.redirectUri)
    return Boolean(config.appKey && config.appSecret && isBackupKeyValid(config.encryptionKey)
      && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
      && url.pathname === '/api/settings/backups/dropbox/callback' && !url.search && !url.hash)
  } catch {
    return false
  }
}

export function requireBackupConfig(config: DropboxConfig) {
  if (!backupConfigured(config)) throw createError({ statusCode: 503, message: 'La connexion Dropbox doit être configurée sur le serveur.' })
}

export function protectBackupRequest(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'no-store')
  if (event.method !== 'GET' && getHeader(event, 'origin') !== getRequestURL(event).origin) {
    throw createError({ statusCode: 403, message: 'Origine de la requête invalide.' })
  }
}

export async function backupSchemaReady(client: Client) {
  const result = await client.execute('SELECT name FROM sqlite_schema WHERE type=\'table\' AND name IN (\'backup_settings\',\'backup_runs\')')
  return result.rows.length === 2
}

export async function requireBackupSchema(client: Client) {
  if (!await backupSchemaReady(client)) throw createError({ statusCode: 503, message: 'La migration des sauvegardes doit être appliquée.' })
}

export async function backupConnection(client: Client) {
  const result = await client.execute('SELECT * FROM backup_settings WHERE id=1')
  return result.rows[0]
}

function toRun(row: Row): BackupRun {
  const stale = row.status === 'running' && Number(row.started_at) < Date.now() - LEASE_DURATION
  return {
    id: String(row.id),
    trigger: row.trigger as BackupRun['trigger'],
    status: stale ? 'failed' : row.status as BackupRun['status'],
    startedAt: Number(row.started_at),
    completedAt: row.completed_at === null ? null : Number(row.completed_at),
    bytes: row.bytes === null ? null : Number(row.bytes),
    path: row.path === null ? null : String(row.path),
    errorCode: stale ? 'interrupted' : row.error_code === null ? null : String(row.error_code)
  }
}

export async function getBackupStatus(client: Client, config: DropboxConfig): Promise<BackupStatus> {
  const schemaReady = await backupSchemaReady(client)
  const status: BackupStatus = { configured: backupConfigured(config), schemaReady, connected: false, accountEmail: null, dailyEnabled: false, running: false, runs: [], lastSuccess: null }
  if (!schemaReady) return status
  const connection = await backupConnection(client)
  status.connected = Boolean(connection?.refresh_token_encrypted)
  status.accountEmail = connection?.account_email ? String(connection.account_email) : null
  status.dailyEnabled = Boolean(Number(connection?.daily_enabled || 0))
  status.runs = (await client.execute('SELECT * FROM backup_runs ORDER BY started_at DESC LIMIT 20')).rows.map(toRun)
  status.running = status.runs.some(run => run.status === 'running')
  const success = (await client.execute('SELECT * FROM backup_runs WHERE status=\'success\' ORDER BY started_at DESC LIMIT 1')).rows[0]
  status.lastSuccess = success ? toRun(success) : null
  return status
}

export async function claimBackup(client: Client, trigger: BackupRun['trigger'], scheduleKey: string | null = null) {
  const now = Date.now()
  const id = crypto.randomUUID()
  const result = await client.batch([
    { sql: 'UPDATE backup_runs SET status=\'failed\', error_code=\'interrupted\', completed_at=? WHERE status=\'running\' AND started_at<?', args: [now, now - LEASE_DURATION] },
    { sql: `INSERT OR IGNORE INTO backup_runs(id,trigger,status,started_at,schedule_key)
      SELECT ?,?,'running',?,? WHERE EXISTS(SELECT 1 FROM backup_settings WHERE id=1 AND refresh_token_encrypted IS NOT NULL ${trigger === 'scheduled' ? 'AND daily_enabled=1' : ''})`, args: [id, trigger, now, scheduleKey] }
  ], 'write')
  return result[1]!.rowsAffected === 1 ? { id, startedAt: now } : null
}

export async function runBackup(client: Client, config: DropboxConfig, trigger: BackupRun['trigger'], turso: TursoExportConfig, scheduleKey: string | null = null) {
  requireBackupConfig(config)
  await requireBackupSchema(client)
  const claim = await claimBackup(client, trigger, scheduleKey)
  if (!claim) {
    if (trigger === 'scheduled') return null
    throw createError({ statusCode: 409, message: 'Une sauvegarde est déjà en cours ou Dropbox est déconnecté.' })
  }
  try {
    const connection = await backupConnection(client)
    if (!connection?.refresh_token_encrypted) throw new BackupError('dropbox_auth')
    let refreshToken: string
    try {
      refreshToken = await decryptBackupToken(String(connection.refresh_token_encrypted), config.encryptionKey)
    } catch {
      throw new BackupError('encryption_key')
    }
    const tokens = await dropboxToken(config, { grant_type: 'refresh_token', refresh_token: refreshToken })
    const stamp = new Date(claim.startedAt).toISOString().replaceAll(':', '-')
    const path = `/pos-${stamp}-${claim.id}.db`
    const signal = AbortSignal.timeout(BACKUP_TIMEOUT)
    const result = await uploadBackup(generateSqliteBackup(turso, signal, claim.id), tokens.access_token, path, signal)
    await client.execute({ sql: 'UPDATE backup_runs SET status=\'success\',completed_at=?,bytes=?,path=?,content_hash=? WHERE id=? AND status=\'running\'', args: [Date.now(), result.bytes, result.path, result.contentHash, claim.id] })
    return claim.id
  } catch (error) {
    const code = error instanceof BackupError ? error.code : error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name) ? 'timeout' : 'export_failed'
    await client.execute({ sql: 'UPDATE backup_runs SET status=\'failed\',completed_at=?,error_code=? WHERE id=? AND status=\'running\'', args: [Date.now(), code, claim.id] })
    // Never expose upstream errors, SQL data, OAuth codes or tokens in logs/API.
    throw createError({ statusCode: 502, message: 'Sauvegarde échouée. Consultez son état dans l’historique.', data: { code } })
  }
}
