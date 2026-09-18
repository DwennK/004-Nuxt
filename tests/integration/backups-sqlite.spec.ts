import { createClient } from '@libsql/client'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import initSqlJs from 'sql.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { downloadSqliteBackup, generateSqliteBackup, MAX_SQLITE_BYTES, SqliteCheckpoint } from '../../server/utils/backups/sqlite-export'
import { validateSqliteBackup } from '../../server/utils/backups/sqlite-validation'

vi.mock('../../server/utils/backups/sqlite-runtime', () => ({
  validateNativeBackup: async (bytes: Uint8Array, runId: string) => validateSqliteBackup(await initSqlJs(), bytes, runId)
}))

const paths: string[] = []
afterEach(() => paths.splice(0).forEach(path => rmSync(path, { recursive: true })))
const config = { url: 'libsql://db.turso.io', authToken: 'private-token' }
const signal = () => new AbortController().signal

async function fixture() {
  const path = mkdtempSync(join(tmpdir(), 'native-backup-'))
  paths.push(path)
  const file = join(path, 'source.db')
  const client = createClient({ url: `file:${file}` })
  try {
    await client.executeMultiple(`
      PRAGMA page_size=4096; PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=0;
      CREATE TABLE backup_runs(id TEXT PRIMARY KEY);
      CREATE TABLE records(id INTEGER PRIMARY KEY AUTOINCREMENT, value BLOB, note TEXT, amount INTEGER);
      PRAGMA user_version=17;
      PRAGMA wal_checkpoint(TRUNCATE);
    `)
    const snapshot = new Uint8Array(readFileSync(file))
    await client.executeMultiple(`
      BEGIN;
      INSERT INTO backup_runs VALUES('current-run');
      INSERT INTO records VALUES(80, X'00FF', CAST(X'61006227C3A9' AS TEXT), 9223372036854775807);
      COMMIT;
    `)
    const wal = new Uint8Array(readFileSync(`${file}-wal`))
    return { snapshot, frames: wal.slice(32) }
  } finally { client.close() }
}

