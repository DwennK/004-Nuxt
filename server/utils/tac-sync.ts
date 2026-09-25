import { createClient, type Client } from '@libsql/client'
import type { H3Event } from 'h3'
import { SQLITE_BACKUP_BYTE_LIMIT } from './backups/limits'
import { encodeTacBlock } from './tac-block'
import { externalFetch } from './external-fetch'
import { parseTacDataset, TAC_COMMIT_URL, TAC_SOURCE, TacError } from './tac-dataset'

const LEASE_MS = 15 * 60_000
const RUN_MS = 10 * 60_000

export function tacClient(event?: H3Event, bindings?: unknown) {
  const config = useRuntimeConfig(event)
  const env = (bindings || event?.context.cloudflare?.env || {}) as Record<string, unknown>
  return createClient({
    url: String(env.TURSO_URL || env.NUXT_TURSO_URL || config.tursoUrl || ''),
    authToken: String(env.TURSO_TOKEN || env.NUXT_TURSO_TOKEN || config.tursoToken || '')
  })
}

export async function tacSchemaReady(client: Client) {
  const result = await client.execute(`SELECT name FROM sqlite_schema WHERE type='table' AND name IN ('tac_blocks','tac_sync_state')`)
  return result.rows.length === 2
}

export async function getTacStatus(client: Client) {
  const schemaReady = await tacSchemaReady(client)
  const row = schemaReady ? (await client.execute('SELECT * FROM tac_sync_state WHERE id=1')).rows[0] : undefined
  const running = Boolean(row?.lock_token && Number(row.lock_until) > Date.now())
  return {
    source: TAC_SOURCE,
    schemaReady,
    available: Boolean(row?.active_version),
    running,
    sourceCommit: row?.source_commit ? String(row.source_commit) : null,
    checkedAt: row?.checked_at ? Number(row.checked_at) : null,
    updatedAt: row?.updated_at ? Number(row.updated_at) : null,
    entryCount: Number(row?.entry_count || 0),
    ignoredCount: Number(row?.ignored_count || 0),
    conflictCount: Number(row?.conflict_count || 0),
    lastError: row?.lock_token && !running ? 'interrupted' : row?.last_error ? String(row.last_error) : null
  }
}

async function sourceResponse(url: string, signal: AbortSignal, maxResponseBytes: number) {
  const { response } = await externalFetch(url, {
    signal,
    redirect: 'manual',
    headers: { 'User-Agent': 'Microwest-TAC-Sync', 'Accept': 'application/vnd.github+json' }
  }, { provider: 'tac-github', timeoutMs: 60_000, maxResponseBytes, requestIdHeader: false })
  if (!response.ok) throw new TacError(response.status === 403 || response.status === 429 ? 'github_rate_limit' : 'github_unavailable')
  return response
}

