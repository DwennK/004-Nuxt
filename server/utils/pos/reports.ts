import { and, desc, eq, gte, inArray, lte, sql, sum } from 'drizzle-orm'
import { catalogItems, customers, documentLines, documents, payments, tickets } from '~~/server/db/schema'
import { lineCategoryLabels, paymentMethods } from '~~/shared/constants/pos'
import type { DailySummary, ReportsLeaders, ReportsOverview } from '~~/shared/types/pos'
import { businessTimeZone, toDateInputValue } from '~~/shared/utils/pos'
import { useDb } from '../turso'
import { buildDayRange, ensurePosSchema } from './core'

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
  const [year, month, day] = date.split('-').map(Number)

  return new Intl.DateTimeFormat('fr-CH', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    timeZone: businessTimeZone
  }).format(new Date(Date.UTC(year!, month! - 1, day!, 12, 0, 0)))
}

function formatDetailedDayLabel(date: string) {
  const [year, month, day] = date.split('-').map(Number)

  return new Intl.DateTimeFormat('fr-CH', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: businessTimeZone
  }).format(new Date(Date.UTC(year!, month! - 1, day!, 12, 0, 0)))
}

function formatMonthLabel(year: number, month: number) {
  return new Intl.DateTimeFormat('fr-CH', {
    month: 'short',
    timeZone: businessTimeZone
  }).format(new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)))
}

function formatMonthTooltipLabel(year: number, month: number) {
  return new Intl.DateTimeFormat('fr-CH', {
    month: 'long',
    year: 'numeric',
    timeZone: businessTimeZone
  }).format(new Date(Date.UTC(year, month - 1, 1, 12, 0, 0)))
}

function buildYearStart(date: string) {
  const [year] = date.split('-').map(Number)
  return `${year}-01-01`
}

function buildYearEnd(date: string) {
  const [year] = date.split('-').map(Number)
  return `${year}-12-31`
}

function buildRollingYearStart(date: string, count: number) {
  const [year] = date.split('-').map(Number)
  return `${year! - (count - 1)}-01-01`
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
      stripe: 0
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
      stripe: 0
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
      stripe: 0
    }
  })
}

type PaymentAggregationBucket = Pick<
  ReportsOverview['paymentPeriods'][number]['buckets'][number],
  'total' | 'cash' | 'cardTwint' | 'bankTransfer' | 'stripe'
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

function normalizeDateRange(startDate: string, endDate: string) {
  return startDate <= endDate
    ? { startDate, endDate }
    : { startDate: endDate, endDate: startDate }
}

async function getTopLeaders(
  db: ReturnType<typeof useDb>,
  paidDocumentIds: number[]
): Promise<Pick<ReportsLeaders, 'topCustomers' | 'topItems'>> {
  if (!paidDocumentIds.length) {
    return {
      topCustomers: [],
      topItems: []
    }
  }

  const [topCustomerRows, topItemRows]: [TopCustomerRow[], TopItemRow[]] = await Promise.all([
    db.select({
      customerId: customers.id,
      customerName: sql<string>`coalesce(${customers.companyName}, ${customers.firstName} || ' ' || ${customers.lastName})`,
      total: sum(documents.total),
      documentCount: sql<number>`count(${documents.id})`
    })
      .from(documents)
      .innerJoin(customers, eq(documents.customerId, customers.id))
      .where(inArray(documents.id, paidDocumentIds))
      .groupBy(customers.id),
    db.select({
      label: sql<string>`coalesce(${catalogItems.name}, ${documentLines.label})`,
      category: documentLines.categoryHint,
      total: sum(documentLines.lineTotal),
      quantity: sum(documentLines.quantity)
    })
      .from(documentLines)
      .leftJoin(catalogItems, eq(documentLines.catalogItemId, catalogItems.id))
      .where(inArray(documentLines.documentId, paidDocumentIds))
      .groupBy(
        sql`coalesce(${catalogItems.name}, ${documentLines.label})`,
        documentLines.categoryHint
      )
  ])

  return {
    topCustomers: topCustomerRows
      .map(row => ({
        customerId: row.customerId,
        customerName: row.customerName,
        total: Number(row.total || 0),
        documentCount: Number(row.documentCount || 0)
      }))
      .sort((left, right) =>
        right.total - left.total
        || right.documentCount - left.documentCount
        || left.customerName.localeCompare(right.customerName, 'fr-CH')
      )
      .slice(0, 8),
    topItems: topItemRows
      .map(row => ({
        key: `${row.category || 'uncategorized'}:${row.label}`,
        label: row.label,
        category: row.category,
        total: Number(row.total || 0),
        quantity: Number(row.quantity || 0)
      }))
      .sort((left, right) =>
        right.total - left.total
        || right.quantity - left.quantity
        || left.label.localeCompare(right.label, 'fr-CH')
      )
      .slice(0, 8)
  }
}

