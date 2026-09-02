import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { customers, documentImports, documentLines, documents, payments } from '~~/server/db/schema'
import type { ShopifyImportResult, ShopifyOrderList, ShopifyOrderSummary, ShopifyProvenance } from '~~/shared/types/shopify'
import { fingerprintIdempotencyPayload } from '../idempotency'
import { mapCustomerInput } from '../pos/customers'
import { ensurePosSchema } from '~~/server/utils/pos/schema'
import { generateDocumentNumber } from '~~/server/utils/pos/numbers'
import { syncDocumentStatus } from '~~/server/utils/pos/document-balances'
import { useDb, type PosDatabase, type PosDatabaseExecutor } from '../turso'
import { connectShopify, fetchShopifyOrder, fetchShopifyOrders, findShopifyOrder, type RemoteSummary } from './client'
import { moneyToCents, normalizeShopifyOrder, shopifyError, type ShopifyOrder, type ShopifyLine } from './model'

const orderReceiptSchema = z.object({ version: z.literal(1), name: z.string(), fingerprint: z.string() })
const paymentReceiptSchema = z.object({ version: z.literal(1), paymentId: z.number(), amount: z.number(), paidAt: z.string(), gateway: z.string(), notes: z.string() })
const externalId = (domain: string, id: string) => `${domain}:${id}`
function receipt<T>(value: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(value))
  } catch {
    return shopifyError('La trace d’import Shopify est invalide. Un contrôle manuel est nécessaire.', 'SHOPIFY_IMPORT_CONFLICT', 409)
  }
}

export async function getShopifyProvenance(documentId: number, db: PosDatabaseExecutor = useDb()): Promise<ShopifyProvenance | null> {
  const [row] = await db.select().from(documentImports).where(and(eq(documentImports.documentId, documentId), eq(documentImports.source, 'shopify_order'))).limit(1)
  if (!row) return null
  const match = /^([a-z0-9-]+\.myshopify\.com):(gid:\/\/shopify\/Order\/\d+)$/.exec(row.externalId)
  if (!match) return shopifyError('La provenance Shopify est invalide.', 'SHOPIFY_IMPORT_CONFLICT', 409)
  return { domain: match[1]!, orderId: match[2]!, orderName: receipt(row.externalNumber, orderReceiptSchema).name }
}

async function summary(domain: string, rows: RemoteSummary[], db: PosDatabaseExecutor): Promise<ShopifyOrderSummary[]> {
  const ids = rows.map(o => externalId(domain, o.id))
  const imports = ids.length ? await db.select().from(documentImports).where(and(eq(documentImports.source, 'shopify_order'), inArray(documentImports.externalId, ids))) : []
  const imported = new Map(imports.map(r => [r.externalId, r.documentId]))
  return rows.map(order => ({
    id: order.id, name: order.name, createdAt: order.createdAt,
    customerName: order.billingAddress?.name || order.shippingAddress?.name || order.email || order.phone || 'Sans coordonnées',
    financialStatus: order.displayFinancialStatus || 'UNKNOWN', fulfillmentStatus: order.displayFulfillmentStatus,
    currency: order.currentTotalPriceSet.shopMoney.currencyCode, totalCents: moneyToCents(order.currentTotalPriceSet.shopMoney.amount),
    documentId: imported.get(externalId(domain, order.id)) ?? null
  }))
}

export async function listShopifyOrders(event: H3Event, after?: string): Promise<ShopifyOrderList> {
  const { config } = await connectShopify(event)
  const result = await fetchShopifyOrders(config, after)
  await ensurePosSchema()
  return { items: await summary(config.domain, result.nodes.filter(o => !o.cancelledAt && !o.test), useDb()), pageInfo: result.pageInfo }
}

export async function searchShopifyOrder(event: H3Event, orderRef: string): Promise<ShopifyOrderSummary> {
  const { config } = await connectShopify(event)
  const order = await findShopifyOrder(config, orderRef)
  // Validate eligibility before offering the import action.
  normalizeShopifyOrder(order)
  await ensurePosSchema()
  return (await summary(config.domain, [{ ...order, billingAddress: { name: customerName(order) }, shippingAddress: null }], useDb()))[0]!
}

function customerName(order: ShopifyOrder) {
  const a = order.billingAddress || order.shippingAddress
  return [a?.firstName, a?.lastName].filter(Boolean).join(' ').trim() || a?.company || `Commande Shopify ${order.name}`
}

