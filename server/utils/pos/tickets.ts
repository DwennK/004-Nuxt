import { and, desc, eq, inArray, or, sql } from 'drizzle-orm'
import { customers, documents, ticketEvents, ticketLines, tickets } from '~~/server/db/schema'
import {
  payableDocumentTypes,
  ticketStatusLabels,
  ticketWorkflowStepLabels
} from '~~/shared/constants/pos'
import type {
  DocumentRecord,
  LineCategoryHint,
  PaymentRecord,
  TicketCommercialSummary,
  TicketDetail,
  TicketEvent,
  TicketLineRecord,
  TicketListItem,
  TicketListResponse,
  TicketRecord,
  TicketStatus,
  TicketWorkflowAction,
  TicketWorkflowSummary
} from '~~/shared/types/pos'
import { useDb } from '../turso'
import {
  calculateDocumentTotals,
  createTicketEvent,
  closeTicketRecord,
  ensurePosSchema,
  generateTicketNumber,
  getTicketPayments,
  mapCustomer,
  normalizeOptionalText,
  syncDocumentStatus,
  updateTicketStatusRecord
} from './core'
import { cloneDocumentLinesFromLatest, createDocumentRecord, mapDocument, mapPayment } from './documents'

export function mapTicket(row: typeof tickets.$inferSelect): TicketRecord {
  return {
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
    updatedAt: row.updatedAt
  }
}

function mapTicketLine(row: typeof ticketLines.$inferSelect): TicketLineRecord {
  return {
    id: row.id,
    ticketId: row.ticketId,
    catalogItemId: row.catalogItemId,
    label: row.label,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    vatRate: row.vatRate,
    lineTotal: row.lineTotal,
    categoryHint: row.categoryHint
  }
}

type TicketLineInput = {
  catalogItemId?: number | null
  label: string
  quantity: number
  unitPrice: number
  vatRate: number
  lineTotal?: number | null
  categoryHint?: LineCategoryHint | null
}

async function getTicketLines(ticketId: number) {
  const db = useDb()
  const rows = await db.select()
    .from(ticketLines)
    .where(eq(ticketLines.ticketId, ticketId))
    .orderBy(ticketLines.id)

  return rows.map(mapTicketLine)
}

async function replaceTicketLines(ticketId: number, lines: TicketLineInput[]) {
  const db = useDb()
  const totals = calculateDocumentTotals(lines)

  await db.delete(ticketLines).where(eq(ticketLines.ticketId, ticketId))

  if (!totals.lines.length) {
    return []
  }

  await db.insert(ticketLines).values(totals.lines.map((line, index) => ({
    ticketId,
    catalogItemId: lines[index]?.catalogItemId ?? null,
    label: lines[index]!.label,
    quantity: lines[index]!.quantity,
    unitPrice: lines[index]!.unitPrice,
    vatRate: lines[index]!.vatRate,
    lineTotal: line.lineTotal,
    categoryHint: lines[index]!.categoryHint ?? null
  })))

  return getTicketLines(ticketId)
}

