import { and, desc, eq, gte, inArray, lte, sql, sum } from 'drizzle-orm'
import { customers, documentLines, documents, payments, tickets } from '~~/server/db/schema'
import { lineCategoryLabels, paymentMethods } from '~~/shared/constants/pos'
import type { DailySummary, ReportsOverview } from '~~/shared/types/pos'
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

function formatMonthDayLabel(date: string) {
  const [year, month, day] = date.split('-').map(Number)

  return new Intl.DateTimeFormat('fr-CH', {
    day: '2-digit',
    timeZone: businessTimeZone
  }).format(new Date(Date.UTC(year!, month! - 1, day!, 12, 0, 0)))
}

function formatLongDateLabel(date: string) {
  const [year, month, day] = date.split('-').map(Number)

  return new Intl.DateTimeFormat('fr-CH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
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

function buildMonthStart(date: string) {
  const [year, month] = date.split('-').map(Number)
  return `${year}-${String(month).padStart(2, '0')}-01`
}

function buildYearStart(date: string) {
  const [year] = date.split('-').map(Number)
  return `${year}-01-01`
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
      bankTransfer: 0
    })
  }

  return buckets
}

function buildYearlyPaymentBuckets(date: string): ReportsOverview['paymentPeriods'][number]['buckets'] {
  const [year, month] = date.split('-').map(Number)
  const monthCount = month || 1

  return Array.from({ length: monthCount }, (_, index): ReportsOverview['paymentPeriods'][number]['buckets'][number] => {
    const monthNumber = index + 1

    return {
      date: `${year}-${String(monthNumber).padStart(2, '0')}`,
      label: formatMonthLabel(year!, monthNumber),
      tooltipLabel: formatMonthTooltipLabel(year!, monthNumber),
      total: 0,
      cash: 0,
      cardTwint: 0,
      bankTransfer: 0
    }
  })
}

type PaymentAggregationBucket = Pick<
  ReportsOverview['paymentPeriods'][number]['buckets'][number],
  'total' | 'cash' | 'cardTwint' | 'bankTransfer'
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
      total: sum(payments.amount)
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
        inArray(documents.type, ['invoice', 'receipt']),
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

  const totalsByMethod = new Map(paymentMethods.map(method => [method, 0]))

  for (const row of totalsByMethodRows) {
    totalsByMethod.set(row.method, (totalsByMethod.get(row.method) || 0) + Number(row.total || 0))
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
        total: totalsByMethod.get(method) || 0
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
  const monthStartDate = buildMonthStart(date)
  const yearStartDate = buildYearStart(date)
  const { start } = buildDayRange(startDate)
  const { end } = buildDayRange(endDate)
  const { start: yearStart } = buildDayRange(yearStartDate)
  const { end: selectedDayEnd } = buildDayRange(date)

  const [paymentRows, paidDocumentRows, openTicketRows, openedRows, closedRows] = await Promise.all([
    db.select({
      amount: payments.amount,
      method: payments.method,
      paidAt: payments.paidAt
    })
      .from(payments)
      .where(and(eq(payments.status, 'paid'), gte(payments.paidAt, yearStart), lte(payments.paidAt, selectedDayEnd))),
    db.select({
      documentId: documents.id
    })
      .from(payments)
      .innerJoin(documents, eq(payments.documentId, documents.id))
      .where(and(
        eq(payments.status, 'paid'),
        eq(documents.status, 'paid'),
        inArray(documents.type, ['invoice', 'receipt']),
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

  const paymentsByDay = rangeDates.map(day => ({
    date: day,
    label: formatDayLabel(day),
    total: 0,
    cash: 0,
    cardTwint: 0,
    bankTransfer: 0
  }))

  const paymentsByDayMap = new Map(paymentsByDay.map(item => [item.date, item]))

  const weeklyBuckets = buildDailyPaymentBuckets(startDate, endDate, formatDayLabel, formatDetailedDayLabel)
  const monthlyBuckets = buildDailyPaymentBuckets(monthStartDate, date, formatMonthDayLabel, formatLongDateLabel)
  const yearlyBuckets = buildYearlyPaymentBuckets(date)

  const weeklyBucketsMap = new Map(weeklyBuckets.map(item => [item.date, item]))
  const monthlyBucketsMap = new Map(monthlyBuckets.map(item => [item.date, item]))
  const yearlyBucketsMap = new Map(yearlyBuckets.map(item => [item.date, item]))

  for (const payment of paymentRows) {
    const dayKey = toDateInputValue(new Date(payment.paidAt), businessTimeZone)
    const amount = Number(payment.amount || 0)

    applyPaymentAmount(paymentsByDayMap.get(dayKey), payment.method, amount)
    applyPaymentAmount(weeklyBucketsMap.get(dayKey), payment.method, amount)
    applyPaymentAmount(monthlyBucketsMap.get(dayKey), payment.method, amount)
    applyPaymentAmount(yearlyBucketsMap.get(dayKey.slice(0, 7)), payment.method, amount)
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

  const totalPaid = paymentsByDay.reduce((sum, item) => sum + item.total, 0)
  const paidToday = paymentsByDayMap.get(date)?.total || 0

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
      description: 'Vue quotidienne cumulée depuis le début du mois jusqu’à la date sélectionnée.',
      buckets: monthlyBuckets
    }, {
      key: 'year',
      label: 'Année',
      description: 'Vue mensuelle cumulée depuis janvier jusqu’au mois sélectionné.',
      buckets: yearlyBuckets
    }],
    turnoverByCategory: turnoverRows
      .filter((row): row is typeof row & { category: NonNullable<typeof row.category> } => Boolean(row.category))
      .map(row => ({
        category: row.category,
        label: lineCategoryLabels[row.category],
        total: Number(row.total || 0)
      })),
    ticketFlowByDay
  }
}
