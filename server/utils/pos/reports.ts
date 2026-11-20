import { getCommercialCategories, getCommercialLeaders } from './commercial-reports'
import { settlementCtes } from './document-settlement'
import { classifyReportPayments } from './payment-classifications'
import { summarizePaymentCategories } from '~~/shared/utils/payment-categories'
import { and, desc, eq, gte, lt, lte, sql, type SQL } from 'drizzle-orm'
import { parseDate } from '@internationalized/date'
import { customers, documents, payments, tickets } from '~~/server/db/schema'
import { lineCategoryLabels, paymentMethods } from '~~/shared/constants/pos'
import type { DailySummary, ReportsCategories, ReportsLeaders, ReportsOverview } from '~~/shared/types/pos'
import { businessTimeZone, formatDate, toDateInputValue, buildZonedDayRange as buildDayRange } from '~~/shared/utils/pos'
import { useDb } from '../turso'
import { ensurePosSchema } from '~~/server/utils/pos/schema'

function shiftIsoDate(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year!, month! - 1, day! + days, 12, 0, 0))

  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0')
  ].join('-')
}

function formatDayLabel(date: string) {
  return formatDate(date)
}

function formatDetailedDayLabel(date: string) {
  return formatDate(date)
}

function formatMonthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat('fr-FR', {
    month: '2-digit',
    timeZone: businessTimeZone
  }).format(new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)))
}

function formatMonthTooltipLabel(year: number, month: number) {
  return new Intl.DateTimeFormat('fr-FR', {
    month: '2-digit',
    year: 'numeric',
    timeZone: businessTimeZone
  }).format(new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)))
}

function buildDailyPaymentBuckets(
  startDate: string,
  endDate: string,
  labelFormatter: (date: string) => string,
  tooltipFormatter: (date: string) => string
) {
  const buckets: ReportsOverview['paymentPeriods'][number]['buckets'] = []

  for (let current = startDate; current <= endDate; current = shiftIsoDate(current, 1)) {
    buckets.push({
      date: current,
      label: labelFormatter(current),
      tooltipLabel: tooltipFormatter(current),
      total: 0,
      cash: 0,
      cardTwint: 0,
      bankTransfer: 0,
      stripe: 0,
      shopify: 0
    })
  }

  return buckets
}

function buildMonthlyPaymentBuckets(date: string): ReportsOverview['paymentPeriods'][number]['buckets'] {
  const [year] = date.split('-').map(Number)

  return Array.from({ length: 12 }, (_, index): ReportsOverview['paymentPeriods'][number]['buckets'][number] => {
    const monthNumber = index + 1

    return {
      date: `${year!}-${String(monthNumber).padStart(2, '0')}`,
      label: formatMonthLabel(year!, monthNumber),
      tooltipLabel: formatMonthTooltipLabel(year!, monthNumber),
      total: 0,
      cash: 0,
      cardTwint: 0,
      bankTransfer: 0,
      stripe: 0,
      shopify: 0
    }
  })
}

function buildAnnualPaymentBuckets(date: string, count = 5): ReportsOverview['paymentPeriods'][number]['buckets'] {
  const [year] = date.split('-').map(Number)
  const startYear = year! - (count - 1)

  return Array.from({ length: count }, (_, index): ReportsOverview['paymentPeriods'][number]['buckets'][number] => {
    const bucketYear = startYear + index

    return {
      date: String(bucketYear),
      label: String(bucketYear),
      tooltipLabel: String(bucketYear),
      total: 0,
      cash: 0,
      cardTwint: 0,
      bankTransfer: 0,
      stripe: 0,
      shopify: 0
    }
  })
}

type PaymentAggregationBucket = Pick<
  ReportsOverview['paymentPeriods'][number]['buckets'][number],
  'total' | 'cash' | 'cardTwint' | 'bankTransfer' | 'stripe' | 'shopify'
>

function applyPaymentAmount(
  bucket: PaymentAggregationBucket | undefined,
  method: (typeof paymentMethods)[number],
  amount: number
) {
  if (!bucket) {
    return
  }

  bucket.total += amount

  switch (method) {
    case 'cash':
      bucket.cash += amount
      break
    case 'card_twint':
      bucket.cardTwint += amount
      break
    case 'bank_transfer':
      bucket.bankTransfer += amount
      break
    case 'stripe':
      bucket.stripe += amount
      break
    case 'shopify':
      bucket.shopify += amount
      break
  }
}

