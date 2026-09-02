import type { H3Event } from 'h3'
import { z } from 'zod'
import type { ShopifyConnection } from '~~/shared/types/shopify'
import { externalFetch } from '../external-fetch'
import { shopifyError, shopifyOrderSchema } from './model'

export const SHOPIFY_API_VERSION = '2026-07'
type ShopifyConfig = { domain: string, clientId: string, clientSecret: string, accessToken: string }
let tokenCache: { key: string, token: string, expiresAt: number } | undefined
let pendingToken: { key: string, promise: Promise<string> } | undefined

export function getShopifyConfig(event: H3Event): ShopifyConfig | null {
  const runtime = useRuntimeConfig(event)
  const domain = String(runtime.shopifyShopDomain || '').trim().toLowerCase()
  const clientId = String(runtime.shopifyClientId || '').trim()
  const clientSecret = String(runtime.shopifyClientSecret || '').trim()
  const accessToken = String(runtime.shopifyAdminAccessToken || '').trim()
  if (![domain, clientId, clientSecret, accessToken].some(Boolean)) return null
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(domain)) return shopifyError('Renseignez le domaine de la boutique au format boutique.myshopify.com.', 'SHOPIFY_CONFIG', 503)
  if ((accessToken && (clientId || clientSecret)) || (!accessToken && (!clientId || !clientSecret))) {
    return shopifyError('Configurez soit le Client ID et le secret Shopify, soit un jeton Admin existant.', 'SHOPIFY_CONFIG', 503)
  }
  return { domain, clientId, clientSecret, accessToken }
}

async function request(config: ShopifyConfig, path: string, body: unknown, token?: string) {
  const { response } = await externalFetch(new URL(path, `https://${config.domain}`), {
    // Workers supports manual/follow only. Non-2xx responses below reject redirects.
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Shopify-Access-Token': token } : {}) },
    body: JSON.stringify(body)
  }, { provider: 'shopify', timeoutMs: 15_000, timeoutMessage: 'Shopify met trop de temps à répondre.', networkErrorMessage: 'Shopify est indisponible.' })
  if (response.status === 401 || response.status === 403) return shopifyError('Accès Shopify refusé. Vérifiez les identifiants et les autorisations de l’application.', 'SHOPIFY_ACCESS_DENIED', 503)
  if (response.status === 429) return shopifyError('Shopify limite temporairement les requêtes. Réessayez dans quelques instants.', 'SHOPIFY_THROTTLED', 503)
  const payload: unknown = await response.json().catch(() => null)
  if (!response.ok) return shopifyError('La requête Shopify a échoué. Vérifiez la connexion de l’application à cette boutique.', 'SHOPIFY_UNAVAILABLE', 502)
  return payload
}

async function accessToken(config: ShopifyConfig) {
  if (config.accessToken) return config.accessToken
  const key = JSON.stringify([config.domain, config.clientId, config.clientSecret])
  if (tokenCache?.key === key && tokenCache.expiresAt > Date.now()) return tokenCache.token
  if (pendingToken?.key === key) return pendingToken.promise
  const promise = (async () => {
    const raw = await request(config, '/admin/oauth/access_token', { grant_type: 'client_credentials', client_id: config.clientId, client_secret: config.clientSecret })
    const parsed = z.object({ access_token: z.string().min(1), expires_in: z.number().positive() }).safeParse(raw)
    if (!parsed.success) return shopifyError('Impossible de renouveler l’accès Shopify.', 'SHOPIFY_ACCESS_DENIED', 503)
    tokenCache = { key, token: parsed.data.access_token, expiresAt: Date.now() + Math.max(0, parsed.data.expires_in - 60) * 1000 }
    return tokenCache.token
  })()
  pendingToken = { key, promise }
  try {
    return await promise
  } finally {
    if (pendingToken?.promise === promise) pendingToken = undefined
  }
}

