import { sql } from 'drizzle-orm'
import type { CommercialReport, CommercialTotals, LineCategoryHint } from '~~/shared/types/pos'
import { buildZonedDayRange, businessTimeZone, toDateInputValue } from '~~/shared/utils/pos'
import type { PosDatabaseExecutor } from '../turso'

// One invoice event at issue time, one negative event per commercial credit at
// recording time. Payments and settlement status never determine the period.
export function commercialEventsCte(start: string, end: string) {
  const until = new Date(Date.parse(end) + 1).toISOString()
  return sql`commercial_events AS MATERIALIZED (
    SELECT 'invoice:' || d.id AS event_key, d.id AS document_id, d.customer_id,
      strftime('%Y-%m-%dT%H:%M:%fZ', d.issued_at) AS occurred_at, d.total AS invoiced_total, 0 AS credit_total,
      1 AS invoice_count, 0 AS credit_count, NULL AS credit_id
    FROM documents d
    WHERE d.type = 'invoice' AND d.status IN ('issued', 'paid')
      AND julianday(d.issued_at) >= julianday(${start}) AND julianday(d.issued_at) < julianday(${until})
    UNION ALL
    SELECT 'credit:' || c.id, d.id, d.customer_id, strftime('%Y-%m-%dT%H:%M:%fZ', c.created_at),
      0, c.amount, 0, 1, c.id
    FROM document_credits c INNER JOIN documents d ON d.id = c.document_id
    WHERE d.type = 'invoice' AND d.status IN ('issued', 'paid')
      AND julianday(c.created_at) >= julianday(${start}) AND julianday(c.created_at) < julianday(${until})
  )`
}

// Allocate each credit as the change in cumulative allocations. This conserves
// cents per event AND reverses every original line exactly after a full credit,
// even when several one-cent reductions cross reporting-period boundaries.
export function commercialLinesCtes(start: string, end: string) {
  return sql`${commercialEventsCte(start, end)},
    commercial_documents AS MATERIALIZED (
      SELECT d.id, d.total FROM documents d
      WHERE d.id IN (SELECT document_id FROM commercial_events)
    ), commercial_source_lines AS (
      SELECT l.id, l.document_id, l.label, l.category_hint, l.quantity, l.line_total, 0 AS residual
      FROM document_lines l INNER JOIN commercial_documents d ON d.id = l.document_id
      UNION ALL
      SELECT 0, d.id, 'Montant sans ligne détaillée', NULL, 0,
        d.total - coalesce(sum(l.line_total), 0), 1
      FROM commercial_documents d LEFT JOIN document_lines l ON l.document_id = d.id
      GROUP BY d.id HAVING count(l.id) = 0 OR d.total != coalesce(sum(l.line_total), 0)
    ), commercial_line_totals AS (
      SELECT l.*, d.total AS document_total,
        sum(l.line_total) OVER (PARTITION BY l.document_id ORDER BY l.residual, l.id ROWS UNBOUNDED PRECEDING) AS cumulative_line_total
      FROM commercial_source_lines l INNER JOIN commercial_documents d ON d.id = l.document_id
    ), commercial_credit_totals AS (
      SELECT c.id, c.amount,
        sum(c.amount) OVER (PARTITION BY c.document_id ORDER BY julianday(c.created_at), c.id ROWS UNBOUNDED PRECEDING) AS cumulative_credit
      FROM document_credits c INNER JOIN commercial_documents d ON d.id = c.document_id
    ), commercial_event_lines AS (
      SELECT e.event_key, e.document_id, e.customer_id, e.occurred_at, l.label, l.category_hint,
        CASE WHEN e.invoice_count = 1 THEN l.quantity ELSE 0 END AS quantity,
        CASE WHEN e.invoice_count = 1 THEN l.line_total ELSE 0 END AS invoiced_total,
        CASE WHEN e.credit_id IS NULL OR l.document_total = 0 THEN 0 ELSE CAST(
          round(l.cumulative_line_total * 1.0 * c.cumulative_credit / l.document_total)
          - round((l.cumulative_line_total - l.line_total) * 1.0 * c.cumulative_credit / l.document_total)
          - round(l.cumulative_line_total * 1.0 * (c.cumulative_credit - c.amount) / l.document_total)
          + round((l.cumulative_line_total - l.line_total) * 1.0 * (c.cumulative_credit - c.amount) / l.document_total)
          AS INTEGER) END AS credit_total
      FROM commercial_events e INNER JOIN commercial_line_totals l ON l.document_id = e.document_id
      LEFT JOIN commercial_credit_totals c ON c.id = e.credit_id
    )`
}