type TurnoverRow = {
  category: ReportsOverview['turnoverByCategory'][number]['category'] | null
  total: number | string | null
}

type TopCustomerRow = {
  customerId: number
  customerName: string
  total: number | string | null
  documentCount: number | string | null
}

type TopItemRow = {
  label: string
  category: ReportsOverview['topItems'][number]['category']
  total: number | string | null
  quantity: number | string | null
}

// Direct invoice receipts and inherited quote/order deposits are disjoint sets.
// Start with the selected cashflow period, then settle only its invoice candidates.
export function paidReportCtes(start: string, end: string): SQL {
  return sql`
    report_period_payments AS MATERIALIZED (
      SELECT document_id, sum(amount) AS amount, max(paid_at) AS paid_at
      FROM payments WHERE status = 'paid' AND paid_at >= ${start} AND paid_at <= ${end}
      GROUP BY document_id
    ),
    report_period_receipts AS MATERIALIZED (
      SELECT d.id, p.amount, p.paid_at
      FROM report_period_payments p INNER JOIN documents d ON d.id = p.document_id
      WHERE d.type = 'invoice'
      UNION ALL
      SELECT invoice.id, p.amount, p.paid_at
      FROM report_period_payments p
      INNER JOIN documents original ON original.id = p.document_id AND original.type IN ('quote', 'customer_order')
      INNER JOIN documents invoice ON invoice.ticket_id = original.ticket_id
        AND invoice.customer_id = original.customer_id AND invoice.sav_id IS original.sav_id AND invoice.type = 'invoice'
    ),
    report_invoice_period AS MATERIALIZED (
      SELECT id, sum(amount) AS period_paid_amount, max(paid_at) AS period_paid_at
      FROM report_period_receipts GROUP BY id
    ),
    ${settlementCtes(sql`SELECT documents.* FROM report_invoice_period
      INNER JOIN documents ON documents.id = report_invoice_period.id`)},
    report_paid_documents AS MATERIALIZED (
      SELECT d.*, period.period_paid_amount, period.period_paid_at
      FROM settled_documents d INNER JOIN report_invoice_period period ON period.id = d.id
      WHERE d.settlement_status = 'paid'
    )
  `
}

function normalizeDateRange(startDate: string, endDate: string) {
  return startDate <= endDate
    ? { startDate, endDate }
    : { startDate: endDate, endDate: startDate }
}

// Keep the candidates for both rankings before limiting the visible list in the UI.
function rankingCandidates<T>(rows: T[], byValue: (a: T, b: T) => number, byCount: (a: T, b: T) => number) {
  return [...new Set([
    ...[...rows].sort(byValue).slice(0, 8),
    ...[...rows].sort(byCount).slice(0, 8)
  ])]
}

export function projectReportsLeaders(topCustomerRows: TopCustomerRow[], topItemRows: TopItemRow[]) {
  const customers = topCustomerRows.map(row => ({
    customerId: row.customerId,
    customerName: row.customerName,
    total: Number(row.total || 0),
    documentCount: Number(row.documentCount || 0)
  }))
  const items = topItemRows.map(row => ({
    key: `${row.category || 'uncategorized'}:${row.label}`,
    label: row.label,
    category: row.category,
    total: Number(row.total || 0),
    quantity: Number(row.quantity || 0)
  }))
  return {
    topCustomers: rankingCandidates(customers,
      (a, b) => b.total - a.total || b.documentCount - a.documentCount || a.customerName.localeCompare(b.customerName, 'fr-CH'),
      (a, b) => b.documentCount - a.documentCount || b.total - a.total || a.customerName.localeCompare(b.customerName, 'fr-CH')),
    topItems: rankingCandidates(items,
      (a, b) => b.total - a.total || b.quantity - a.quantity || a.label.localeCompare(b.label, 'fr-CH'),
      (a, b) => b.quantity - a.quantity || b.total - a.total || a.label.localeCompare(b.label, 'fr-CH'))
  }
}

