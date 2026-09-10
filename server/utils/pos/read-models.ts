import { settlementSqlForAlias } from './document-settlement'
import type { BatchItem, BatchResponse } from 'drizzle-orm/batch'
import { sql } from 'drizzle-orm'
import {
  documentTypeColors,
  documentTypeLabels,
  paymentMethodColors,
  paymentMethodLabels,
  paymentMethods,
  ticketStatusColors,
  ticketStatusLabels
} from '~~/shared/constants/pos'
import type {
  CounterOverviewResponse,
  DocumentListItem,
  HomeActivityItem,
  HomeOverview,
  TicketListItem,
  TicketListResponse,
  TicketStatus
} from '~~/shared/types/pos'
import { formatCurrency, buildZonedDayRange as buildDayRange } from '~~/shared/utils/pos'
import type { PosDatabase } from '../turso'
import { useDb } from '../turso'
import { ensurePosSchema } from '~~/server/utils/pos/schema'

type ReadModelName = 'counter-overview' | 'home-overview'

export type PosReadModelMetrics = {
  scope: 'pos-read-model'
  readModel: ReadModelName
  databaseCalls: 1
  statementCount: number
  durationMs: number
  outcome: 'success' | 'error'
}

export type PosReadModelObserver = (metrics: PosReadModelMetrics) => void

type CounterTicketQueueRow = {
  id: number
  ticketNumber: string
  customerId: number
  type: TicketListItem['type']
  status: TicketStatus
  brand: string | null
  model: string | null
  serialNumber: string | null
  imei: string | null
  accessCode: string | null
  simCode: string | null
  issueDescription: string
  internalNotes: string | null
  openedAt: string
  closedAt: string | null
  createdAt: string
  updatedAt: string
  customerName: string
  documentCount: number | string
  totalCount: number | string
  openCount: number | string
  readyCount: number | string
  staleCount: number | string
}

type DueDocumentRow = {
  id: number
  documentNumber: string
  type: DocumentListItem['type']
  status: DocumentListItem['status']
  customerId: number
  ticketId: number | null
  issuedAt: string
  subtotal: number
  taxAmount: number
  total: number
  notes: string | null
  createdAt: string
  updatedAt: string
  customerName: string
  ticketNumber: string | null
  paidAmount: number | string
  balanceDue: number | string
  totalCount?: number | string
  paidCount?: number | string
  totalBalanceDue?: number | string
}

type HomeKpiRow = {
  totalPaid: number | string
  totalBalanceDue: number | string
  dueDocumentCount: number | string
  openTicketCount: number | string
  openedToday: number | string
  readyForPickupCount: number | string
}

type HomePaymentMethodRow = {
  method: (typeof paymentMethods)[number]
  total: number | string | null
  transactionCount: number | string
}

type HomeReadyTicketRow = {
  id: number
  ticketNumber: string
  customerName: string
  issueDescription: string
  brand: string | null
  model: string | null
  openedAt: string
  status: TicketStatus
}

type HomePaymentActivityRow = {
  id: number
  documentId: number
  documentNumber: string
  customerName: string
  amount: number
  method: (typeof paymentMethods)[number]
  paidAt: string
}

type HomeTicketEventRow = {
  id: number
  kind: 'ticket_created' | 'ticket_status_changed' | 'ticket_closed' | 'ticket_note_added' | 'document_created' | 'payment_recorded' | 'ticket_sms_qr_opened'
  label: string
  note: string | null
  metadataJson: string | null
  occurredAt: string
  ticketId: number
  ticketNumber: string
  status: TicketStatus
  brand: string | null
  model: string | null
  customerName: string
}

function writeReadModelMetrics(metrics: PosReadModelMetrics) {
  const message = JSON.stringify(metrics)

  if (metrics.outcome === 'error') {
    console.error(message)
    return
  }

  console.info(message)
}

function notifyReadModelObserver(observer: PosReadModelObserver, metrics: PosReadModelMetrics) {
  try {
    observer(metrics)
  } catch {
    console.error(JSON.stringify({
      scope: 'pos-read-model',
      readModel: metrics.readModel,
      errorCode: 'metrics_observer_failed'
    }))
  }
}

