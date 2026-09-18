import type { Client } from '@libsql/client'

const identifier = (name: string) => `"${name.replaceAll('"', '""')}"`

// SQL serializes values itself: no JS integer rounding, embedded NUL truncation,
// lost BLOBs or confusion between SQL NULL and the string "NULL".
function literal(column: string) {
  const name = identifier(column)
  return `CASE typeof(${name}) WHEN 'text' THEN 'CAST(X''' || hex(${name}) || ''' AS TEXT)' ELSE quote(${name}) END`
}

/** One read transaction covers both schema and all rows. No application writes. */
export async function* generateSqlDump(client: Client, signal: AbortSignal) {
  const tx = await client.transaction('read')
  try {
    const schema = await tx.execute('SELECT type, name, sql FROM sqlite_schema WHERE sql IS NOT NULL AND name NOT GLOB \'sqlite_*\' ORDER BY rowid')
    const tables = schema.rows.filter(row => row.type === 'table')
    if (tables.some(row => /^CREATE\s+VIRTUAL\s+TABLE/i.test(String(row.sql)))) {
      throw new Error('Virtual tables require a dedicated backup strategy')
    }
    yield '-- POS Turso SQL backup v1\nPRAGMA foreign_keys=OFF;\nBEGIN TRANSACTION;\n'
    for (const table of tables) {
      signal.throwIfAborted()
      yield `${String(table.sql)};\n`
      const name = identifier(String(table.name))
      const info = await tx.execute(`PRAGMA table_xinfo(${name})`)
      const columns = info.rows.filter(row => Number(row.hidden) === 0).map(row => String(row.name))
      let rowId: string | undefined
      if (!/\bWITHOUT\s+ROWID\b/i.test(String(table.sql))) {
        rowId = ['rowid', '_rowid_', 'oid'].find(alias => !info.rows.some(row => String(row.name).toLowerCase() === alias))
        if (!rowId) throw new Error('No accessible rowid for backup')
        columns.unshift(rowId)
      }
      const prefix = `INSERT INTO ${name}(${columns.map(identifier).join(',')}) VALUES(`
      const order = rowId ? identifier(rowId) : info.rows.filter(row => Number(row.pk) > 0).sort((a, b) => Number(a.pk) - Number(b.pk)).map(row => identifier(String(row.name))).join(',')
      let cursor: string | null = null
      for (let offset = 0; ; offset += 100) {
        signal.throwIfAborted()
        // Seek by rowid instead of re-reading every prior page on each request.
        const rows = await tx.execute({
          sql: `SELECT ${columns.map(literal).join(' || \',\' || ')} AS serialized${rowId ? `, quote(${identifier(rowId)}) AS cursor` : ''}
            FROM ${name}${rowId && cursor !== null ? ` WHERE ${identifier(rowId)} > CAST(? AS INTEGER)` : ''}
            ORDER BY ${order} LIMIT 100${rowId ? '' : ` OFFSET ${offset}`}`,
          args: rowId && cursor !== null ? [cursor] : []
        })
        for (const row of rows.rows) yield `${prefix}${String(row.serialized)});\n`
        if (rows.rows.length < 100) break
        if (rowId) cursor = String(rows.rows.at(-1)!.cursor)
      }
    }
    // Preserve AUTOINCREMENT high-water marks, including deleted records.
    const sequence = await tx.execute('SELECT name FROM sqlite_schema WHERE name = \'sqlite_sequence\'')
    if (sequence.rows.length) {
      yield 'DELETE FROM sqlite_sequence;\n'
      const rows = await tx.execute('SELECT quote(name) AS name, quote(seq) AS seq FROM sqlite_sequence')
      for (const row of rows.rows) yield `INSERT INTO sqlite_sequence VALUES(${String(row.name)},${String(row.seq)});\n`
    }
    // Create triggers only after data to avoid side effects during restoration.
    for (const row of schema.rows.filter(row => row.type !== 'table')) yield `${String(row.sql)};\n`
    await tx.commit()
    yield 'COMMIT;\nPRAGMA foreign_keys=ON;\n'
  } finally {
    if (!tx.closed) await tx.rollback()
    tx.close()
  }
}

/** Fixed-size chunks also match Dropbox's content_hash block algorithm. */
export async function* dumpChunks(source: AsyncIterable<string>, size = 4 * 1024 * 1024) {
  const encoder = new TextEncoder()
  let buffer = new Uint8Array(size)
  let used = 0
  for await (const line of source) {
    const bytes = encoder.encode(line)
    for (let offset = 0; offset < bytes.length;) {
      const length = Math.min(size - used, bytes.length - offset)
      buffer.set(bytes.subarray(offset, offset + length), used)
      used += length
      offset += length
      if (used === size) {
        yield buffer
        buffer = new Uint8Array(size)
        used = 0
      }
    }
  }
  if (used) yield buffer.slice(0, used)
}
