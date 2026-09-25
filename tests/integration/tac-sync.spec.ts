import { createClient, type Client } from '@libsql/client'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { lookupSmartphoneImei } from '../../server/utils/imei-lookup'
import { getTacStatus, syncTacDataset } from '../../server/utils/tac-sync'
import { TAC_COMMIT_URL } from '../../server/utils/tac-dataset'

const sha = 'a'.repeat(40)
const nextSha = 'b'.repeat(40)
const csv = 'Brand,TAC,SPECS\n' + Array.from({ length: 100_000 }, (_, i) => `ACME,${10_000_000 + i * 100},ACME Phone ${i}`).join('\n') + '\nNOKIA,49015420,"NOKIA, Nokia 6110"'
let client: Client
let fetchMock: ReturnType<typeof vi.fn>
let sourceSha: string
let sourceCsv: string

beforeEach(async () => {
  client = createClient({ url: ':memory:' })
  await client.executeMultiple(readFileSync('drizzle/20260925095028_tac_database/migration.sql', 'utf8'))
  sourceSha = sha
  sourceCsv = csv
  fetchMock = vi.fn(async (url: string, _options?: RequestInit) => url === TAC_COMMIT_URL
    ? Response.json([{ sha: sourceSha }])
    : new Response(sourceCsv))
  vi.stubGlobal('fetch', fetchMock)
  vi.spyOn(console, 'info').mockImplementation(() => undefined)
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
})
afterEach(() => client.close())

