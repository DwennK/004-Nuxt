#!/usr/bin/env node

import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  CliError,
  createDatabaseClient,
  parseCliArgs,
  printJson,
  resolveDatabaseTarget,
  runCli,
  tableExists
} from './_shared.mjs'
import { documentLineTaxableBaseSql } from './_document-total-sql.mjs'

const help = `Usage:
  node scripts/db/backfill-document-totals.mjs [options]

Recompute stored document totals from document_lines. The default mode is a
read-only plan; no data changes without --apply.

Options:
  --apply                       Apply the idempotent backfill
  --batch-size <n>              Documents per transaction (default: 100, max: 500)
  --max-batches <n>             Transactions per run (default: 10, max: 100)
  --after-id <id>               Resume strictly after this document ID (default: 0)
  --url <url>                   Override TURSO_URL
  --environment <name>         development|test|staging|production
  --confirm-target <host>       Required for every remote database
  --allow-production-read       Required for a production plan
  --allow-production-write      Required with --apply in production
  --backup-reference <value>    Required with --apply in production
  --help                        Show this help
`

export const defaultBatchSize = 100
export const maximumBatchSize = 500
export const defaultMaxBatches = 10
export const maximumBatchCount = 100

const mismatchSql = `
  SELECT COUNT(*) AS count
  FROM documents d
  JOIN (
    SELECT
      document_id,
      CAST(SUM(${documentLineTaxableBaseSql}) AS INTEGER) AS subtotal,
      CAST(SUM(
        line_total - (${documentLineTaxableBaseSql})
      ) AS INTEGER) AS tax_amount,
      CAST(SUM(line_total) AS INTEGER) AS total
    FROM document_lines
    GROUP BY document_id
  ) computed ON computed.document_id = d.id
  WHERE d.subtotal != computed.subtotal
     OR d.tax_amount != computed.tax_amount
     OR d.total != computed.total
`

const documentBatchSql = `
  WITH candidate_documents AS (
    SELECT id, subtotal, tax_amount, total
    FROM documents
    WHERE id > ?
    ORDER BY id
    LIMIT ?
  ),
  computed AS (
    SELECT
      document_id,
      CAST(SUM(${documentLineTaxableBaseSql}) AS INTEGER) AS subtotal,
      CAST(SUM(
        line_total - (${documentLineTaxableBaseSql})
      ) AS INTEGER) AS tax_amount,
      CAST(SUM(line_total) AS INTEGER) AS total
    FROM document_lines
    WHERE document_id IN (SELECT id FROM candidate_documents)
    GROUP BY document_id
  )
  SELECT
    d.id,
    CASE
      WHEN computed.document_id IS NOT NULL AND (
        d.subtotal != computed.subtotal
        OR d.tax_amount != computed.tax_amount
        OR d.total != computed.total
      ) THEN 1
      ELSE 0
    END AS is_mismatch
  FROM candidate_documents d
  LEFT JOIN computed ON computed.document_id = d.id
  ORDER BY d.id
`

const updateMismatchSql = `
  WITH computed AS (
    SELECT
      CAST(SUM(${documentLineTaxableBaseSql}) AS INTEGER) AS subtotal,
      CAST(SUM(
        line_total - (${documentLineTaxableBaseSql})
      ) AS INTEGER) AS tax_amount,
      CAST(SUM(line_total) AS INTEGER) AS total
    FROM document_lines
    WHERE document_id = ?
    HAVING COUNT(*) > 0
  )
  UPDATE documents
  SET
    subtotal = (SELECT subtotal FROM computed),
    tax_amount = (SELECT tax_amount FROM computed),
    total = (SELECT total FROM computed)
  WHERE documents.id = ?
    AND EXISTS (SELECT 1 FROM computed)
    AND (
      documents.subtotal != (SELECT subtotal FROM computed)
      OR documents.tax_amount != (SELECT tax_amount FROM computed)
      OR documents.total != (SELECT total FROM computed)
    )
`

