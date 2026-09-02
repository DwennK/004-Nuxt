import { and, desc, eq, isNotNull, sum } from 'drizzle-orm'
import { createError } from 'h3'
import { documents, payments } from '~~/server/db/schema'
import { payableDocumentTypes } from '~~/shared/constants/pos'
import type { DocumentStatus, PaymentStatus } from '~~/shared/types/pos'
import { toIsoDateTime } from '~~/shared/utils/pos'
import type { PosDatabaseExecutor } from '../turso'
import { useDb } from '../turso'
import { ensurePosSchema } from './schema'

export async function syncDocumentStatus(documentId: number, executor?: PosDatabaseExecutor) {
  await ensurePosSchema()

  const db = executor || useDb()
  const paymentSummary = await db.select({
    paidTotal: sum(payments.amount)
  })
    .from(payments)
    .where(and(eq(payments.documentId, documentId), eq(payments.status, 'paid')))

  const documentRow = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1)
  const currentDocument = documentRow[0]

  if (!currentDocument) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Document not found'
    })
  }

  const paidTotal = Number(paymentSummary[0]?.paidTotal || 0)
  const isPayable = payableDocumentTypes.includes(currentDocument.type as (typeof payableDocumentTypes)[number])
  const nextStatus: DocumentStatus = currentDocument.status === 'cancelled'
    ? 'cancelled'
    : isPayable && paidTotal >= currentDocument.total && currentDocument.total > 0
      ? 'paid'
      : currentDocument.status === 'draft'
        ? 'draft'
        : 'issued'

  if (nextStatus !== currentDocument.status) {
    await db.update(documents)
      .set({
        status: nextStatus,
        updatedAt: toIsoDateTime()
      })
      .where(eq(documents.id, documentId))
  }

  return nextStatus
}

export async function getTicketPayments(ticketId: number) {
  await ensurePosSchema()

  const db = useDb()
  return db.select({
    id: payments.id,
    customerId: payments.customerId,
    documentId: payments.documentId,
    method: payments.method,
    status: payments.status,
    amount: payments.amount,
    paidAt: payments.paidAt,
    notes: payments.notes,
    createdAt: payments.createdAt,
    updatedAt: payments.updatedAt
  })
    .from(payments)
    .innerJoin(documents, eq(payments.documentId, documents.id))
    .where(and(eq(documents.ticketId, ticketId), isNotNull(documents.ticketId)))
    .orderBy(desc(payments.paidAt), desc(payments.id))
}

export async function getDocumentPaymentTotals(
  documentId: number,
  status: PaymentStatus = 'paid',
  executor?: PosDatabaseExecutor
) {
  await ensurePosSchema()

  const db = executor || useDb()
  const totals = await db.select({
    total: sum(payments.amount)
  })
    .from(payments)
    .where(and(eq(payments.documentId, documentId), eq(payments.status, status)))

  return Number(totals[0]?.total || 0)
}