async function executeReadModelBatch<
  T extends readonly [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]
>(
  db: PosDatabase,
  readModel: ReadModelName,
  queries: T,
  observer: PosReadModelObserver = writeReadModelMetrics
): Promise<BatchResponse<T>> {
  const startedAt = performance.now()

  try {
    const results = await db.batch(queries)

    notifyReadModelObserver(observer, {
      scope: 'pos-read-model',
      readModel,
      databaseCalls: 1,
      statementCount: queries.length,
      durationMs: Math.round(performance.now() - startedAt),
      outcome: 'success'
    })

    return results
  } catch (error) {
    notifyReadModelObserver(observer, {
      scope: 'pos-read-model',
      readModel,
      databaseCalls: 1,
      statementCount: queries.length,
      durationMs: Math.round(performance.now() - startedAt),
      outcome: 'error'
    })

    throw error
  }
}

function mapTicketQueue(
  rows: CounterTicketQueueRow[],
  status: TicketStatus,
  pageSize: number
): TicketListResponse {
  const matchingRows = rows
    .filter(row => row.status === status)
    .sort((left, right) => right.openedAt.localeCompare(left.openedAt) || right.id - left.id)
  const summaryRow = matchingRows[0]

  return {
    items: matchingRows.map((row): TicketListItem => ({
      id: row.id,
      ticketNumber: row.ticketNumber,
      customerId: row.customerId,
      type: row.type,
      status: row.status,
      brand: row.brand,
      model: row.model,
      serialNumber: row.serialNumber,
      imei: row.imei,
      accessCode: row.accessCode,
      simCode: row.simCode,
      issueDescription: row.issueDescription,
      internalNotes: row.internalNotes,
      openedAt: row.openedAt,
      closedAt: row.closedAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      customerName: row.customerName,
      documentCount: Number(row.documentCount || 0)
    })),
    page: 1,
    pageSize,
    total: Number(summaryRow?.totalCount || 0),
    summary: {
      openCount: Number(summaryRow?.openCount || 0),
      readyCount: Number(summaryRow?.readyCount || 0),
      staleCount: Number(summaryRow?.staleCount || 0)
    }
  }
}

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

function buildTicketContext(row: Pick<HomeTicketEventRow, 'brand' | 'model' | 'customerName'>) {
  const device = [row.brand, row.model].filter(Boolean).join(' ')
  return device ? `${row.customerName} · ${device}` : row.customerName
}

