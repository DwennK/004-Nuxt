import { and, desc, eq, gte, inArray, lte, sql, sum } from 'drizzle-orm'
import { customers, documentLines, documents, payments, tickets } from '~~/server/db/schema'
import type { DailySummary } from '~~/shared/types/pos'
import { useDb } from '../turso'
import { buildDayRange, ensurePosSchema } from './core'

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