export async function syncTacDataset(client: Client) {
  if (!await tacSchemaReady(client)) throw new TacError('migration_required')
  await client.execute('INSERT OR IGNORE INTO tac_sync_state(id) VALUES (1)')
  const token = crypto.randomUUID()
  const startedAt = Date.now()
  const claim = await client.execute({
    sql: 'UPDATE tac_sync_state SET lock_token=?,lock_until=?,last_error=NULL WHERE id=1 AND lock_until<=?',
    args: [token, startedAt + LEASE_MS, startedAt]
  })
  if (!claim.rowsAffected) return { status: 'running' as const }
  const signal = AbortSignal.timeout(RUN_MS)
  try {
    const current = (await client.execute('SELECT source_commit,entry_count FROM tac_sync_state WHERE id=1')).rows[0]!
    const response = await sourceResponse(TAC_COMMIT_URL, signal, 64 * 1024)
    const commits: unknown = await response.json()
    const sha: unknown = Array.isArray(commits) ? commits[0]?.sha : null
    if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) throw new TacError('invalid_commit')
    let outcome: 'updated' | 'unchanged' = 'unchanged'
    if (sha !== current.source_commit) {
      const csv = await (await sourceResponse(`https://raw.githubusercontent.com/MoazEb/tac-database/${sha}/tac_full.csv`, signal, 24 * 1024 * 1024)).text()
      signal.throwIfAborted()
      const dataset = parseTacDataset(csv)
      // Reject a truncated/replaced source, while allowing its known incomplete rows.
      if (dataset.entries < 100_000 || dataset.entries < Number(current.entry_count) * 0.9) throw new TacError('unexpected_entry_count')
      if ((dataset.ignored + dataset.conflicts) / dataset.rows > 0.1) throw new TacError('excessive_invalid_rows')
      // Reuse the retired version's pages before staging. Keeping three copies
      // would permanently raise SQLite's file size, even after DELETE.
      await client.batch([
        { sql: 'UPDATE tac_sync_state SET previous_version=NULL WHERE id=1 AND lock_token=? AND lock_until>?', args: [token, Date.now()] },
        { sql: `DELETE FROM tac_blocks WHERE version NOT IN (SELECT active_version FROM tac_sync_state WHERE active_version IS NOT NULL)
            AND EXISTS(SELECT 1 FROM tac_sync_state WHERE id=1 AND lock_token=? AND lock_until>?)`, args: [token, Date.now()] }
      ], 'write')
      const compressedChunks = []
      for (const chunk of dataset.chunks) compressedChunks.push({ ...chunk, payload: await encodeTacBlock(chunk.payload) })
      const [pages, free, pageSize] = await client.batch(['PRAGMA page_count', 'PRAGMA freelist_count', 'PRAGMA page_size'], 'read')
      const size = Number(pageSize!.rows[0]!.page_size)
      const allocated = Number(pages!.rows[0]!.page_count) * size
      const occupied = allocated - Number(free!.rows[0]!.freelist_count) * size
      const incoming = compressedChunks.reduce((total, chunk) => total + Math.ceil((chunk.payload.length + 512) / size) * size, 0)
      if (Math.max(allocated, occupied + incoming + 128 * 1024) > SQLITE_BACKUP_BYTE_LIMIT) throw new TacError('backup_capacity')
      const version = `${sha}-${token}`
      // Staging is isolated by run ID, including after an expired lease is reclaimed.
      for (let offset = 0; offset < compressedChunks.length; offset += 4) {
        signal.throwIfAborted()
        const compressed = compressedChunks.slice(offset, offset + 4)
        const results = await client.batch(compressed.map(chunk => ({
          sql: `INSERT INTO tac_blocks(id,version,prefix,payload)
            SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM tac_sync_state WHERE id=1 AND lock_token=? AND lock_until>?)`,
          args: [`${version}:${chunk.prefix}`, version, chunk.prefix, chunk.payload, token, Date.now()]
        })), 'write')
        if (results.some(result => result.rowsAffected !== 1)) throw new TacError('lease_lost')
      }
      signal.throwIfAborted()
      const activated = await client.execute({
        sql: `UPDATE tac_sync_state SET previous_version=active_version,active_version=?,source_commit=?,
          updated_at=?,entry_count=?,ignored_count=?,conflict_count=?
          WHERE id=1 AND lock_token=? AND lock_until>?`,
        args: [version, sha, Date.now(), dataset.entries, dataset.ignored, dataset.conflicts, token, Date.now()]
      })
      if (!activated.rowsAffected) throw new TacError('lease_lost')
      outcome = 'updated'
    }
    // Keep the preceding complete version, discard abandoned/older stages only
    // while still owning the lease. A late worker cannot delete another run's data.
    await client.execute({
      sql: `DELETE FROM tac_blocks WHERE version NOT IN (
          SELECT active_version FROM tac_sync_state WHERE active_version IS NOT NULL
          UNION SELECT previous_version FROM tac_sync_state WHERE previous_version IS NOT NULL)
        AND EXISTS(SELECT 1 FROM tac_sync_state WHERE id=1 AND lock_token=? AND lock_until>?)`,
      args: [token, Date.now()]
    })
    const finished = await client.execute({
      sql: 'UPDATE tac_sync_state SET checked_at=?,last_error=NULL,lock_token=NULL,lock_until=0 WHERE id=1 AND lock_token=? AND lock_until>?',
      args: [Date.now(), token, Date.now()]
    })
    if (!finished.rowsAffected) throw new TacError('lease_lost')
    return { status: outcome }
  } catch (error) {
    const code = error instanceof TacError ? error.message : signal.aborted ? 'timeout' : 'sync_failed'
    await client.execute({
      sql: 'UPDATE tac_sync_state SET checked_at=?,last_error=?,lock_token=NULL,lock_until=0 WHERE id=1 AND lock_token=?',
      args: [Date.now(), code, token]
    })
    throw new TacError(code)
  }
}
