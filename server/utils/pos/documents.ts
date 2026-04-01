import { and, asc, desc, eq, gte, lte, sql } from 'drizzle-orm'
import {
  customers,
  documentLines,
  documents,
  payments,
  tickets
} from '~~/server/db/schema'
import { paymentMethodLabels } from '~~/shared/constants/pos'
import type {
  DocumentDetail,
  DocumentLineRecord,
  DocumentListItem,
  DocumentRecord,
  PaymentRecord
} from '~~/shared/types/pos'
import { isPayableDocumentType } from '~~/shared/utils/pos'
import { useDb } from '../turso'
import {
  calculateDocumentTotals,
  createTicketEvent,
  ensurePosSchema,
  generateDocumentNumber,
  getDocumentPaymentTotals,
  mapCustomer,
  normalizeOptionalText,
  syncDocumentStatus
} from './core'

export function mapDocument(row: typeof documents.$inferSelect): DocumentRecord {
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
    updatedAt: row.updatedAt
  }
}

export function mapDocumentLine(row: typeof documentLines.$inferSelect): DocumentLineRecord {
  return {
    id: row.id,
    documentId: row.documentId,
    catalogItemId: row.catalogItemId,
    label: row.label,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    vatRate: row.vatRate,
    lineTotal: row.lineTotal,
    categoryHint: row.categoryHint
  }
}

export function mapPayment(row: typeof payments.$inferSelect): PaymentRecord {
  return {
    id: row.id,
    customerId: row.customerId,
    documentId: row.documentId,
    method: row.method,
    status: row.status,
    amount: row.amount,
    paidAt: row.paidAt,
    reference: row.reference,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  }
}

function getDocumentCreatedLabel(type: DocumentRecord['type']) {
  switch (type) {
    case 'quote':
      return 'Devis créé'
    case 'customer_order':
      return 'Commande créée'
    case 'invoice':
      return 'Facture créée'
    case 'receipt':
      return 'Reçu créé'
  }
}

export async function listDocuments(filters?: {
  type?: string
  status?: string
  dateFrom?: string
  dateTo?: string
  customerId?: number
  ticketId?: number
}) {
  await ensurePosSchema()

  const db = useDb()
  const rows = await db.select({
    id: documents.id,
    documentNumber: documents.documentNumber,
    type: documents.type,
    status: documents.status,
    customerId: documents.customerId,
    ticketId: documents.ticketId,
    issuedAt: documents.issuedAt,
    subtotal: documents.subtotal,
    taxAmount: documents.taxAmount,
    total: documents.total,
    notes: documents.notes,
    createdAt: documents.createdAt,
    updatedAt: documents.updatedAt,
    customerFirstName: customers.firstName,
    customerLastName: customers.lastName,
    customerCompanyName: customers.companyName,
    ticketNumber: tickets.ticketNumber,
    paidAmount: sql<number>`coalesce(sum(case when ${payments.status} = 'paid' then ${payments.amount} else 0 end), 0)`
  })
    .from(documents)
    .innerJoin(customers, eq(documents.customerId, customers.id))
    .leftJoin(tickets, eq(documents.ticketId, tickets.id))
    .leftJoin(payments, eq(payments.documentId, documents.id))
    .where(and(
      filters?.type ? eq(documents.type, filters.type as typeof documents.$inferSelect.type) : undefined,
      filters?.status ? eq(documents.status, filters.status as typeof documents.$inferSelect.status) : undefined,
      filters?.customerId ? eq(documents.customerId, filters.customerId) : undefined,
      filters?.ticketId ? eq(documents.ticketId, filters.ticketId) : undefined,
      filters?.dateFrom ? gte(documents.issuedAt, filters.dateFrom) : undefined,
      filters?.dateTo ? lte(documents.issuedAt, filters.dateTo) : undefined
    ))
    .groupBy(documents.id, customers.id, tickets.id)
    .orderBy(desc(documents.issuedAt), desc(documents.id))

  return rows.map((row): DocumentListItem => ({
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
    customerName: row.customerCompanyName || `${row.customerFirstName} ${row.customerLastName}`,
    ticketNumber: row.ticketNumber,
    paidAmount: Number(row.paidAmount || 0),
    balanceDue: isPayableDocumentType(row.type) ? row.total - Number(row.paidAmount || 0) : 0
  }))
}