async function getTopLeaders(db: ReturnType<typeof useDb>, start: string, end: string) {
  const rows = await getCommercialLeaders(db, start, end)
  return {
    ...projectReportsLeaders(rows.customers, rows.items),
    totalCommercial: rows.customers.reduce((sum, row) => sum + row.total, 0)
  }
}

export async function getEndOfDaySummary(date: string): Promise<DailySummary> {
  await ensurePosSchema()

  const db = useDb()
  const { start, end } = buildDayRange(date)
  const customerNameValue = sql<string>`coalesce(nullif(trim(${customers.companyName}), ''), nullif(${customers.name}, ''), 'Unknown customer')`

  const [paymentRows, paidDocumentRows, unpaidDocumentRows, openTicketRows, openedTodayRows, closedTodayRows] = await Promise.all([
    db.select({
      id: payments.id,
      documentId: payments.documentId,
      documentNumber: documents.documentNumber,
      customerName: customerNameValue,
      method: payments.method,
      amount: payments.amount,
      paidAt: payments.paidAt
    })
      .from(payments)
      .leftJoin(documents, eq(payments.documentId, documents.id))
      .leftJoin(customers, eq(documents.customerId, customers.id))
      .where(and(eq(payments.status, 'paid'), gte(payments.paidAt, start), lte(payments.paidAt, end)))
      .orderBy(desc(payments.paidAt), desc(payments.id)),
    db.all<DailySummary['paidDocuments'][number]>(sql`
      WITH ${paidReportCtes(start, end)}
      SELECT d.id, d.document_number AS "documentNumber", d.type, d.settlement_status AS status,
        ${customerNameValue} AS "customerName", d.total,
        d.period_paid_amount AS "paidAmountToday", d.period_paid_at AS "paidAt"
      FROM report_paid_documents d INNER JOIN customers ON customers.id = d.customer_id
      ORDER BY d.period_paid_at DESC
    `),
    db.all<{ id: number, documentNumber: string, customerName: string, total: number, creditedTotal: number, paidAmount: number }>(sql`
      WITH ${settlementCtes(sql`SELECT * FROM documents
        WHERE type = 'invoice' AND status != 'cancelled' AND issued_at >= ${start} AND issued_at <= ${end}`)}
      SELECT d.id, d.document_number AS "documentNumber", ${customerNameValue} AS "customerName",
        d.total, d.credited_total AS "creditedTotal", d.paid_amount AS "paidAmount"
      FROM settled_documents d INNER JOIN customers ON customers.id = d.customer_id
      ORDER BY d.issued_at DESC, d.id DESC
    `),
    db.select({ count: sql<number>`count(*)` })
      .from(tickets)
      .where(sql`${tickets.status} not in ('closed', 'cancelled')`),
    db.select({ count: sql<number>`count(*)` })
      .from(tickets)
      .where(and(gte(tickets.openedAt, start), lte(tickets.openedAt, end))),
    db.select({ count: sql<number>`count(*)` })
      .from(tickets)
      .where(and(eq(tickets.status, 'closed'), gte(tickets.closedAt, start), lte(tickets.closedAt, end)))
  ])

  const turnoverRows = await getCommercialCategories(db, start, end)

  const totalsByMethod = new Map(paymentMethods.map(method => [method, {
    total: 0,
    transactionCount: 0
  }]))

  for (const row of paymentRows) {
    const totals = totalsByMethod.get(row.method)!
    totals.total += row.amount
    totals.transactionCount += 1
  }

  return {
    date,
    totalPaid: paymentRows.reduce((total, row) => total + row.amount, 0),
    payments: await classifyReportPayments(db, paymentRows),
    paidDocuments: paidDocumentRows.map(row => ({
      id: row.id,
      documentNumber: row.documentNumber,
      type: row.type,
      status: row.status,
      customerName: row.customerName,
      total: row.total,
      paidAmountToday: Number(row.paidAmountToday || 0),
      paidAt: row.paidAt
    })),
    unpaidDocuments: unpaidDocumentRows
      .map((row) => {
        const paidAmount = Number(row.paidAmount || 0)
        const balanceDue = Math.max(row.total - Number(row.creditedTotal || 0) - paidAmount, 0)

        return {
          id: row.id,
          documentNumber: row.documentNumber,
          customerName: row.customerName,
          total: row.total,
          paidAmount,
          balanceDue
        }
      })
      .filter(document => document.balanceDue > 0),
    totalsByMethod: paymentMethods
      .map(method => ({
        method,
        total: totalsByMethod.get(method)?.total || 0,
        transactionCount: totalsByMethod.get(method)?.transactionCount || 0
      }))
      .filter(item => item.transactionCount > 0),
    ticketStats: {
      openCount: Number(openTicketRows[0]?.count || 0),
      openedToday: Number(openedTodayRows[0]?.count || 0),
      closedToday: Number(closedTodayRows[0]?.count || 0)
    },
    turnoverByCategory: turnoverRows
      .map(row => ({
        category: row.category,
        total: Number(row.total || 0)
      }))
  }
}

