import { getDocumentSettlement, settlementCtes } from './document-settlement'
import { syncDocumentStatus } from './document-balances'
import { dossierReferenceSearch, dossierReferenceTerm } from './dossier-search'
import { guardDossierWrite, type DossierWriteContext } from './dossiers'
import { getShopifyProvenance } from '../shopify/import'
import { and, asc, desc, eq, gte, lte, ne, or, sql } from 'drizzle-orm'
import { createError } from 'h3'
import {
  customers,
  documentImports,
  documentLines,
  documents,
  payments,
  tickets
} from '~~/server/db/schema'
import { evaluateDocumentRevision } from '~~/shared/domain/documents/revision'
import { canCreateTicketDocument } from '~~/shared/domain/tickets/document-policy'
import type {
  DocumentDetail,
  DocumentLineRecord,
  DocumentListItem,
  DocumentListResponse,
  DocumentRecord,
  PaymentRecord
} from '~~/shared/types/pos'
import { buildZonedDayRange, isPayableDocumentType } from '~~/shared/utils/pos'
import type { PosDatabaseExecutor } from '../turso'
import { useDb } from '../turso'
import { runIdempotentDocumentOperation } from '../idempotency'
import { calculateCommercialTotals as calculateDocumentTotals } from '~~/shared/domain/commercial/money'
import { createTicketEvent } from '~~/server/utils/pos/ticket-events'
import { ensurePosSchema } from '~~/server/utils/pos/schema'
import { generateDocumentNumber } from '~~/server/utils/pos/numbers'
import { mapCustomer } from '~~/server/modules/customers/mapper'
import { normalizeOptionalText } from '~~/shared/lib/text'
import { getPayablePaymentDocument, recordDocumentPayment } from './payment-writes'
import { resolveCounterCustomer } from './counter-customer'

export function mapDocument(row: typeof documents.$inferSelect): DocumentRecord {
  return {
    id: row.id,
    documentNumber: row.documentNumber,
    type: row.type,
    status: row.status,
    customerId: row.customerId,
    ticketId: row.ticketId,
    issuedAt: row.issuedAt,
    dueDate: row.dueDate,
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
  }
}

function mapDocumentListItem(row: {
  id: number
  documentNumber: string
  type: DocumentRecord['type']
  status: DocumentRecord['status']
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
  paidAmount: number | null
  balanceDue: number | null
}): DocumentListItem {
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

type DocumentWriteLineInput = {
  catalogItemId?: number | null
  label: string
  quantity: number
  unitPrice: number
  vatRate: number
  lineTotal?: number | null
  categoryHint?: typeof documentLines.$inferSelect.categoryHint | null
}

type DocumentWriteInput = {
  type: typeof documents.$inferSelect.type
  status?: typeof documents.$inferSelect.status
  customerId: number
  ticketId?: number | null
  issuedAt: string
  dueDate?: string | null
  notes?: string | null
  lines: DocumentWriteLineInput[]
}

type DocumentPaymentInput = {
  method: typeof payments.$inferSelect.method
  amount?: number
  paidAt: string
  notes?: string | null
}

export function normalizeDocumentDateFrom(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? buildZonedDayRange(value).start
    : value
}

export function normalizeDocumentDateTo(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? buildZonedDayRange(value).end
    : value
}

export async function assertTicketDocumentCreationAllowed(
  executor: PosDatabaseExecutor,
  input: {
    ticketId: number
    documentType: DocumentRecord['type']
    customerId: number
    excludeDocumentId?: number
  }
) {
  const [[ticket], existingDocuments] = await Promise.all([
    executor.select({
      status: tickets.status,
      customerId: tickets.customerId
    })
      .from(tickets)
      .where(eq(tickets.id, input.ticketId))
      .limit(1),
    executor.select({ type: documents.type, status: documents.status })
      .from(documents)
      .where(and(
        eq(documents.ticketId, input.ticketId),
        input.excludeDocumentId ? ne(documents.id, input.excludeDocumentId) : undefined
      ))
  ])

  if (!ticket) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Dossier introuvable'
    })
  }

  if (ticket.customerId !== input.customerId) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Le client du document doit correspondre à celui du dossier',
      data: { code: 'TICKET_DOCUMENT_CUSTOMER_MISMATCH' }
    })
  }

  if (canCreateTicketDocument({
    ticketStatus: ticket.status,
    existingDocumentTypes: existingDocuments.map(document => document.type),
    activeDocumentTypes: existingDocuments.filter(document => document.status !== 'cancelled').map(document => document.type)
  }, input.documentType)) {
    return
  }

  const isFinalized = ticket.status === 'closed' || ticket.status === 'cancelled'
  const isDuplicate = existingDocuments.some(document => document.type === input.documentType)

  throw createError({
    statusCode: 409,
    statusMessage: isFinalized
      ? 'Les dossiers clôturés ou annulés ne peuvent pas recevoir de nouveaux documents commerciaux'
      : isDuplicate ? 'Ce dossier possède déjà un document de ce type' : 'Ce dossier possède déjà un document commercial plus avancé.',
    data: {
      code: isFinalized ? 'TICKET_FINALIZED' : isDuplicate ? 'TICKET_DOCUMENT_ALREADY_EXISTS' : 'DOCUMENT_STAGE_ALREADY_PASSED',
      documentType: input.documentType
    }
  })
}

