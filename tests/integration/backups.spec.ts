import { createClient, type Client } from '@libsql/client'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createError } from 'h3'
import { generateSqlDump } from '../../server/utils/backups/dump'
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
  yield value
}
afterEach(() => {
  clients.splice(0).forEach(client => client.close())
  directories.splice(0).forEach(directory => rmSync(directory, { recursive: true }))
})

describe('restorable SQL backup', () => {
  it('pages sparse 64-bit rowids without duplicates or rounding', async () => {
    const source = database()
    const restored = database()
    await source.execute('CREATE TABLE entries(value TEXT)')
    await source.batch(Array.from({ length: 251 }, (_, index) => ({
      sql: 'INSERT INTO entries(rowid,value) VALUES(CAST(? AS INTEGER),?)',
      args: [(9007199254740993n + BigInt(index) * 3n).toString(), String(index)]
    })), 'write')
    let dump = ''
    for await (const part of generateSqlDump(source, new AbortController().signal)) dump += part
    await restored.executeMultiple(dump)
    expect((await restored.execute('SELECT quote(rowid),value FROM entries ORDER BY rowid')).rows)
      .toEqual((await source.execute('SELECT quote(rowid),value FROM entries ORDER BY rowid')).rows)
  })

  it('keeps one snapshot while another connection writes', async () => {
    const source = database()
    const writer = createClient({ url: `file:${join(directories.at(-1)!, 'test.db')}` })
    clients.push(writer)
    await source.execute('PRAGMA journal_mode=WAL')
    await source.executeMultiple('CREATE TABLE entries(value TEXT); INSERT INTO entries VALUES(\'before\');')
    const dump = generateSqlDump(source, new AbortController().signal)
    let sql = (await dump.next()).value || ''
    await writer.execute('INSERT INTO entries VALUES(\'after\')')
    for await (const part of dump) sql += part
    const restored = database()
    await restored.executeMultiple(sql)
    expect((await restored.execute('SELECT value FROM entries')).rows).toEqual([{ value: 'before' }])
  })

  it('restores schema, NUL/unicode text, blobs, large integers, rowids, sequences, generated columns and triggers', async () => {
    const source = database()
    const restored = database()
    await source.executeMultiple(`
      CREATE TABLE parent(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE);
      INSERT INTO parent VALUES(1,'é');
      INSERT INTO parent VALUES(80,'deleted'); DELETE FROM parent WHERE id=80;
      CREATE TABLE child(id TEXT PRIMARY KEY, parent_id INTEGER REFERENCES parent(id), value BLOB, amount INTEGER, note TEXT, extra TEXT GENERATED ALWAYS AS (note || '!') STORED);
      INSERT INTO child(rowid,id,parent_id,value,amount,note) VALUES(9,'one',1,X'00FF',9223372036854775807,CAST(X'61006227C3A9' AS TEXT));
      CREATE TABLE audit(message TEXT);
      CREATE TRIGGER audit_child AFTER INSERT ON child BEGIN INSERT INTO audit VALUES('created'); END;
      CREATE INDEX child_parent ON child(parent_id);
      CREATE VIEW child_view AS SELECT id FROM child;
      CREATE TABLE composite(a TEXT,b TEXT,PRIMARY KEY(a,b)) WITHOUT ROWID;
      INSERT INTO composite VALUES('a','b');
      CREATE TABLE sqliteCustom(value TEXT);
      INSERT INTO sqliteCustom VALUES('application table');
    `)
    let dump = ''
    for await (const part of generateSqlDump(source, new AbortController().signal)) dump += part
    await restored.executeMultiple(dump)
    for (const sql of [
      'SELECT rowid,id,parent_id,hex(value),quote(amount),hex(note),hex(extra) FROM child',
      'SELECT * FROM sqlite_sequence', 'SELECT * FROM audit', 'SELECT * FROM composite', 'SELECT * FROM sqliteCustom',
      'SELECT type,name,sql FROM sqlite_schema WHERE name NOT LIKE \'sqlite_%\' ORDER BY type,name'
    ]) expect((await restored.execute(sql)).rows).toEqual((await source.execute(sql)).rows)
    expect((await restored.execute('PRAGMA integrity_check')).rows[0]?.integrity_check).toBe('ok')
    expect((await restored.execute('PRAGMA foreign_key_check')).rows).toEqual([])
    expect((await restored.execute('INSERT INTO parent(name) VALUES(\'next\') RETURNING id')).rows[0]?.id).toBe('81')
  })

  it('fails closed on unsupported virtual tables', async () => {
    const client = database()
    await client.execute('CREATE VIRTUAL TABLE search USING fts5(text)')
    const dump = generateSqlDump(client, new AbortController().signal)
    await expect(dump.next()).rejects.toThrow('Virtual tables')
  })

  it('closes its transaction when the consumer fails', async () => {
    const client = database()
    await client.execute('CREATE TABLE example(value TEXT)')
    const dump = generateSqlDump(client, new AbortController().signal)
    await dump.next()
    await dump.return(undefined)
    await expect(client.execute('INSERT INTO example VALUES(\'still usable\')')).resolves.toBeDefined()
  })
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
    await expect(runBackup(client, config, 'manual')).rejects.toMatchObject({ statusCode: 502 })
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
      .mockResolvedValueOnce(Response.json({ size: bytes.length, content_hash: hash, path_display: '/test.sql' }))
    vi.stubGlobal('fetch', fetch)
    expect(await uploadBackup(textSource('COMMIT;\n'), 'token', '/test.sql', new AbortController().signal)).toMatchObject({ bytes: bytes.length, contentHash: hash })
    const commit = JSON.parse(fetch.mock.calls[1]![1].headers['Dropbox-API-Arg'])
    expect(commit).toMatchObject({ cursor: { offset: bytes.length }, commit: { mode: 'add', autorename: false } })
  })

  it('never commits an incomplete source', async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ session_id: 'session' }))
    vi.stubGlobal('fetch', fetch)
    async function* broken() {
      yield 'x'.repeat(4 * 1024 * 1024)
      throw new Error('read failed')
    }
    await expect(uploadBackup(broken(), 'token', '/test.sql', new AbortController().signal)).rejects.toThrow('read failed')
    expect(fetch.mock.calls.map(call => call[0])).toEqual(['https://content.dropboxapi.com/2/files/upload_session/start'])
  })

  it('rejects a truncated or altered upload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(Response.json({ session_id: 'session' })).mockResolvedValueOnce(Response.json({ size: 1, content_hash: 'wrong' })))
    await expect(uploadBackup(textSource('COMMIT;\n'), 'token', '/test.sql', new AbortController().signal)).rejects.toThrow('integrity_mismatch')
  })
})
