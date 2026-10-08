#!/usr/bin/env node
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { CliError, createDatabaseClient, parseCliArgs, printJson, resolveDatabaseTarget, runCli } from './_shared.mjs'

// Read-only preparation for the single-name migration. Matching prefixes are
// ambiguous (including legitimate repetitions): report them, never rewrite them.
export async function auditPersonNames(client) {
  const tables = []
  for (const table of ['customers', 'employees']) {
    const columns = (await client.execute(`PRAGMA table_info(${table})`)).rows.map(row => String(row.name))
    if (!columns.length) throw new CliError(`Missing table: ${table}`)
    const legacy = columns.includes('first_name') && columns.includes('last_name')
    if (!legacy && !columns.includes('name')) throw new CliError(`Unrecognized name schema: ${table}`)
    const rows = (await client.execute(legacy
      ? `SELECT id, first_name, last_name FROM ${table} ORDER BY id`
      : `SELECT id, name FROM ${table} ORDER BY id`)).rows
    const candidates = []
    if (legacy) {
      for (const row of rows) {
        const first = String(row.first_name || '').trim()
        const last = String(row.last_name || '').trim()
        const comparable = value => value.replace(/\s+/g, ' ').toLocaleLowerCase('fr-CH')
        const prefix = comparable(first)
        const remainder = comparable(last)
        if (prefix && (remainder === prefix || remainder.startsWith(`${prefix} `))) {
          candidates.push({ id: Number(row.id), firstName: first, lastName: last, migratedName: [first, last].filter(Boolean).join(' ') })
        }
      }
    }
    tables.push({ table, state: legacy ? 'legacy' : 'unified', count: rows.length, candidates })
  }
  return { readOnly: true, tables }
}

async function main() {
  const { options, positional } = parseCliArgs(process.argv.slice(2), {
    booleanFlags: ['--allow-production-read', '--help'],
    valueFlags: ['--url', '--environment', '--confirm-target']
  })
  if (options.help) {
    console.log('Usage: node scripts/db/audit-person-names.mjs [--url file:/path/test.db] [--environment production --confirm-target <host> --allow-production-read]\nRead-only audit; the JSON report contains personal names. Store it with the restricted migration backup.')
    return
  }
  if (positional.length) throw new CliError(`Unexpected arguments: ${positional.join(' ')}`)
  const target = resolveDatabaseTarget(options, { access: 'read' })
  const client = createDatabaseClient(target)
  try {
    printJson(await auditPersonNames(client))
  } finally {
    client.close()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await runCli(main)