export async function getCommercialCategories(db: PosDatabaseExecutor, start: string, end: string) {
  return db.all<{ category: LineCategoryHint | null, invoicedTotal: number, creditTotal: number, total: number }>(sql`
    WITH ${commercialLinesCtes(start, end)}
    SELECT category_hint AS category, sum(invoiced_total) AS "invoicedTotal",
      sum(credit_total) AS "creditTotal", sum(invoiced_total - credit_total) AS total
    FROM commercial_event_lines GROUP BY category_hint ORDER BY total DESC, category_hint
  `)
}

export async function getCommercialLeaders(db: PosDatabaseExecutor, start: string, end: string) {
  const rows = await db.all<{ kind: 'customer' | 'item', customerId: number | null, label: string, category: LineCategoryHint | null, total: number, count: number }>(sql`
      WITH ${commercialLinesCtes(start, end)}
      SELECT 'customer' AS kind, e.customer_id AS "customerId", coalesce(nullif(trim(c.company_name), ''), c.name) AS label,
        NULL AS category, sum(e.invoiced_total - e.credit_total) AS total, sum(e.invoice_count) AS count
      FROM commercial_events e INNER JOIN customers c ON c.id = e.customer_id GROUP BY e.customer_id
      UNION ALL
      SELECT 'item', NULL, label, category_hint, sum(invoiced_total - credit_total), sum(quantity)
      FROM commercial_event_lines GROUP BY label, category_hint
    `)
  return {
    customers: rows.filter(row => row.kind === 'customer').map(row => ({ customerId: row.customerId!, customerName: row.label, total: row.total, documentCount: row.count })),
    items: rows.filter(row => row.kind === 'item').map(row => ({ label: row.label, category: row.category, total: row.total, quantity: row.count }))
  }
}

function emptyTotals(): CommercialTotals {
  return { invoicedTotal: 0, creditTotal: 0, total: 0, invoiceCount: 0, creditCount: 0 }
}

export function commercialReportRange(date: string, period: CommercialReport['period']) {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7))
  if (period === 'day') return { startDate: date, endDate: date }
  if (period === 'year') return { startDate: `${year}-01-01`, endDate: `${year}-12-31` }
  return { startDate: `${date.slice(0, 7)}-01`, endDate: `${date.slice(0, 7)}-${new Date(Date.UTC(year, month, 0, 12)).getUTCDate()}` }
}

export async function getCommercialReport(db: PosDatabaseExecutor, date: string, period: CommercialReport['period']): Promise<CommercialReport> {
  const range = commercialReportRange(date, period)
  const { start } = buildZonedDayRange(range.startDate)
  const { end } = buildZonedDayRange(range.endDate)
  // One SQL statement gives totals and categories the same database snapshot,
  // including when an operator records a new invoice while the report loads.
  const rows = await db.all<{ kind: 'event' | 'category', occurredAt: string | null, category: LineCategoryHint | null, invoicedTotal: number, creditTotal: number, invoiceCount: number, creditCount: number }>(sql`
      WITH ${commercialLinesCtes(start, end)}
      SELECT 'event' AS kind, occurred_at AS "occurredAt", NULL AS category, invoiced_total AS "invoicedTotal", credit_total AS "creditTotal",
        invoice_count AS "invoiceCount", credit_count AS "creditCount" FROM commercial_events
      UNION ALL
      SELECT 'category', NULL, category_hint, sum(invoiced_total), sum(credit_total), 0, 0
      FROM commercial_event_lines GROUP BY category_hint
    `)
  const events = rows.filter(row => row.kind === 'event')
  const categories = rows.filter(row => row.kind === 'category').map(row => ({
    category: row.category, invoicedTotal: row.invoicedTotal, creditTotal: row.creditTotal, total: row.invoicedTotal - row.creditTotal
  })).sort((a, b) => b.total - a.total || (a.category || '').localeCompare(b.category || ''))
  const bucketCount = period === 'year' ? 12 : period === 'month' ? Number(range.endDate.slice(8, 10)) : 1
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    date: period === 'year'
      ? `${date.slice(0, 4)}-${String(index + 1).padStart(2, '0')}`
      : period === 'month' ? `${date.slice(0, 7)}-${String(index + 1).padStart(2, '0')}` : date,
    ...emptyTotals()
  }))
  const byDate = new Map(buckets.map(bucket => [bucket.date, bucket]))
  const totals = emptyTotals()
  for (const event of events) {
    const day = toDateInputValue(new Date(event.occurredAt!), businessTimeZone)
    const bucket = byDate.get(period === 'year' ? day.slice(0, 7) : day)!
    for (const target of [totals, bucket]) {
      target.invoicedTotal += event.invoicedTotal
      target.creditTotal += event.creditTotal
      target.total += event.invoicedTotal - event.creditTotal
      target.invoiceCount += event.invoiceCount
      target.creditCount += event.creditCount
    }
  }
  return { period, range, totals, buckets, categories }
}