describe('versioned TAC synchronization', () => {
  it('imports and looks up locally without transmitting an IMEI; skips an unchanged source', async () => {
    expect(await lookupSmartphoneImei('490154203237518', client)).toEqual({ status: 'unavailable' })
    expect(await syncTacDataset(client)).toEqual({ status: 'updated' })
    expect(await getTacStatus(client)).toMatchObject({ available: true, running: false, sourceCommit: sha, entryCount: 100_001, lastError: null })
    expect(await lookupSmartphoneImei('490154203237518', client)).toEqual({ status: 'found', model: 'Nokia 6110' })
    expect(await lookupSmartphoneImei('490154203237500', client)).toEqual({ status: 'found', model: 'Nokia 6110' })
    expect(await lookupSmartphoneImei('356938035643809', client)).toEqual({ status: 'not_found' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ redirect: 'manual' })
    expect(fetchMock.mock.calls[1]![0]).toBe(`https://raw.githubusercontent.com/MoazEb/tac-database/${sha}/tac_full.csv`)
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('490154203237518')
    expect(await syncTacDataset(client)).toEqual({ status: 'unchanged' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('activates complete updates and retains only the previous complete version', async () => {
    await syncTacDataset(client)
    const old = (await client.execute('SELECT active_version FROM tac_sync_state')).rows[0]!.active_version
    sourceSha = nextSha
    sourceCsv = csv.replace('Nokia 6110', 'Nokia 6120')
    await syncTacDataset(client)
    expect(await lookupSmartphoneImei('490154203237518', client)).toEqual({ status: 'found', model: 'Nokia 6120' })
    expect((await client.execute('SELECT previous_version FROM tac_sync_state')).rows[0]!.previous_version).toBe(old)
    sourceSha = 'c'.repeat(40)
    await syncTacDataset(client)
    expect((await client.execute('SELECT DISTINCT version FROM tac_blocks')).rows).toHaveLength(2)
    expect((await client.execute({ sql: 'SELECT id FROM tac_blocks WHERE version=?', args: [old!] })).rows).toHaveLength(0)
  })

  it('keeps the active database after truncated, malformed or unavailable downloads', async () => {
    await syncTacDataset(client)
    sourceSha = nextSha
    sourceCsv = 'Brand,TAC,SPECS\nNOKIA,49015420,Nokia 6120'
    await expect(syncTacDataset(client)).rejects.toThrow('unexpected_entry_count')
    sourceCsv = '<html>error</html>'
    await expect(syncTacDataset(client)).rejects.toThrow()
    fetchMock.mockImplementation(async () => new Response('', { status: 429 }))
    await expect(syncTacDataset(client)).rejects.toThrow('github_rate_limit')
    expect(await lookupSmartphoneImei('490154203237518', client)).toEqual({ status: 'found', model: 'Nokia 6110' })
    expect(await getTacStatus(client)).toMatchObject({ sourceCommit: sha, running: false, lastError: 'github_rate_limit' })
  })

  it('keeps partial staging invisible and recovers after interrupted writes', async () => {
    await syncTacDataset(client)
    sourceSha = nextSha
    const batch = client.batch.bind(client)
    let writes = 0
    vi.spyOn(client, 'batch').mockImplementation(async (...args) => {
      expect(await lookupSmartphoneImei('490154203237518', client)).toEqual({ status: 'found', model: 'Nokia 6110' })
      if (++writes === 2) throw new Error('private database details')
      return batch(...args)
    })
    await expect(syncTacDataset(client)).rejects.toThrow('sync_failed')
    expect(await getTacStatus(client)).toMatchObject({ sourceCommit: sha, lastError: 'sync_failed' })
    vi.mocked(client.batch).mockRestore()
    expect(await syncTacDataset(client)).toEqual({ status: 'updated' })
    expect((await client.execute('SELECT DISTINCT version FROM tac_blocks')).rows).toHaveLength(2)
  })

  it('prevents concurrent imports and recovers an expired lease', async () => {
    await client.execute('INSERT INTO tac_sync_state(id,lock_token,lock_until) VALUES(1,\'other\',9999999999999)')
    expect(await syncTacDataset(client)).toEqual({ status: 'running' })
    expect(fetchMock).not.toHaveBeenCalled()
    await client.execute('UPDATE tac_sync_state SET lock_until=0')
    expect(await getTacStatus(client)).toMatchObject({ lastError: 'interrupted' })
    expect(await syncTacDataset(client)).toEqual({ status: 'updated' })
  })

  it('refuses staging when it would exceed the SQLite backup budget', async () => {
    await syncTacDataset(client)
    await client.execute('CREATE TABLE backup_pressure(payload BLOB)')
    await client.execute('INSERT INTO backup_pressure VALUES(zeroblob(16 * 1024 * 1024))')
    sourceSha = nextSha
    await expect(syncTacDataset(client)).rejects.toThrow('backup_capacity')
    expect(await lookupSmartphoneImei('490154203237518', client)).toEqual({ status: 'found', model: 'Nokia 6110' })
    expect(await getTacStatus(client)).toMatchObject({ sourceCommit: sha, lastError: 'backup_capacity' })
  })

  it('a superseded run cannot publish or release the new owner’s lease', async () => {
    const batch = client.batch.bind(client)
    vi.spyOn(client, 'batch').mockImplementationOnce(async (...args) => {
      await client.execute('UPDATE tac_sync_state SET lock_token=\'new-owner\',lock_until=9999999999999')
      return batch(...args)
    })
    await expect(syncTacDataset(client)).rejects.toThrow('lease_lost')
    const row = (await client.execute('SELECT * FROM tac_sync_state')).rows[0]!
    expect(row.lock_token).toBe('new-owner')
    expect(row.active_version).toBeNull()
    expect((await client.execute('SELECT * FROM tac_blocks')).rows).toHaveLength(0)
  })

  it('gracefully reports an absent migration and rejects invalid IMEIs', async () => {
    await client.executeMultiple('DROP TABLE tac_blocks; DROP TABLE tac_sync_state;')
    expect(await getTacStatus(client)).toMatchObject({ schemaReady: false, available: false })
    expect(await lookupSmartphoneImei('490154203237518', client)).toEqual({ status: 'unavailable' })
    await expect(syncTacDataset(client)).rejects.toThrow('migration_required')
    await expect(lookupSmartphoneImei('123', client)).rejects.toThrow()
  })
})