export async function getDocumentById(id: number): Promise<DocumentDetail> {
  await ensurePosSchema()

  const db = useDb()
  const headerRows = await db.select({
    document: documents,
    customer: customers,
    ticket: tickets
  })
    .from(documents)
    .innerJoin(customers, eq(documents.customerId, customers.id))
    .leftJoin(tickets, eq(documents.ticketId, tickets.id))
    .where(eq(documents.id, id))
    .limit(1)

  const header = headerRows[0]

  if (!header) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Document not found'
    })
  }

  const [lineRows, paymentRows] = await Promise.all([
    db.select().from(documentLines).where(eq(documentLines.documentId, id)).orderBy(asc(documentLines.id)),
    db.select().from(payments).where(eq(payments.documentId, id)).orderBy(desc(payments.paidAt), desc(payments.id))
  ])

  return {
    ...mapDocument(header.document),
    customer: mapCustomer(header.customer),
    ticket: header.ticket
      ? {
          id: header.ticket.id,
          ticketNumber: header.ticket.ticketNumber,
          customerId: header.ticket.customerId,
          type: header.ticket.type,
          status: header.ticket.status,
          brand: header.ticket.brand,
          model: header.ticket.model,
          serialNumber: header.ticket.serialNumber,
          imei: header.ticket.imei,
          accessCode: header.ticket.accessCode,
          simCode: header.ticket.simCode,
          issueDescription: header.ticket.issueDescription,
          internalNotes: header.ticket.internalNotes,
          openedAt: header.ticket.openedAt,
          closedAt: header.ticket.closedAt,
          createdAt: header.ticket.createdAt,
          updatedAt: header.ticket.updatedAt
        }
      : null,
    lines: lineRows.map(mapDocumentLine),
    payments: paymentRows.map(mapPayment)
  }
}

export async function createDocumentRecord(input: {
  type: typeof documents.$inferSelect.type
  status?: typeof documents.$inferSelect.status
  customerId: number
  ticketId?: number | null
  issuedAt: string
  notes?: string | null
  lines: Array<{
    catalogItemId?: number | null
    label: string
    quantity: number
    unitPrice: number
    vatRate: number
    categoryHint?: typeof documentLines.$inferSelect.categoryHint | null
  }>
}) {
  await ensurePosSchema()

  const db = useDb()
  const now = new Date().toISOString()
  const totals = calculateDocumentTotals(input.lines)
  const documentNumber = await generateDocumentNumber(input.type)

  const insertedRows = await db.insert(documents).values({
    documentNumber,
    type: input.type,
    status: input.status || 'issued',
    customerId: input.customerId,
    ticketId: input.ticketId ?? null,
    issuedAt: input.issuedAt,
    subtotal: totals.subtotal,
    taxAmount: totals.taxAmount,
    total: totals.total,
    notes: normalizeOptionalText(input.notes),
    createdAt: now,
    updatedAt: now
  }).returning()

  const document = insertedRows[0]

  if (!document) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Could not create document'
    })
  }

  await db.insert(documentLines).values(totals.lines.map((line, index) => ({
    documentId: document.id,
    catalogItemId: input.lines[index]?.catalogItemId ?? null,
    label: input.lines[index]!.label,
    quantity: input.lines[index]!.quantity,
    unitPrice: input.lines[index]!.unitPrice,
    vatRate: input.lines[index]!.vatRate,
    lineTotal: line.lineTotal,
    categoryHint: input.lines[index]!.categoryHint ?? null
  })))

  const detail = await getDocumentById(document.id)

  if (detail.ticketId && (detail.type === 'quote' || detail.type === 'customer_order' || detail.type === 'invoice')) {
    await createTicketEvent({
      ticketId: detail.ticketId,
      kind: 'document_created',
      label: getDocumentCreatedLabel(detail.type),
      metadata: {
        documentId: detail.id,
        documentNumber: detail.documentNumber,
        documentType: detail.type,
        documentStatus: detail.status
      },
      occurredAt: detail.issuedAt
    })
  }

  return detail
}