type ReportsOverviewProjectionInput = {
  date: string
  paymentCategories: ReportsOverview['paymentCategories']
  weeklyPaymentRows: Array<{
    amount: number
    method: (typeof paymentMethods)[number]
    paidAt: string
  }>
  monthlyPaymentRows: Array<{
    bucket: string
    method: (typeof paymentMethods)[number]
    total: number | string | null
  }>
  yearlyPaymentRows: Array<{
    bucket: string
    method: (typeof paymentMethods)[number]
    total: number | string | null
  }>
  openTicketCount: number | string | null
  openedRows: Array<{ openedAt: string }>
  closedRows: Array<{ closedAt: string | null }>
  topCustomers: ReportsLeaders['topCustomers']
  topItems: ReportsLeaders['topItems']
  turnoverRows: TurnoverRow[]
}

function projectTicketFlow(
  startDate: string,
  endDate: string,
  { openedRows, closedRows }: Pick<ReportsOverviewProjectionInput, 'openedRows' | 'closedRows'>,
  interval: ReportsCategories['ticketInterval'] = 'day'
) {
  const keyLength = { day: 10, month: 7, year: 4 }[interval]
  const endKey = endDate.slice(0, keyLength)
  const first = parseDate(startDate)
  const firstBucket = interval === 'day' ? first : first.set({ day: 1, month: interval === 'year' ? 1 : first.month })
  const step = interval === 'day' ? { days: 1 } : interval === 'month' ? { months: 1 } : { years: 1 }
  const buckets = new Map<string, ReportsCategories['ticketFlow'][number]>()
  for (let cursor = firstBucket; cursor.toString().slice(0, keyLength) <= endKey; cursor = cursor.add(step)) {
    const date = cursor.toString().slice(0, keyLength)
    const label = interval === 'day'
      ? formatDayLabel(date)
      : interval === 'month' ? formatMonthTooltipLabel(cursor.year, cursor.month) : date
    buckets.set(date, { date, label, opened: 0, closed: 0 })
    if (date === endKey) break
  }
  for (const [field, timestamps] of [
    ['opened', openedRows.map(row => row.openedAt)],
    ['closed', closedRows.map(row => row.closedAt)]
  ] as const) {
    for (const timestamp of timestamps) {
      if (!timestamp) continue
      const day = toDateInputValue(new Date(timestamp), businessTimeZone)
      const bucket = buckets.get(day.slice(0, keyLength))
      if (bucket) bucket[field] += 1
    }
  }
  return [...buckets.values()]
}

function projectTurnoverCategories(rows: TurnoverRow[]): ReportsOverview['turnoverByCategory'] {
  return rows.map(row => ({
    category: row.category,
    label: row.category ? lineCategoryLabels[row.category] : 'Sans catégorie',
    total: Number(row.total || 0)
  }))
}