export async function cloneTicketLines(ticketId: number) {
  const rows = await getTicketLines(ticketId)

  return rows.map(line => ({
    catalogItemId: line.catalogItemId,
    label: line.label,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    vatRate: line.vatRate,
    lineTotal: line.lineTotal,
    categoryHint: line.categoryHint
  }))
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

function mapTicketEvent(row: typeof ticketEvents.$inferSelect): TicketEvent {
  return {
    id: row.id,
    ticketId: row.ticketId,
    kind: row.kind,
    label: row.label,
    note: row.note,
    metadata: parseEventMetadata(row.metadataJson),
    occurredAt: row.occurredAt,
    createdAt: row.createdAt
  }
}

function getTicketWorkflowStep(status: TicketStatus): TicketWorkflowSummary['step'] {
  if (status === 'new') {
    return 'reception'
  }

  if (status === 'diagnosis' || status === 'awaiting_customer_approval') {
    return 'diagnostic'
  }

  if (status === 'approved' || status === 'in_progress' || status === 'waiting_parts') {
    return 'workshop'
  }

  if (status === 'ready_for_pickup' || status === 'delivered') {
    return 'pickup'
  }

  return 'closure'
}

function getWorkflowActions(status: TicketStatus): TicketWorkflowAction[] {
  const actions: Record<TicketStatus, TicketWorkflowAction[]> = {
    new: [{
      id: 'start-diagnosis',
      kind: 'status',
      label: 'Lancer le diagnostic',
      description: 'Le ticket entre en analyse atelier.',
      icon: 'i-lucide-stethoscope',
      color: 'info',
      targetStatus: 'diagnosis'
    }, {
      id: 'request-approval',
      kind: 'status',
      label: 'Demander l’accord client',
      description: 'Le diagnostic est fait et le client doit valider la suite.',
      icon: 'i-lucide-badge-help',
      color: 'warning',
      targetStatus: 'awaiting_customer_approval'
    }, {
      id: 'cancel-ticket',
      kind: 'status',
      label: 'Annuler le ticket',
      description: 'Le dossier est abandonné avant intervention.',
      icon: 'i-lucide-circle-x',
      color: 'error',
      targetStatus: 'cancelled'
    }],
    diagnosis: [{
      id: 'request-approval',
      kind: 'status',
      label: 'Demander l’accord client',
      description: 'Le diagnostic est prêt et attend la validation du client.',
      icon: 'i-lucide-badge-help',
      color: 'warning',
      targetStatus: 'awaiting_customer_approval'
    }, {
      id: 'approve-work',
      kind: 'status',
      label: 'Accord reçu',
      description: 'Le client a validé, la réparation peut passer en atelier.',
      icon: 'i-lucide-badge-check',
      color: 'info',
      targetStatus: 'approved'
    }, {
      id: 'cancel-ticket',
      kind: 'status',
      label: 'Annuler le ticket',
      description: 'Le dossier est fermé sans intervention.',
      icon: 'i-lucide-circle-x',
      color: 'error',
      targetStatus: 'cancelled'
    }],
    awaiting_customer_approval: [{
      id: 'approve-work',
      kind: 'status',
      label: 'Accord reçu',
      description: 'Le client a validé le devis ou l’intervention.',
      icon: 'i-lucide-badge-check',
      color: 'success',
      targetStatus: 'approved'
    }, {
      id: 'back-to-diagnosis',
      kind: 'status',
      label: 'Revenir au diagnostic',
      description: 'Le dossier repart en analyse ou en ajustement.',
      icon: 'i-lucide-rotate-ccw',
      color: 'neutral',
      targetStatus: 'diagnosis'
    }, {
      id: 'cancel-ticket',
      kind: 'status',
      label: 'Refus client / annuler',
      description: 'Le client refuse, le dossier est abandonné.',
      icon: 'i-lucide-circle-x',
      color: 'error',
      targetStatus: 'cancelled'
    }],
    approved: [{
      id: 'start-repair',
      kind: 'status',
      label: 'Démarrer l’intervention',
      description: 'Le travail atelier commence.',
      icon: 'i-lucide-wrench',
      color: 'info',
      targetStatus: 'in_progress'
    }, {
      id: 'wait-parts',
      kind: 'status',
      label: 'Mettre en attente de pièces',
      description: 'La réparation est bloquée par des pièces non reçues.',
      icon: 'i-lucide-package-search',
      color: 'warning',
      targetStatus: 'waiting_parts'
    }, {
      id: 'cancel-ticket',
      kind: 'status',
      label: 'Annuler le ticket',
      description: 'Le dossier est abandonné malgré accord.',
      icon: 'i-lucide-circle-x',
      color: 'error',
      targetStatus: 'cancelled'
    }],
    in_progress: [{
      id: 'wait-parts',
      kind: 'status',
      label: 'En attente de pièces',
      description: 'Suspendez l’intervention jusqu’à réception.',
      icon: 'i-lucide-package-search',
      color: 'warning',
      targetStatus: 'waiting_parts'
    }, {
      id: 'ready-pickup',
      kind: 'status',
      label: 'Marquer prêt au retrait',
      description: 'L’appareil est terminé et peut être restitué.',
      icon: 'i-lucide-package-check',
      color: 'success',
      targetStatus: 'ready_for_pickup'
    }, {
      id: 'cancel-ticket',
      kind: 'status',
      label: 'Annuler le ticket',
      description: 'Annuler le dossier en cours d’atelier.',
      icon: 'i-lucide-circle-x',
      color: 'error',
      targetStatus: 'cancelled'
    }],
    waiting_parts: [{
      id: 'resume-work',
      kind: 'status',
      label: 'Reprendre l’atelier',
      description: 'Les pièces sont reçues, l’intervention peut continuer.',
      icon: 'i-lucide-play',
      color: 'info',
      targetStatus: 'in_progress'
    }, {
      id: 'ready-pickup',
      kind: 'status',
      label: 'Marquer prêt au retrait',
      description: 'La réparation est terminée malgré l’attente précédente.',
      icon: 'i-lucide-package-check',
      color: 'success',
      targetStatus: 'ready_for_pickup'
    }, {
      id: 'cancel-ticket',
      kind: 'status',
      label: 'Annuler le ticket',
      description: 'Le dossier est abandonné faute de pièces ou de validation.',
      icon: 'i-lucide-circle-x',
      color: 'error',
      targetStatus: 'cancelled'
    }],
    ready_for_pickup: [{
      id: 'mark-delivered',
      kind: 'status',
      label: 'Marquer remis au client',
      description: 'L’appareil quitte le magasin.',
      icon: 'i-lucide-handshake',
      color: 'success',
      targetStatus: 'delivered'
    }, {
      id: 'back-in-progress',
      kind: 'status',
      label: 'Rouvrir l’intervention',
      description: 'Retour atelier si un point doit être corrigé.',
      icon: 'i-lucide-rotate-ccw',
      color: 'neutral',
      targetStatus: 'in_progress'
    }],
    delivered: [{
      id: 'close-ticket',
      kind: 'close',
      label: 'Clôturer le ticket',
      description: 'Le dossier est terminé et archivé.',
      icon: 'i-lucide-check-check',
      color: 'success',
      targetStatus: null
    }, {
      id: 'back-ready-pickup',
      kind: 'status',
      label: 'Revenir en attente de retrait',
      description: 'La remise est annulée, le ticket revient au comptoir.',
      icon: 'i-lucide-rotate-ccw',
      color: 'neutral',
      targetStatus: 'ready_for_pickup'
    }],
    closed: [],
    cancelled: []
  }

  return actions[status]
}

function getTicketCommercialSummary(documentRows: DocumentRecord[], paymentRows: PaymentRecord[]): TicketCommercialSummary {
  const quote = documentRows.find(document => document.type === 'quote') || null
  const customerOrder = documentRows.find(document => document.type === 'customer_order') || null
  const invoice = documentRows.find(document => document.type === 'invoice') || null
  const latestDocument = documentRows[0] || null
  const payableDocuments = documentRows.filter(document =>
    document.status !== 'cancelled'
    && payableDocumentTypes.includes(document.type as (typeof payableDocumentTypes)[number])
  )
  const payableDocument = invoice || payableDocuments[0] || null
  const totalPaid = paymentRows
    .filter(payment => payment.status === 'paid')
    .reduce((sum, payment) => sum + payment.amount, 0)
  const payableTotal = payableDocuments.reduce((sum, document) => sum + document.total, 0)
  const balanceDue = Math.max(payableTotal - totalPaid, 0)

  let paymentStateLabel = 'Aucun document commercial'

  if (quote && !payableDocuments.length) {
    paymentStateLabel = 'En attente de facturation'
  } else if (payableDocuments.length) {
    if (totalPaid <= 0) {
      paymentStateLabel = 'Non encaissé'
    } else if (balanceDue > 0) {
      paymentStateLabel = 'Encaissement partiel'
    } else {
      paymentStateLabel = 'Entièrement encaissé'
    }
  }

  return {
    quote,
    customerOrder,
    invoice,
    latestDocument,
    payableDocument,
    totalPaid,
    balanceDue,
    paymentStateLabel
  }
}

function getTicketWorkflowSummary(ticket: TicketRecord, commercialSummary: TicketCommercialSummary): TicketWorkflowSummary {
  const step = getTicketWorkflowStep(ticket.status)

  const blockerLabel = (() => {
    switch (ticket.status) {
      case 'awaiting_customer_approval':
        return 'Accord client manquant'
      case 'waiting_parts':
        return 'Pièces non reçues'
      case 'ready_for_pickup':
        return commercialSummary.balanceDue > 0 ? 'Encaissement restant avant restitution' : null
      default:
        return null
    }
  })()

  const nextActionLabel = (() => {
    switch (ticket.status) {
      case 'new':
        return 'Lancer le diagnostic'
      case 'diagnosis':
        return 'Établir le devis, la commande ou demander l’accord client'
      case 'awaiting_customer_approval':
        return 'Relancer le client ou enregistrer sa décision'
      case 'approved':
        return 'Démarrer l’intervention atelier'
      case 'in_progress':
        return 'Terminer l’intervention ou signaler un besoin de pièces'
      case 'waiting_parts':
        return 'Réceptionner les pièces puis reprendre l’atelier'
      case 'ready_for_pickup':
        return commercialSummary.balanceDue > 0 ? 'Encaisser puis remettre l’appareil' : 'Remettre l’appareil au client'
      case 'delivered':
        return 'Clôturer le ticket'
      case 'closed':
        return 'Dossier terminé'
      case 'cancelled':
        return 'Dossier annulé'
    }
  })()

  return {
    step,
    stepLabel: ticketWorkflowStepLabels[step],
    currentStatusLabel: ticketStatusLabels[ticket.status],
    nextActionLabel,
    blockerLabel,
    actions: getWorkflowActions(ticket.status)
  }
}

function buildSyntheticEvents(ticket: TicketRecord, documentRows: DocumentRecord[], paymentRows: PaymentRecord[]): TicketEvent[] {
  const events: TicketEvent[] = [{
    id: `synthetic-ticket-created-${ticket.id}`,
    ticketId: ticket.id,
    kind: 'ticket_created',
    label: 'Ticket ouvert',
    note: ticket.internalNotes,
    metadata: {
      status: ticket.status,
      ticketNumber: ticket.ticketNumber
    },
    occurredAt: ticket.openedAt,
    createdAt: ticket.createdAt,
    isSynthetic: true
  }]

  for (const document of documentRows) {
    const label = document.type === 'quote'
      ? 'Devis créé'
      : document.type === 'customer_order'
        ? 'Commande créée'
        : 'Facture créée'

    events.push({
      id: `synthetic-document-${document.id}`,
      ticketId: ticket.id,
      kind: 'document_created',
      label,
      note: document.notes,
      metadata: {
        documentId: document.id,
        documentNumber: document.documentNumber,
        documentType: document.type,
        documentStatus: document.status
      },
      occurredAt: document.issuedAt,
      createdAt: document.createdAt,
      isSynthetic: true
    })
  }

  for (const payment of paymentRows.filter(candidate => candidate.status === 'paid')) {
    events.push({
      id: `synthetic-payment-${payment.id}`,
      ticketId: ticket.id,
      kind: 'payment_recorded',
      label: 'Paiement enregistré',
      note: payment.notes,
      metadata: {
        paymentId: payment.id,
        amount: payment.amount,
        method: payment.method,
        documentId: payment.documentId
      },
      occurredAt: payment.paidAt,
      createdAt: payment.createdAt,
      isSynthetic: true
    })
  }

  if (ticket.closedAt) {
    events.push({
      id: `synthetic-ticket-closed-${ticket.id}`,
      ticketId: ticket.id,
      kind: ticket.status === 'cancelled' ? 'ticket_status_changed' : 'ticket_closed',
      label: ticket.status === 'cancelled' ? 'Ticket annulé' : 'Ticket clôturé',
      note: ticket.internalNotes,
      metadata: {
        status: ticket.status
      },
      occurredAt: ticket.closedAt,
      createdAt: ticket.updatedAt,
      isSynthetic: true
    })
  }

  return events.sort((left, right) => {
    return new Date(right.occurredAt).getTime() - new Date(left.occurredAt).getTime()
  })
}

export async function listTickets(filters?: {
  q?: string
  status?: string
  customerId?: number
  page?: number
  pageSize?: number
}): Promise<TicketListResponse> {
  await ensurePosSchema()

  const db = useDb()

  const page = Math.max(filters?.page || 1, 1)
  const pageSize = Math.min(Math.max(filters?.pageSize || 50, 1), 250)
  const offset = (page - 1) * pageSize
  const searchTerm = filters?.q?.trim().toLowerCase()
  const searchPattern = searchTerm ? `%${searchTerm}%` : null

  const customerNameValue = sql<string>`coalesce(nullif(${customers.companyName}, ''), trim(${customers.firstName} || ' ' || ${customers.lastName}))`

  const whereClause = and(
    filters?.status ? eq(tickets.status, filters.status as typeof tickets.$inferSelect.status) : undefined,
    filters?.customerId ? eq(tickets.customerId, filters.customerId) : undefined,
    searchPattern
      ? or(
          sql`lower(${tickets.ticketNumber}) like ${searchPattern}`,
          sql`lower(${customerNameValue}) like ${searchPattern}`,
          sql`lower(coalesce(${tickets.brand}, '')) like ${searchPattern}`,
          sql`lower(coalesce(${tickets.model}, '')) like ${searchPattern}`,
          sql`lower(${tickets.issueDescription}) like ${searchPattern}`
        )
      : undefined
  )

  const [summaryRows, pageIdRows] = await Promise.all([
    db.select({
      total: sql<number>`count(*)`,
      openCount: sql<number>`coalesce(sum(case when ${tickets.status} not in ('closed', 'cancelled') then 1 else 0 end), 0)`,
      readyCount: sql<number>`coalesce(sum(case when ${tickets.status} = 'ready_for_pickup' then 1 else 0 end), 0)`
    })
      .from(tickets)
      .innerJoin(customers, eq(tickets.customerId, customers.id))
      .where(whereClause),
    db.select({ id: tickets.id })
      .from(tickets)
      .innerJoin(customers, eq(tickets.customerId, customers.id))
      .where(whereClause)
      .orderBy(desc(tickets.openedAt), desc(tickets.id))
      .limit(pageSize)
      .offset(offset)
  ])

  const pageIds = pageIdRows.map(row => row.id)
  const rows = pageIds.length
    ? await db.select({
        ticket: tickets,
        customer: customers,
        documentCount: sql<number>`count(${documents.id})`
      })
        .from(tickets)
        .innerJoin(customers, eq(tickets.customerId, customers.id))
        .leftJoin(documents, eq(documents.ticketId, tickets.id))
        .where(inArray(tickets.id, pageIds))
        .groupBy(tickets.id, customers.id)
        .orderBy(desc(tickets.openedAt), desc(tickets.id))
    : []

  const summary = summaryRows[0]

  return {
    items: rows.map((row): TicketListItem => ({
      ...mapTicket(row.ticket),
      customerName: row.customer.companyName || `${row.customer.firstName} ${row.customer.lastName}`,
      documentCount: Number(row.documentCount || 0)
    })),
    page,
    pageSize,
    total: Number(summary?.total || 0),
    summary: {
      openCount: Number(summary?.openCount || 0),
      readyCount: Number(summary?.readyCount || 0)
    }
  }
}

export async function getTicketById(id: number): Promise<TicketDetail> {
  await ensurePosSchema()

  const db = useDb()
  const headerRows = await db.select({
    ticket: tickets,
    customer: customers
  })
    .from(tickets)
    .innerJoin(customers, eq(tickets.customerId, customers.id))
    .where(eq(tickets.id, id))
    .limit(1)

  const header = headerRows[0]

  if (!header) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Ticket not found'
    })
  }

  const [lineRows, documentRows, paymentRows, eventRows] = await Promise.all([
    getTicketLines(id),
    db.select().from(documents).where(eq(documents.ticketId, id)).orderBy(desc(documents.issuedAt), desc(documents.id)),
    getTicketPayments(id),
    db.select().from(ticketEvents).where(eq(ticketEvents.ticketId, id)).orderBy(desc(ticketEvents.occurredAt), desc(ticketEvents.id))
  ])

  const mappedTicket = mapTicket(header.ticket)
  const mappedDocuments = documentRows.map(mapDocument)
  const mappedPayments = paymentRows.map(mapPayment)
  const commercialSummary = getTicketCommercialSummary(mappedDocuments, mappedPayments)

  return {
    ...mappedTicket,
    customer: mapCustomer(header.customer),
    lines: lineRows,
    documents: mappedDocuments,
    payments: mappedPayments,
    events: eventRows.length ? eventRows.map(mapTicketEvent) : buildSyntheticEvents(mappedTicket, mappedDocuments, mappedPayments),
    workflow: getTicketWorkflowSummary(mappedTicket, commercialSummary),
    commercialSummary
  }
}

