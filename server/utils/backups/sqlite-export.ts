import { BackupError } from './dropbox'

export type TursoExportConfig = { url: string, authToken: string }
// Keep room for the source, committed/pending pages and SQLite WASM validation
// inside the existing Worker's 128 MiB memory budget. Fail before uploading.
export const MAX_SQLITE_BYTES = 16 * 1024 * 1024
const MAX_WAL_BYTES = 256 * 1024 * 1024
const BATCH_FRAMES = 128
const SIGNATURE = 'SQLite format 3\0'

function fail(): never {
  throw new BackupError('turso_export')
}

/** Bounds decompressed bytes too, including responses without Content-Length. */
async function readBytes(response: Response, limit: number) {
  if (!response.body) fail()
  const reader = response.body.getReader()
  const parts: Uint8Array[] = []
  let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.length
      if (size > limit) throw new BackupError('backup_too_large')
      parts.push(value)
    }
  } finally {
    await reader.cancel()
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

function sqlitePageSize(bytes: Uint8Array) {
  if (bytes.length < 100 || new TextDecoder().decode(bytes.subarray(0, 16)) !== SIGNATURE) fail()
  const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(16)
  // The official Turso /sync export protocol uses 4096-byte SQLite pages.
  if (size !== 4096 || bytes.length % size !== 0) fail()
  return size
}

/** SQLite's checkpoint algorithm: only apply complete transactions, then truncate. */
export class SqliteCheckpoint {
  private pages = new Map<number, Uint8Array>()
  private pending = new Map<number, Uint8Array>()
  private pageCount: number
  readonly pageSize: number

  constructor(snapshot: Uint8Array) {
    if (snapshot.length > MAX_SQLITE_BYTES) throw new BackupError('backup_too_large')
    this.pageSize = sqlitePageSize(snapshot)
    this.pageCount = snapshot.length / this.pageSize
    for (let i = 0; i < this.pageCount; i++) this.pages.set(i + 1, snapshot.slice(i * this.pageSize, (i + 1) * this.pageSize))
  }

  append(frames: Uint8Array) {
    const stride = this.pageSize + 24
    if (frames.length % stride !== 0) fail()
    const view = new DataView(frames.buffer, frames.byteOffset, frames.byteLength)
    for (let offset = 0; offset < frames.length; offset += stride) {
      const page = view.getUint32(offset)
      const commitPages = view.getUint32(offset + 4)
      if (!page) fail()
      if (Math.max(page, commitPages) * this.pageSize > MAX_SQLITE_BYTES) throw new BackupError('backup_too_large')
      this.pending.set(page, frames.slice(offset + 24, offset + stride))
      if (commitPages) {
        for (const [id, bytes] of this.pending) this.pages.set(id, bytes)
        this.pending.clear()
        this.pageCount = commitPages
        for (const id of this.pages.keys()) if (id > commitPages) this.pages.delete(id)
      }
    }
    return frames.length / stride
  }

  finish() {
    // An unfinished tail is not committed. Never let it overwrite committed pages.
    this.pending.clear()
    const bytes = new Uint8Array(this.pageCount * this.pageSize)
    for (let page = 1; page <= this.pageCount; page++) {
      const data = this.pages.get(page)
      if (!data) fail()
      bytes.set(data, (page - 1) * this.pageSize)
    }
    this.pages.clear()
    sqlitePageSize(bytes)
    // Self-contained rollback-journal format, with the committed page count.
    // No .db-wal or .db-shm sidecar is required to open the backup.
    bytes[18] = 1
    bytes[19] = 1
    const view = new DataView(bytes.buffer)
    view.setUint32(28, this.pageCount)
    view.setUint32(92, view.getUint32(24))
    return bytes
  }
}

/** Same native endpoints as `turso db export`, pinned source in docs/backups.md. */
export async function downloadSqliteBackup(config: TursoExportConfig, signal: AbortSignal) {
  const base = new URL(config.url.replace(/^libsql:/, 'https:'))
  if (base.protocol !== 'https:' || base.username || base.password || base.pathname !== '/' || base.search || base.hash) fail()
  const request = async (path: string) => {
    signal.throwIfAborted()
    const response = await fetch(new URL(path, base), {
      headers: { Authorization: `Bearer ${config.authToken}` },
      // Workers only supports manual/follow. Reject 3xx below without forwarding credentials.
      redirect: 'manual',
      signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)])
    })
    // Unlike the CLI, errors (including 400/500) never mean a successful WAL end.
    if (!response.ok) {
      await response.body?.cancel()
      fail()
    }
    return response
  }
  const info = async () => {
    const bytes = await readBytes(await request('/info'), 16 * 1024)
    const value = JSON.parse(new TextDecoder().decode(bytes)) as { current_generation?: number, db_type?: string }
    if (!Number.isSafeInteger(value.current_generation) || Number(value.current_generation) < 0 || value.db_type !== 'sqlite') fail()
    return value.current_generation!
  }
  const generation = await info()
  const snapshot = new SqliteCheckpoint(await readBytes(await request(`/export/${generation}`), MAX_SQLITE_BYTES))
  let walBytes = 0
  for (let frame = 1; ;) {
    const frames = await readBytes(await request(`/sync/${generation}/${frame}/${frame + BATCH_FRAMES}`), BATCH_FRAMES * (snapshot.pageSize + 24))
    walBytes += frames.length
    if (walBytes > MAX_WAL_BYTES) throw new BackupError('backup_too_large')
    const count = snapshot.append(frames)
    if (count < BATCH_FRAMES) break
    frame += count
  }
  // A generation rollover during download must be retried, never silently mixed.
  if (await info() !== generation) throw new BackupError('export_stale')
  signal.throwIfAborted()
  return snapshot.finish()
}

export async function* generateSqliteBackup(config: TursoExportConfig, signal: AbortSignal, runId: string) {
  const { validateNativeBackup } = await import('./sqlite-runtime')
  for (let attempt = 0; ; attempt++) {
    try {
      const bytes = await downloadSqliteBackup(config, signal)
      await validateNativeBackup(bytes, runId)
      signal.throwIfAborted()
      yield bytes
      return
    } catch (error) {
      if (!(error instanceof BackupError) || error.code !== 'export_stale' || attempt >= 2) throw error
      signal.throwIfAborted()
    }
  }
}
