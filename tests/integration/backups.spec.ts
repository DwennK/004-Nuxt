import { createClient, type Client } from '@libsql/client'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import { claimBackup, getBackupStatus, runBackup } from '../../server/utils/backups/service'
import { encryptBackupToken, decryptBackupToken } from '../../server/utils/backups/crypto'
import { uploadBackup } from '../../server/utils/backups/dropbox'

const clients: Client[] = []
const directories: string[] = []
const config = { appKey: 'key', appSecret: 'secret', redirectUri: 'https://pos.example/api/settings/backups/dropbox/callback', encryptionKey: btoa('x'.repeat(32)) }
function database() {
  const directory = mkdtempSync(join(tmpdir(), 'pos-backups-'))
  directories.push(directory)
  const client = createClient({ url: `file:${join(directory, 'test.db')}`, intMode: 'string' })
  clients.push(client)
  return client
}
async function backupDatabase() {
  const client = database()
  await client.executeMultiple(readFileSync('drizzle/20260918133216_dropbox_backups/migration.sql', 'utf8'))
  await client.execute('INSERT INTO backup_settings(id,refresh_token_encrypted,daily_enabled) VALUES(1,\'encrypted\',1)')
  return client
}
async function* textSource(value: string) {
  yield new TextEncoder().encode(value)
}
afterEach(() => {
  clients.splice(0).forEach(client => client.close())
  directories.splice(0).forEach(directory => rmSync(directory, { recursive: true }))
})

describe('backup ownership and history', () => {
  it('claims a single run across concurrent requests and deduplicates cron delivery', async () => {
    const client = await backupDatabase()
    const claims = await Promise.all([claimBackup(client, 'scheduled', '2026-09-18'), claimBackup(client, 'manual')])
    expect(claims.filter(Boolean)).toHaveLength(1)
    await client.execute('UPDATE backup_runs SET status=\'success\'')
    const first = (await client.execute('SELECT schedule_key FROM backup_runs')).rows[0]?.schedule_key
    if (first) expect(await claimBackup(client, 'scheduled', '2026-09-18')).toBeNull()
    else expect(await claimBackup(client, 'scheduled', '2026-09-18')).not.toBeNull()
  })

  it('recovers stale locks and does not run a disabled schedule', async () => {
    const client = await backupDatabase()
    await claimBackup(client, 'manual')
    await client.execute('UPDATE backup_runs SET started_at=0')
    expect(await claimBackup(client, 'manual')).not.toBeNull()
    expect((await client.execute('SELECT error_code FROM backup_runs WHERE status=\'failed\'')).rows[0]?.error_code).toBe('interrupted')
    await client.execute('UPDATE backup_runs SET status=\'success\' WHERE status=\'running\'')
    await client.execute('UPDATE backup_settings SET daily_enabled=0')
    expect(await claimBackup(client, 'scheduled', '2026-09-19')).toBeNull()
  })

  it('returns setup state before migration and never returns stored tokens', async () => {
    expect(await getBackupStatus(database(), config)).toMatchObject({ schemaReady: false, connected: false })
    const client = await backupDatabase()
    const status = await getBackupStatus(client, config)
    expect(status).toMatchObject({ schemaReady: true, connected: true, dailyEnabled: true })
    expect(JSON.stringify(status)).not.toContain('encrypted')
  })

  it('records sanitized failure without publishing success', async () => {
    vi.stubGlobal('createError', createError)
    const client = await backupDatabase()
    await expect(runBackup(client, config, 'manual', { url: 'https://db.turso.io', authToken: 'token' })).rejects.toMatchObject({ statusCode: 502 })
    expect((await getBackupStatus(client, config)).runs[0]).toMatchObject({ status: 'failed', errorCode: 'encryption_key', path: null })
  })
})

describe('Dropbox transfer', () => {
  it('encrypts stored refresh tokens and rejects a different key', async () => {
    const encrypted = await encryptBackupToken('refresh-token', config.encryptionKey)
    expect(encrypted).not.toContain('refresh-token')
    expect(await decryptBackupToken(encrypted, config.encryptionKey)).toBe('refresh-token')
    await expect(decryptBackupToken(encrypted, btoa('y'.repeat(32)))).rejects.toThrow()
  })

  it('checks the final Dropbox content hash and exact byte count', async () => {
    const bytes = new TextEncoder().encode('COMMIT;\n')
    const blockHash = await crypto.subtle.digest('SHA-256', bytes)
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', blockHash))
    const hash = Array.from(digest, b => b.toString(16).padStart(2, '0')).join('')
    const fetch = vi.fn().mockResolvedValueOnce(Response.json({ session_id: 'session' }))
      .mockResolvedValueOnce(Response.json({ size: bytes.length, content_hash: hash, path_display: '/test.db' }))
    vi.stubGlobal('fetch', fetch)
    expect(await uploadBackup(textSource('COMMIT;\n'), 'token', '/test.db', new AbortController().signal)).toMatchObject({ bytes: bytes.length, contentHash: hash })
    const commit = JSON.parse(fetch.mock.calls[1]![1].headers['Dropbox-API-Arg'])
    expect(commit).toMatchObject({ cursor: { offset: bytes.length }, commit: { mode: 'add', autorename: false } })
  })

  it('never commits an incomplete source', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ session_id: 'session' }))
    vi.stubGlobal('fetch', fetch)
    async function* broken() {
      yield new Uint8Array(4 * 1024 * 1024)
      throw new Error('read failed')
    }
    await expect(uploadBackup(broken(), 'token', '/test.db', new AbortController().signal)).rejects.toThrow('read failed')
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['https://content.dropboxapi.com/2/files/upload_session/start'])
  })

  it('rejects a truncated or altered upload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ session_id: 'session' })).mockResolvedValueOnce(Response.json({ size: 1, content_hash: 'wrong' })))
    await expect(uploadBackup(textSource('COMMIT;\n'), 'token', '/test.db', new AbortController().signal)).rejects.toThrow('integrity_mismatch')
  })
})