function assertNonNegativeDocumentTotal(total: number) {
  if (total >= 0) {
    return
  }

  throw createError({
    statusCode: 400,
    statusMessage: 'Document total cannot be negative'
  })
}

async function insertDocumentWithLines(
  executor: PosDatabaseExecutor,
  input: DocumentWriteInput,
  documentNumber: string
) {
  const now = new Date().toISOString()
  const totals = calculateDocumentTotals(input.lines)

  assertNonNegativeDocumentTotal(totals.total)

  if (input.status === 'paid') {
    throw createError({
      statusCode: 400,
      statusMessage: 'Paid status is derived from recorded payments',
      data: { code: 'DOCUMENT_PAID_STATUS_DERIVED' }
    })
  }

  const insertedRows = await executor.insert(documents).values({
    documentNumber,
    type: input.type,
    status: input.status || 'issued',
    customerId: input.customerId,
    ticketId: input.ticketId ?? null,
    issuedAt: input.issuedAt,
    dueDate: input.type === 'customer_order' ? null : input.dueDate ?? null,
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

  await executor.insert(documentLines).values(totals.lines.map((line, index) => ({
    documentId: document.id,
    catalogItemId: input.lines[index]?.catalogItemId ?? null,
    label: input.lines[index]!.label,
    quantity: input.lines[index]!.quantity,
    unitPrice: input.lines[index]!.unitPrice,
    vatRate: input.lines[index]!.vatRate,
    lineTotal: line.lineTotal,
    categoryHint: input.lines[index]!.categoryHint ?? null
  })))

  return document
}

async function createDocumentCreatedEvent(
  executor: PosDatabaseExecutor,
  document: typeof documents.$inferSelect
) {
  if (!document.ticketId) {
    return
  }

  await createTicketEvent({
    ticketId: document.ticketId,
    kind: 'document_created',
    label: getDocumentCreatedLabel(document.type),
    metadata: {
      documentId: document.id,
      documentNumber: document.documentNumber,
      documentType: document.type,
      documentStatus: document.status
    },
    occurredAt: document.issuedAt
  }, executor)
}

export async function listDocuments(filters?: {
  q?: string
  type?: string
  status?: string
  dateFrom?: string
  dateTo?: string
  customerId?: number
  ticketId?: number
  paymentState?: 'all' | 'due'
  sortBy?: 'issuedAt' | 'balanceDue'
  page?: number
  pageSize?: number
}): Promise<DocumentListResponse> {
  await ensurePosSchema()

  const db = useDb()

  const page = Math.max(filters?.page || 1, 1)
  const pageSize = Math.min(Math.max(filters?.pageSize || 50, 1), 250)
  const offset = (page - 1) * pageSize
  const sortBy = filters?.sortBy || 'issuedAt'
  const searchTerm = filters?.q?.trim().toLowerCase()
  const searchPattern = searchTerm ? `%${searchTerm}%` : null
  const referenceTerm = dossierReferenceTerm(searchTerm)
  const dateFrom = filters?.dateFrom ? normalizeDocumentDateFrom(filters.dateFrom) : undefined
  const dateTo = filters?.dateTo ? normalizeDocumentDateTo(filters.dateTo) : undefined
  const customerNameValue = sql<string>`coalesce(nullif(${customers.companyName}, ''), trim(${customers.firstName} || ' ' || ${customers.lastName}))`
  // Apply cheap/search filters before calculating settlements. Related receipts
  // and active invoices remain scoped by dossier + customer, outside these filters.
  const candidateFilters = and(
    filters?.type ? eq(documents.type, filters.type as typeof documents.$inferSelect.type) : undefined,
    filters?.customerId ? eq(documents.customerId, filters.customerId) : undefined,
    filters?.ticketId ? eq(documents.ticketId, filters.ticketId) : undefined,
    dateFrom ? gte(documents.issuedAt, dateFrom) : undefined,
    dateTo ? lte(documents.issuedAt, dateTo) : undefined,
    searchPattern
      ? or(
          sql`lower(${documents.documentNumber}) like ${searchPattern}`,
          sql`lower(${customerNameValue}) like ${searchPattern}`,
          sql`${dossierReferenceSearch(sql`${tickets.ticketNumber}`)} like ${`%${referenceTerm}%`}`
        )
      : undefined
  )
  const source = sql`SELECT documents.* FROM documents
    ${searchPattern
      ? sql`INNER JOIN customers ON customers.id = documents.customer_id
      LEFT JOIN tickets ON tickets.id = documents.ticket_id`
      : sql``}
    ${candidateFilters ? sql`WHERE ${candidateFilters}` : sql``}`
  const settledFilters = and(
    filters?.status ? sql`d.settlement_status = ${filters.status}` : undefined,
    filters?.paymentState === 'due' ? sql`d.balance_due > 0` : undefined
  )
  const relevance = searchTerm
    ? sql`CASE
    WHEN lower(d.document_number) = ${searchTerm} THEN 0
    WHEN ${dossierReferenceSearch(sql`t.ticket_number`)} = ${referenceTerm} THEN 0
    WHEN lower(coalesce(nullif(c.company_name, ''), trim(c.first_name || ' ' || c.last_name))) = ${searchTerm} THEN 0
    WHEN lower(d.document_number) LIKE ${`${searchTerm}%`} THEN 1
    WHEN ${dossierReferenceSearch(sql`t.ticket_number`)} LIKE ${`${referenceTerm}%`} THEN 1
    ELSE 2 END`
    : sql`0`
  type ListRow = Parameters<typeof mapDocumentListItem>[0] & {
    resultTotal: number
    paidCount: number
    totalBalanceDue: number
  }
  const rows = await db.all<ListRow>(sql`
    WITH ${settlementCtes(source)},
    filtered AS MATERIALIZED (
      SELECT d.*, coalesce(nullif(c.company_name, ''), trim(c.first_name || ' ' || c.last_name)) AS customer_name,
        t.ticket_number, ${relevance} AS relevance
      FROM settled_documents d
      INNER JOIN customers c ON c.id = d.customer_id
      LEFT JOIN tickets t ON t.id = d.ticket_id
      ${settledFilters ? sql`WHERE ${settledFilters}` : sql``}
    ), summary AS (
      SELECT count(*) AS "resultTotal",
        coalesce(sum(CASE WHEN settlement_status = 'paid' THEN 1 ELSE 0 END), 0) AS "paidCount",
        coalesce(sum(balance_due), 0) AS "totalBalanceDue" FROM filtered
    ), page AS MATERIALIZED (
      SELECT * FROM filtered
      ORDER BY relevance, ${sortBy === 'balanceDue' ? sql`balance_due DESC,` : sql``} issued_at DESC, id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    )
    SELECT page.id, page.document_number AS "documentNumber", page.type, page.settlement_status AS status,
      page.customer_id AS "customerId", page.ticket_id AS "ticketId", page.issued_at AS "issuedAt",
      page.subtotal, page.tax_amount AS "taxAmount", page.total, page.notes,
      page.created_at AS "createdAt", page.updated_at AS "updatedAt", page.customer_name AS "customerName",
      page.ticket_number AS "ticketNumber", page.paid_amount AS "paidAmount", page.balance_due AS "balanceDue",
      summary.*
    FROM summary LEFT JOIN page ON 1 = 1
    ORDER BY page.relevance, ${sortBy === 'balanceDue' ? sql`page.balance_due DESC,` : sql``} page.issued_at DESC, page.id DESC
  `)
  const summary = rows[0]
  return {
    items: rows.filter(row => row.id != null).map(mapDocumentListItem),
    page,
    pageSize,
    total: Number(summary?.resultTotal || 0),
    summary: {
      paidCount: Number(summary?.paidCount || 0),
      totalBalanceDue: Number(summary?.totalBalanceDue || 0)
    }
  }
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

  const [lineRows, settlement, relatedDocuments] = await Promise.all([
    db.select().from(documentLines).where(eq(documentLines.documentId, id)).orderBy(asc(documentLines.id)),
    getDocumentSettlement(db, header.document),
    header.document.ticketId
      ? db.select({ id: documents.id, documentNumber: documents.documentNumber, type: documents.type, status: documents.status })
          .from(documents)
          .where(and(eq(documents.ticketId, header.document.ticketId), eq(documents.customerId, header.document.customerId), ne(documents.id, id)))
          .orderBy(asc(documents.issuedAt), asc(documents.id))
      : Promise.resolve([])
  ])

  return {
    ...mapDocument(header.document),
    relatedDocuments,
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
    shopify: await getShopifyProvenance(id, db),
    payments: settlement.payments.map(mapPayment),
    status: settlement.isPayable
      ? settlement.paidAmount >= header.document.total && header.document.total > 0 ? 'paid' : header.document.status === 'draft' ? 'draft' : 'issued'
      : header.document.status,
    settlement: {
      isPayable: settlement.isPayable,
      paidAmount: settlement.paidAmount,
      balanceDue: settlement.balanceDue,
      activeDocument: settlement.activeDocument ? { id: settlement.activeDocument.id, documentNumber: settlement.activeDocument.documentNumber, type: settlement.activeDocument.type } : null
    }
  }
}

export async function createDocumentRecord(input: DocumentWriteInput, idempotency: {
  key: string
  payload?: unknown
  dossier?: DossierWriteContext
}) {
  await ensurePosSchema()

  const db = useDb()
  const result = await runIdempotentDocumentOperation({
    database: db,
    source: 'api_document_create',
    key: idempotency.key,
    payload: idempotency.payload ?? input,
    async execute(tx) {
      if (input.ticketId) {
        await guardDossierWrite(tx, [{ kind: 'ticket', id: input.ticketId }], idempotency.dossier)
        await assertTicketDocumentCreationAllowed(tx, {
          ticketId: input.ticketId,
          documentType: input.type,
          customerId: input.customerId
        })
      }

      const documentNumber = await generateDocumentNumber(input.type, tx)
      const createdDocument = await insertDocumentWithLines(tx, input, documentNumber)
      const settlement = await getDocumentSettlement(tx, createdDocument)
      if (settlement.isPayable && settlement.paidAmount > createdDocument.total) {
        throw createError({ statusCode: 409, statusMessage: 'Le total ne peut pas être inférieur aux acomptes déjà encaissés.', data: { code: 'DOCUMENT_TOTAL_BELOW_PAID' } })
      }
      await syncDocumentStatus(createdDocument.id, tx)
      await createDocumentCreatedEvent(tx, createdDocument)

      return {
        value: createdDocument.id,
        documentId: createdDocument.id,
        resourceId: createdDocument.id
      }
    },
    async replay(tx, receipt) {
      const [existing] = await tx.select({ id: documents.id })
        .from(documents)
        .where(eq(documents.id, receipt.documentId))
        .limit(1)

      if (!existing) {
        throw createError({
          statusCode: 409,
          statusMessage: 'The result of this idempotent operation no longer exists',
          data: { code: 'IDEMPOTENCY_RESOURCE_MISSING' }
        })
      }

      return existing.id
    }
  })

  return getDocumentById(result.value)
}

export async function createAndPayDocumentRecord(
  input: Omit<DocumentWriteInput, 'customerId'> & { customerId: number | null },
  paymentInput: Omit<DocumentPaymentInput, 'amount'>,
  idempotencyKey: string,
  dossier?: DossierWriteContext
) {
  await ensurePosSchema()

  if (!isPayableDocumentType(input.type)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Only customer orders and invoices can be created and paid'
    })
  }

  if (input.customerId === null && input.ticketId) {
    throw createError({ statusCode: 400, statusMessage: 'Un document lié à un dossier doit conserver son client' })
  }

  const totals = calculateDocumentTotals(input.lines)

  assertNonNegativeDocumentTotal(totals.total)

  if (totals.total <= 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'A paid sale total must be greater than zero'
    })
  }

  const db = useDb()
  const result = await runIdempotentDocumentOperation({
    database: db,
    source: 'api_sale_create_and_pay',
    key: idempotencyKey,
    payload: { document: input, payment: paymentInput },
    async execute(tx) {
      const customerId = input.customerId ?? await resolveCounterCustomer(tx)
      if (input.ticketId) {
        await guardDossierWrite(tx, [{ kind: 'ticket', id: input.ticketId }], dossier)
        await assertTicketDocumentCreationAllowed(tx, {
          ticketId: input.ticketId,
          documentType: input.type,
          customerId
        })
      }

      const documentNumber = await generateDocumentNumber(input.type, tx)
      const createdDocument = await insertDocumentWithLines(tx, {
        ...input,
        customerId,
        status: 'issued'
      }, documentNumber)

      const settlement = await getDocumentSettlement(tx, createdDocument)
      if (settlement.isPayable && settlement.paidAmount > createdDocument.total) {
        throw createError({ statusCode: 409, statusMessage: 'Le total ne peut pas être inférieur aux acomptes déjà encaissés.', data: { code: 'DOCUMENT_TOTAL_BELOW_PAID' } })
      }
      await syncDocumentStatus(createdDocument.id, tx)
      await createDocumentCreatedEvent(tx, createdDocument)

      const payment = settlement.balanceDue > 0
        ? await recordDocumentPayment(tx, createdDocument, {
            ...paymentInput,
            status: 'paid',
            amount: settlement.balanceDue
          })
        : null

      return {
        value: createdDocument.id,
        documentId: createdDocument.id,
        resourceId: payment?.id ?? createdDocument.id
      }
    },
    async replay(tx, receipt) {
      const [existing] = await tx.select({ id: documents.id })
        .from(documents)
        .where(eq(documents.id, receipt.documentId))
        .limit(1)

      if (!existing) {
        throw createError({
          statusCode: 409,
          statusMessage: 'The result of this idempotent operation no longer exists',
          data: { code: 'IDEMPOTENCY_RESOURCE_MISSING' }
        })
      }

      return existing.id
    }
  })

  return getDocumentById(result.value)
}