export async function createTicket(input: Omit<TicketRecord, 'id' | 'ticketNumber' | 'createdAt' | 'updatedAt'> & {
  lines?: TicketLineInput[]
}) {
  await ensurePosSchema()

  const db = useDb()
  const now = new Date().toISOString()
  const ticketNumber = await generateTicketNumber()
  const rows = await db.insert(tickets).values({
    ticketNumber,
    customerId: input.customerId,
    type: input.type,
    status: input.status,
    brand: normalizeOptionalText(input.brand),
    model: normalizeOptionalText(input.model),
    serialNumber: normalizeOptionalText(input.serialNumber),
    imei: normalizeOptionalText(input.imei),
    accessCode: normalizeOptionalText(input.accessCode),
    simCode: normalizeOptionalText(input.simCode),
    issueDescription: input.issueDescription.trim(),
    internalNotes: normalizeOptionalText(input.internalNotes),
    openedAt: input.openedAt,
    closedAt: normalizeOptionalText(input.closedAt),
    createdAt: now,
    updatedAt: now
  }).returning()

  const ticket = mapTicket(rows[0]!)

  await replaceTicketLines(ticket.id, input.lines || [])

  await createTicketEvent({
    ticketId: ticket.id,
    kind: 'ticket_created',
    label: 'Ticket ouvert',
    note: input.internalNotes,
    metadata: {
      status: ticket.status,
      ticketNumber: ticket.ticketNumber
    },
    occurredAt: input.openedAt
  })

  return ticket
}

