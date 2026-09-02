import { and, asc, desc, eq, gte, lte, or, sql } from 'drizzle-orm'
import { customers, documents, payments } from '~~/server/db/schema'
import {
  canChangePaymentStatus,
  canDeletePayment,
  canEditPayment
} from '~~/shared/domain/payments/rules'
import type { PaymentListItem, PaymentListResponse, PaymentRecord } from '~~/shared/types/pos'
import { buildZonedDayRange } from '~~/shared/utils/pos'
import { useDb } from '../turso'
import { runIdempotentDocumentOperation } from '../idempotency'
import { ensurePosSchema } from '~~/server/utils/pos/schema'
import { normalizeOptionalText } from '~~/shared/lib/text'
import { syncDocumentStatus } from '~~/server/utils/pos/document-balances'
import { mapPayment } from './documents'
import { assertPaymentFitsDocument, createPaymentRecordedEvent, getPayablePaymentDocument, recordDocumentPayment } from './payment-writes'

function normalizePaymentDateFrom(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? buildZonedDayRange(value).start
    : value
}

function normalizePaymentDateTo(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? buildZonedDayRange(value).end
    : value
}

function assertPositivePaymentAmount(amount: number) {
  if (amount > 0) {
    return
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'Payment amount must be greater than zero'
  })
}

export async function listPayments(filters?: {
  search?: string
  method?: PaymentRecord['method']
  status?: PaymentRecord['status']
  dateFrom?: string
  dateTo?: string
  documentId?: number
  customerId?: number
  page?: number
  pageSize?: number
  sortBy?: 'paidAt' | 'amount'
  sortDirection?: 'asc' | 'desc'
}): Promise<PaymentListResponse> {
  await ensurePosSchema()

  const db = useDb()
  const dateFrom = filters?.dateFrom ? normalizePaymentDateFrom(filters.dateFrom) : undefined
  const dateTo = filters?.dateTo ? normalizePaymentDateTo(filters.dateTo) : undefined
  const normalizedSearch = filters?.search?.trim().toLowerCase()
  const searchPattern = normalizedSearch ? `%${normalizedSearch}%` : undefined
  const page = Math.max(filters?.page || 1, 1)
  const pageSize = Math.min(Math.max(filters?.pageSize || 50, 1), 250)
  const offset = (page - 1) * pageSize
  const whereClause = and(
    filters?.method ? eq(payments.method, filters.method) : undefined,
    filters?.status ? eq(payments.status, filters.status) : undefined,
    filters?.documentId ? eq(payments.documentId, filters.documentId) : undefined,
    filters?.customerId ? eq(payments.customerId, filters.customerId) : undefined,
    dateFrom ? gte(payments.paidAt, dateFrom) : undefined,
    dateTo ? lte(payments.paidAt, dateTo) : undefined,
    searchPattern
      ? or(
          sql`lower(coalesce(${customers.companyName}, '')) like ${searchPattern}`,
          sql`lower(trim(${customers.firstName} || ' ' || ${customers.lastName})) like ${searchPattern}`,
          sql`lower(${documents.documentNumber}) like ${searchPattern}`
        )
      : undefined
  )
  const orderBy = filters?.sortBy === 'amount'
    ? filters.sortDirection === 'asc'
      ? [asc(payments.amount), asc(payments.id)]
      : [desc(payments.amount), desc(payments.id)]
    : filters?.sortDirection === 'asc'
      ? [asc(payments.paidAt), asc(payments.id)]
      : [desc(payments.paidAt), desc(payments.id)]

  const [totalRows, rows] = await Promise.all([
    db.select({ total: sql<number>`count(*)` })
      .from(payments)
      .innerJoin(documents, eq(payments.documentId, documents.id))
      .leftJoin(customers, eq(payments.customerId, customers.id))
      .where(whereClause),
    db.select({
      payment: payments,
      customer: customers,
      documentNumber: documents.documentNumber,
      documentType: documents.type
    })
      .from(payments)
      .innerJoin(documents, eq(payments.documentId, documents.id))
      .leftJoin(customers, eq(payments.customerId, customers.id))
      .where(whereClause)
      .orderBy(...orderBy)
      .limit(pageSize)
      .offset(offset)
  ])

  return {
    items: rows.map((row): PaymentListItem => ({
      ...mapPayment(row.payment),
      customerName: row.customer ? (row.customer.companyName || `${row.customer.firstName} ${row.customer.lastName}`) : null,
      documentNumber: row.documentNumber,
      documentType: row.documentType
    })),
    page,
    pageSize,
    total: Number(totalRows[0]?.total || 0)
  }
}

export async function getPaymentById(id: number) {
  await ensurePosSchema()

  const db = useDb()
  const rows = await db.select().from(payments).where(eq(payments.id, id)).limit(1)
  const row = rows[0]

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Payment not found'
    })
  }

  return mapPayment(row)
}