export async function updateDocumentRecord(id: number, input: DocumentWriteInput, dossier?: DossierWriteContext) {
  await ensurePosSchema()

  const db = useDb()
  const totals = calculateDocumentTotals(input.lines)
  const nextStatus = input.status || 'issued'
  const isPayable = isPayableDocumentType(input.type)

  assertNonNegativeDocumentTotal(totals.total)

  if (!isPayable && nextStatus === 'paid') {
    throw createError({
      statusCode: 400,
      statusMessage: 'This document type cannot be paid directly'
    })
  }

  await db.transaction(async (tx) => {
    await guardDossierWrite(tx, [{ kind: 'document', id }, ...(input.ticketId ? [{ kind: 'ticket' as const, id: input.ticketId }] : [])], dossier, input.ticketId ? [] : [`document:${id}`])
    const [existingDocument] = await tx.select().from(documents).where(eq(documents.id, id)).limit(1)

    if (!existingDocument) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Document not found'
      })
    }

    const settlement = await getDocumentSettlement(tx, existingDocument)
    if (settlement.activeDocument && settlement.activeDocument.id !== id && existingDocument.status !== 'cancelled') {
      throw createError({ statusCode: 409, statusMessage: 'Modifiez le document courant du dossier ; cette étape est conservée dans l’historique.', data: { code: 'DOCUMENT_SUPERSEDED', documentId: settlement.activeDocument.id } })
    }
    if (existingDocument.ticketId && (input.ticketId !== existingDocument.ticketId || input.type !== existingDocument.type || input.customerId !== existingDocument.customerId)) {
      const related = await tx.select({ id: documents.id }).from(documents).where(eq(documents.ticketId, existingDocument.ticketId))
      if (related.length > 1) {
        throw createError({ statusCode: 409, statusMessage: 'Les documents successifs doivent conserver leur dossier, leur client et leur type.', data: { code: 'DOCUMENT_OPERATION_IMMUTABLE' } })
      }
    }
    const paymentSummary = { count: settlement.payments.length, paidTotal: settlement.paidAmount }

    if (input.ticketId) {
      await assertTicketDocumentCreationAllowed(tx, {
        ticketId: input.ticketId,
        documentType: input.type,
        customerId: input.customerId,
        excludeDocumentId: id
      })
    }

    if (input.type === 'invoice' && input.ticketId && input.ticketId !== existingDocument.ticketId) {
      const destination = await getDocumentSettlement(tx, { ...existingDocument, ticketId: input.ticketId, customerId: input.customerId, type: input.type })
      paymentSummary.count = destination.payments.length
      paymentSummary.paidTotal = destination.paidAmount
    }

    const revision = evaluateDocumentRevision({
      currentType: existingDocument.type,
      nextType: input.type,
      requestedStatus: nextStatus,
      nextTotal: totals.total,
      paymentCount: Number(paymentSummary?.count || 0),
      paidTotal: Number(paymentSummary?.paidTotal || 0),
      nextTypeIsPayable: isPayable
    })

    if (!revision.ok) {
      const messages = {
        DOCUMENT_TOTAL_BELOW_PAID: 'Document total cannot be lower than the amount already paid',
        DOCUMENT_TYPE_WITH_PAYMENTS_IMMUTABLE: 'A document with payments cannot change commercial type',
        PAID_DOCUMENT_CANNOT_BE_CANCELLED: 'A paid document cannot be cancelled without a correction or refund'
      } satisfies Record<typeof revision.code, string>

      throw createError({
        statusCode: 409,
        statusMessage: messages[revision.code],
        data: {
          code: revision.code,
          paidTotal: Number(paymentSummary?.paidTotal || 0)
        }
      })
    }

    const updatedRows = await tx.update(documents)
      .set({
        type: input.type,
        status: revision.status,
        customerId: input.customerId,
        ticketId: input.ticketId ?? null,
        issuedAt: input.issuedAt,
        dueDate: input.type === 'customer_order' ? null : input.dueDate === undefined ? existingDocument.dueDate : input.dueDate,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        total: totals.total,
        notes: normalizeOptionalText(input.notes),
        updatedAt: new Date().toISOString()
      })
      .where(eq(documents.id, id))
      .returning()

    if (!updatedRows[0]) {
      throw createError({
        statusCode: 404,
        statusMessage: 'Document not found'
      })
    }

    if (Number(paymentSummary?.count || 0) > 0) {
      await tx.update(payments)
        .set({
          customerId: input.customerId,
          updatedAt: new Date().toISOString()
        })
        .where(eq(payments.documentId, id))
    }

    await tx.delete(documentLines).where(eq(documentLines.documentId, id))
    await tx.insert(documentLines).values(totals.lines.map((line, index) => ({
      documentId: id,
      catalogItemId: input.lines[index]?.catalogItemId ?? null,
      label: input.lines[index]!.label,
      quantity: input.lines[index]!.quantity,
      unitPrice: input.lines[index]!.unitPrice,
      vatRate: input.lines[index]!.vatRate,
      lineTotal: line.lineTotal,
      categoryHint: input.lines[index]!.categoryHint ?? null
    })))
  })

  return getDocumentById(id)
}