async function graphql<T>(config: ShopifyConfig, query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const raw = await request(config, `/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, { query, variables }, await accessToken(config))
  const envelope = z.object({ data: z.unknown().optional(), errors: z.array(z.object({ extensions: z.object({ code: z.string().optional() }).passthrough().optional() }).passthrough()).optional() }).safeParse(raw)
  if (!envelope.success || envelope.data.errors?.length || !envelope.data.data) {
    const codes = envelope.success ? envelope.data.errors?.map(e => e.extensions?.code) : []
    if (codes?.includes('ACCESS_DENIED')) return shopifyError('Shopify refuse l’accès aux commandes ou aux coordonnées clients. Vérifiez les autorisations.', 'SHOPIFY_ACCESS_DENIED', 503)
    if (codes?.includes('THROTTLED')) return shopifyError('Shopify limite temporairement les requêtes. Réessayez.', 'SHOPIFY_THROTTLED', 503)
    return shopifyError('Shopify a retourné une réponse incomplète. Aucun import n’a été effectué.', 'SHOPIFY_INVALID_RESPONSE', 502)
  }
  return envelope.data.data as T
}

export const connectionQuery = `query ShopifyConnection {
  shop { name myshopifyDomain }
  currentAppInstallation { accessScopes { handle } }
}`

export async function connectShopify(event: H3Event) {
  const config = getShopifyConfig(event)
  if (!config) return shopifyError('Shopify n’est pas encore connecté.', 'SHOPIFY_NOT_CONFIGURED', 503)
  const result = await graphql<{ shop: { name: string, myshopifyDomain: string }, currentAppInstallation: { accessScopes: { handle: string }[] } }>(config, connectionQuery)
  if (result.shop?.myshopifyDomain !== config.domain) return shopifyError('La boutique Shopify retournée ne correspond pas à la configuration.', 'SHOPIFY_SHOP_MISMATCH', 409)
  const scopes = result.currentAppInstallation?.accessScopes?.map(s => s.handle) || []
  if (!scopes.includes('read_orders') && !scopes.includes('write_orders')) return shopifyError('L’application Shopify doit disposer de l’autorisation read_orders.', 'SHOPIFY_ACCESS_DENIED', 503)
  return { config, name: result.shop.name, allOrders: scopes.includes('read_all_orders') }
}

export async function getShopifyConnection(event: H3Event): Promise<ShopifyConnection> {
  if (!getShopifyConfig(event)) return { configured: false }
  const connection = await connectShopify(event)
  return { configured: true, shop: { domain: connection.config.domain, name: connection.name }, allOrders: connection.allOrders }
}

const moneyFields = 'shopMoney { amount currencyCode }'
export const listQuery = `query ShopifyOrders($after: String, $query: String!) {
  orders(first: 20, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
    nodes { id name createdAt cancelledAt test displayFinancialStatus displayFulfillmentStatus email phone billingAddress { name } shippingAddress { name } currentTotalPriceSet { ${moneyFields} } }
    pageInfo { hasNextPage endCursor }
  }
}`
export type RemoteSummary = {
  id: string
  name: string
  createdAt: string
  cancelledAt: string | null
  test: boolean
  displayFinancialStatus: string | null
  displayFulfillmentStatus: string
  email: string | null
  phone: string | null
  billingAddress: { name: string } | null
  shippingAddress: { name: string } | null
  currentTotalPriceSet: { shopMoney: { amount: string, currencyCode: string } }
}
type Connection<T> = { nodes: T[], pageInfo: { hasNextPage: boolean, endCursor: string | null } }

export async function fetchShopifyOrders(config: ShopifyConfig, after?: string, query = 'status:open test:false') {
  const data = await graphql<{ orders: Connection<RemoteSummary> }>(config, listQuery, { after, query })
  if (!Array.isArray(data.orders?.nodes) || !data.orders.pageInfo) return shopifyError('Liste Shopify incomplète.', 'SHOPIFY_INVALID_RESPONSE', 502)
  return data.orders
}

const addressFields = 'firstName lastName company address1 address2 zip city phone'
const taxFields = `rate priceSet { ${moneyFields} }`
const lineFields = `id name sku quantity currentQuantity isGiftCard customAttributes { key value } originalTotalSet { ${moneyFields} } discountAllocations { allocatedAmountSet { ${moneyFields} } } taxLines { ${taxFields} }`
const shippingFields = `id title isRemoved discountedPriceSet { ${moneyFields} } taxLines { ${taxFields} }`
export const orderQuery = `query ShopifyOrder($id: ID!) {
  order(id: $id) {
    id name createdAt updatedAt cancelledAt test taxesIncluded currencyCode presentmentCurrencyCode note email phone
    billingAddress { ${addressFields} } shippingAddress { ${addressFields} }
    displayFinancialStatus displayFulfillmentStatus
    currentTotalPriceSet { ${moneyFields} } currentTotalTaxSet { ${moneyFields} }
    totalReceivedSet { ${moneyFields} } totalOutstandingSet { ${moneyFields} } totalRefundedSet { ${moneyFields} }
    currentTotalDutiesSet { ${moneyFields} } currentTotalAdditionalFeesSet { ${moneyFields} } totalTipReceivedSet { ${moneyFields} }
    lineItems(first: 100) { nodes { ${lineFields} } pageInfo { hasNextPage endCursor } }
    shippingLines(first: 100) { nodes { ${shippingFields} } pageInfo { hasNextPage endCursor } }
    transactionsCount { count precision }
    transactions { id kind status test gateway formattedGateway createdAt processedAt amountSet { ${moneyFields} } }
  }
}`
export const linePageQuery = `query ShopifyLinePage($id: ID!, $after: String!) { order(id: $id) { updatedAt lineItems(first: 100, after: $after) { nodes { ${lineFields} } pageInfo { hasNextPage endCursor } } } }`
export const shippingPageQuery = `query ShopifyShippingPage($id: ID!, $after: String!) { order(id: $id) { updatedAt shippingLines(first: 100, after: $after) { nodes { ${shippingFields} } pageInfo { hasNextPage endCursor } } } }`

export async function fetchShopifyOrder(config: ShopifyConfig, id: string) {
  const { order } = await graphql<{ order: (Record<string, unknown> & { updatedAt: string, lineItems: Connection<unknown>, shippingLines: Connection<unknown> }) | null }>(config, orderQuery, { id })
  if (!order) return shopifyError('Commande Shopify introuvable ou inaccessible. Au-delà de 60 jours, read_all_orders est nécessaire.', 'SHOPIFY_NOT_FOUND', 404)
  for (const [field, query] of [['lineItems', linePageQuery], ['shippingLines', shippingPageQuery]] as const) {
    const seen = new Set<string>()
    if (!order[field]?.pageInfo || !Array.isArray(order[field].nodes)) return shopifyError('Articles Shopify incomplets.', 'SHOPIFY_INVALID_RESPONSE', 502)
    while (order[field].pageInfo.hasNextPage) {
      const after = order[field].pageInfo.endCursor
      if (!after || seen.has(after) || seen.size >= 100) return shopifyError('Pagination Shopify invalide ou commande trop volumineuse.', 'SHOPIFY_INVALID_RESPONSE', 502)
      seen.add(after)
      const next = await graphql<{ order: Record<typeof field, Connection<unknown>> & { updatedAt: string } }>(config, query, { id, after })
      if (!next.order || next.order.updatedAt !== order.updatedAt) return shopifyError('La commande a changé pendant sa lecture. Réessayez.', 'SHOPIFY_ORDER_CHANGED', 409)
      order[field].nodes.push(...next.order[field].nodes)
      order[field].pageInfo = next.order[field].pageInfo
    }
  }
  const parsed = shopifyOrderSchema.safeParse({ ...order, lineItems: order.lineItems.nodes, shippingLines: order.shippingLines.nodes })
  if (!parsed.success) return shopifyError('Les données Shopify sont incomplètes ou invalides.', 'SHOPIFY_INVALID_RESPONSE', 502)
  return parsed.data
}

export async function findShopifyOrder(config: ShopifyConfig, reference: string) {
  const ref = reference.trim()
  if (/^gid:\/\/shopify\/Order\/\d+$/.test(ref)) return fetchShopifyOrder(config, ref)
  // Shopify search uses its own syntax; quote and escape user-provided names.
  const name = ref.startsWith('#') ? ref : `#${ref}`
  const search = `(name:${JSON.stringify(ref)} OR name:${JSON.stringify(name)})`
  let after: string | undefined
  const matches = new Set<string>()
  for (let page = 0; page < 100; page++) {
    const result = await fetchShopifyOrders(config, after, search)
    for (const order of result.nodes) if ([ref, name].includes(order.name)) matches.add(order.id)
    if (!result.pageInfo.hasNextPage) break
    if (!result.pageInfo.endCursor || result.pageInfo.endCursor === after || page === 99) return shopifyError('Recherche Shopify trop large. Utilisez l’identifiant complet.', 'SHOPIFY_AMBIGUOUS_ORDER', 409)
    after = result.pageInfo.endCursor
  }
  if (matches.size > 1) return shopifyError('Plusieurs commandes correspondent. Utilisez l’identifiant Shopify.', 'SHOPIFY_AMBIGUOUS_ORDER', 409)
  if (matches.size === 1) return fetchShopifyOrder(config, [...matches][0]!)
  if (/^\d+$/.test(ref)) return fetchShopifyOrder(config, `gid://shopify/Order/${ref}`)
  return shopifyError('Commande introuvable. Vérifiez son nom exact ; les commandes de plus de 60 jours nécessitent read_all_orders.', 'SHOPIFY_NOT_FOUND', 404)
}
