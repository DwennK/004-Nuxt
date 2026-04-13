import { and, desc, eq, gte, inArray, lte, sql, sum } from 'drizzle-orm'
import { customers, documentLines, documents, payments, tickets } from '~~/server/db/schema'
import { lineCategoryLabels } from '~~/shared/constants/pos'
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
    totalsByMethod: totalsByMethodRows.map(row => ({
      method: row.method,
      total: Number(row.total || 0)
    })),
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
  const { start } = buildDayRange(startDate)
  const { end } = buildDayRange(endDate)

  const [paymentRows, paidDocumentRows, openTicketRows, openedRows, closedRows] = await Promise.all([
    db.select({
      amount: payments.amount,
      method: payments.method,
      paidAt: payments.paidAt
    })
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
    card: 0,
    twint: 0,
    bankTransfer: 0
  }))

  const paymentsByDayMap = new Map(paymentsByDay.map(item => [item.date, item]))

  for (const payment of paymentRows) {
    const dayKey = toDateInputValue(new Date(payment.paidAt), businessTimeZone)
    const bucket = paymentsByDayMap.get(dayKey)

    if (!bucket) {
      continue
    }

    const amount = Number(payment.amount || 0)
    bucket.total += amount

    if (payment.method === 'bank_transfer') {
      bucket.bankTransfer += amount
      continue
    }

    switch (payment.method) {
      case 'cash':
        bucket.cash += amount
        break
      case 'card':
        bucket.card += amount
        break
      case 'twint':
        bucket.twint += amount
        break
    }
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