export async function assertDocumentDeletionAllowed(executor: PosDatabaseExecutor, id: number) {
  const [[document], [paymentSummary], [receiptSummary]] = await Promise.all([
    executor.select().from(documents).where(eq(documents.id, id)).limit(1),
    executor.select({
      count: sql<number>`count(*)`,
      paidTotal: sql<number>`coalesce(sum(case when ${payments.status} = 'paid' then ${payments.amount} else 0 end), 0)`
    }).from(payments).where(eq(payments.documentId, id)),
    executor.select({ count: sql<number>`count(*)` })
      .from(documentImports)
      .where(eq(documentImports.documentId, id))
  ])

  if (!document) {
    return null
  }

  if (document.ticketId) {
    const related = await executor.select({ id: documents.id }).from(documents).where(eq(documents.ticketId, document.ticketId)).limit(2)
    if (related.length > 1) {
      throw createError({ statusCode: 409, statusMessage: 'Conservez les documents successifs du dossier ; annulez le document courant si nécessaire.', data: { code: 'DOCUMENT_OPERATION_IMMUTABLE' } })
    }
  }

  if (Number(receiptSummary?.count || 0) > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Documents protected by an idempotency receipt cannot be deleted. Cancel them instead.',
      data: { code: 'DOCUMENT_IDEMPOTENCY_PROTECTED' }
    })
  }

  if (document.status === 'paid' || Number(paymentSummary?.count || 0) > 0 || Number(paymentSummary?.paidTotal || 0) > 0) {
    throw createError({
      statusCode: 409,
      statusMessage: 'Documents with payments cannot be deleted. Cancel the document or record a correction instead.'
    })
  }

  return document
}