function parseBoundedInteger(rawValue, { defaultValue, flag, minimum, maximum }) {
  if (rawValue === undefined) {
    return defaultValue
  }

  if (!/^\d+$/.test(String(rawValue))) {
    throw new RangeError(`${flag} must be an integer between ${minimum} and ${maximum}`)
  }

  const value = Number(rawValue)

  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${flag} must be an integer between ${minimum} and ${maximum}`)
  }

  return value
}

export function resolveBackfillBounds(options = {}) {
  const batchSize = parseBoundedInteger(options.batchSize, {
    defaultValue: defaultBatchSize,
    flag: '--batch-size',
    minimum: 1,
    maximum: maximumBatchSize
  })
  const maxBatches = parseBoundedInteger(options.maxBatches, {
    defaultValue: defaultMaxBatches,
    flag: '--max-batches',
    minimum: 1,
    maximum: maximumBatchCount
  })
  const afterId = parseBoundedInteger(options.afterId, {
    defaultValue: 0,
    flag: '--after-id',
    minimum: 0,
    maximum: Number.MAX_SAFE_INTEGER
  })

  return {
    afterId,
    batchSize,
    maxBatches,
    maxDocuments: batchSize * maxBatches
  }
}

export async function countDocumentTotalMismatches(client) {
  const result = await client.execute(mismatchSql)
  return Number(result.rows[0]?.count || 0)
}

export async function listDocumentBackfillBatch(client, { afterId, limit }) {
  const result = await client.execute({
    sql: documentBatchSql,
    args: [afterId, limit]
  })

  return result.rows.map(row => ({
    id: Number(row.id),
    mismatched: Number(row.is_mismatch) === 1
  }))
}

async function updateMismatchDocuments(client, documentIds) {
  if (!documentIds.length) {
    return 0
  }

  const results = await client.batch(documentIds.map(documentId => ({
    sql: updateMismatchSql,
    args: [documentId, documentId]
  })), 'write')

  return results.reduce((total, result) => total + Number(result.rowsAffected || 0), 0)
}

export async function processBackfillWindow(client, bounds, { apply = false } = {}) {
  let cursor = bounds.afterId
  let processedBatches = 0
  let scannedDocuments = 0
  let mismatchedDocuments = 0
  let updatedDocuments = 0

  while (processedBatches < bounds.maxBatches) {
    const documents = await listDocumentBackfillBatch(client, {
      afterId: cursor,
      limit: bounds.batchSize
    })

    if (!documents.length) {
      break
    }

    const mismatchIds = documents.filter(document => document.mismatched).map(document => document.id)
    processedBatches += 1
    scannedDocuments += documents.length
    mismatchedDocuments += mismatchIds.length

    if (apply) {
      updatedDocuments += await updateMismatchDocuments(client, mismatchIds)
    }

    cursor = documents[documents.length - 1].id

    if (documents.length < bounds.batchSize) {
      break
    }
  }

  const nextDocuments = await listDocumentBackfillBatch(client, { afterId: cursor, limit: 1 })
  const hasMore = nextDocuments.length > 0

  return {
    startAfterId: bounds.afterId,
    lastProcessedId: cursor === bounds.afterId ? null : cursor,
    processedBatches,
    scannedDocuments,
    mismatchedDocuments,
    updatedDocuments,
    hasMore
  }
}

async function main() {
  const { options, positional } = parseCliArgs(process.argv.slice(2), {
    booleanFlags: [
      '--allow-production-read',
      '--allow-production-write',
      '--apply',
      '--help'
    ],
    valueFlags: [
      '--after-id',
      '--backup-reference',
      '--batch-size',
      '--confirm-target',
      '--environment',
      '--max-batches',
      '--url'
    ]
  })

  if (options.help) {
    console.log(help)
    return
  }

  if (positional.length) {
    throw new CliError(`Unexpected arguments: ${positional.join(' ')}`)
  }

  let bounds

  try {
    bounds = resolveBackfillBounds(options)
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error))
  }

  const target = resolveDatabaseTarget(options, { access: options.apply ? 'write' : 'read' })

  if (options.apply && target.environment === 'production' && !options.backupReference) {
    throw new CliError('Production backfill requires --backup-reference <value>')
  }

  const client = createDatabaseClient(target)

  try {
    for (const tableName of ['documents', 'document_lines']) {
      if (!await tableExists(client, tableName)) {
        throw new CliError(`Required table is missing: ${tableName}`)
      }
    }

    const before = await countDocumentTotalMismatches(client)
    const plan = {
      mode: options.apply ? 'apply' : 'plan',
      target: {
        environment: target.environment,
        id: target.targetId,
        local: target.local
      },
      mismatchedDocuments: before,
      startAfterId: bounds.afterId,
      batchSize: bounds.batchSize,
      maxBatches: bounds.maxBatches,
      maxDocuments: bounds.maxDocuments,
      backupReference: options.backupReference || null
    }

    if (!options.apply) {
      const window = await processBackfillWindow(client, bounds)
      printJson({
        ...plan,
        applied: false,
        candidateDocuments: window.scannedDocuments,
        candidateMismatches: window.mismatchedDocuments,
        candidateBatches: window.processedBatches,
        plannedThroughId: window.lastProcessedId,
        additionalCandidates: window.hasMore,
        remainingMismatches: before,
        complete: before === 0
      })
      return
    }

    if (before === 0) {
      printJson({
        ...plan,
        applied: false,
        processedBatches: 0,
        scannedDocuments: 0,
        mismatchedDocumentsInWindow: 0,
        updatedDocuments: 0,
        nextAfterId: null,
        remainingMismatches: 0,
        complete: true
      })
      return
    }

    const window = await processBackfillWindow(client, bounds, { apply: true })
    const after = await countDocumentTotalMismatches(client)
    const complete = after === 0
    const nextAfterId = complete
      ? null
      : (window.hasMore ? window.lastProcessedId : 0)

    printJson({
      ...plan,
      applied: window.updatedDocuments > 0,
      processedBatches: window.processedBatches,
      scannedDocuments: window.scannedDocuments,
      mismatchedDocumentsInWindow: window.mismatchedDocuments,
      updatedDocuments: window.updatedDocuments,
      lastProcessedId: window.lastProcessedId,
      nextAfterId,
      restartFromBeginning: !complete && !window.hasMore,
      remainingMismatches: after,
      complete
    })
  } finally {
    client.close()
  }
}

const isDirectExecution = Boolean(process.argv[1])
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href

if (isDirectExecution) {
  await runCli(main)
}
