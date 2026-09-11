#!/usr/bin/env node
import { pathToFileURL } from 'node:url'
import { parseCliArgs, printJson, runCli } from './_shared.mjs'

const FREE_READS = 500_000_000
const FREE_WRITES = 10_000_000

function finiteCount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null
}

export function summarizeUsage(payload, { now = new Date(), readLimit = FREE_READS, writeLimit = FREE_WRITES } = {}) {
  const usage = payload?.organization?.usage
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)
  const elapsed = now.getTime() - start
  const metric = (value, limit) => {
    const used = finiteCount(value)
    return {
      used,
      limit,
      remaining: used === null ? null : Math.max(0, limit - used),
      percentUsed: used === null ? null : Math.round(used / limit * 10000) / 100,
      projectedMonthTotal: used === null || elapsed < 86_400_000 ? null : Math.ceil(used * (end - start) / elapsed),
      status: used === null ? 'unknown' : used >= limit ? 'exceeded' : used >= limit * 0.9 ? 'critical' : used >= limit * 0.75 ? 'warning' : 'within_budget'
    }
  }
  return {
    checkedAt: now.toISOString(),
    source: 'Turso organization usage API; no application SQL executed',
    projectionAssumption: 'Current UTC calendar month; constant average usage. No projection during the first 24 hours. Not a guarantee or enforcement.',
    reads: metric(usage?.rows_read, readLimit),
    writes: metric(usage?.rows_written, writeLimit),
    storageBytes: finiteCount(usage?.storage_bytes),
    databases: (payload?.organization?.databases || []).map(database => ({
      id: database.uuid,
      rowsRead: finiteCount(database.total?.rows_read),
      rowsWritten: finiteCount(database.total?.rows_written),
      storageBytes: finiteCount(database.total?.storage_bytes)
    }))
  }
}

function positiveLimit(value, fallback) {
  if (value === undefined) return fallback
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error('Usage limits must be positive safe integers')
  return parsed
}

async function main() {
  const { options, positional } = parseCliArgs(process.argv.slice(2), {
    booleanFlags: ['--help'],
    valueFlags: ['--organization', '--read-limit', '--write-limit']
  })
  if (options.help) {
    console.log(`Usage: npm run db:usage -- --organization <slug> [--read-limit <rows>] [--write-limit <rows>]

Read current organization consumption through the Turso Platform API, without
running database queries. Set TURSO_PLATFORM_TOKEN in the environment; never
pass a token on the command line. Defaults: Free plan, 500M reads / 10M writes.
This command reports a snapshot and an indicative projection; it does not
schedule monitoring, change the plan, block the POS, or reset existing usage.`)
    return
  }
  if (positional.length) throw new Error('Unexpected positional arguments')
  const organization = options.organization || process.env.TURSO_ORGANIZATION
  if (!organization || !/^[a-zA-Z0-9_-]+$/.test(organization)) throw new Error('Provide a valid --organization slug')
  const token = process.env.TURSO_PLATFORM_TOKEN
  if (!token) throw new Error('Missing TURSO_PLATFORM_TOKEN (Platform API token, distinct from TURSO_TOKEN)')
  const readLimit = positiveLimit(options.readLimit, FREE_READS)
  const writeLimit = positiveLimit(options.writeLimit, FREE_WRITES)
  const response = await fetch(`https://api.turso.tech/v1/organizations/${encodeURIComponent(organization)}/usage`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
    redirect: 'error'
  })
  if (!response.ok) throw new Error(`Turso usage API returned HTTP ${response.status}`)
  const payload = await response.json()
  if (!payload?.organization?.usage) throw new Error('Turso usage API returned no organization usage')
  printJson(summarizeUsage(payload, { readLimit, writeLimit }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await runCli(main)
