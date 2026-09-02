import { and, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import { documents, payments } from '~~/server/db/schema'
import { paymentMethodLabels } from '~~/shared/constants/pos'
import { evaluateDocumentPayment } from '~~/shared/domain/payments/rules'
import { normalizeOptionalText } from '~~/shared/lib/text'
import type { PaymentMethod } from '~~/shared/types/pos'
import { isPayableDocumentType } from '~~/shared/utils/pos'
import type { PosTransaction } from '../turso'
import { createTicketEvent, syncDocumentStatus } from './core'

type PaymentDocument = Pick<typeof documents.$inferSelect,
  'id' | 'type' | 'status' | 'customerId' | 'total' | 'ticketId' | 'documentNumber'>

export async function getPayablePaymentDocument(tx: PosTransaction, documentId: number) {
  const [document] = await tx.select().from(documents).where(eq(documents.id, documentId)).limit(1)

  if (!document) {
    throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  }

  assertPayableDocumentType(document)
  return document
}

function assertPayableDocumentType(document: PaymentDocument) {
  if (!isPayableDocumentType(document.type)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only customer orders and invoices can receive payments'
    })
  }
}

export async function assertPaymentFitsDocument(
  tx: PosTransaction,
  document: PaymentDocument,
  requestedAmount: number | undefined,
  excludedPaymentId?: number
) {
  const [summary] = await tx.select({
    paidTotal: sql<number>`coalesce(sum(case when ${payments.status} = 'paid' then ${payments.amount} else 0 end), 0)`
  }).from(payments).where(and(
    eq(payments.documentId, document.id),
    excludedPaymentId ? sql`${payments.id} <> ${excludedPaymentId}` : undefined
  ))
  const paidTotal = Number(summary?.paidTotal || 0)
  const amount = requestedAmount ?? Math.max(document.total - paidTotal, 0)
  const result = evaluateDocumentPayment({
    documentStatus: document.status,
    documentTotal: document.total,
    paidTotal,
    amount
  })

  if (result.ok) {
    return amount
  }

  const messages = {
    DOCUMENT_CANCELLED: 'Cancelled documents cannot receive payments',
    DOCUMENT_ALREADY_PAID: 'Document is already fully paid',
    PAYMENT_AMOUNT_INVALID: 'Payment amount must be a positive integer number of cents',
    PAYMENT_EXCEEDS_BALANCE: 'Payment amount cannot exceed the remaining balance'
  } satisfies Record<typeof result.code, string>

  throw createError({
    statusCode: result.code === 'DOCUMENT_CANCELLED' || result.code === 'DOCUMENT_ALREADY_PAID' ? 409 : 400,
    statusMessage: messages[result.code],
    data: { code: result.code, remainingBalance: result.balanceBeforePayment }
  })
}

export async function createPaymentRecordedEvent(
  tx: PosTransaction,
  document: PaymentDocument,
  payment: typeof payments.$inferSelect
) {
  if (!document.ticketId || payment.status !== 'paid') {
    return
  }

  await createTicketEvent({
    ticketId: document.ticketId,
    kind: 'payment_recorded',
    label: 'Paiement enregistré',
    note: payment.notes,
    metadata: {
      paymentId: payment.id,
      documentId: document.id,
      documentNumber: document.documentNumber,
      documentType: document.type,
      amount: payment.amount,
      method: payment.method,
      methodLabel: paymentMethodLabels[payment.method]
    },
    occurredAt: payment.paidAt
  }, tx)
}

// Caller owns the transaction and idempotency receipt. Never opens a nested transaction.
export async function recordDocumentPayment(tx: PosTransaction, document: PaymentDocument, input: {
  method: PaymentMethod
  status: 'pending' | 'paid'
  amount?: number
  paidAt: string
  notes?: string | null
}) {
  assertPayableDocumentType(document)
  const amount = await assertPaymentFitsDocument(tx, document, input.amount)
  const now = new Date().toISOString()
  const [payment] = await tx.insert(payments).values({
    customerId: document.customerId,
    documentId: document.id,
    method: input.method,
    status: input.status,
    amount,
    paidAt: input.paidAt,
    notes: normalizeOptionalText(input.notes),
    createdAt: now,
    updatedAt: now
  }).returning()

  if (!payment) {
    throw createError({ statusCode: 500, statusMessage: 'Could not create payment' })
  }

  await syncDocumentStatus(document.id, tx)
  await createPaymentRecordedEvent(tx, document, payment)
  return payment
}
