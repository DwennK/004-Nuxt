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
      SELECT DISTINCT ticket_id, customer_id, sav_id FROM settlement_documents WHERE ticket_id IS NOT NULL
    ),
    settlement_deposits AS MATERIALIZED (
      SELECT d.id, d.type, d.ticket_id, d.customer_id, d.sav_id
      FROM settlement_operations operation
      INNER JOIN documents d ON d.ticket_id = operation.ticket_id
        AND d.customer_id = operation.customer_id AND d.sav_id IS operation.sav_id AND d.type IN ('quote', 'customer_order')
    ),
    settlement_receipts AS MATERIALIZED (
      SELECT id FROM settlement_documents UNION SELECT id FROM settlement_deposits
    ),
    settlement_payment_totals AS MATERIALIZED (
      SELECT receipt.id, coalesce(sum(p.amount), 0) AS paid_amount
      FROM settlement_receipts receipt
      LEFT JOIN payments p ON p.document_id = receipt.id AND p.status = 'paid'
      GROUP BY receipt.id
    ),
    settlement_deposit_totals AS MATERIALIZED (
      SELECT d.ticket_id, d.customer_id, d.sav_id, d.type, sum(p.paid_amount) AS paid_amount
      FROM settlement_deposits d INNER JOIN settlement_payment_totals p ON p.id = d.id
      GROUP BY d.ticket_id, d.customer_id, d.sav_id, d.type
    ),
    settlement_active_stages AS MATERIALIZED (
      SELECT operation.ticket_id, operation.customer_id, operation.sav_id,
        CASE WHEN EXISTS (
          SELECT 1 FROM documents d WHERE d.ticket_id = operation.ticket_id AND d.customer_id = operation.customer_id
            AND d.sav_id IS operation.sav_id AND d.type = 'invoice' AND d.status != 'cancelled'
        ) THEN 2 WHEN EXISTS (
          SELECT 1 FROM documents d WHERE d.ticket_id = operation.ticket_id AND d.customer_id = operation.customer_id
            AND d.sav_id IS operation.sav_id AND d.type = 'customer_order' AND d.status != 'cancelled'
        ) THEN 1 ELSE 0 END AS stage
      FROM settlement_operations operation
    ),
    settlement_values AS MATERIALIZED (
      SELECT d.*,
        (d.status != 'cancelled' AND d.type IN ('quote', 'customer_order', 'invoice')
          AND (d.ticket_id IS NULL OR active.stage = CASE d.type WHEN 'invoice' THEN 2 WHEN 'customer_order' THEN 1 ELSE 0 END)) AS is_active,
        coalesce(direct.paid_amount, 0) + CASE WHEN d.type IN ('customer_order', 'invoice')
          THEN coalesce(quote.paid_amount, 0) ELSE 0 END + CASE WHEN d.type = 'invoice'
          THEN coalesce(deposit.paid_amount, 0) ELSE 0 END AS paid_amount
      FROM settlement_documents d
      LEFT JOIN settlement_payment_totals direct ON direct.id = d.id
      LEFT JOIN settlement_deposit_totals quote ON quote.ticket_id = d.ticket_id AND quote.customer_id = d.customer_id AND quote.sav_id IS d.sav_id AND quote.type = 'quote'
      LEFT JOIN settlement_deposit_totals deposit ON deposit.ticket_id = d.ticket_id AND deposit.customer_id = d.customer_id AND deposit.sav_id IS d.sav_id AND deposit.type = 'customer_order'
      LEFT JOIN settlement_active_stages active ON active.ticket_id = d.ticket_id AND active.customer_id = d.customer_id AND active.sav_id IS d.sav_id
    ),
    settled_documents AS MATERIALIZED (
      SELECT settlement_values.*,
        CASE WHEN is_active THEN max(total - coalesce(credited_total, 0) - paid_amount, 0) ELSE 0 END AS balance_due,
        CASE WHEN is_active AND total > 0 AND paid_amount + coalesce(credited_total, 0) >= total THEN 'paid'
          WHEN is_active AND status = 'paid' THEN 'issued' ELSE status END AS settlement_status
      FROM settlement_values
    )
  `
}

export async function getDocumentSettlement(executor: PosDatabaseExecutor, document: typeof documents.$inferSelect) {
  const related = document.ticketId
    ? await executor.select().from(documents).where(and(eq(documents.ticketId, document.ticketId), eq(documents.customerId, document.customerId), sql`${documents.savId} IS ${document.savId ?? null}`)).orderBy(desc(documents.id))
    : [document]
  const activeDocument = document.type === 'sav' ? null : getActivePayableDocument(related)
  // Carry earlier-stage receipts forward once, preserving their original document.
  const inheritedTypes = document.type === 'invoice' ? ['quote', 'customer_order'] : document.type === 'customer_order' ? ['quote'] : []
  const paymentDocumentIds = [...new Set([document.id, ...related.filter(row => inheritedTypes.includes(row.type)).map(row => row.id)])]
  const paymentRows = await executor.select().from(payments).where(inArray(payments.documentId, paymentDocumentIds)).orderBy(desc(payments.paidAt), desc(payments.id))
  const paidAmount = paymentRows.filter(payment => payment.status === 'paid').reduce((total, payment) => total + payment.amount, 0)
  const isPayable = activeDocument?.id === document.id
  return { activeDocument, paymentDocumentIds, payments: paymentRows, paidAmount, isPayable, balanceDue: isPayable ? Math.max(document.total - (document.creditedTotal || 0) - paidAmount, 0) : 0 }
}
