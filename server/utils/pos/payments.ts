import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { paymentMethodLabels } from '~~/shared/constants/pos'
import { customers, documents, payments } from '~~/server/db/schema'
import type { PaymentListItem, PaymentRecord } from '~~/shared/types/pos'
import { buildZonedDayRange, isPayableDocumentType } from '~~/shared/utils/pos'
import type { PosDatabaseExecutor } from '../turso'
import { useDb } from '../turso'
import { createTicketEvent, ensurePosSchema, normalizeOptionalText, syncDocumentStatus } from './core'
import { mapPayment } from './documents'

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

async function assertPayablePaymentDocument(documentId: number, executor?: PosDatabaseExecutor) {
  const db = executor || useDb()
  const [document] = await db.select({
    id: documents.id,
    type: documents.type,
    ticketId: documents.ticketId,
    documentNumber: documents.documentNumber
  }).from(documents).where(eq(documents.id, documentId)).limit(1)

  if (!document) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Document not found'
    })
  }

  if (!isPayableDocumentType(document.type)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only customer orders and invoices can receive payments'
    })
  }

  return document
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
  method?: string
  status?: string
  dateFrom?: string
  dateTo?: string
  documentId?: number
  customerId?: number
}) {
  await ensurePosSchema()

  const db = useDb()
  const dateFrom = filters?.dateFrom ? normalizePaymentDateFrom(filters.dateFrom) : undefined
  const dateTo = filters?.dateTo ? normalizePaymentDateTo(filters.dateTo) : undefined
  const rows = await db.select({
    payment: payments,
    customer: customers,
    documentNumber: documents.documentNumber,
    documentType: documents.type
  })
    .from(payments)
    .innerJoin(documents, eq(payments.documentId, documents.id))
    .leftJoin(customers, eq(payments.customerId, customers.id))
    .where(and(
      filters?.method ? eq(payments.method, filters.method as typeof payments.$inferSelect.method) : undefined,
      filters?.status ? eq(payments.status, filters.status as typeof payments.$inferSelect.status) : undefined,
      filters?.documentId ? eq(payments.documentId, filters.documentId) : undefined,
      filters?.customerId ? eq(payments.customerId, filters.customerId) : undefined,
      dateFrom ? gte(payments.paidAt, dateFrom) : undefined,
      dateTo ? lte(payments.paidAt, dateTo) : undefined
    ))
    .orderBy(desc(payments.paidAt), desc(payments.id))

  return rows.map((row): PaymentListItem => ({
    ...mapPayment(row.payment),
    customerName: row.customer ? (row.customer.companyName || `${row.customer.firstName} ${row.customer.lastName}`) : null,
    documentNumber: row.documentNumber,
    documentType: row.documentType
  }))
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

export async function createPaymentRecord(input: Omit<PaymentRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  await ensurePosSchema()

  assertPositivePaymentAmount(input.amount)

  const db = useDb()
  const payment = await db.transaction(async (tx) => {
    const document = await assertPayablePaymentDocument(input.documentId, tx)
    const now = new Date().toISOString()
    const rows = await tx.insert(payments).values({
      customerId: input.customerId,
      documentId: input.documentId,
      method: input.method,
      status: input.status,
      amount: input.amount,
      paidAt: input.paidAt,
      notes: normalizeOptionalText(input.notes),
      createdAt: now,
      updatedAt: now
    }).returning()
    const createdPayment = rows[0]

    if (!createdPayment) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Could not create payment'
      })
    }

    await syncDocumentStatus(input.documentId, tx)

    if (document.ticketId && input.status === 'paid') {
      await createTicketEvent({
        ticketId: document.ticketId,
        kind: 'payment_recorded',
        label: 'Paiement enregistré',
        note: input.notes,
        metadata: {
          paymentId: createdPayment.id,
          documentId: document.id,
          documentNumber: document.documentNumber,
          documentType: document.type,
          amount: input.amount,
          method: input.method,
          methodLabel: paymentMethodLabels[input.method]
        },
        occurredAt: input.paidAt
      }, tx)
    }

    return createdPayment
  })

  return mapPayment(payment)
}

export async function updatePaymentRecord(id: number, input: Omit<PaymentRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  await ensurePosSchema()

  assertPositivePaymentAmount(input.amount)

  const db = useDb()
  const row = await db.transaction(async (tx) => {
    const [existing] = await tx.select({
      id: payments.id,
      documentId: payments.documentId
    }).from(payments).where(eq(payments.id, id)).limit(1)

    if (!existing) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Payment not found'
      })
    }

    await assertPayablePaymentDocument(input.documentId, tx)

    const rows = await tx.update(payments)
      .set({
        customerId: input.customerId,
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

    if (existing.documentId !== updatedPayment.documentId) {
      await syncDocumentStatus(existing.documentId, tx)
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

    const result = await tx.delete(payments).where(eq(payments.id, id))
    await syncDocumentStatus(row.documentId, tx)

    return result.rowsAffected
  })
}
