import { eq } from 'drizzle-orm'
import { customers, documentImports, documentLines, documents } from '~~/server/db/schema'
import { woocommerceOpenOrderStatuses } from '~~/shared/constants/pos'
import type { CustomerUpsertInput, WooImportResult, WooOrderListResponse, WooOrderSummary } from '~~/shared/types/pos'
import { getDocumentImportByExternalId, listDocumentImportsByExternalIds } from './document-imports'
import { mapCustomerInput } from './pos/customers'
import { calculateDocumentTotals, ensurePosSchema, generateDocumentNumber, normalizeOptionalText } from './pos/core'
import { useDb } from './turso'

type WooOrderMeta = {
  key?: string
  value?: unknown
  display_key?: unknown
  display_value?: unknown
}

type WooOrderLineItem = {
  id: number
  name?: string
  quantity?: number
  total?: string
  total_tax?: string
  meta_data?: WooOrderMeta[]
}

type WooShippingLine = {
  id: number
  method_title?: string
  total?: string
  total_tax?: string
}

type WooFeeLine = {
  id: number
  name?: string
  total?: string
  total_tax?: string
}

type WooOrder = {
  id: number
  number: string
  status: string
  currency?: string
  date_created?: string
  total?: string
  total_tax?: string
  discount_total?: string
  customer_note?: string
  coupon_lines?: Array<unknown>
  tax_lines?: Array<unknown>
  billing?: {
    first_name?: string
    last_name?: string
    company?: string
    address_1?: string
    address_2?: string
    postcode?: string
    city?: string
    email?: string
    phone?: string
  }
  line_items?: WooOrderLineItem[]
  shipping_lines?: WooShippingLine[]
  fee_lines?: WooFeeLine[]
}

const WOOCOMMERCE_SOURCE = 'woocommerce_order' as const
const DEFAULT_POS_VAT_RATE = 8.1
const wooHonorificCompanyNames = new Set([
  'm',
  'mr',
  'mrs',
  'mme',
  'mlle',
  'mademoiselle',
  'madame',
  'monsieur'
])
type WooCustomerDb = Pick<ReturnType<typeof useDb>, 'insert' | 'select'>

function getWooCommerceConfig() {
  const config = useRuntimeConfig()
  const storeUrl = normalizeOptionalText(config.woocommerceStoreUrl)
  const consumerKey = normalizeOptionalText(config.woocommerceConsumerKey)
  const consumerSecret = normalizeOptionalText(config.woocommerceConsumerSecret)

  if (!storeUrl || !consumerKey || !consumerSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'La configuration WooCommerce est incomplète.'
    })
  }

  return {
    storeUrl: storeUrl.replace(/\/+$/, ''),
    consumerKey,
    consumerSecret
  }
}

function getWooCommerceAuthorizationHeader(consumerKey: string, consumerSecret: string) {
  const raw = `${consumerKey}:${consumerSecret}`

  if (typeof btoa === 'function') {
    return `Basic ${btoa(raw)}`
  }

  return `Basic ${Buffer.from(raw).toString('base64')}`
}

async function wooCommerceRequest<T>(path: string, query: Record<string, string | number | undefined> = {}) {
  const { storeUrl, consumerKey, consumerSecret } = getWooCommerceConfig()
  const url = new URL(`/wp-json/wc/v3${path}`, storeUrl)

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue
    }

    url.searchParams.set(key, String(value))
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: getWooCommerceAuthorizationHeader(consumerKey, consumerSecret)
    }
  })

  const payload = await response.json().catch(() => null) as Record<string, unknown> | T | null

  if (!response.ok) {
    const message = payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
      ? payload.message
      : 'WooCommerce a refusé la requête.'

    throw createError({
      statusCode: response.status,
      statusMessage: message
    })
  }

  return {
    data: payload as T,
    headers: response.headers
  }
}

function normalizeOrderRef(orderRef: string) {
  return orderRef.trim().replace(/^#/, '')
}

function parseMoneyToCents(value: string | number | null | undefined) {
  const amount = typeof value === 'number' ? value : Number(String(value || '0').replace(',', '.'))

  if (!Number.isFinite(amount)) {
    return 0
  }

  return Math.round(amount * 100)
}

function getErrorMessage(error: unknown) {
  if (!error || typeof error !== 'object') {
    return ''
  }

  if ('message' in error && typeof error.message === 'string') {
    return error.message
  }

  if ('cause' in error && error.cause && typeof error.cause === 'object' && 'message' in error.cause && typeof error.cause.message === 'string') {
    return error.cause.message
  }

  return ''
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') {
    return ''
  }

  if ('code' in error && typeof error.code === 'string') {
    return error.code
  }

  if ('cause' in error && error.cause && typeof error.cause === 'object' && 'code' in error.cause && typeof error.cause.code === 'string') {
    return error.cause.code
  }

  return ''
}

