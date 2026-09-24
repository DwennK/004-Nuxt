import { and, eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type { z } from 'zod'
import { documentCredits, documents, payments } from '~~/server/db/schema'
import { refundPaymentSchema, voidPaymentSchema } from '~~/shared/validation/pos'
import { runIdempotentDocumentOperation } from '../idempotency'
import { useDb, type PosTransaction } from '../turso'
import { guardDossierWrite, type DossierWriteContext } from './dossiers'
import { getDocumentSettlement } from './document-settlement'
import { syncDocumentStatus } from './document-balances'
import { mapPayment } from './documents'
import { createTicketEvent } from './ticket-events'

function conflict(message: string, code: string): never {
  throw createError({ statusCode: 409, statusMessage: message, data: { code } })
}

async function originalPayment(tx: PosTransaction, id: number, dossier?: DossierWriteContext) {
  await guardDossierWrite(tx, [{ kind: 'payment', id }], dossier)
  const [payment] = await tx.select().from(payments).where(eq(payments.id, id))
  if (!payment) throw createError({ statusCode: 404, statusMessage: 'Paiement introuvable.' })
  if (payment.kind !== 'receipt' || payment.status !== 'paid') {
    conflict('Seul un encaissement effectué peut être remboursé ou annulé.', 'PAYMENT_NOT_RECEIPT')
  }
  const [document] = await tx.select().from(documents).where(eq(documents.id, payment.documentId))
  if (!document) throw createError({ statusCode: 404, statusMessage: 'Document introuvable.' })
  const [row] = await tx.select({ amount: sql<number>`coalesce(sum(${payments.amount}), 0)` })
    .from(payments).where(and(eq(payments.originalPaymentId, id), eq(payments.status, 'paid')))
  return { payment, document, remaining: payment.amount + Number(row?.amount || 0) }
}

export async function refundPayment(id: number, rawInput: z.infer<typeof refundPaymentSchema>, key: string, actor: string, dossier?: DossierWriteContext) {
  const input = refundPaymentSchema.parse(rawInput)
  const now = new Date().toISOString()
  if (Date.parse(input.paidAt) > Date.now() + 60_000) {
    throw createError({ statusCode: 400, statusMessage: 'La date du remboursement ne peut pas être dans le futur.' })
  }
  const result = await runIdempotentDocumentOperation({
    source: 'api_payment_refund', key, payload: { id, ...input }, database: useDb(),
    async execute(tx) {
      const { payment, document, remaining } = await originalPayment(tx, id, dossier)
      if (input.amount > remaining) conflict('Le montant dépasse le solde remboursable de ce paiement.', 'REFUND_EXCEEDS_PAYMENT')
      if (Date.parse(input.paidAt) < Date.parse(payment.paidAt)) {
        conflict('Le remboursement ne peut pas précéder l’encaissement.', 'REFUND_DATE_INVALID')
      }
      const settlement = await getDocumentSettlement(tx, document)
      const creditDocument = settlement.activeDocument
      if (input.effect === 'commercial' && (!creditDocument || creditDocument.type !== 'invoice' || input.amount > creditDocument.total - (creditDocument.creditedTotal || 0))) {
        conflict('La réduction commerciale nécessite une facture courante avec un montant suffisant. Pour un acompte, choisissez la correction du règlement.', 'REFUND_CREDIT_INVALID')
      }
      const [refund] = await tx.insert(payments).values({
        kind: 'refund', originalPaymentId: payment.id, customerId: payment.customerId,
        documentId: payment.documentId, method: input.method, status: 'paid', amount: -input.amount,
        paidAt: input.paidAt, notes: input.reason, recordedBy: actor, createdAt: now, updatedAt: now
      }).returning()
      if (!refund) throw createError({ statusCode: 500, statusMessage: 'Remboursement non enregistré.' })
      if (input.effect === 'commercial' && creditDocument) {
        await tx.insert(documentCredits).values({ documentId: creditDocument.id, paymentId: refund.id, amount: input.amount, reason: input.reason, createdAt: now })
      }
      await syncDocumentStatus(document.id, tx)
      if (document.ticketId) {
        await createTicketEvent({ ticketId: document.ticketId, kind: 'payment_recorded', label: 'Remboursement enregistré', note: input.reason,
          metadata: { paymentId: refund.id, originalPaymentId: id, amount: refund.amount, method: input.method, effect: input.effect, actor }, occurredAt: input.paidAt }, tx)
      }
      return { value: refund, documentId: document.id, resourceId: refund.id }
    },
    async replay(tx, receipt) {
      const [refund] = await tx.select().from(payments).where(and(eq(payments.id, receipt.resourceId), eq(payments.originalPaymentId, id)))
      if (!refund) conflict('Le remboursement enregistré est introuvable.', 'IDEMPOTENCY_RESOURCE_MISSING')
      return refund
    }
  })
  return mapPayment(result.value)
}

export async function voidPayment(id: number, rawInput: z.infer<typeof voidPaymentSchema>, key: string, actor: string, dossier?: DossierWriteContext) {
  const input = voidPaymentSchema.parse(rawInput)
  const result = await runIdempotentDocumentOperation({
    source: 'api_payment_void', key, payload: { id, ...input }, database: useDb(),
    async execute(tx) {
      const { payment, document, remaining } = await originalPayment(tx, id, dossier)
      if (remaining !== payment.amount) conflict('Un encaissement déjà remboursé ne peut pas être annulé.', 'PAYMENT_HAS_REFUNDS')
      const now = new Date().toISOString()
      const [voided] = await tx.update(payments).set({ status: 'cancelled', voidReason: input.reason, voidedAt: now, recordedBy: actor, updatedAt: now }).where(eq(payments.id, id)).returning()
      if (!voided) throw createError({ statusCode: 404, statusMessage: 'Paiement introuvable.' })
      await syncDocumentStatus(payment.documentId, tx)
      if (document.ticketId) await createTicketEvent({ ticketId: document.ticketId, kind: 'payment_recorded', label: 'Saisie de paiement annulée', note: input.reason, metadata: { paymentId: id, actor }, occurredAt: now }, tx)
      return { value: voided, documentId: payment.documentId, resourceId: id }
    },
    async replay(tx) {
      const [payment] = await tx.select().from(payments).where(eq(payments.id, id))
      if (!payment) conflict('Le paiement enregistré est introuvable.', 'IDEMPOTENCY_RESOURCE_MISSING')
      return payment
    }
  })
  return mapPayment(result.value)
}
