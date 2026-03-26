import { and, desc, eq, gte, lte } from 'drizzle-orm'
import { paymentMethodLabels } from '~~/shared/constants/pos'
import { customers, documents, payments } from '~~/server/db/schema'
import type { PaymentListItem, PaymentRecord } from '~~/shared/types/pos'
import { useDb } from '../turso'
import { createTicketEvent, ensurePosSchema, normalizeOptionalText, syncDocumentStatus } from './core'
import { mapPayment } from './documents'

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
      filters?.dateFrom ? gte(payments.paidAt, filters.dateFrom) : undefined,
      filters?.dateTo ? lte(payments.paidAt, filters.dateTo) : undefined
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

  const db = useDb()
  const now = new Date().toISOString()
  const rows = await db.insert(payments).values({
    customerId: input.customerId,
    documentId: input.documentId,
    method: input.method,
    status: input.status,
    amount: input.amount,
    paidAt: input.paidAt,
    reference: normalizeOptionalText(input.reference),
    notes: normalizeOptionalText(input.notes),
    createdAt: now,
    updatedAt: now
  }).returning()

  await syncDocumentStatus(input.documentId)

  const documentRows = await db.select({
    id: documents.id,
    ticketId: documents.ticketId,
    documentNumber: documents.documentNumber,
    type: documents.type
  }).from(documents).where(eq(documents.id, input.documentId)).limit(1)
  const document = documentRows[0]
  const payment = rows[0]

  if (document?.ticketId && payment && input.status === 'paid') {
    await createTicketEvent({
      ticketId: document.ticketId,
      kind: 'payment_recorded',
      label: 'Paiement enregistré',
      note: input.notes,
      metadata: {
        paymentId: payment.id,
        documentId: document.id,
        documentNumber: document.documentNumber,
        documentType: document.type,
        amount: input.amount,
        method: input.method,
        methodLabel: paymentMethodLabels[input.method],
        reference: input.reference || null
      },
      occurredAt: input.paidAt
    })
  }

  return mapPayment(rows[0]!)
}

export async function updatePaymentRecord(id: number, input: Omit<PaymentRecord, 'id' | 'createdAt' | 'updatedAt'>) {
  await ensurePosSchema()

  const db = useDb()
  const rows = await db.update(payments)
    .set({
      customerId: input.customerId,
      documentId: input.documentId,
      method: input.method,
      status: input.status,
      amount: input.amount,
      paidAt: input.paidAt,
      reference: normalizeOptionalText(input.reference),
      notes: normalizeOptionalText(input.notes),
      updatedAt: new Date().toISOString()
    })
    .where(eq(payments.id, id))
    .returning()

  const row = rows[0]

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Payment not found'
    })
  }

  await syncDocumentStatus(row.documentId)

  return mapPayment(row)
}

export async function deletePayment(id: number) {
  await ensurePosSchema()

  const db = useDb()
  const existing = await db.select().from(payments).where(eq(payments.id, id)).limit(1)
  const row = existing[0]

  if (!row) {
    return 0
  }

  const result = await db.delete(payments).where(eq(payments.id, id))
  await syncDocumentStatus(row.documentId)

  return result.rowsAffected
}
