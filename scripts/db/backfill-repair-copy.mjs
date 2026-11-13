#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { repairCopyUpdate } from '../../shared/utils/repair-copy.ts'
import { CliError, createDatabaseClient, parseCliArgs, printJson, resolveDatabaseTarget, runCli } from './_shared.mjs'

// The snapshot and updates share one transaction. Only catalogue copy is changed;
// existing document/ticket lines keep their historical text.
export async function backfillRepairCopy(client, { apply = false, saveBackup } = {}) {
  if (apply && !saveBackup) throw new CliError('A catalogue backup is required before applying changes')
  const tx = await client.transaction(apply ? 'write' : 'read')
  try {
    const { rows } = await tx.execute('SELECT * FROM catalog_items WHERE type = \'repair\' ORDER BY id')
    const changes = rows.flatMap((row) => {
      const update = repairCopyUpdate({ type: row.type, name: row.name, model: row.model, serviceKind: row.service_kind })
      return update ? [{ id: row.id, before: { name: row.name, serviceKind: row.service_kind }, after: update }] : []
    })
    let updated = 0
    if (apply && changes.length) {
      await saveBackup(rows)
      const now = new Date().toISOString()
      for (let offset = 0; offset < changes.length; offset += 50) {
        const results = await tx.batch(changes.slice(offset, offset + 50).map(change => ({
          sql: 'UPDATE catalog_items SET name = ?, service_kind = ?, updated_at = ? WHERE id = ? AND name = ? AND service_kind IS ?',
          args: [change.after.name, change.after.serviceKind, now, change.id, change.before.name, change.before.serviceKind]
        })))
        updated += results.reduce((count, result) => count + result.rowsAffected, 0)
      }
      if (updated !== changes.length) throw new CliError('Catalogue changed during the update; rolling back')
      const after = (await tx.execute('SELECT id, name, service_kind FROM catalog_items WHERE type = \'repair\' ORDER BY id')).rows
      const byId = new Map(after.map(row => [row.id, row]))
      for (const change of changes) {
        const row = byId.get(change.id)
        if (row?.name !== change.after.name || row?.service_kind !== change.after.serviceKind) {
          throw new CliError(`Verification failed for repair ${change.id}; rolling back`)
        }
      }
    }
    await tx.commit()
    return { total: rows.length, unchanged: rows.length - changes.length, updated, changes }
  } catch (error) {
    await tx.rollback()
    throw error
  } finally {
    tx.close()
  }
}

async function main() {
  const { options, positional } = parseCliArgs(process.argv.slice(2), {
    booleanFlags: ['--apply', '--allow-production-read', '--allow-production-write', '--help'],
    valueFlags: ['--url', '--environment', '--confirm-target', '--backup']
  })
  if (options.help) {
    console.log(`Usage: node scripts/db/backfill-repair-copy.mjs [options]
Preview catalogue repair names/descriptions; custom copy is preserved.
  --apply                     Apply atomically with a mandatory automatic backup
  --backup <path>             Optional backup path (must not already exist)
  --url <url>                 Override TURSO_URL
  --environment <name>        development|test|staging|production
  --confirm-target <host>     Required for remote targets in DB_REMOTE_TARGETS
  --allow-production-read     Required for a production preview
  --allow-production-write    Required to apply in production
  --help                     Show this help`)
    return
  }
  if (positional.length) throw new CliError(`Unexpected arguments: ${positional.join(' ')}`)
  const target = resolveDatabaseTarget(options, { access: options.apply ? 'write' : 'read' })
  const client = createDatabaseClient(target)
  let backup = null
  try {
    const result = await backfillRepairCopy(client, {
      apply: Boolean(options.apply),
      saveBackup: async (rows) => {
        const path = resolve(options.backup || `.data/repair-copy/catalog-before-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
        await mkdir(dirname(path), { recursive: true, mode: 0o700 })
        await writeFile(path, JSON.stringify({ target: target.targetId, environment: target.environment, rows }, null, 2), { flag: 'wx', mode: 0o600 })
        backup = path
      }
    })
    printJson({ target: target.targetId, mode: options.apply ? 'apply' : 'preview', backup, ...result })
  } finally {
    client.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await runCli(main)