export async function createPaymentRecord(
  input: Omit<PaymentRecord, 'id' | 'createdAt' | 'updatedAt'>,
  idempotencyKey: string
) {
  await ensurePosSchema()

  assertPositivePaymentAmount(input.amount)

  if (input.status === 'refunded' || input.status === 'cancelled') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Refunds and cancellations require a dedicated correction flow',
      data: { code: 'PAYMENT_CORRECTION_FLOW_REQUIRED' }
    })
  }

  const paymentStatus = input.status
  const db = useDb()
  const result = await runIdempotentDocumentOperation({
    database: db,
    source: 'api_payment_create',
    key: idempotencyKey,
    payload: input,
    async execute(tx) {
      const document = await getPayablePaymentDocument(tx, input.documentId)

      if (input.customerId !== null && input.customerId !== document.customerId) {
        throw createError({
          statusCode: 400,
          statusMessage: 'Payment customer must match the document customer',
          data: { code: 'PAYMENT_CUSTOMER_MISMATCH' }
        })
      }

      const createdPayment = await recordDocumentPayment(tx, document, {
        ...input,
        status: paymentStatus
      })

      return {
        value: createdPayment,
        documentId: document.id,
        resourceId: createdPayment.id
      }
    },
    async replay(tx, receipt) {
      const [existingPayment] = await tx.select()
        .from(payments)
        .where(and(
          eq(payments.id, receipt.resourceId),
          eq(payments.documentId, receipt.documentId)
        ))
        .limit(1)

      if (!existingPayment) {
        throw createError({
          statusCode: 409,
          statusMessage: 'The result of this idempotent operation no longer exists',
          data: { code: 'IDEMPOTENCY_RESOURCE_MISSING' }
        })
      }

      return existingPayment
    }
  })

  return mapPayment(result.value)
}

export async function updatePaymentRecord(id: number, input: Omit<PaymentRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  await ensurePosSchema()

  assertPositivePaymentAmount(input.amount)

  const db = useDb()
  const row = await db.transaction(async (tx) => {
    const [existing] = await tx.select({
      id: payments.id,
      documentId: payments.documentId,
      status: payments.status,
      amount: payments.amount
    }).from(payments).where(eq(payments.id, id)).limit(1)

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Payment not found'
      })
    }

    if (!canEditPayment(existing.status)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Cancelled or refunded payments require a dedicated correction flow.',
        data: { code: 'PAYMENT_IMMUTABLE' }
      })
    }

    if (existing.documentId !== input.documentId) {
      throw createError({
        statusCode: 409,
        statusMessage: 'A payment cannot be moved to another document',
        data: { code: 'PAYMENT_DOCUMENT_IMMUTABLE' }
      })
    }

    if (input.status === 'refunded') {
      throw createError({
        statusCode: 400,
        statusMessage: 'Refunds require a dedicated correction flow',
        data: { code: 'PAYMENT_CORRECTION_FLOW_REQUIRED' }
      })
    }

    if (!canChangePaymentStatus(existing.status, input.status)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'This payment status change requires a correction or refund',
        data: { code: 'PAYMENT_STATUS_CORRECTION_REQUIRED' }
      })
    }

    const document = await getPayablePaymentDocument(tx, input.documentId)

    if (input.customerId !== null && input.customerId !== document.customerId) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Payment customer must match the document customer',
        data: { code: 'PAYMENT_CUSTOMER_MISMATCH' }
      })
    }

    if (
      (existing.status === 'paid' && input.amount !== existing.amount)
      || (existing.status === 'pending' && (input.status === 'paid' || input.status === 'pending'))
    ) {
      await assertPaymentFitsDocument(tx, document, input.amount, existing.id)
    }

    const rows = await tx.update(payments)
      .set({
        customerId: document.customerId,
        documentId: input.documentId,
        method: input.method,
        status: input.status,
        amount: input.amount,
        paidAt: input.paidAt,
        notes: normalizeOptionalText(input.notes),
        updatedAt: new Date().toISOString()
      })
      .where(eq(payments.id, id))
      .returning()
    const updatedPayment = rows[0]

    if (!updatedPayment) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Payment not found'
      })
    }

    await syncDocumentStatus(updatedPayment.documentId, tx)

    if (existing.status === 'pending' && updatedPayment.status === 'paid' && document.ticketId) {
      await createPaymentRecordedEvent(tx, document, updatedPayment)
    }

    return updatedPayment
  })

  return mapPayment(row)
}

export async function deletePayment(id: number) {
  await ensurePosSchema()

  const db = useDb()
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(payments).where(eq(payments.id, id)).limit(1)
    const row = existing[0]

    if (!row) {
      return 0
    }

    if (!canDeletePayment(row.status)) {
      throw createError({
        statusCode: 409,
        statusMessage: 'Recorded payments cannot be deleted. Use a correction or refund instead.',
        data: { code: 'PAYMENT_IMMUTABLE' }
      })
    }

    const result = await tx.delete(payments).where(eq(payments.id, id))
    await syncDocumentStatus(row.documentId, tx)

    return result.rowsAffected
  })
}