export async function updateTicket(id: number, input: Omit<TicketRecord, 'id' | 'ticketNumber' | 'createdAt' | 'updatedAt'> & {
  lines?: TicketLineInput[]
}) {
  await ensurePosSchema()

  const db = useDb()
  const rows = await db.update(tickets)
    .set({
      customerId: input.customerId,
      type: input.type,
      status: input.status,
      brand: normalizeOptionalText(input.brand),
      model: normalizeOptionalText(input.model),
      serialNumber: normalizeOptionalText(input.serialNumber),
      imei: normalizeOptionalText(input.imei),
      accessCode: normalizeOptionalText(input.accessCode),
      simCode: normalizeOptionalText(input.simCode),
      issueDescription: input.issueDescription.trim(),
      internalNotes: normalizeOptionalText(input.internalNotes),
      openedAt: input.openedAt,
      closedAt: normalizeOptionalText(input.closedAt),
      updatedAt: new Date().toISOString()
    })
    .where(eq(tickets.id, id))
    .returning()

  const row = rows[0]

  if (!row) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Ticket not found'
    })
  }

  await replaceTicketLines(id, input.lines || [])

  return mapTicket(row)
}

export async function deleteTicket(id: number) {
  await ensurePosSchema()

  const db = useDb()
  const result = await db.delete(tickets).where(eq(tickets.id, id))

  return result.rowsAffected
}