async function resolveCustomer(order: ShopifyOrder, tx: PosDatabaseExecutor) {
  const email = order.email?.trim().toLowerCase() || null
  if (email) {
    const matches = await tx.select({ id: customers.id }).from(customers).where(sql`lower(trim(${customers.email})) = ${email}`).limit(2)
    if (matches.length > 1) return shopifyError('Plusieurs clients utilisent cet e-mail. Corrigez les doublons avant l’import.', 'SHOPIFY_CUSTOMER_CONFLICT', 409)
    if (matches[0]) return matches[0].id
  }
  const a = order.billingAddress || order.shippingAddress
  const now = new Date().toISOString()
  const [customer] = await tx.insert(customers).values({
    ...mapCustomerInput({ displayName: customerName(order), firstName: a?.firstName, lastName: a?.lastName, companyName: a?.company,
      email, phone: order.phone || a?.phone, addressLine1: a?.address1, addressLine2: a?.address2, postalCode: a?.zip, city: a?.city,
      notes: `Client créé depuis Shopify ${order.name}` }), createdAt: now, updatedAt: now
  }).returning({ id: customers.id })
  if (!customer) return shopifyError('Impossible de créer le client Shopify.', 'SHOPIFY_IMPORT_FAILED', 500)
  return customer.id
}

function commercialPayload(lines: ShopifyLine[], total: number, taxAmount: number) {
  return { lines: lines.map(({ label, quantity, unitPrice, vatRate }) => ({ label, quantity, unitPrice, vatRate })), total, taxAmount }
}

async function persistPayments(tx: PosDatabaseExecutor, domain: string, order: ShopifyOrder, document: { id: number, customerId: number }, incoming: ReturnType<typeof normalizeShopifyOrder>['payments']) {
  const now = new Date().toISOString()
  for (const payment of incoming) {
    const notes = `Shopify ${order.name} · ${payment.gateway} · ${payment.transactionId}`
    const [created] = await tx.insert(payments).values({ documentId: document.id, customerId: document.customerId, method: 'shopify', status: 'paid', amount: payment.amount, paidAt: payment.paidAt, notes, createdAt: now, updatedAt: now }).returning({ id: payments.id })
    if (!created) return shopifyError('Impossible de créer le paiement Shopify.', 'SHOPIFY_IMPORT_FAILED', 500)
    await tx.insert(documentImports).values({ documentId: document.id, source: 'shopify_payment', externalId: externalId(domain, payment.transactionId), externalNumber: JSON.stringify({ version: 1, paymentId: created.id, amount: payment.amount, paidAt: payment.paidAt, gateway: payment.gateway, notes }), createdAt: now })
  }
  await syncDocumentStatus(document.id, tx)
}

async function existingResult(db: PosDatabaseExecutor, domain: string, order: ShopifyOrder): Promise<ShopifyImportResult | null> {
  const [existing] = await db.select({ id: documents.id, number: documents.documentNumber }).from(documentImports).innerJoin(documents, eq(documents.id, documentImports.documentId)).where(and(eq(documentImports.source, 'shopify_order'), eq(documentImports.externalId, externalId(domain, order.id)))).limit(1)
  return existing ? { documentId: existing.id, documentNumber: existing.number, orderName: order.name, paymentsAdded: 0, alreadyImported: true } : null
}

// Exported separately so financial integration tests exercise real SQLite transactions
// without credentials or network requests.
export async function persistShopifyOrder(domain: string, order: ShopifyOrder, db: PosDatabase = useDb()): Promise<ShopifyImportResult> {
  const prior = await existingResult(db, domain, order)
  if (prior) return prior
  const normalized = normalizeShopifyOrder(order)
  const fingerprint = await fingerprintIdempotencyPayload(commercialPayload(normalized.lines, normalized.totals.total, normalized.totals.taxAmount))
  try {
    return await db.transaction(async (tx) => {
      const existing = await existingResult(tx, domain, order)
      if (existing) return existing
      const customerId = await resolveCustomer(order, tx)
      const documentNumber = await generateDocumentNumber('invoice', tx)
      const now = new Date().toISOString()
      const [document] = await tx.insert(documents).values({ documentNumber, customerId, ticketId: null, type: 'invoice', status: 'issued',
        issuedAt: order.createdAt, subtotal: normalized.totals.subtotal, taxAmount: normalized.totals.taxAmount, total: normalized.totals.total,
        notes: [`Import Shopify ${order.name} (${domain})`, order.note].filter(Boolean).join('\n\n'), createdAt: now, updatedAt: now }).returning()
      if (!document) return shopifyError('Impossible de créer la facture Shopify.', 'SHOPIFY_IMPORT_FAILED', 500)
      await tx.insert(documentLines).values(normalized.totals.lines.map(line => ({ documentId: document.id, catalogItemId: null, label: line.label, quantity: line.quantity, unitPrice: line.unitPrice, vatRate: line.vatRate, lineTotal: line.lineTotal, categoryHint: null })))
      await tx.insert(documentImports).values({ documentId: document.id, source: 'shopify_order', externalId: externalId(domain, order.id), externalNumber: JSON.stringify({ version: 1, name: order.name, fingerprint }), createdAt: now })
      await persistPayments(tx, domain, order, document, normalized.payments)
      return { documentId: document.id, documentNumber, orderName: order.name, paymentsAdded: normalized.payments.length, alreadyImported: false }
    })
  } catch (error) {
    // A concurrent import may have won the unique source/external-id constraint.
    const concurrent = await existingResult(db, domain, order)
    if (concurrent) return concurrent
    throw error
  }
}

