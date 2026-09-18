import type { SqlJsStatic } from 'sql.js'
import { BackupError } from './dropbox'

export function validateSqliteBackup(sqlite: SqlJsStatic, bytes: Uint8Array, runId: string) {
  const db = new sqlite.Database(bytes)
  try {
    const check = db.exec('PRAGMA integrity_check')
    if (check.length !== 1 || check[0]?.values.length !== 1 || check[0]?.values[0]?.[0] !== 'ok'
      || db.exec('PRAGMA foreign_key_check').length) throw new BackupError('sqlite_integrity')
    // The run was committed before /info. Its presence proves we did not upload
    // an older generation snapshot without the recent WAL transactions.
    const marker = db.exec('SELECT id FROM backup_runs WHERE id = ?', [runId])
    if (marker[0]?.values[0]?.[0] !== runId) throw new BackupError('export_stale')
  } catch (error) {
    if (error instanceof BackupError) throw error
    throw new BackupError('sqlite_integrity')
  } finally {
    db.close()
  }
}