function projectHomeOverview(input: {
  date: string
  kpi: HomeKpiRow
  methods: HomePaymentMethodRow[]
  dueDocuments: DueDocumentRow[]
  readyTickets: HomeReadyTicketRow[]
  payments: HomePaymentActivityRow[]
  events: HomeTicketEventRow[]
}): HomeOverview {
  const paymentActivity: HomeActivityItem[] = input.payments.map(row => ({
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

  for (const row of input.events) {
    const metadata = parseEventMetadata(row.metadataJson)

    if (row.kind === 'ticket_created') {
      eventActivity.push({
        id: `event-${row.id}`,
        kind: 'ticket',
        title: `${row.ticketNumber} ouvert`,
        subtitle: buildTicketContext(row),
        occurredAt: row.occurredAt,
        to: `/tickets/${row.ticketId}`,
        badgeLabel: 'Nouveau dossier',
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
  const totalPaid = Number(input.kpi.totalPaid || 0)
  const totalBalanceDue = Number(input.kpi.totalBalanceDue || 0)
  const dueDocumentCount = Number(input.kpi.dueDocumentCount || 0)
  const openTicketCount = Number(input.kpi.openTicketCount || 0)
  const openedToday = Number(input.kpi.openedToday || 0)
  const readyForPickupCount = Number(input.kpi.readyForPickupCount || 0)
  const methodsByMethod = new Map(input.methods.map(row => [row.method, row]))
  const methods = paymentMethods
    .map((method) => {
      const row = methodsByMethod.get(method)

      return {
        method,
        total: Number(row?.total || 0),
        transactionCount: Number(row?.transactionCount || 0)
      }
    })
    .filter(method => method.total > 0)

  return {
    date: input.date,
    summary: {
      totalPaid,
      totalBalanceDue,
      dueDocumentCount,
      openTicketCount,
      openedToday,
      readyForPickupCount
    },
    cashbox: {
      totalPaid,
      latestPaymentAt: input.payments[0]?.paidAt || null,
      methods
    },
    priorities: [{
      id: 'due-documents',
      title: 'Documents à encaisser',
      value: String(dueDocumentCount),
      description: `${formatCurrency(totalBalanceDue)} restant à encaisser`,
      to: '/documents?paymentState=due',
      badgeLabel: 'Ouvrir',
      badgeColor: 'warning'
    }, {
      id: 'ready-tickets',
      title: 'Dossiers prêts pour retrait',
      value: String(readyForPickupCount),
      description: readyForPickupCount ? 'Clients à prévenir ou restitutions à préparer' : 'Aucun dossier prêt actuellement',
      to: '/tickets?status=ready_for_pickup',
      badgeLabel: 'Voir',
      badgeColor: 'success'
    }, {
      id: 'open-tickets',
      title: 'Dossiers ouverts',
      value: String(openTicketCount),
      description: `${openedToday} nouveau(x) aujourd’hui`,
      to: '/tickets',
      badgeLabel: 'Traiter',
      badgeColor: 'info'
    }, {
      id: 'reports',
      title: 'Clôture / reports',
      value: formatCurrency(totalPaid),
      description: 'Préparer le rapport et vérifier la caisse',
      to: '/reports',
      badgeLabel: 'Contrôler',
      badgeColor: 'neutral'
    }],
    activity,
    readyTickets: input.readyTickets,
    dueDocuments: input.dueDocuments.map(row => ({
      id: row.id,
      documentNumber: row.documentNumber,
      customerName: row.customerName,
      issuedAt: row.issuedAt,
      total: row.total,
      balanceDue: Number(row.balanceDue || 0),
      type: row.type
    }))
  }
}

function createCounterQueries(db: PosDatabase, date: string) {
  const staleCutoff = new Date(Date.now() - (7 * 24 * 60 * 60 * 1000)).toISOString()
  const { start, end } = buildDayRange(date)

  const ticketQueues = db.all<CounterTicketQueueRow>(sql`
    WITH ticket_base AS (
      SELECT
        t.id,
        t.ticket_number AS "ticketNumber",
        t.customer_id AS "customerId",
        t.type,
        t.status,
        t.brand,
        t.model,
        t.serial_number AS "serialNumber",
        t.imei,
        t.access_code AS "accessCode",
        t.sim_code AS "simCode",
        t.issue_description AS "issueDescription",
        t.internal_notes AS "internalNotes",
        t.opened_at AS "openedAt",
        t.closed_at AS "closedAt",
        t.created_at AS "createdAt",
        t.updated_at AS "updatedAt",
        coalesce(nullif(c.company_name, ''), trim(c.first_name || ' ' || c.last_name)) AS "customerName",
        count(d.id) AS "documentCount"
      FROM tickets t
      INNER JOIN customers c ON c.id = t.customer_id
      LEFT JOIN documents d ON d.ticket_id = t.id
      WHERE t.status IN ('ready_for_pickup', 'diagnosis', 'awaiting_customer_approval', 'waiting_parts')
      GROUP BY t.id, c.id
    ), ranked AS (
      SELECT
        ticket_base.*,
        row_number() OVER (PARTITION BY status ORDER BY "openedAt" DESC, id DESC) AS row_number,
        count(*) OVER (PARTITION BY status) AS "totalCount",
        sum(CASE WHEN status NOT IN ('closed', 'cancelled') THEN 1 ELSE 0 END) OVER (PARTITION BY status) AS "openCount",
        sum(CASE WHEN status = 'ready_for_pickup' THEN 1 ELSE 0 END) OVER (PARTITION BY status) AS "readyCount",
        sum(CASE WHEN status NOT IN ('closed', 'cancelled') AND datetime("updatedAt") < datetime(${staleCutoff}) THEN 1 ELSE 0 END)
          OVER (PARTITION BY status) AS "staleCount"
      FROM ticket_base
    )
    SELECT *
    FROM ranked
    WHERE (status = 'ready_for_pickup' AND row_number <= 6)
      OR (status != 'ready_for_pickup' AND row_number <= 4)
    ORDER BY status, "openedAt" DESC, id DESC
  `)

  const dailyPayments = db.all<HomePaymentMethodRow>(sql`
    SELECT method, sum(amount) AS total, count(*) AS "transactionCount"
    FROM payments
    WHERE status = 'paid' AND paid_at >= ${start} AND paid_at <= ${end}
    GROUP BY method
  `)

  return [ticketQueues, dailyPayments] as const
}

function createHomeQueries(db: PosDatabase, date: string) {
  const { start, end } = buildDayRange(date)
  const kpis = db.all<HomeKpiRow>(sql`
    WITH due AS (
      SELECT ${settlementSqlForAlias('d').balanceDue} AS balance_due
      FROM documents d
      INNER JOIN customers c ON c.id = d.customer_id
      LEFT JOIN tickets t ON t.id = d.ticket_id
      LEFT JOIN payments p ON p.document_id = d.id
      WHERE ${settlementSqlForAlias('d').active}
      GROUP BY d.id, c.id, t.id
      HAVING ${settlementSqlForAlias('d').balanceDue} > 0
    )
    SELECT
      coalesce((SELECT sum(amount) FROM payments WHERE status = 'paid' AND paid_at >= ${start} AND paid_at <= ${end}), 0) AS "totalPaid",
      coalesce((SELECT sum(balance_due) FROM due), 0) AS "totalBalanceDue",
      (SELECT count(*) FROM due) AS "dueDocumentCount",
      (SELECT count(*) FROM tickets WHERE status NOT IN ('closed', 'cancelled')) AS "openTicketCount",
      (SELECT count(*) FROM tickets WHERE opened_at >= ${start} AND opened_at <= ${end}) AS "openedToday",
      (SELECT count(*) FROM tickets ready_ticket INNER JOIN customers ready_customer ON ready_customer.id = ready_ticket.customer_id WHERE ready_ticket.status = 'ready_for_pickup') AS "readyForPickupCount"
  `)
  const methods = db.all<HomePaymentMethodRow>(sql`
    SELECT method, sum(amount) AS total, count(*) AS "transactionCount"
    FROM payments
    WHERE status = 'paid' AND paid_at >= ${start} AND paid_at <= ${end}
    GROUP BY method
    ORDER BY method
  `)
  const dueDocuments = db.all<DueDocumentRow>(sql`
    SELECT *
    FROM (
      SELECT
        d.id,
        d.document_number AS "documentNumber",
        d.type,
        ${settlementSqlForAlias('d').status} AS status,
        d.customer_id AS "customerId",
        d.ticket_id AS "ticketId",
        d.issued_at AS "issuedAt",
        d.subtotal,
        d.tax_amount AS "taxAmount",
        d.total,
        d.notes,
        d.created_at AS "createdAt",
        d.updated_at AS "updatedAt",
        coalesce(nullif(c.company_name, ''), trim(c.first_name || ' ' || c.last_name)) AS "customerName",
        t.ticket_number AS "ticketNumber",
        ${settlementSqlForAlias('d').paidAmount} AS "paidAmount",
        ${settlementSqlForAlias('d').balanceDue} AS "balanceDue"
      FROM documents d
      INNER JOIN customers c ON c.id = d.customer_id
      LEFT JOIN tickets t ON t.id = d.ticket_id
      LEFT JOIN payments p ON p.document_id = d.id
      WHERE ${settlementSqlForAlias('d').active}
      GROUP BY d.id, c.id, t.id
      HAVING ${settlementSqlForAlias('d').balanceDue} > 0
    ) due
    ORDER BY "balanceDue" DESC, "issuedAt" DESC, id DESC
    LIMIT 5
  `)
  const readyTickets = db.all<HomeReadyTicketRow>(sql`
    SELECT
      t.id,
      t.ticket_number AS "ticketNumber",
      coalesce(nullif(c.company_name, ''), trim(c.first_name || ' ' || c.last_name)) AS "customerName",
      t.issue_description AS "issueDescription",
      t.brand,
      t.model,
      t.opened_at AS "openedAt",
      t.status
    FROM tickets t
    INNER JOIN customers c ON c.id = t.customer_id
    WHERE t.status = 'ready_for_pickup'
    ORDER BY t.opened_at DESC, t.id DESC
    LIMIT 5
  `)
  const paymentActivity = db.all<HomePaymentActivityRow>(sql`
    SELECT
      p.id,
      d.id AS "documentId",
      d.document_number AS "documentNumber",
      coalesce(nullif(c.company_name, ''), trim(c.first_name || ' ' || c.last_name)) AS "customerName",
      p.amount,
      p.method,
      p.paid_at AS "paidAt"
    FROM payments p
    INNER JOIN documents d ON d.id = p.document_id
    INNER JOIN customers c ON c.id = d.customer_id
    WHERE p.status = 'paid' AND p.paid_at >= ${start} AND p.paid_at <= ${end}
    ORDER BY p.paid_at DESC, p.id DESC
    LIMIT 10
  `)
  const eventActivity = db.all<HomeTicketEventRow>(sql`
    SELECT
      e.id,
      e.kind,
      e.label,
      e.note,
      e.metadata_json AS "metadataJson",
      e.occurred_at AS "occurredAt",
      t.id AS "ticketId",
      t.ticket_number AS "ticketNumber",
      t.status,
      t.brand,
      t.model,
      coalesce(nullif(c.company_name, ''), trim(c.first_name || ' ' || c.last_name)) AS "customerName"
    FROM ticket_events e
    INNER JOIN tickets t ON t.id = e.ticket_id
    INNER JOIN customers c ON c.id = t.customer_id
    WHERE e.occurred_at >= ${start} AND e.occurred_at <= ${end}
    ORDER BY e.occurred_at DESC, e.id DESC
    LIMIT 20
  `)

  return [kpis, methods, dueDocuments, readyTickets, paymentActivity, eventActivity] as const
}

export async function readCounterOverview(
  db: PosDatabase,
  date: string,
  observer?: PosReadModelObserver
): Promise<CounterOverviewResponse> {
  const queries = createCounterQueries(db, date)
  const [ticketQueueRows, paymentRows] = await executeReadModelBatch(db, 'counter-overview', queries, observer)
  const methods = paymentMethods.flatMap((method) => {
    const row = paymentRows.find(row => row.method === method)
    return row ? [{ method, total: Number(row.total || 0), transactionCount: Number(row.transactionCount) }] : []
  })

  return {
    readyTickets: mapTicketQueue(ticketQueueRows, 'ready_for_pickup', 6),
    diagnosisTickets: mapTicketQueue(ticketQueueRows, 'diagnosis', 4),
    approvalTickets: mapTicketQueue(ticketQueueRows, 'awaiting_customer_approval', 4),
    waitingPartsTickets: mapTicketQueue(ticketQueueRows, 'waiting_parts', 4),
    dailyPayments: {
      date,
      totalPaid: methods.reduce((total, row) => total + row.total, 0),
      transactionCount: methods.reduce((total, row) => total + row.transactionCount, 0),
      methods
    }
  }
}

export async function getCounterOverviewReadModel(date: string): Promise<CounterOverviewResponse> {
  await ensurePosSchema()
  return readCounterOverview(useDb(), date)
}

export async function readHomeOverview(
  db: PosDatabase,
  date: string,
  observer?: PosReadModelObserver
): Promise<HomeOverview> {
  const queries = createHomeQueries(db, date)
  const [kpiRows, methods, dueDocuments, readyTickets, paymentActivity, eventActivity] = await executeReadModelBatch(
    db,
    'home-overview',
    queries,
    observer
  )

  return projectHomeOverview({
    date,
    kpi: kpiRows[0] || {
      totalPaid: 0,
      totalBalanceDue: 0,
      dueDocumentCount: 0,
      openTicketCount: 0,
      openedToday: 0,
      readyForPickupCount: 0
    },
    methods,
    dueDocuments,
    readyTickets,
    payments: paymentActivity,
    events: eventActivity
  })
}

export async function getHomeOverviewReadModel(date: string): Promise<HomeOverview> {
  await ensurePosSchema()
  return readHomeOverview(useDb(), date)
}