export function projectReportsOverview(input: ReportsOverviewProjectionInput): ReportsOverview {
  const startDate = shiftIsoDate(input.date, -6)
  const endDate = input.date
  const weeklyBuckets = buildDailyPaymentBuckets(startDate, endDate, formatDayLabel, formatDetailedDayLabel)
  const monthlyBuckets = buildMonthlyPaymentBuckets(input.date)
  const yearlyBuckets = buildAnnualPaymentBuckets(input.date)
  const weeklyBucketsMap = new Map(weeklyBuckets.map(item => [item.date, item]))
  const monthlyBucketsMap = new Map(monthlyBuckets.map(item => [item.date, item]))
  const yearlyBucketsMap = new Map(yearlyBuckets.map(item => [item.date, item]))

  for (const payment of input.weeklyPaymentRows) {
    const dayKey = toDateInputValue(new Date(payment.paidAt), businessTimeZone)
    applyPaymentAmount(weeklyBucketsMap.get(dayKey), payment.method, Number(payment.amount || 0))
  }

  for (const payment of input.monthlyPaymentRows) {
    applyPaymentAmount(monthlyBucketsMap.get(payment.bucket), payment.method, Number(payment.total || 0))
  }

  for (const payment of input.yearlyPaymentRows) {
    applyPaymentAmount(yearlyBucketsMap.get(payment.bucket), payment.method, Number(payment.total || 0))
  }

  const paymentsByDay = weeklyBuckets.map(({ date: bucketDate, label, total, cash, cardTwint, bankTransfer, stripe, shopify }) => ({
    date: bucketDate,
    label,
    total,
    cash,
    cardTwint,
    bankTransfer,
    stripe,
    shopify
  }))
  const totalPaid = weeklyBuckets.reduce((sum, item) => sum + item.total, 0)
  const paidToday = weeklyBucketsMap.get(input.date)?.total || 0

  return {
    range: {
      startDate,
      endDate,
      labels: paymentsByDay.map(item => item.label)
    },
    kpis: {
      totalPaid,
      paidToday,
      averagePerDay: Math.round(totalPaid / paymentsByDay.length),
      openTickets: Number(input.openTicketCount || 0)
    },
    paymentsByDay,
    paymentPeriods: [{
      key: 'week',
      label: '7 jours',
      description: 'Encaissements et remboursements sur les sept jours affichés.',
      buckets: weeklyBuckets
    }, {
      key: 'month',
      label: 'Mois',
      description: 'Total mensuel de janvier à décembre pour l’année sélectionnée.',
      buckets: monthlyBuckets
    }, {
      key: 'years',
      label: 'Années',
      description: 'Total annuel sur les 5 dernières années.',
      buckets: yearlyBuckets
    }],
    turnoverByCategory: projectTurnoverCategories(input.turnoverRows),
    paymentCategories: input.paymentCategories,
    topCustomers: input.topCustomers,
    topItems: input.topItems,
    ticketFlowByDay: projectTicketFlow(startDate, endDate, input)
  }
}

function getPaidRows(db: ReturnType<typeof useDb>, start: string, end: string) {
  const until = new Date(Date.parse(end) + 1).toISOString()
  return db.select({
    id: payments.id,
    documentId: payments.documentId,
    amount: payments.amount,
    method: payments.method,
    paidAt: payments.paidAt
  })
    .from(payments)
    .where(and(eq(payments.status, 'paid'), gte(payments.paidAt, start), lt(payments.paidAt, until)))
}

async function getTicketFlowRows(db: ReturnType<typeof useDb>, start: string, end: string) {
  const until = new Date(Date.parse(end) + 1).toISOString()
  const [openedRows, closedRows] = await Promise.all([
    db.select({ openedAt: tickets.openedAt })
      .from(tickets)
      .where(and(gte(tickets.openedAt, start), lt(tickets.openedAt, until))),
    db.select({ closedAt: tickets.closedAt })
      .from(tickets)
      .where(and(eq(tickets.status, 'closed'), gte(tickets.closedAt, start), lt(tickets.closedAt, until)))
  ])
  return { openedRows, closedRows }
}

export async function getReportsCategories(firstDate: string, lastDate: string): Promise<ReportsCategories> {
  await ensurePosSchema()

  const db = useDb()
  const { startDate, endDate } = normalizeDateRange(firstDate, lastDate)
  const { start } = buildDayRange(startDate)
  const { end } = buildDayRange(endDate)
  const from = parseDate(startDate)
  const to = parseDate(endDate)
  const monthSpan = (to.year - from.year) * 12 + to.month - from.month
  const ticketInterval = monthSpan >= 24 ? 'year' : from.add({ days: 45 }).compare(to) <= 0 ? 'month' : 'day'
  const [paymentRows, turnoverRows, ticketRows] = await Promise.all([
    getPaidRows(db, start, end),
    getCommercialCategories(db, start, end),
    getTicketFlowRows(db, start, end)
  ])
  return {
    paymentCategories: summarizePaymentCategories(await classifyReportPayments(db, paymentRows)),
    turnoverByCategory: projectTurnoverCategories(turnoverRows),
    ticketInterval,
    ticketFlow: projectTicketFlow(startDate, endDate, ticketRows, ticketInterval)
  }
}