function buildFallbackLines(ticket: TicketRecord): Array<{
  label: string
  quantity: number
  unitPrice: number
  vatRate: number
  categoryHint: 'repair' | 'service'
}> {
  return [{
    label: `${ticket.type === 'repair' ? 'Repair' : 'Support'} - ${[ticket.brand, ticket.model].filter(Boolean).join(' ') || ticket.ticketNumber}`,
    quantity: 1,
    unitPrice: 0,
    vatRate: 8.1,
    categoryHint: ticket.type === 'repair' ? 'repair' : 'service'
  }]
}

export async function createQuoteFromTicket(ticketId: number) {
  const ticket = await getTicketById(ticketId)
  const ticketLines = await cloneTicketLines(ticketId)
  const existingLines = ticketLines.length ? [] : await cloneDocumentLinesFromLatest(ticketId, 'quote')

  return createDocumentRecord({
    type: 'quote',
    status: 'draft',
    customerId: ticket.customerId,
    ticketId,
    issuedAt: new Date().toISOString(),
    notes: `Quote created from ${ticket.ticketNumber}.`,
    lines: ticketLines.length ? ticketLines : existingLines.length ? existingLines : buildFallbackLines(ticket)
  })
}

export async function createCustomerOrderFromTicket(ticketId: number) {
  const ticket = await getTicketById(ticketId)
  const ticketLines = await cloneTicketLines(ticketId)
  const existingLines = ticketLines.length ? [] : await cloneDocumentLinesFromLatest(ticketId, 'quote')

  return createDocumentRecord({
    type: 'customer_order',
    status: 'issued',
    customerId: ticket.customerId,
    ticketId,
    issuedAt: new Date().toISOString(),
    notes: `Commande créée depuis ${ticket.ticketNumber}.`,
    lines: ticketLines.length ? ticketLines : existingLines.length ? existingLines : buildFallbackLines(ticket)
  })
}

export async function createInvoiceFromTicket(ticketId: number) {
  const ticket = await getTicketById(ticketId)
  const ticketLines = await cloneTicketLines(ticketId)
  const existingLines = ticketLines.length ? [] : await cloneDocumentLinesFromLatest(ticketId, 'quote')
  const invoice = await createDocumentRecord({
    type: 'invoice',
    status: 'issued',
    customerId: ticket.customerId,
    ticketId,
    issuedAt: new Date().toISOString(),
    notes: `Invoice created from ${ticket.ticketNumber}.`,
    lines: ticketLines.length ? ticketLines : existingLines.length ? existingLines : buildFallbackLines(ticket)
  })

  await syncDocumentStatus(invoice.id)

  return invoice
}

export async function updateTicketStatus(ticketId: number, status: typeof tickets.$inferSelect.status, internalNotes?: string | null) {
  const row = await updateTicketStatusRecord(ticketId, status, internalNotes)
  return mapTicket(row)
}

export async function closeTicket(ticketId: number, internalNotes?: string | null) {
  const row = await closeTicketRecord(ticketId, internalNotes)
  return mapTicket(row)
}
