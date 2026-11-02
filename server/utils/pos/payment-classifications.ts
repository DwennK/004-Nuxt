import { eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type { z } from 'zod'
import { paymentClassifications, payments } from '~~/server/db/schema'
import { paymentCategories, type PaymentCategory, type PaymentClassification } from '~~/shared/types/payment-categories'
import { paymentAllocationsSchema, paymentClassificationSchema } from '~~/shared/validation/payment-categories'
import { useDb, type PosDatabaseExecutor } from '../turso'

export async function classifyReportPayments<T extends { id: number, documentId: number, amount: number }>(db: PosDatabaseExecutor, rows: T[]) {
  if (!rows.length) return [] as (T & { classification: PaymentClassification })[]
  const ids = JSON.stringify(rows.map(row => row.id))
  const stored = await db.select().from(paymentClassifications)
    .where(sql`${paymentClassifications.paymentId} IN (SELECT value FROM json_each(${ids}))`)
  const hints = await db.all<{ documentId: number, category: string | null }>(sql`
    SELECT l.document_id AS "documentId",
      CASE WHEN count(*) = count(l.category_hint) AND count(DISTINCT l.category_hint) = 1
        THEN min(l.category_hint) ELSE NULL END AS category
    FROM document_lines l
    WHERE l.document_id IN (SELECT document_id FROM payments WHERE id IN (SELECT value FROM json_each(${ids})))
    GROUP BY l.document_id
  `)
  const savedById = new Map(stored.map(row => [row.paymentId, row]))
  const hintsByDocument = new Map(hints.map(row => [row.documentId, row.category]))
  return rows.map((row) => {
    const saved = savedById.get(row.id)
    const hint = hintsByDocument.get(row.documentId)
    const manual = saved?.allocations != null
    const parsed = paymentAllocationsSchema.safeParse(saved?.allocations)
    // A stale allocation must never produce a report total different from cashflow.
    const valid = parsed.success && parsed.data.reduce((sum, item) => sum + item.amount, 0) === Math.abs(row.amount)
    const allocations = manual
      ? (valid ? parsed.data! : [])
      : (row.amount !== 0 && hint && paymentCategories.includes(hint as PaymentCategory)
          ? [{ category: hint as PaymentCategory, amount: Math.abs(row.amount) }]
          : [])
    return { ...row, classification: { allocations, source: manual ? 'manual' as const : 'automatic' as const, revision: saved?.revision || 0 } }
  })
}

export async function updatePaymentClassification(id: number, rawInput: z.infer<typeof paymentClassificationSchema>, userId: number) {
  const input = paymentClassificationSchema.parse(rawInput)
  return useDb().transaction(async (tx) => {
    const [payment] = await tx.select({ id: payments.id, amount: payments.amount, status: payments.status }).from(payments).where(eq(payments.id, id))
    if (!payment) throw createError({ statusCode: 404, statusMessage: 'Paiement introuvable.' })
    const [current] = await tx.select().from(paymentClassifications).where(eq(paymentClassifications.paymentId, id))
    if (payment.status !== 'paid' || payment.amount !== input.expectedAmount || (current?.revision || 0) !== input.expectedRevision) {
      throw createError({ statusCode: 409, statusMessage: 'Ce mouvement a changé. Rechargez la journée avant de réessayer.' })
    }
    if (input.allocations?.length && input.allocations.reduce((sum, item) => sum + item.amount, 0) !== Math.abs(payment.amount)) {
      throw createError({ statusCode: 400, statusMessage: 'La répartition doit correspondre exactement au montant du mouvement.' })
    }
    const values = { allocations: input.allocations, revision: (current?.revision || 0) + 1, updatedAt: new Date().toISOString(), updatedBy: userId }
    if (current) await tx.update(paymentClassifications).set(values).where(eq(paymentClassifications.paymentId, id))
    else await tx.insert(paymentClassifications).values({ paymentId: id, ...values })
    return { revision: values.revision }
  }, { behavior: 'immediate' })
}