export async function deleteDocument(id: number, dossier?: DossierWriteContext) {
  await ensurePosSchema()

  const db = useDb()
  return db.transaction(async (tx) => {
    await guardDossierWrite(tx, [{ kind: 'document', id }], dossier)
    const document = await assertDocumentDeletionAllowed(tx, id)

    if (!document) {
      return 0
    }

    const result = await tx.delete(documents).where(eq(documents.id, id))

    return result.rowsAffected
  })
}

export async function markDocumentAsPaid(id: number, input: DocumentPaymentInput, idempotencyKey: string, dossier?: DossierWriteContext) {
  await ensurePosSchema()

  const db = useDb()
  await runIdempotentDocumentOperation({
    database: db,
    source: 'api_document_mark_paid',
    key: `${id}:${idempotencyKey}`,
    payload: { documentId: id, payment: input },
    async execute(tx) {
      await guardDossierWrite(tx, [{ kind: 'document', id }], dossier)
      const document = await getPayablePaymentDocument(tx, id)
      const payment = await recordDocumentPayment(tx, document, { ...input, status: 'paid' })

      return {
        value: document.id,
        documentId: document.id,
        resourceId: payment.id
      }
    },
    async replay(tx, receipt) {
      const [payment] = await tx.select({ id: payments.id })
        .from(payments)
        .where(and(
          eq(payments.id, receipt.resourceId),
          eq(payments.documentId, receipt.documentId)
        ))
        .limit(1)

      if (!payment) {
        throw createError({
          statusCode: 409,
          statusMessage: 'The result of this idempotent operation no longer exists',
          data: { code: 'IDEMPOTENCY_RESOURCE_MISSING' }
        })
      }

      return receipt.documentId
    }
  })

  return getDocumentById(id)
}

export async function cloneDocumentLinesFromLatest(ticketId: number, preferredType?: typeof documents.$inferSelect.type) {
  await ensurePosSchema()

  const db = useDb()
  const candidates = await db.select()
    .from(documents)
    .where(and(
      eq(documents.ticketId, ticketId),
      ne(documents.status, 'cancelled'),
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