export async function importShopifyOrder(event: H3Event, orderRef: string) {
  const { config } = await connectShopify(event)
  const order = await findShopifyOrder(config, orderRef)
  await ensurePosSchema()
  return persistShopifyOrder(config.domain, order)
}

export async function persistShopifyPaymentSync(domain: string, order: ShopifyOrder, documentId: number, db: PosDatabase = useDb()): Promise<ShopifyImportResult> {
  const normalized = normalizeShopifyOrder(order)
  const remoteFingerprint = await fingerprintIdempotencyPayload(commercialPayload(normalized.lines, normalized.totals.total, normalized.totals.taxAmount))
  return db.transaction(async (tx) => {
    const [imported] = await tx.select().from(documentImports).where(and(eq(documentImports.documentId, documentId), eq(documentImports.source, 'shopify_order'), eq(documentImports.externalId, externalId(domain, order.id)))).limit(1)
    const [document] = await tx.select().from(documents).where(eq(documents.id, documentId)).limit(1)
    if (!imported || !document || document.status === 'cancelled' || document.type !== 'invoice') return shopifyError('Cette facture ne peut pas être actualisée depuis Shopify.', 'SHOPIFY_IMPORT_CONFLICT', 409)
    const original = receipt(imported.externalNumber, orderReceiptSchema)
    const lines = await tx.select().from(documentLines).where(eq(documentLines.documentId, documentId)).orderBy(asc(documentLines.id))
    if (document.subtotal !== document.total - document.taxAmount || lines.some(line => line.lineTotal !== line.quantity * line.unitPrice)) {
      return shopifyError('Les montants de la facture sont incohérents. Rapprochement manuel requis.', 'SHOPIFY_IMPORT_CONFLICT', 409)
    }
    const localFingerprint = await fingerprintIdempotencyPayload(commercialPayload(lines, document.total, document.taxAmount))
    if (localFingerprint !== original.fingerprint || remoteFingerprint !== original.fingerprint) return shopifyError('La facture ou la commande Shopify a été modifiée. Rapprochez les montants manuellement.', 'SHOPIFY_IMPORT_CONFLICT', 409)
    const localPayments = await tx.select().from(payments).where(eq(payments.documentId, documentId))
    const traces = await tx.select().from(documentImports).where(and(eq(documentImports.documentId, documentId), eq(documentImports.source, 'shopify_payment')))
    if (localPayments.length !== traces.length) return shopifyError('Des paiements ont été ajoutés ou supprimés dans le POS. Rapprochement manuel requis.', 'SHOPIFY_PAYMENT_CONFLICT', 409)
    const existingIds = new Set<string>()
    const paymentIds = new Set<number>()
    for (const trace of traces) {
      const stored = receipt(trace.externalNumber, paymentReceiptSchema)
      const local = localPayments.find(p => p.id === stored.paymentId)
      const remote = normalized.payments.find(p => externalId(domain, p.transactionId) === trace.externalId)
      if (!local || !remote || paymentIds.has(local.id) || local.status !== 'paid' || local.method !== 'shopify' || local.customerId !== document.customerId || local.amount !== stored.amount || local.paidAt !== stored.paidAt || local.notes !== stored.notes || remote.amount !== stored.amount || remote.paidAt !== stored.paidAt || remote.gateway !== stored.gateway) {
        return shopifyError('Un paiement importé a été modifié. Rapprochement manuel requis.', 'SHOPIFY_PAYMENT_CONFLICT', 409)
      }
      existingIds.add(trace.externalId)
      paymentIds.add(local.id)
    }
    const incoming = normalized.payments.filter(p => !existingIds.has(externalId(domain, p.transactionId)))
    const totalPaid = [...localPayments, ...incoming].reduce((sum, p) => sum + p.amount, 0)
    if (totalPaid > document.total) return shopifyError('Les paiements dépasseraient le solde de la facture.', 'SHOPIFY_PAYMENT_CONFLICT', 409)
    await persistPayments(tx, domain, order, document, incoming)
    return { documentId, documentNumber: document.documentNumber, orderName: order.name, paymentsAdded: incoming.length, alreadyImported: true }
  })
}

export async function syncShopifyPayments(event: H3Event, documentId: number) {
  const { config } = await connectShopify(event)
  await ensurePosSchema()
  const origin = await getShopifyProvenance(documentId)
  if (!origin || origin.domain !== config.domain) return shopifyError('Cette facture ne provient pas de la boutique Shopify connectée.', 'SHOPIFY_SHOP_MISMATCH', 409)
  return persistShopifyPaymentSync(config.domain, await fetchShopifyOrder(config, origin.orderId), documentId)
}
