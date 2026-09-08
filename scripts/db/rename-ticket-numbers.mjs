#!/usr/bin/env node
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CliError, createDatabaseClient, parseCliArgs, printJson, resolveDatabaseTarget, runCli } from './_shared.mjs'

// The entire inventory and conversion share one transaction, including the sequence.
export async function renameTicketNumbers(client, { apply = false } = {}) {
  const tx = await client.transaction(apply ? 'write' : 'read')
  try {
    const { rows } = await tx.execute('SELECT id, ticket_number FROM tickets ORDER BY id')
    const invalid = []
    const collisions = []
    const targets = new Map()
    const changes = []
    let maximum = 0
    for (const row of rows) {
      const number = String(row.ticket_number)
      const match = /^(TIC|DOS)-([1-9]\d*)$/.exec(number)
      if (!match || !Number.isSafeInteger(Number(match[2])) || Number(match[2]) >= Number.MAX_SAFE_INTEGER) {
        invalid.push({ id: row.id, number })
        continue
      }
      maximum = Math.max(maximum, Number(match[2]))
      const target = `DOS-${match[2]}`
      if (targets.has(target)) collisions.push({ target, ids: [targets.get(target), row.id] })
      targets.set(target, row.id)
      if (number !== target) changes.push({ id: row.id, from: number, to: target })
    }
    const sequence = await tx.execute('SELECT last_value FROM number_sequences WHERE scope = \'ticket\'')
    const previousSequence = sequence.rows.length ? Number(sequence.rows[0].last_value) : null
    if (previousSequence !== null && (!Number.isSafeInteger(previousSequence) || previousSequence < 0 || previousSequence >= Number.MAX_SAFE_INTEGER)) {
      throw new CliError('Invalid dossier number sequence; no changes applied')
    }
    const nextSequence = Math.max(previousSequence ?? 0, maximum)
    const report = { total: rows.length, changes, invalid, collisions, previousSequence, nextSequence }
    if (apply && (invalid.length || collisions.length)) {
      throw new CliError(`Conversion refused; no changes applied: ${JSON.stringify(report)}`)
    }
    let updated = 0
    if (apply) {
      const result = await tx.execute('UPDATE tickets SET ticket_number = \'DOS-\' || substr(ticket_number, 5) WHERE ticket_number LIKE \'TIC-%\'')
      updated = result.rowsAffected
      if (previousSequence === null || nextSequence > previousSequence) {
        await tx.execute({
          sql: 'INSERT INTO number_sequences(scope, last_value) VALUES (\'ticket\', ?) ON CONFLICT(scope) DO UPDATE SET last_value = max(number_sequences.last_value, excluded.last_value)',
          args: [nextSequence]
        })
      }
    }
    await tx.commit()
    return { ...report, applied: apply, updated, ready: invalid.length === 0 && collisions.length === 0 }
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
    valueFlags: ['--url', '--environment', '--confirm-target', '--backup-reference']
  })
  if (options.help) {
    console.log(`Usage: node scripts/db/rename-ticket-numbers.mjs [options]
Convert TIC-N to DOS-N, preserving IDs and sequence continuity. Read-only by default.
  --apply                      Apply atomically; stop application writes during rollout
  --url <url>                  Override TURSO_URL
  --environment <name>         development|test|staging|production
  --confirm-target <host>      Required for remote targets in DB_REMOTE_TARGETS
  --allow-production-read      Required for a production plan
  --allow-production-write     Required for a production conversion
  --backup-reference <value>   Required for production writes
  --help                      Show this help`)
    return
  }
  if (positional.length) throw new CliError(`Unexpected arguments: ${positional.join(' ')}`)
  const target = resolveDatabaseTarget(options, { access: options.apply ? 'write' : 'read' })
  if (options.apply && target.environment === 'production' && !options.backupReference?.trim()) {
    throw new CliError('Production conversion requires --backup-reference')
  }
  const client = createDatabaseClient(target)
  try {
    printJson({ target: target.targetId, backupReference: options.backupReference || null, ...await renameTicketNumbers(client, { apply: Boolean(options.apply) }) })
  } finally {
    client.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await runCli(main)
