import { eq, sql } from 'drizzle-orm'
import { createError } from 'h3'
import type { z } from 'zod'
import { paymentClassifications, payments } from '~~/server/db/schema'
import { paymentCategories, type PaymentCategory, type PaymentCategoryAllocation, type PaymentClassification } from '~~/shared/types/payment-categories'
import { paymentAllocationsSchema, paymentClassificationSchema } from '~~/shared/validation/payment-categories'
import { useDb, type PosDatabaseExecutor } from '../turso'

type DocumentCategoryTotal = { category: string | null, total: number }

function allocatePayment(amount: number, totals: DocumentCategoryTotal[]): PaymentCategoryAllocation[] {
  if (!Number.isSafeInteger(amount) || amount === 0 || !totals.length) return []
  // Discounts reduce their category's weight. Missing categories and negative
  // category balances cannot be represented by positive payment allocations.
  if (totals.some(row => !paymentCategories.includes(row.category as PaymentCategory) || !Number.isSafeInteger(row.total) || row.total < 0)) return []
  const weights = totals.filter(row => row.total > 0)
    .sort((a, b) => paymentCategories.indexOf(a.category as PaymentCategory) - paymentCategories.indexOf(b.category as PaymentCategory))
  const total = weights.reduce((sum, row) => sum + BigInt(row.total), BigInt(0))
  if (total === BigInt(0)) return []

  // Largest remainders preserve every cent, including for deposits and refunds.
  // Integer arithmetic avoids losing precision when multiplying two amounts.
  const absoluteAmount = Math.abs(amount)
  const parts = weights.map((row) => {
    const numerator = BigInt(absoluteAmount) * BigInt(row.total)
    return { category: row.category as PaymentCategory, amount: Number(numerator / total), remainder: numerator % total }
  })
  const remaining = absoluteAmount - parts.reduce((sum, part) => sum + part.amount, 0)
  const ranked = [...parts].sort((a, b) => a.remainder === b.remainder ? 0 : a.remainder > b.remainder ? -1 : 1)
  for (let i = 0; i < remaining; i++) ranked[i]!.amount++
  return parts.filter(part => part.amount > 0).map(({ category, amount }) => ({ category, amount }))
}

export async function classifyReportPayments<T extends { id: number, documentId: number, amount: number }>(db: PosDatabaseExecutor, rows: T[]) {
  if (!rows.length) return [] as (T & { classification: PaymentClassification })[]
  const ids = JSON.stringify(rows.map(row => row.id))
  const stored = await db.select().from(paymentClassifications)
    .where(sql`${paymentClassifications.paymentId} IN (SELECT value FROM json_each(${ids}))`)
  const categoryTotals = await db.all<DocumentCategoryTotal & { documentId: number }>(sql`
    SELECT l.document_id AS "documentId", l.category_hint AS category, sum(l.line_total) AS total
    FROM document_lines l
    WHERE l.document_id IN (SELECT document_id FROM payments WHERE id IN (SELECT value FROM json_each(${ids})))
    GROUP BY l.document_id, l.category_hint
  `)
  const savedById = new Map(stored.map(row => [row.paymentId, row]))
  const totalsByDocument = new Map<number, DocumentCategoryTotal[]>()
  for (const row of categoryTotals) {
    const totals = totalsByDocument.get(row.documentId) || []
    totals.push(row)
    totalsByDocument.set(row.documentId, totals)
  }
  return rows.map((row) => {
    const saved = savedById.get(row.id)
    const manual = saved?.allocations != null
    const parsed = paymentAllocationsSchema.safeParse(saved?.allocations)
    // A stale allocation must never produce a report total different from cashflow.
    const valid = parsed.success && parsed.data.reduce((sum, item) => sum + item.amount, 0) === Math.abs(row.amount)
    const allocations = manual
      ? (valid ? parsed.data! : [])
      : allocatePayment(row.amount, totalsByDocument.get(row.documentId) || [])
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