function isDocumentImportConflictError(error: unknown) {
  const message = getErrorMessage(error)
  const code = getErrorCode(error)

  // libSQL/SQLite error shapes vary a bit by runtime and driver version.
  // Keep both code and message matching so duplicate imports still map to a clean 409.
  if (code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT') {
    return true
  }

  return message.includes('document_imports_source_external_id_idx')
    || message.includes('UNIQUE constraint failed: document_imports.source, document_imports.external_id')
}

function computeVatRate(netCents: number, taxCents: number) {
  if (netCents <= 0 || taxCents <= 0) {
    return 0
  }

  return Number(((taxCents / netCents) * 100).toFixed(3))
}

function normalizeWooCompanyName(order: WooOrder) {
  const company = normalizeOptionalText(order.billing?.company)

  if (!company) {
    return null
  }

  const normalizedCompany = company
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')

  const hasPersonName = Boolean(
    normalizeOptionalText(order.billing?.first_name)
    || normalizeOptionalText(order.billing?.last_name)
  )

  if (hasPersonName && wooHonorificCompanyNames.has(normalizedCompany)) {
    return null
  }

  return company
}

function resolveWooVatRate(netCents: number, taxCents: number) {
  if (netCents > 0 && taxCents <= 0) {
    return DEFAULT_POS_VAT_RATE
  }

  return computeVatRate(netCents, taxCents)
}

function formatMetaEntry(meta: WooOrderMeta) {
  const displayKey = normalizeOptionalText(typeof meta.display_key === 'string' ? meta.display_key : null)
  const displayValue = normalizeOptionalText(typeof meta.display_value === 'string' ? meta.display_value : null)
  const rawKey = normalizeOptionalText(typeof meta.key === 'string' ? meta.key : null)

  if (!displayValue || (rawKey && rawKey.startsWith('_'))) {
    return null
  }

  if (!displayKey || displayKey === displayValue) {
    return displayValue
  }

  return `${displayKey}: ${displayValue}`
}

function buildWooLineLabel(baseLabel: string, metaData?: WooOrderMeta[]) {
  const base = normalizeOptionalText(baseLabel) || 'Article WooCommerce'

  if (!metaData?.length) {
    return base
  }

  const parts = [...new Set(metaData
    .map(formatMetaEntry)
    .filter((entry): entry is string => Boolean(entry)))]

  if (!parts.length) {
    return base
  }

  return `${base} · ${parts.join(' · ')}`
}

function buildWooCustomerName(order: WooOrder) {
  const firstName = normalizeOptionalText(order.billing?.first_name)
  const lastName = normalizeOptionalText(order.billing?.last_name)
  const company = normalizeWooCompanyName(order)
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()

  return fullName || company || `Commande Woo #${order.number}`
}

function mapWooOrderSummary(order: WooOrder, importedDocumentId: number | null): WooOrderSummary {
  const alreadyImported = importedDocumentId !== null

  return {
    id: order.id,
    number: order.number,
    status: order.status,
    createdAt: order.date_created || new Date().toISOString(),
    currency: normalizeOptionalText(order.currency) || 'CHF',
    customerName: buildWooCustomerName(order),
    email: normalizeOptionalText(order.billing?.email),
    phone: normalizeOptionalText(order.billing?.phone),
    totalCents: parseMoneyToCents(order.total),
    importState: alreadyImported ? 'imported' : 'ready',
    alreadyImported,
    documentId: importedDocumentId
  }
}

