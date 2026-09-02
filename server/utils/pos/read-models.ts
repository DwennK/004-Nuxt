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
  DocumentListResponse,
  HomeActivityItem,
  HomeOverview,
  ReportsOverview,
  TicketListItem,
  TicketListResponse,
  TicketStatus
} from '~~/shared/types/pos'
import { formatCurrency, isPayableDocumentType, buildZonedDayRange as buildDayRange } from '~~/shared/utils/pos'
import type { PosDatabase } from '../turso'
import { useDb } from '../turso'
import { ensurePosSchema } from '~~/server/utils/pos/schema'
import { projectReportsLeaders, projectReportsOverview } from './reports'

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

type WeeklyPaymentRow = {
  amount: number
  method: (typeof paymentMethods)[number]
  paidAt: string
}

type PeriodPaymentRow = {
  bucket: string
  method: (typeof paymentMethods)[number]
  total: number | string | null
}

type TicketSnapshotRow = {
  kind: 'summary' | 'opened' | 'closed'
  occurredAt: string | null
  openCount: number | string
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

type TurnoverRow = {
  category: ReportsOverview['turnoverByCategory'][number]['category'] | null
  total: number | string | null
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

function shiftIsoDate(date: string, days: number) {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year!, month! - 1, day! + days, 12, 0, 0))

  return [
    value.getUTCFullYear(),
    String(value.getUTCMonth() + 1).padStart(2, '0'),
    String(value.getUTCDate()).padStart(2, '0')
  ].join('-')
}

