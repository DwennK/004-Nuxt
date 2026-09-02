import { and, eq } from 'drizzle-orm'
import { createError, getHeader, type H3Event } from 'h3'
import { documentImports } from '~~/server/db/schema'
import { serializeIdempotencyPayload } from '~~/shared/lib/idempotency'
import type { PosDatabase, PosTransaction } from './turso'
import { useDb } from './turso'

export type OperationReceiptSource = Exclude<
  typeof documentImports.$inferSelect.source,
  'woocommerce_order' | 'shopify_order' | 'shopify_payment'
>

type StoredReceipt = {
  version: 1
  fingerprint: string
  resourceId: number
}

export type IdempotentOperationResult<T> = {
  value: T
  replayed: boolean
}

export async function fingerprintIdempotencyPayload(payload: unknown) {
  const bytes = new TextEncoder().encode(serializeIdempotencyPayload(payload))
  const digest = await crypto.subtle.digest('SHA-256', bytes)

  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

export function requireIdempotencyKey(event: H3Event) {
  const key = getHeader(event, 'idempotency-key')?.trim()

  if (!key) {
    throw createError({
      statusCode: 428,
      statusMessage: 'Idempotency-Key header is required',
      data: { code: 'IDEMPOTENCY_KEY_REQUIRED' }
    })
  }

  if (key.length < 8 || key.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Idempotency-Key header is invalid',
      data: { code: 'IDEMPOTENCY_KEY_INVALID' }
    })
  }

  return key
}

function parseStoredReceipt(value: string): StoredReceipt {
  try {
    const parsed = JSON.parse(value) as Partial<StoredReceipt>

    if (
      parsed.version === 1
      && typeof parsed.fingerprint === 'string'
      && typeof parsed.resourceId === 'number'
      && Number.isInteger(parsed.resourceId)
      && parsed.resourceId > 0
    ) {
      return parsed as StoredReceipt
    }
  } catch {
    // Fall through to a deterministic server error below.
  }

  throw createError({
    statusCode: 500,
    statusMessage: 'Stored idempotency receipt is invalid',
    data: { code: 'IDEMPOTENCY_RECEIPT_INVALID' }
  })
}

export async function runIdempotentDocumentOperation<T>(options: {
  source: OperationReceiptSource
  key: string
  payload: unknown
  database?: PosDatabase
  execute: (executor: PosTransaction) => Promise<{
    value: T
    documentId: number
    resourceId: number
  }>
  replay: (executor: PosTransaction, receipt: {
    documentId: number
    resourceId: number
  }) => Promise<T>
}): Promise<IdempotentOperationResult<T>> {
  const fingerprint = await fingerprintIdempotencyPayload(options.payload)
  const db = options.database || useDb()

  return db.transaction(async (tx) => {
    const [existing] = await tx.select({
      documentId: documentImports.documentId,
      receipt: documentImports.externalNumber
    }).from(documentImports).where(and(
      eq(documentImports.source, options.source),
      eq(documentImports.externalId, options.key)
    )).limit(1)

    if (existing) {
      const receipt = parseStoredReceipt(existing.receipt)

      if (receipt.fingerprint !== fingerprint) {
        throw createError({
          statusCode: 409,
          statusMessage: 'Idempotency-Key was already used with a different payload',
          data: { code: 'IDEMPOTENCY_PAYLOAD_MISMATCH' }
        })
      }

      return {
        value: await options.replay(tx, {
          documentId: existing.documentId,
          resourceId: receipt.resourceId
        }),
        replayed: true
      }
    }

    const result = await options.execute(tx)
    const storedReceipt: StoredReceipt = {
      version: 1,
      fingerprint,
      resourceId: result.resourceId
    }

    await tx.insert(documentImports).values({
      documentId: result.documentId,
      source: options.source,
      externalId: options.key,
      externalNumber: JSON.stringify(storedReceipt),
      createdAt: new Date().toISOString()
    })

    return {
      value: result.value,
      replayed: false
    }
  })
}
