import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import { customers, documents, payments, ticketEvents, tickets } from '~~/server/db/schema'
import {
  documentTypeColors,
  documentTypeLabels,
  paymentMethodColors,
  paymentMethodLabels,
  ticketStatusColors,
  ticketStatusLabels
} from '~~/shared/constants/pos'
import type { HomeActivityItem, HomeOverview } from '~~/shared/types/pos'
import { formatCurrency } from '~~/shared/utils/pos'
import { useDb } from '../turso'
import { buildDayRange, ensurePosSchema } from './core'
import { listDocuments } from './documents'
import { getEndOfDaySummary } from './reports'
import { listTickets } from './tickets'

function parseEventMetadata(value: string | null) {
  if (!value) {
    return null
  }

  try {
    const parsed = JSON.parse(value)
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  } catch {
    return null
  }
}

function buildTicketContext(row: {
  brand: string | null
  model: string | null
  customerName: string
}) {
  const device = [row.brand, row.model].filter(Boolean).join(' ')
  return device ? `${row.customerName} · ${device}` : row.customerName
}

export async function getHomeOverview(date: string): Promise<HomeOverview> {
  await ensurePosSchema()

  const db = useDb()
  const { start, end } = buildDayRange(date)
  const customerNameValue = sql<string>`coalesce(nullif(${customers.companyName}, ''), trim(${customers.firstName} || ' ' || ${customers.lastName}))`

  const [summary, dueDocumentsResponse, readyTickets, paymentRows, eventRows] = await Promise.all([
    getEndOfDaySummary(date),
    listDocuments({
      paymentState: 'due',
      sortBy: 'balanceDue',
      page: 1,
      pageSize: 5
    }),
    listTickets({ status: 'ready_for_pickup', page: 1, pageSize: 5 }),
    db.select({
      id: payments.id,
      documentId: documents.id,
      documentNumber: documents.documentNumber,
      customerName: customerNameValue,
      amount: payments.amount,
      method: payments.method,
      paidAt: payments.paidAt
    })
      .from(payments)
      .innerJoin(documents, eq(payments.documentId, documents.id))
      .innerJoin(customers, eq(documents.customerId, customers.id))
      .where(and(
        eq(payments.status, 'paid'),
        gte(payments.paidAt, start),
        lte(payments.paidAt, end)
      ))
      .orderBy(desc(payments.paidAt), desc(payments.id))
      .limit(10),
    db.select({
      id: ticketEvents.id,
      kind: ticketEvents.kind,
      label: ticketEvents.label,
      note: ticketEvents.note,
      metadataJson: ticketEvents.metadataJson,
      occurredAt: ticketEvents.occurredAt,
      ticketId: tickets.id,
      ticketNumber: tickets.ticketNumber,
      status: tickets.status,
      brand: tickets.brand,
      model: tickets.model,
      customerName: customerNameValue
    })
      .from(ticketEvents)
      .innerJoin(tickets, eq(ticketEvents.ticketId, tickets.id))
      .innerJoin(customers, eq(tickets.customerId, customers.id))
      .where(and(
        gte(ticketEvents.occurredAt, start),
        lte(ticketEvents.occurredAt, end)
      ))
      .orderBy(desc(ticketEvents.occurredAt), desc(ticketEvents.id))
      .limit(20)
  ])

  const paymentActivity: HomeActivityItem[] = paymentRows.map(row => ({
    id: `payment-${row.id}`,
    kind: 'payment',
    title: `Paiement · ${row.documentNumber}`,
    subtitle: `${row.customerName} · ${paymentMethodLabels[row.method]}`,
    occurredAt: row.paidAt,
    to: `/documents/${row.documentId}`,
    amount: row.amount,
    badgeLabel: paymentMethodLabels[row.method],
    badgeColor: paymentMethodColors[row.method]
  }))

  const eventActivity: HomeActivityItem[] = []

  for (const row of eventRows) {
    const metadata = parseEventMetadata(row.metadataJson)

    if (row.kind === 'ticket_created') {
      eventActivity.push({
        id: `event-${row.id}`,
        kind: 'ticket',
        title: `${row.ticketNumber} ouvert`,
        subtitle: buildTicketContext(row),
        occurredAt: row.occurredAt,
        to: `/tickets/${row.ticketId}`,
        badgeLabel: 'Nouveau ticket',
        badgeColor: 'info'
      })
      continue
    }

    if (row.kind === 'ticket_status_changed' && metadata?.nextStatus === 'ready_for_pickup') {
      eventActivity.push({
        id: `event-${row.id}`,
        kind: 'ticket',
        title: `${row.ticketNumber} prêt pour retrait`,
        subtitle: buildTicketContext(row),
        occurredAt: row.occurredAt,
        to: `/tickets/${row.ticketId}`,
        badgeLabel: ticketStatusLabels.ready_for_pickup,
        badgeColor: ticketStatusColors.ready_for_pickup
      })
      continue
    }

    if (row.kind === 'document_created') {
      const documentId = typeof metadata?.documentId === 'number' ? metadata.documentId : null
      const documentNumber = typeof metadata?.documentNumber === 'string' ? metadata.documentNumber : null
      const documentType = metadata?.documentType === 'quote' || metadata?.documentType === 'customer_order' || metadata?.documentType === 'invoice'
        ? metadata.documentType
        : null

      if (!documentId || !documentType) {
        continue
      }

      eventActivity.push({
        id: `event-${row.id}`,
        kind: 'document',
        title: `${documentTypeLabels[documentType]} · ${documentNumber || row.label}`,
        subtitle: `${row.customerName} · ${row.ticketNumber}`,
        occurredAt: row.occurredAt,
        to: `/documents/${documentId}`,
        badgeLabel: documentTypeLabels[documentType],
        badgeColor: documentTypeColors[documentType]
      })
    }
  }

  const activity = [...paymentActivity, ...eventActivity]
    .sort((left, right) => new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime())
    .slice(0, 12)

  const readyForPickupCount = readyTickets.total

  return {
    date,
    summary: {
      totalPaid: summary.totalPaid,
      totalBalanceDue: dueDocumentsResponse.summary.totalBalanceDue,
      dueDocumentCount: dueDocumentsResponse.total,
      openTicketCount: summary.ticketStats.openCount,
      openedToday: summary.ticketStats.openedToday,
      readyForPickupCount
    },
    cashbox: {
      totalPaid: summary.totalPaid,
      latestPaymentAt: paymentRows[0]?.paidAt || null,
      methods: summary.totalsByMethod
    },
    priorities: [{
      id: 'due-documents',
      title: 'Documents à encaisser',
      value: String(dueDocumentsResponse.total),
      description: `${formatCurrency(dueDocumentsResponse.summary.totalBalanceDue)} restant à encaisser`,
      to: '/documents?paymentState=due',
      badgeLabel: 'Ouvrir',
      badgeColor: 'warning'
    }, {
      id: 'ready-tickets',
      title: 'Tickets prêts pour retrait',
      value: String(readyForPickupCount),
      description: readyForPickupCount ? 'Clients à prévenir ou restitutions à préparer' : 'Aucun ticket prêt actuellement',
      to: '/tickets?status=ready_for_pickup',
      badgeLabel: 'Voir',
      badgeColor: 'success'
    }, {
      id: 'open-tickets',
      title: 'Tickets ouverts',
      value: String(summary.ticketStats.openCount),
      description: `${summary.ticketStats.openedToday} nouveau(x) aujourd’hui`,
      to: '/tickets',
      badgeLabel: 'Traiter',
      badgeColor: 'info'
    }, {
      id: 'reports',
      title: 'Clôture / reports',
      value: formatCurrency(summary.totalPaid),
      description: 'Préparer le rapport et vérifier la caisse',
      to: '/reports',
      badgeLabel: 'Contrôler',
      badgeColor: 'neutral'
    }],
    activity,
    readyTickets: readyTickets.items.slice(0, 5).map(ticket => ({
      id: ticket.id,
      ticketNumber: ticket.ticketNumber,
      customerName: ticket.customerName,
      issueDescription: ticket.issueDescription,
      brand: ticket.brand,
      model: ticket.model,
      openedAt: ticket.openedAt,
      status: ticket.status
    })),
    dueDocuments: dueDocumentsResponse.items.map(document => ({
      id: document.id,
      documentNumber: document.documentNumber,
      customerName: document.customerName,
      issuedAt: document.issuedAt,
      total: document.total,
      balanceDue: document.balanceDue,
      type: document.type
    }))
  }
}