function buildReportQueryRange(date: string) {
  const startDate = shiftIsoDate(date, -6)
  const [year] = date.split('-').map(Number)
  const { start } = buildDayRange(startDate)
  const { end } = buildDayRange(date)
  const { start: selectedYearStart } = buildDayRange(`${year}-01-01`)
  const { end: selectedYearEnd } = buildDayRange(`${year}-12-31`)
  const { start: rollingYearStart } = buildDayRange(`${year! - 4}-01-01`)

  return {
    start,
    end,
    selectedYearStart,
    selectedYearEnd,
    rollingYearStart
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

function mapDueDocument(row: DueDocumentRow): DocumentListItem {
  return {
    id: row.id,
    documentNumber: row.documentNumber,
    type: row.type,
    status: row.status,
    customerId: row.customerId,
    ticketId: row.ticketId,
    issuedAt: row.issuedAt,
    subtotal: row.subtotal,
    taxAmount: row.taxAmount,
    total: row.total,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    customerName: row.customerName,
    ticketNumber: row.ticketNumber,
    paidAmount: Number(row.paidAmount || 0),
    balanceDue: isPayableDocumentType(row.type) ? Number(row.balanceDue || 0) : 0
  }
}

function mapDueDocuments(rows: DueDocumentRow[], pageSize: number): DocumentListResponse {
  const summaryRow = rows[0]

  return {
    items: rows.map(mapDueDocument),
    page: 1,
    pageSize,
    total: Number(summaryRow?.totalCount || 0),
    summary: {
      paidCount: Number(summaryRow?.paidCount || 0),
      totalBalanceDue: Number(summaryRow?.totalBalanceDue || 0)
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
      title: 'Tickets prêts pour retrait',
      value: String(readyForPickupCount),
      description: readyForPickupCount ? 'Clients à prévenir ou restitutions à préparer' : 'Aucun ticket prêt actuellement',
      to: '/tickets?status=ready_for_pickup',
      badgeLabel: 'Voir',
      badgeColor: 'success'
    }, {
      id: 'open-tickets',
      title: 'Tickets ouverts',
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
  const range = buildReportQueryRange(date)

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

  const dueDocuments = db.all<DueDocumentRow>(sql`
    WITH document_base AS (
      SELECT
        d.id,
        d.document_number AS "documentNumber",
        d.type,
        d.status,
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
        coalesce(sum(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) AS "paidAmount"
      FROM documents d
      INNER JOIN customers c ON c.id = d.customer_id
      LEFT JOIN tickets t ON t.id = d.ticket_id
      LEFT JOIN payments p ON p.document_id = d.id
      WHERE d.type IN ('customer_order', 'invoice')
      GROUP BY d.id, c.id, t.id
    ), due AS (
      SELECT document_base.*, max(total - "paidAmount", 0) AS "balanceDue"
      FROM document_base
      WHERE total > "paidAmount"
    )
    SELECT
      due.*,
      count(*) OVER () AS "totalCount",
      sum(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) OVER () AS "paidCount",
      sum("balanceDue") OVER () AS "totalBalanceDue"
    FROM due
    ORDER BY "balanceDue" DESC, "issuedAt" DESC, id DESC
    LIMIT 6
  `)

  const weeklyPayments = db.all<WeeklyPaymentRow>(sql`
    SELECT amount, method, paid_at AS "paidAt"
    FROM payments
    WHERE status = 'paid' AND paid_at >= ${range.start} AND paid_at <= ${range.end}
  `)
  const monthlyPayments = db.all<PeriodPaymentRow>(sql`
    SELECT substr(paid_at, 1, 7) AS bucket, method, sum(amount) AS total
    FROM payments
    WHERE status = 'paid' AND paid_at >= ${range.selectedYearStart} AND paid_at <= ${range.selectedYearEnd}
    GROUP BY bucket, method
    ORDER BY bucket, method
  `)
  const yearlyPayments = db.all<PeriodPaymentRow>(sql`
    SELECT substr(paid_at, 1, 4) AS bucket, method, sum(amount) AS total
    FROM payments
    WHERE status = 'paid' AND paid_at >= ${range.rollingYearStart} AND paid_at <= ${range.selectedYearEnd}
    GROUP BY bucket, method
    ORDER BY bucket, method
  `)
  const ticketSnapshot = db.all<TicketSnapshotRow>(sql`
    WITH open_total AS (
      SELECT count(*) AS open_count
      FROM tickets
      WHERE status NOT IN ('closed', 'cancelled')
    ), flow AS (
      SELECT 'opened' AS kind, opened_at AS occurred_at
      FROM tickets
      WHERE opened_at >= ${range.start} AND opened_at <= ${range.end}
      UNION ALL
      SELECT 'closed' AS kind, closed_at AS occurred_at
      FROM tickets
      WHERE status = 'closed' AND closed_at >= ${range.start} AND closed_at <= ${range.end}
    )
    SELECT 'summary' AS kind, NULL AS "occurredAt", open_count AS "openCount"
    FROM open_total
    UNION ALL
    SELECT flow.kind, flow.occurred_at AS "occurredAt", open_total.open_count AS "openCount"
    FROM flow CROSS JOIN open_total
  `)
  const qualifyingPayment = sql`
    EXISTS (
      SELECT 1
      FROM payments recent_payment
      WHERE recent_payment.document_id = report_document.id
        AND recent_payment.status = 'paid'
        AND recent_payment.paid_at >= ${range.start}
        AND recent_payment.paid_at <= ${range.end}
    )
  `
  const topCustomers = db.all<TopCustomerRow>(sql`
    SELECT
      c.id AS "customerId",
      coalesce(c.company_name, c.first_name || ' ' || c.last_name) AS "customerName",
      sum(report_document.total) AS total,
      count(report_document.id) AS "documentCount"
    FROM documents report_document
    INNER JOIN customers c ON c.id = report_document.customer_id
    WHERE report_document.status = 'paid'
      AND report_document.type = 'invoice'
      AND ${qualifyingPayment}
    GROUP BY c.id
  `)
  const topItems = db.all<TopItemRow>(sql`
    SELECT
      coalesce(ci.name, dl.label) AS label,
      dl.category_hint AS category,
      sum(dl.line_total) AS total,
      sum(dl.quantity) AS quantity
    FROM document_lines dl
    INNER JOIN documents report_document ON report_document.id = dl.document_id
    LEFT JOIN catalog_items ci ON ci.id = dl.catalog_item_id
    WHERE report_document.status = 'paid'
      AND report_document.type = 'invoice'
      AND ${qualifyingPayment}
    GROUP BY coalesce(ci.name, dl.label), dl.category_hint
  `)
  const turnover = db.all<TurnoverRow>(sql`
    SELECT dl.category_hint AS category, sum(dl.line_total) AS total
    FROM document_lines dl
    INNER JOIN documents report_document ON report_document.id = dl.document_id
    WHERE dl.category_hint IS NOT NULL
      AND report_document.status = 'paid'
      AND report_document.type = 'invoice'
      AND ${qualifyingPayment}
    GROUP BY dl.category_hint
  `)

  return [
    ticketQueues,
    dueDocuments,
    weeklyPayments,
    monthlyPayments,
    yearlyPayments,
    ticketSnapshot,
    topCustomers,
    topItems,
    turnover
  ] as const
}

function createHomeQueries(db: PosDatabase, date: string) {
  const { start, end } = buildDayRange(date)
  const kpis = db.all<HomeKpiRow>(sql`
    WITH due AS (
      SELECT max(d.total - coalesce(sum(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0), 0) AS balance_due
      FROM documents d
      INNER JOIN customers c ON c.id = d.customer_id
      LEFT JOIN tickets t ON t.id = d.ticket_id
      LEFT JOIN payments p ON p.document_id = d.id
      WHERE d.type IN ('customer_order', 'invoice')
      GROUP BY d.id, c.id, t.id
      HAVING d.total > coalesce(sum(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0)
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
        d.status,
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
        coalesce(sum(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) AS "paidAmount",
        max(d.total - coalesce(sum(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0), 0) AS "balanceDue"
      FROM documents d
      INNER JOIN customers c ON c.id = d.customer_id
      LEFT JOIN tickets t ON t.id = d.ticket_id
      LEFT JOIN payments p ON p.document_id = d.id
      WHERE d.type IN ('customer_order', 'invoice')
      GROUP BY d.id, c.id, t.id
      HAVING d.total > coalesce(sum(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0)
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
  const [
    ticketQueueRows,
    dueDocumentRows,
    weeklyPaymentRows,
    monthlyPaymentRows,
    yearlyPaymentRows,
    ticketSnapshotRows,
    topCustomerRows,
    topItemRows,
    turnoverRows
  ] = await executeReadModelBatch(db, 'counter-overview', queries, observer)
  const leaders = projectReportsLeaders(topCustomerRows, topItemRows)
  const summaryRow = ticketSnapshotRows.find(row => row.kind === 'summary')

  return {
    readyTickets: mapTicketQueue(ticketQueueRows, 'ready_for_pickup', 6),
    dueDocuments: mapDueDocuments(dueDocumentRows, 6),
    diagnosisTickets: mapTicketQueue(ticketQueueRows, 'diagnosis', 4),
    approvalTickets: mapTicketQueue(ticketQueueRows, 'awaiting_customer_approval', 4),
    waitingPartsTickets: mapTicketQueue(ticketQueueRows, 'waiting_parts', 4),
    reportsOverview: projectReportsOverview({
      date,
      weeklyPaymentRows,
      monthlyPaymentRows,
      yearlyPaymentRows,
      openTicketCount: summaryRow?.openCount || 0,
      openedRows: ticketSnapshotRows
        .filter(row => row.kind === 'opened' && row.occurredAt)
        .map(row => ({ openedAt: row.occurredAt! })),
      closedRows: ticketSnapshotRows
        .filter(row => row.kind === 'closed')
        .map(row => ({ closedAt: row.occurredAt })),
      topCustomers: leaders.topCustomers,
      topItems: leaders.topItems,
      turnoverRows
    })
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