function buildWooDocumentLines(order: WooOrder) {
  const productLines = (order.line_items || [])
    .map((line) => {
      const quantity = Math.max(Number(line.quantity || 0), 1)
      const netTotal = parseMoneyToCents(line.total)
      const taxTotal = parseMoneyToCents(line.total_tax)
      const lineTotal = netTotal + taxTotal

      if (lineTotal <= 0) {
        return null
      }

      return {
        catalogItemId: null,
        label: buildWooLineLabel(line.name || 'Article WooCommerce', line.meta_data),
        quantity,
        unitPrice: Math.round(lineTotal / quantity),
        vatRate: resolveWooVatRate(netTotal, taxTotal),
        lineTotal,
        categoryHint: null
      }
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line))

  const shippingLines = (order.shipping_lines || [])
    .map((line) => {
      const netTotal = parseMoneyToCents(line.total)
      const taxTotal = parseMoneyToCents(line.total_tax)
      const lineTotal = netTotal + taxTotal

      if (lineTotal <= 0) {
        return null
      }

      return {
        catalogItemId: null,
        label: `Livraison · ${normalizeOptionalText(line.method_title) || 'WooCommerce'}`,
        quantity: 1,
        unitPrice: lineTotal,
        vatRate: resolveWooVatRate(netTotal, taxTotal),
        lineTotal,
        categoryHint: null
      }
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line))

  const feeLines = (order.fee_lines || [])
    .map((line) => {
      const netTotal = parseMoneyToCents(line.total)
      const taxTotal = parseMoneyToCents(line.total_tax)
      const lineTotal = netTotal + taxTotal

      if (lineTotal <= 0) {
        return null
      }

      return {
        catalogItemId: null,
        label: normalizeOptionalText(line.name) || 'Frais WooCommerce',
        quantity: 1,
        unitPrice: lineTotal,
        vatRate: resolveWooVatRate(netTotal, taxTotal),
        lineTotal,
        categoryHint: null
      }
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line))

  const referenceLine = {
    catalogItemId: null,
    label: `Commande ShopyPhone #${order.number}`,
    quantity: 1,
    unitPrice: 0,
    vatRate: 0,
    lineTotal: 0,
    categoryHint: null
  }

  return [...productLines, ...shippingLines, ...feeLines, referenceLine]
}

function assertWooOrderSupported(order: WooOrder) {
  const currency = (normalizeOptionalText(order.currency) || '').toUpperCase()

  if (currency !== 'CHF') {
    throw createError({
      statusCode: 400,
      statusMessage: `La devise ${currency || 'inconnue'} n’est pas supportée pour l’import WooCommerce.`
    })
  }

  if (parseMoneyToCents(order.discount_total) > 0 || (order.coupon_lines?.length || 0) > 0) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cette commande WooCommerce contient une remise ou un coupon. L’import automatique est bloqué.'
    })
  }
}

async function findWooOrderByRef(orderRef: string) {
  const normalizedRef = normalizeOrderRef(orderRef)

  if (!normalizedRef) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Le numéro de commande WooCommerce est obligatoire.'
    })
  }

  const searchResponse = await wooCommerceRequest<WooOrder[]>('/orders', {
    search: normalizedRef,
    per_page: 20,
    orderby: 'date',
    order: 'desc'
  })

  const exactByNumber = searchResponse.data.find(order => String(order.number) === normalizedRef)

  if (exactByNumber) {
    return exactByNumber
  }

  if (/^\d+$/.test(normalizedRef)) {
    try {
      const byIdResponse = await wooCommerceRequest<WooOrder>(`/orders/${normalizedRef}`)

      if (String(byIdResponse.data.number) === normalizedRef || String(byIdResponse.data.id) === normalizedRef) {
        return byIdResponse.data
      }
    } catch (error) {
      if (!(error && typeof error === 'object' && 'statusCode' in error && Number(error.statusCode) === 404)) {
        throw error
      }
    }
  }

  throw createError({
    statusCode: 404,
    statusMessage: `Commande WooCommerce introuvable pour la référence ${normalizedRef}.`
  })
}

async function resolveWooCustomerId(order: WooOrder, db: WooCustomerDb) {
  const email = normalizeOptionalText(order.billing?.email)

  if (email) {
    const matches = await db.select()
      .from(customers)
      .where(eq(customers.email, email))

    if (matches.length === 1) {
      return matches[0]!.id
    }

    if (matches.length > 1) {
      throw createError({
        statusCode: 409,
        statusMessage: `Plusieurs clients utilisent l’e-mail ${email}. L’import WooCommerce est bloqué.`
      })
    }
  }

  const customerInput: CustomerUpsertInput = {
    displayName: buildWooCustomerName(order),
    firstName: normalizeOptionalText(order.billing?.first_name),
    lastName: normalizeOptionalText(order.billing?.last_name),
    companyName: normalizeWooCompanyName(order),
    phone: normalizeOptionalText(order.billing?.phone),
    email,
    addressLine1: normalizeOptionalText(order.billing?.address_1),
    addressLine2: normalizeOptionalText(order.billing?.address_2),
    postalCode: normalizeOptionalText(order.billing?.postcode),
    city: normalizeOptionalText(order.billing?.city),
    notes: `Client créé depuis WooCommerce #${order.number}`
  }

  const now = new Date().toISOString()
  const rows = await db.insert(customers).values({
    ...mapCustomerInput(customerInput),
    createdAt: now,
    updatedAt: now
  }).returning({ id: customers.id })

  const customer = rows[0]

  if (!customer) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Impossible de créer le client WooCommerce.'
    })
  }

  return customer.id
}

