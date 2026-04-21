import { eq } from 'drizzle-orm'
import { customers } from '~~/server/db/schema'
import { woocommerceOpenOrderStatuses } from '~~/shared/constants/pos'
import type { CustomerUpsertInput, WooImportResult, WooOrderListResponse, WooOrderSummary } from '~~/shared/types/pos'
import { createDocumentImportRecord, getDocumentImportByExternalId, listDocumentImportsByExternalIds } from './document-imports'
import { createDocumentRecord } from './pos/documents'
import { createCustomer } from './pos/customers'
import { ensurePosSchema, normalizeOptionalText } from './pos/core'
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
  discount_total?: string
  customer_note?: string
  coupon_lines?: Array<unknown>
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

function computeVatRate(netCents: number, taxCents: number) {
  if (netCents <= 0 || taxCents <= 0) {
    return 0
  }

  return Number(((taxCents / netCents) * 100).toFixed(3))
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
  const company = normalizeOptionalText(order.billing?.company)
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
        vatRate: computeVatRate(netTotal, taxTotal),
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
        vatRate: computeVatRate(netTotal, taxTotal),
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
        vatRate: computeVatRate(netTotal, taxTotal),
        lineTotal,
        categoryHint: null
      }
    })
    .filter((line): line is NonNullable<typeof line> => Boolean(line))

  return [...productLines, ...shippingLines, ...feeLines]
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

async function resolveWooCustomerId(order: WooOrder) {
  const email = normalizeOptionalText(order.billing?.email)

  if (email) {
    const db = useDb()
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
    companyName: normalizeOptionalText(order.billing?.company),
    phone: normalizeOptionalText(order.billing?.phone),
    email,
    addressLine1: normalizeOptionalText(order.billing?.address_1),
    addressLine2: normalizeOptionalText(order.billing?.address_2),
    postalCode: normalizeOptionalText(order.billing?.postcode),
    city: normalizeOptionalText(order.billing?.city),
    notes: `Client créé depuis WooCommerce #${order.number}`
  }

  const customer = await createCustomer(customerInput)
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

  const customerId = await resolveWooCustomerId(order)
  const notes = [
    `Import WooCommerce #${order.number}`,
    normalizeOptionalText(order.customer_note)
  ].filter(Boolean).join('\n\n')

  const document = await createDocumentRecord({
    type: 'invoice',
    status: 'issued',
    customerId,
    ticketId: null,
    issuedAt: normalizeOptionalText(order.date_created) || new Date().toISOString(),
    notes,
    lines
  })

  await createDocumentImportRecord({
    documentId: document.id,
    source: WOOCOMMERCE_SOURCE,
    externalId: String(order.id),
    externalNumber: order.number
  })

  return {
    documentId: document.id,
    documentNumber: document.documentNumber,
    orderNumber: order.number
  }
}
