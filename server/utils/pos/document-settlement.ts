import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { documents, payments } from '~~/server/db/schema'
import { getActivePayableDocument } from '~~/shared/domain/documents/settlement'
import type { PosDatabaseExecutor } from '../turso'

/**
 * Build one settlement projection for the requested documents. Materialization
 * prevents SQLite from inlining the payment sums again for status/filter/order.
 * Receipt IDs are deduplicated before summing, and every payment lookup uses
 * document_id equality (never an OR over the whole paid-payment history).
 */
export function settlementCtes(source: SQL = sql`SELECT * FROM documents`): SQL {
  return sql`
    settlement_documents AS MATERIALIZED (${source}),
    settlement_operations AS MATERIALIZED (
      SELECT DISTINCT ticket_id, customer_id FROM settlement_documents WHERE ticket_id IS NOT NULL
    ),
    settlement_orders AS MATERIALIZED (
      SELECT d.id, d.ticket_id, d.customer_id
      FROM settlement_operations operation
      INNER JOIN documents d ON d.ticket_id = operation.ticket_id
        AND d.customer_id = operation.customer_id AND d.type = 'customer_order'
    ),
    settlement_receipts AS MATERIALIZED (
      SELECT id FROM settlement_documents UNION SELECT id FROM settlement_orders
    ),
    settlement_payment_totals AS MATERIALIZED (
      SELECT receipt.id, coalesce(sum(p.amount), 0) AS paid_amount
      FROM settlement_receipts receipt
      LEFT JOIN payments p ON p.document_id = receipt.id AND p.status = 'paid'
      GROUP BY receipt.id
    ),
    settlement_order_totals AS MATERIALIZED (
      SELECT d.ticket_id, d.customer_id, sum(p.paid_amount) AS paid_amount
      FROM settlement_orders d INNER JOIN settlement_payment_totals p ON p.id = d.id
      GROUP BY d.ticket_id, d.customer_id
    ),
    settlement_invoice_operations AS MATERIALIZED (
      SELECT operation.ticket_id, operation.customer_id
      FROM settlement_operations operation
      WHERE EXISTS (
        SELECT 1 FROM documents invoice
        WHERE invoice.ticket_id = operation.ticket_id AND invoice.customer_id = operation.customer_id
          AND invoice.type = 'invoice' AND invoice.status != 'cancelled'
      )
    ),
    settlement_values AS MATERIALIZED (
      SELECT d.*,
        (d.status != 'cancelled' AND d.type IN ('customer_order', 'invoice')
          AND (d.type = 'invoice' OR d.ticket_id IS NULL OR invoice.ticket_id IS NULL)) AS is_active,
        coalesce(direct.paid_amount, 0) + CASE WHEN d.type = 'invoice'
          THEN coalesce(deposit.paid_amount, 0) ELSE 0 END AS paid_amount
      FROM settlement_documents d
      LEFT JOIN settlement_payment_totals direct ON direct.id = d.id
      LEFT JOIN settlement_order_totals deposit ON deposit.ticket_id = d.ticket_id AND deposit.customer_id = d.customer_id
      LEFT JOIN settlement_invoice_operations invoice ON invoice.ticket_id = d.ticket_id AND invoice.customer_id = d.customer_id
    ),
    settled_documents AS MATERIALIZED (
      SELECT settlement_values.*,
        CASE WHEN is_active THEN max(total - paid_amount, 0) ELSE 0 END AS balance_due,
        CASE WHEN is_active AND total > 0 AND paid_amount >= total THEN 'paid'
          WHEN is_active AND status = 'paid' THEN 'issued' ELSE status END AS settlement_status
      FROM settlement_values
    )
  `
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
