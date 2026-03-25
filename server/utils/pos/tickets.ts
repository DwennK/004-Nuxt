import { and, desc, eq, sql } from 'drizzle-orm'
import { customers, documents, tickets } from '~~/server/db/schema'
import type { TicketDetail, TicketListItem, TicketRecord } from '~~/shared/types/pos'
import { useDb } from '../turso'
import {
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
    issueDescription: row.issueDescription,
    internalNotes: row.internalNotes,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

export async function listTickets(filters?: {
  status?: string
  customerId?: number
}) {
  await ensurePosSchema()

  const db = useDb()
  const rows = await db.select({
    ticket: tickets,
    customer: customers,
    documentCount: sql<number>`count(${documents.id})`
  })
    .from(tickets)
    .innerJoin(customers, eq(tickets.customerId, customers.id))
    .leftJoin(documents, eq(documents.ticketId, tickets.id))
    .where(and(
      filters?.status ? eq(tickets.status, filters.status as typeof tickets.$inferSelect.status) : undefined,
      filters?.customerId ? eq(tickets.customerId, filters.customerId) : undefined
    ))
    .groupBy(tickets.id, customers.id)
    .orderBy(desc(tickets.openedAt), desc(tickets.id))

  return rows.map((row): TicketListItem => ({
    ...mapTicket(row.ticket),
    customerName: row.customer.companyName || `${row.customer.firstName} ${row.customer.lastName}`,
    documentCount: Number(row.documentCount || 0)
  }))
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

  const [documentRows, paymentRows] = await Promise.all([
    db.select().from(documents).where(eq(documents.ticketId, id)).orderBy(desc(documents.issuedAt), desc(documents.id)),
    getTicketPayments(id)
  ])

  return {
    ...mapTicket(header.ticket),
    customer: mapCustomer(header.customer),
    documents: documentRows.map(mapDocument),
    payments: paymentRows.map(mapPayment)
  }
}

export async function createTicket(input: Omit<TicketRecord, 'id' | 'ticketNumber' | 'createdAt' | 'updatedAt'>) {
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
    issueDescription: input.issueDescription.trim(),
    internalNotes: normalizeOptionalText(input.internalNotes),
    openedAt: input.openedAt,
    closedAt: normalizeOptionalText(input.closedAt),
    createdAt: now,
    updatedAt: now
  }).returning()

  return mapTicket(rows[0]!)
}

export async function updateTicket(id: number, input: Omit<TicketRecord, 'id' | 'ticketNumber' | 'createdAt' | 'updatedAt'>) {
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
  const existingLines = await cloneDocumentLinesFromLatest(ticketId, 'quote')

  return createDocumentRecord({
    type: 'quote',
    status: 'draft',
    customerId: ticket.customerId,
    ticketId,
    issuedAt: new Date().toISOString(),
    notes: `Quote created from ${ticket.ticketNumber}.`,
    lines: existingLines.length ? existingLines : buildFallbackLines(ticket)
  })
}

export async function createInvoiceFromTicket(ticketId: number) {
  const ticket = await getTicketById(ticketId)
  const existingLines = await cloneDocumentLinesFromLatest(ticketId, 'quote')
  const invoice = await createDocumentRecord({
    type: 'invoice',
    status: 'issued',
    customerId: ticket.customerId,
    ticketId,
    issuedAt: new Date().toISOString(),
    notes: `Invoice created from ${ticket.ticketNumber}.`,
    lines: existingLines.length ? existingLines : buildFallbackLines(ticket)
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