export async function listWooOrders(input?: {
  page?: number
  pageSize?: number
}): Promise<WooOrderListResponse> {
  await ensurePosSchema()

  const page = Math.max(input?.page || 1, 1)
  const pageSize = Math.min(Math.max(input?.pageSize || 20, 1), 50)
  const response = await wooCommerceRequest<WooOrder[]>('/orders', {
    page,
    per_page: pageSize,
    orderby: 'date',
    order: 'desc',
    status: woocommerceOpenOrderStatuses.join(',')
  })

  const imports = await listDocumentImportsByExternalIds(
    WOOCOMMERCE_SOURCE,
    response.data.map(order => String(order.id))
  )

  const importsByExternalId = new Map(imports.map(entry => [entry.externalId, entry.documentId]))
  const total = Number(response.headers.get('x-wp-total') || response.data.length)

  return {
    items: response.data.map(order => mapWooOrderSummary(
      order,
      importsByExternalId.get(String(order.id)) ?? null
    )),
    page,
    pageSize,
    total
  }
}

export async function importWooOrderToInvoice(orderRef: string): Promise<WooImportResult> {
  await ensurePosSchema()

  const order = await findWooOrderByRef(orderRef)
  assertWooOrderSupported(order)

  const existingImport = await getDocumentImportByExternalId(WOOCOMMERCE_SOURCE, String(order.id))

  if (existingImport) {
    throw createError({
      statusCode: 409,
      statusMessage: `La commande WooCommerce #${order.number} a déjà été importée.`
    })
  }

  const lines = buildWooDocumentLines(order)

  if (!lines.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Cette commande WooCommerce ne contient aucune ligne positive à importer.'
    })
  }

  const db = useDb()
  const documentNumber = await generateDocumentNumber('invoice')
  const issuedAt = normalizeOptionalText(order.date_created) || new Date().toISOString()
  const notes = [
    `Import WooCommerce #${order.number}`,
    normalizeOptionalText(order.customer_note)
  ].filter(Boolean).join('\n\n')
  const totals = calculateDocumentTotals(lines)

  let document: { id: number, documentNumber: string }

  try {
    document = await db.transaction(async (tx) => {
      const customerId = await resolveWooCustomerId(order, tx)
      const now = new Date().toISOString()
      const insertedRows = await tx.insert(documents).values({
        documentNumber,
        type: 'invoice',
        status: 'issued',
        customerId,
        ticketId: null,
        issuedAt,
        subtotal: totals.subtotal,
        taxAmount: totals.taxAmount,
        total: totals.total,
        notes,
        createdAt: now,
        updatedAt: now
      }).returning({
        id: documents.id,
        documentNumber: documents.documentNumber
      })

      const createdDocument = insertedRows[0]

      if (!createdDocument) {
        throw createError({
          statusCode: 500,
          statusMessage: 'Impossible de créer la facture WooCommerce.'
        })
      }

      await tx.insert(documentLines).values(totals.lines.map((line, index) => ({
        documentId: createdDocument.id,
        catalogItemId: lines[index]?.catalogItemId ?? null,
        label: lines[index]!.label,
        quantity: lines[index]!.quantity,
        unitPrice: lines[index]!.unitPrice,
        vatRate: lines[index]!.vatRate,
        lineTotal: line.lineTotal,
        categoryHint: lines[index]!.categoryHint ?? null
      })))

      await tx.insert(documentImports).values({
        documentId: createdDocument.id,
        source: WOOCOMMERCE_SOURCE,
        externalId: String(order.id),
        externalNumber: order.number,
        createdAt: now
      })

      return createdDocument
    })
  } catch (error) {
    if (isDocumentImportConflictError(error)) {
      throw createError({
        statusCode: 409,
        statusMessage: `La commande WooCommerce #${order.number} a déjà été importée.`
      })
    }

    throw error
  }

  return {
    documentId: document.id,
    documentNumber: document.documentNumber,
    orderNumber: order.number
  }
}