function mockExport(snapshot: Uint8Array, frames: Uint8Array, finalGeneration = 5) {
  let infos = 0
  const mock = vi.fn(async (input: URL | string) => {
    const path = new URL(input).pathname
    if (path === '/info') return Response.json({ current_generation: infos++ ? finalGeneration : 5, db_type: 'sqlite' })
    if (path === '/export/5') return new Response(snapshot.slice())
    const match = /^\/sync\/5\/(\d+)\/(\d+)$/.exec(path)
    if (!match) throw new Error(`Unexpected path ${path}`)
    return new Response(frames.slice((Number(match[1]) - 1) * 4120, (Number(match[2]) - 1) * 4120))
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('native Turso SQLite export', () => {
  it('opens one standalone .db with the committed WAL, metadata, blobs, NUL text and 64-bit integers', async () => {
    const { snapshot, frames } = await fixture()
    const fetch = mockExport(snapshot, frames)
    const bytes = await downloadSqliteBackup(config, signal())
    const sqlite = await initSqlJs()
    expect(() => validateSqliteBackup(sqlite, snapshot, 'current-run')).toThrow('export_stale')
    expect(() => validateSqliteBackup(sqlite, bytes, 'current-run')).not.toThrow()
    const db = new sqlite.Database(bytes)
    try {
      expect(db.exec('PRAGMA user_version')[0]?.values).toEqual([[17]])
      expect(db.exec('SELECT hex(value), hex(note), quote(amount) FROM records')[0]?.values)
        .toEqual([['00FF', '61006227C3A9', '9223372036854775807']])
      expect(db.exec('SELECT seq FROM sqlite_sequence')[0]?.values).toEqual([[80]])
      expect(db.exec('PRAGMA journal_mode')[0]?.values).toEqual([['delete']])
    } finally { db.close() }
    expect(fetch.mock.calls.map(call => new URL(call[0]).pathname)).toEqual(['/info', '/export/5', '/sync/5/1/129', '/info'])
    const request = vi.mocked(globalThis.fetch).mock.calls[0]?.[1]
    expect(request).toMatchObject({ redirect: 'manual', headers: { Authorization: 'Bearer private-token' } })
  })

  it('ignores an uncommitted tail even when it replaces page one', async () => {
    const { snapshot, frames } = await fixture()
    const checkpoint = new SqliteCheckpoint(snapshot)
    checkpoint.append(frames)
    const incomplete = new Uint8Array(4120)
    new DataView(incomplete.buffer).setUint32(0, 1)
    checkpoint.append(incomplete)
    validateSqliteBackup(await initSqlJs(), checkpoint.finish(), 'current-run')
  })

  it('preserves a transaction across response boundaries', async () => {
    const { snapshot, frames } = await fixture()
    const checkpoint = new SqliteCheckpoint(snapshot)
    checkpoint.append(frames.slice(0, 4120))
    checkpoint.append(frames.slice(4120))
    validateSqliteBackup(await initSqlJs(), checkpoint.finish(), 'current-run')
  })

  it('downloads successive 128-frame batches without skipping a frame', async () => {
    const { snapshot, frames } = await fixture()
    const repeated = new Uint8Array(frames.length * 40)
    for (let i = 0; i < 40; i++) repeated.set(frames, i * frames.length)
    const fetch = mockExport(snapshot, repeated)
    const bytes = await downloadSqliteBackup(config, signal())
    validateSqliteBackup(await initSqlJs(), bytes, 'current-run')
    expect(fetch.mock.calls.map(call => new URL(call[0]).pathname)).toContain('/sync/5/129/257')
  })

  it('truncates at a committed database size and rejects missing pages', async () => {
    const { snapshot } = await fixture()
    const frame = new Uint8Array(4120)
    const view = new DataView(frame.buffer)
    view.setUint32(0, 1)
    view.setUint32(4, 1)
    frame.set(snapshot.subarray(0, 4096), 24)
    const checkpoint = new SqliteCheckpoint(snapshot)
    checkpoint.append(frame)
    expect(checkpoint.finish()).toHaveLength(4096)
    const gap = new SqliteCheckpoint(snapshot)
    view.setUint32(4, snapshot.length / 4096 + 1)
    gap.append(frame)
    expect(() => gap.finish()).toThrow('turso_export')
  })

  it('rejects truncated frames, unsupported pages and oversized pages', async () => {
    const { snapshot, frames } = await fixture()
    const checkpoint = new SqliteCheckpoint(snapshot)
    expect(() => checkpoint.append(frames.slice(1))).toThrow('turso_export')
    const oversized = frames.slice(0, 4120)
    new DataView(oversized.buffer).setUint32(0, MAX_SQLITE_BYTES / 4096 + 1)
    expect(() => checkpoint.append(oversized)).toThrow('backup_too_large')
    snapshot[16] = 32
    expect(() => new SqliteCheckpoint(snapshot)).toThrow('turso_export')
  })

  it.each([302, 400, 401, 500])('never treats a WAL HTTP %s error as end of backup', async (status) => {
    const { snapshot, frames } = await fixture()
    const fetch = mockExport(snapshot, frames)
    fetch.mockImplementationOnce(async () => Response.json({ current_generation: 5, db_type: 'sqlite' }))
      .mockImplementationOnce(async () => new Response(snapshot.slice()))
      .mockImplementationOnce(async () => new Response('upstream error', { status }))
    await expect(downloadSqliteBackup(config, signal())).rejects.toThrow('turso_export')
  })

  it('rejects a generation rollover', async () => {
    const { snapshot, frames } = await fixture()
    mockExport(snapshot, frames, 6)
    await expect(downloadSqliteBackup(config, signal())).rejects.toThrow('export_stale')
  })

  it('does not yield an old snapshot or a corrupt database', async () => {
    const { snapshot, frames } = await fixture()
    mockExport(snapshot, new Uint8Array())
    await expect(generateSqliteBackup(config, signal(), 'current-run').next()).rejects.toThrow('export_stale')
    mockExport(snapshot, frames)
    const bytes = await downloadSqliteBackup(config, signal())
    bytes.fill(0, 100, 200)
    expect(() => validateSqliteBackup(awaitedSqlite, bytes, 'current-run')).toThrow()
  })

  it('yields binary SQLite only after validation, and respects cancellation', async () => {
    const { snapshot, frames } = await fixture()
    mockExport(snapshot, frames)
    const result = await generateSqliteBackup(config, signal(), 'current-run').next()
    expect(new TextDecoder().decode(result.value!.subarray(0, 16))).toBe('SQLite format 3\0')
    const aborted = AbortSignal.abort()
    await expect(downloadSqliteBackup(config, aborted)).rejects.toThrow()
  })
})

const awaitedSqlite = await initSqlJs()