export async function getEndOfDaySummary(date: string): Promise<DailySummary> {
  await ensurePosSchema()

  const db = useDb()
  const { start, end } = buildDayRange(date)

  const [paymentTotalRows, totalsByMethodRows, paidDocumentRows, openTicketRows, openedTodayRows, closedTodayRows] = await Promise.all([
    db.select({ total: sum(payments.amount) })
      .from(payments)
      .where(and(eq(payments.status, 'paid'), gte(payments.paidAt, start), lte(payments.paidAt, end))),
    db.select({
      method: payments.method,
      total: sum(payments.amount),
      transactionCount: sql<number>`count(*)`
    })
      .from(payments)
      .where(and(eq(payments.status, 'paid'), gte(payments.paidAt, start), lte(payments.paidAt, end)))
      .groupBy(payments.method)
      .orderBy(payments.method),
    db.select({
      id: documents.id,
      documentNumber: documents.documentNumber,
      type: documents.type,
      status: documents.status,
      customerName: sql<string>`coalesce(${customers.companyName}, ${customers.firstName} || ' ' || ${customers.lastName})`,
      total: documents.total,
      paidAmountToday: sum(payments.amount),
      paidAt: sql<string>`max(${payments.paidAt})`
    })
      .from(payments)
      .innerJoin(documents, eq(payments.documentId, documents.id))
      .innerJoin(customers, eq(documents.customerId, customers.id))
      .where(and(
        eq(payments.status, 'paid'),
        eq(documents.status, 'paid'),
        inArray(documents.type, ['invoice']),
        gte(payments.paidAt, start),
        lte(payments.paidAt, end)
      ))
      .groupBy(documents.id, customers.id)
      .orderBy(desc(sql`max(${payments.paidAt})`)),
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

  const paidDocumentIds = paidDocumentRows.map(row => row.id)
  const turnoverRows = paidDocumentIds.length
    ? await db.select({
        category: documentLines.categoryHint,
        total: sum(documentLines.lineTotal)
      })
        .from(documentLines)
        .where(and(
          inArray(documentLines.documentId, paidDocumentIds),
          sql`${documentLines.categoryHint} is not null`
        ))
        .groupBy(documentLines.categoryHint)
    : []

  const totalsByMethod = new Map(paymentMethods.map(method => [method, {
    total: 0,
    transactionCount: 0
  }]))

  for (const row of totalsByMethodRows) {
    totalsByMethod.set(row.method, {
      total: Number(row.total || 0),
      transactionCount: Number(row.transactionCount || 0)
    })
  }

  return {
    date,
    totalPaid: Number(paymentTotalRows[0]?.total || 0),
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
    totalsByMethod: paymentMethods
      .map(method => ({
        method,
        total: totalsByMethod.get(method)?.total || 0,
        transactionCount: totalsByMethod.get(method)?.transactionCount || 0
      }))
      .filter(item => item.total > 0),
    ticketStats: {
      openCount: Number(openTicketRows[0]?.count || 0),
      openedToday: Number(openedTodayRows[0]?.count || 0),
      closedToday: Number(closedTodayRows[0]?.count || 0)
    },
    turnoverByCategory: turnoverRows
      .filter(row => row.category)
      .map(row => ({
        category: row.category!,
        total: Number(row.total || 0)
      }))
  }
}

export async function getReportsOverview(date: string): Promise<ReportsOverview> {
  await ensurePosSchema()

  const db = useDb()
  const rangeDates = Array.from({ length: 7 }, (_, index) => shiftIsoDate(date, index - 6))
  const startDate = rangeDates[0]!
  const endDate = rangeDates[rangeDates.length - 1]!
  const yearStartDate = buildYearStart(date)
  const yearEndDate = buildYearEnd(date)
  const rollingYearStartDate = buildRollingYearStart(date, 5)
  const { start } = buildDayRange(startDate)
  const { end } = buildDayRange(endDate)
  const { start: selectedYearStart } = buildDayRange(yearStartDate)
  const { end: selectedYearEnd } = buildDayRange(yearEndDate)
  const { start: rollingYearStart } = buildDayRange(rollingYearStartDate)
  const monthBucketSql = sql<string>`substr(${payments.paidAt}, 1, 7)`
  const yearBucketSql = sql<string>`substr(${payments.paidAt}, 1, 4)`

  const [weeklyPaymentRows, monthlyPaymentRows, yearlyPaymentRows, paidDocumentRows, openTicketRows, openedRows, closedRows] = await Promise.all([
    db.select({
      amount: payments.amount,
      method: payments.method,
      paidAt: payments.paidAt
    })
      .from(payments)
      .where(and(eq(payments.status, 'paid'), gte(payments.paidAt, start), lte(payments.paidAt, end))),
    db.select({
      bucket: monthBucketSql,
      method: payments.method,
      total: sum(payments.amount)
    })
      .from(payments)
      .where(and(eq(payments.status, 'paid'), gte(payments.paidAt, selectedYearStart), lte(payments.paidAt, selectedYearEnd)))
      .groupBy(monthBucketSql, payments.method)
      .orderBy(monthBucketSql, payments.method),
    db.select({
      bucket: yearBucketSql,
      method: payments.method,
      total: sum(payments.amount)
    })
      .from(payments)
      .where(and(eq(payments.status, 'paid'), gte(payments.paidAt, rollingYearStart), lte(payments.paidAt, selectedYearEnd)))
      .groupBy(yearBucketSql, payments.method)
      .orderBy(yearBucketSql, payments.method),
    db.select({
      documentId: documents.id
    })
      .from(payments)
      .innerJoin(documents, eq(payments.documentId, documents.id))
      .where(and(
        eq(payments.status, 'paid'),
        eq(documents.status, 'paid'),
        inArray(documents.type, ['invoice']),
        gte(payments.paidAt, start),
        lte(payments.paidAt, end)
      ))
      .groupBy(documents.id),
    db.select({ count: sql<number>`count(*)` })
      .from(tickets)
      .where(sql`${tickets.status} not in ('closed', 'cancelled')`),
    db.select({ openedAt: tickets.openedAt })
      .from(tickets)
      .where(and(gte(tickets.openedAt, start), lte(tickets.openedAt, end))),
    db.select({ closedAt: tickets.closedAt })
      .from(tickets)
      .where(and(eq(tickets.status, 'closed'), gte(tickets.closedAt, start), lte(tickets.closedAt, end)))
  ])

  const weeklyBuckets = buildDailyPaymentBuckets(startDate, endDate, formatDayLabel, formatDetailedDayLabel)
  const monthlyBuckets = buildMonthlyPaymentBuckets(date)
  const yearlyBuckets = buildAnnualPaymentBuckets(date)

  const weeklyBucketsMap = new Map(weeklyBuckets.map(item => [item.date, item]))
  const monthlyBucketsMap = new Map(monthlyBuckets.map(item => [item.date, item]))
  const yearlyBucketsMap = new Map(yearlyBuckets.map(item => [item.date, item]))

  for (const payment of weeklyPaymentRows) {
    const dayKey = toDateInputValue(new Date(payment.paidAt), businessTimeZone)
    const amount = Number(payment.amount || 0)

    applyPaymentAmount(weeklyBucketsMap.get(dayKey), payment.method, amount)
  }

  for (const payment of monthlyPaymentRows) {
    applyPaymentAmount(monthlyBucketsMap.get(payment.bucket), payment.method, Number(payment.total || 0))
  }

  for (const payment of yearlyPaymentRows) {
    applyPaymentAmount(yearlyBucketsMap.get(payment.bucket), payment.method, Number(payment.total || 0))
  }

  const ticketFlowByDay = rangeDates.map(day => ({
    date: day,
    label: formatDayLabel(day),
    opened: 0,
    closed: 0
  }))

  const ticketFlowByDayMap = new Map(ticketFlowByDay.map(item => [item.date, item]))

  for (const ticket of openedRows) {
    const dayKey = toDateInputValue(new Date(ticket.openedAt), businessTimeZone)
    const bucket = ticketFlowByDayMap.get(dayKey)

    if (bucket) {
      bucket.opened += 1
    }
  }

  for (const ticket of closedRows) {
    if (!ticket.closedAt) {
      continue
    }

    const dayKey = toDateInputValue(new Date(ticket.closedAt), businessTimeZone)
    const bucket = ticketFlowByDayMap.get(dayKey)

    if (bucket) {
      bucket.closed += 1
    }
  }

  const paidDocumentIds = paidDocumentRows.map(row => row.documentId)
  const [{ topCustomers, topItems }, turnoverRows]: [Pick<ReportsLeaders, 'topCustomers' | 'topItems'>, TurnoverRow[]] = await Promise.all([
    getTopLeaders(db, paidDocumentIds),
    paidDocumentIds.length
      ? db.select({
          category: documentLines.categoryHint,
          total: sum(documentLines.lineTotal)
        })
          .from(documentLines)
          .where(and(
            inArray(documentLines.documentId, paidDocumentIds),
            sql`${documentLines.categoryHint} is not null`
          ))
          .groupBy(documentLines.categoryHint)
      : Promise.resolve([])
  ])

  const paymentsByDay = weeklyBuckets.map(({ date: bucketDate, label, total, cash, cardTwint, bankTransfer, stripe }) => ({
    date: bucketDate,
    label,
    total,
    cash,
    cardTwint,
    bankTransfer,
    stripe
  }))

  const totalPaid = weeklyBuckets.reduce((sum, item) => sum + item.total, 0)
  const paidToday = weeklyBucketsMap.get(date)?.total || 0

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
      openTickets: Number(openTicketRows[0]?.count || 0)
    },
    paymentsByDay,
    paymentPeriods: [{
      key: 'week',
      label: '7 jours',
      description: 'Vue glissante quotidienne sur les 7 derniers jours encaissés.',
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
    turnoverByCategory: turnoverRows
      .filter((row): row is typeof row & { category: NonNullable<typeof row.category> } => Boolean(row.category))
      .map(row => ({
        category: row.category,
        label: lineCategoryLabels[row.category],
        total: Number(row.total || 0)
      })),
    topCustomers,
    topItems,
    ticketFlowByDay
  }
}

export async function getReportsLeaders(startDate: string, endDate: string): Promise<ReportsLeaders> {
  await ensurePosSchema()

  const db = useDb()
  const normalizedRange = normalizeDateRange(startDate, endDate)
  const { start } = buildDayRange(normalizedRange.startDate)
  const { end } = buildDayRange(normalizedRange.endDate)

  const [paymentTotalRows, paidDocumentRows] = await Promise.all([
    db.select({ total: sum(payments.amount) })
      .from(payments)
      .where(and(eq(payments.status, 'paid'), gte(payments.paidAt, start), lte(payments.paidAt, end))),
    db.select({
      documentId: documents.id
    })
      .from(payments)
      .innerJoin(documents, eq(payments.documentId, documents.id))
      .where(and(
        eq(payments.status, 'paid'),
        eq(documents.status, 'paid'),
        inArray(documents.type, ['invoice']),
        gte(payments.paidAt, start),
        lte(payments.paidAt, end)
      ))
      .groupBy(documents.id)
  ])

  const leaders = await getTopLeaders(db, paidDocumentRows.map(row => row.documentId))

  return {
    range: normalizedRange,
    totalPaid: Number(paymentTotalRows[0]?.total || 0),
    ...leaders
  }
}