export async function updateDocumentRecord(id: number, input: {
  type: typeof documents.$inferSelect.type
  status?: typeof documents.$inferSelect.status
  customerId: number
  ticketId?: number | null
  issuedAt: string
  notes?: string | null
  lines: Array<{
    catalogItemId?: number | null
    label: string
    quantity: number
    unitPrice: number
    vatRate: number
    categoryHint?: typeof documentLines.$inferSelect.categoryHint | null
  }>
}) {
  await ensurePosSchema()

  const db = useDb()
  const totals = calculateDocumentTotals(input.lines)
  const updatedRows = await db.update(documents)
    .set({
      type: input.type,
      status: input.status || 'issued',
      customerId: input.customerId,
      ticketId: input.ticketId ?? null,
      issuedAt: input.issuedAt,
      subtotal: totals.subtotal,
      taxAmount: totals.taxAmount,
      total: totals.total,
      notes: normalizeOptionalText(input.notes),
      updatedAt: new Date().toISOString()
    })
    .where(eq(documents.id, id))
    .returning()

  const document = updatedRows[0]

  if (!document) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Document not found'
    })
  }

  if (!isPayableDocumentType(document.type)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'This document type cannot be paid directly'
    })
  }

  await db.delete(documentLines).where(eq(documentLines.documentId, id))
  await db.insert(documentLines).values(totals.lines.map((line, index) => ({
    documentId: id,
    catalogItemId: input.lines[index]?.catalogItemId ?? null,
    label: input.lines[index]!.label,
    quantity: input.lines[index]!.quantity,
    unitPrice: input.lines[index]!.unitPrice,
    vatRate: input.lines[index]!.vatRate,
    lineTotal: line.lineTotal,
    categoryHint: input.lines[index]!.categoryHint ?? null
  })))

  await syncDocumentStatus(id)

  return getDocumentById(id)
}

export async function deleteDocument(id: number) {
  await ensurePosSchema()

  const db = useDb()
  const result = await db.delete(documents).where(eq(documents.id, id))

  return result.rowsAffected
}

export async function markDocumentAsPaid(id: number, input: {
  method: typeof payments.$inferSelect.method
  amount?: number
  paidAt: string
  reference?: string | null
  notes?: string | null
}) {
  await ensurePosSchema()

  const db = useDb()
  const documentRows = await db.select().from(documents).where(eq(documents.id, id)).limit(1)
  const document = documentRows[0]

  if (!document) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Document not found'
    })
  }

  const paidTotal = await getDocumentPaymentTotals(id)
  const balance = Math.max(document.total - paidTotal, 0)
  const amount = input.amount && input.amount > 0 ? input.amount : balance || document.total
  const now = new Date().toISOString()

  const rows = await db.insert(payments).values({
    customerId: document.customerId,
    documentId: document.id,
    method: input.method,
    status: 'paid',
    amount,
    paidAt: input.paidAt,
    reference: normalizeOptionalText(input.reference),
    notes: normalizeOptionalText(input.notes),
    createdAt: now,
    updatedAt: now
  }).returning()

  await syncDocumentStatus(id)

  const detail = await getDocumentById(id)
  const payment = rows[0]

  if (detail.ticketId && payment) {
    await createTicketEvent({
      ticketId: detail.ticketId,
      kind: 'payment_recorded',
      label: 'Paiement enregistré',
      note: input.notes,
      metadata: {
        paymentId: payment.id,
        documentId: detail.id,
        documentNumber: detail.documentNumber,
        documentType: detail.type,
        amount,
        method: input.method,
        methodLabel: paymentMethodLabels[input.method],
        reference: input.reference || null
      },
      occurredAt: payment.paidAt
    })
  }

  return detail
}

export async function cloneDocumentLinesFromLatest(ticketId: number, preferredType?: typeof documents.$inferSelect.type) {
  await ensurePosSchema()

  const db = useDb()
  const candidates = await db.select()
    .from(documents)
    .where(and(
      eq(documents.ticketId, ticketId),
      preferredType ? eq(documents.type, preferredType) : undefined
    ))
    .orderBy(desc(documents.issuedAt), desc(documents.id))
    .limit(1)

  const source = candidates[0]

  if (!source) {
    return []
  }

  const lines = await db.select().from(documentLines).where(eq(documentLines.documentId, source.id)).orderBy(asc(documentLines.id))
  return lines.map(line => ({
    catalogItemId: line.catalogItemId,
    label: line.label,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    vatRate: line.vatRate,
    categoryHint: line.categoryHint
  }))
}
