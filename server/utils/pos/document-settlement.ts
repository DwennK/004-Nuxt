import { and, desc, eq, inArray, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { documents, payments } from '~~/server/db/schema'
import { getActivePayableDocument } from '~~/shared/domain/documents/settlement'
import type { PosDatabaseExecutor } from '../turso'

type DocumentRef = { id: SQLWrapper, type: SQLWrapper, status: SQLWrapper, ticketId: SQLWrapper, customerId: SQLWrapper, total: SQLWrapper }

export function settlementSql(ref: DocumentRef = documents) {
  const active = sql`(${ref.status} != 'cancelled' AND ${ref.type} IN ('customer_order', 'invoice') AND (
    ${ref.type} = 'invoice' OR ${ref.ticketId} IS NULL OR NOT EXISTS (
      SELECT 1 FROM documents settlement_invoice
      WHERE settlement_invoice.ticket_id = ${ref.ticketId} AND settlement_invoice.customer_id = ${ref.customerId}
        AND settlement_invoice.type = 'invoice' AND settlement_invoice.status != 'cancelled'
    )
  ))`
  const paymentScope = (paymentDocumentId: SQLWrapper): SQL => sql`(${paymentDocumentId} = ${ref.id} OR (
    ${ref.type} = 'invoice' AND ${ref.ticketId} IS NOT NULL AND ${paymentDocumentId} IN (
      SELECT settlement_order.id FROM documents settlement_order
      WHERE settlement_order.ticket_id = ${ref.ticketId} AND settlement_order.customer_id = ${ref.customerId}
        AND settlement_order.type = 'customer_order'
    )
  ))`
  const paidAmount = sql<number>`coalesce((SELECT sum(settlement_payment.amount) FROM payments settlement_payment
    WHERE settlement_payment.status = 'paid' AND ${paymentScope(sql`settlement_payment.document_id`)}), 0)`
  const balanceDue = sql<number>`CASE WHEN ${active} THEN max(${ref.total} - ${paidAmount}, 0) ELSE 0 END`
  const status = sql<'draft' | 'issued' | 'paid' | 'cancelled'>`CASE WHEN ${active} AND ${ref.total} > 0 AND ${paidAmount} >= ${ref.total} THEN 'paid'
    WHEN ${active} AND ${ref.status} = 'paid' THEN 'issued' ELSE ${ref.status} END`
  return { active, paidAmount, balanceDue, paymentScope, status }
}

export function settlementSqlForAlias(alias: 'd' | 'report_document') {
  // Quote table and column separately (SQLite treats "d.id" as a single name).
  const ref = (name: string) => sql`${sql.identifier(alias)}.${sql.identifier(name)}`
  return settlementSql({ id: ref('id'), type: ref('type'), status: ref('status'), ticketId: ref('ticket_id'), customerId: ref('customer_id'), total: ref('total') })
}

export async function getDocumentSettlement(executor: PosDatabaseExecutor, document: typeof documents.$inferSelect) {
  const related = document.ticketId
    ? await executor.select().from(documents).where(and(eq(documents.ticketId, document.ticketId), eq(documents.customerId, document.customerId))).orderBy(desc(documents.id))
    : [document]
  const activeDocument = getActivePayableDocument(related)
  // Keep each receipt on its original document; the invoice also includes order deposits.
  const paymentDocumentIds = document.type === 'invoice'
    ? [...new Set([document.id, ...related.filter(row => row.type === 'customer_order').map(row => row.id)])]
    : [document.id]
  const paymentRows = await executor.select().from(payments).where(inArray(payments.documentId, paymentDocumentIds)).orderBy(desc(payments.paidAt), desc(payments.id))
  const paidAmount = paymentRows.filter(payment => payment.status === 'paid').reduce((total, payment) => total + payment.amount, 0)
  const isPayable = activeDocument?.id === document.id
  return { activeDocument, paymentDocumentIds, payments: paymentRows, paidAmount, isPayable, balanceDue: isPayable ? Math.max(document.total - paidAmount, 0) : 0 }
}