export async function getReportsOverview(date: string, options: { includeLeaders?: boolean } = {}): Promise<ReportsOverview> {
  await ensurePosSchema()

  const db = useDb()
  const startDate = shiftIsoDate(date, -6)
  const endDate = date
  const { start } = buildDayRange(startDate)
  const { end } = buildDayRange(endDate)
  const selectedYear = Number(date.slice(0, 4))
  // UTC bounds for each Swiss calendar month, including daylight saving time.
  // Joining ranges keeps the payment date index usable and aggregates in SQL.
  const monthRanges = Array.from({ length: 60 }, (_, index) => {
    const year = selectedYear - 4 + Math.floor(index / 12)
    const month = index % 12 + 1
    const bucket = `${year}-${String(month).padStart(2, '0')}`
    const nextMonth = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, '0')}`
    return sql`(${bucket}, ${buildDayRange(`${bucket}-01`).start}, ${buildDayRange(`${nextMonth}-01`).start})`
  })

  const [weeklyPaymentRows, periodPaymentRows, openTicketRows, ticketRows] = await Promise.all([
    getPaidRows(db, start, end),
    db.all<{ bucket: string, method: (typeof paymentMethods)[number], total: number }>(sql`
      WITH month_ranges(bucket, start_at, end_at) AS (VALUES ${sql.join(monthRanges, sql`, `)})
      SELECT r.bucket, p.method, sum(p.amount) AS total
      FROM month_ranges r INNER JOIN payments p
        ON p.paid_at >= r.start_at AND p.paid_at < r.end_at AND p.status = 'paid'
      GROUP BY r.bucket, p.method ORDER BY r.bucket, p.method
    `),
    db.select({ count: sql<number>`count(*)` })
      .from(tickets)
      .where(sql`${tickets.status} not in ('closed', 'cancelled')`),
    getTicketFlowRows(db, start, end)
  ])

  const monthlyPaymentRows = periodPaymentRows
    .filter(row => row.bucket.startsWith(`${selectedYear}-`))
  const yearlyTotals = new Map<string, { bucket: string, method: (typeof paymentMethods)[number], total: number }>()
  for (const row of periodPaymentRows) {
    const bucket = row.bucket.slice(0, 4)
    const key = `${bucket}:${row.method}`
    const current = yearlyTotals.get(key) || { bucket, method: row.method, total: 0 }
    current.total += Number(row.total || 0)
    yearlyTotals.set(key, current)
  }
  const yearlyPaymentRows = [...yearlyTotals.values()]
  const [{ topCustomers, topItems }, turnoverRows]: [Pick<ReportsLeaders, 'topCustomers' | 'topItems'>, TurnoverRow[]] = await Promise.all([
    options.includeLeaders === false ? Promise.resolve({ topCustomers: [], topItems: [] }) : getTopLeaders(db, start, end),
    getCommercialCategories(db, start, end)
  ])

  return projectReportsOverview({
    date,
    paymentCategories: summarizePaymentCategories(await classifyReportPayments(db, weeklyPaymentRows)),
    weeklyPaymentRows,
    monthlyPaymentRows,
    yearlyPaymentRows,
    openTicketCount: openTicketRows[0]?.count || 0,
    ...ticketRows,
    topCustomers,
    topItems,
    turnoverRows
  })
}

export async function getReportsLeaders(startDate: string, endDate: string): Promise<ReportsLeaders> {
  await ensurePosSchema()

  const db = useDb()
  const normalizedRange = normalizeDateRange(startDate, endDate)
  const { start } = buildDayRange(normalizedRange.startDate)
  const { end } = buildDayRange(normalizedRange.endDate)

  const leaders = await getTopLeaders(db, start, end)

  return {
    range: normalizedRange,
    ...leaders
  }
}
