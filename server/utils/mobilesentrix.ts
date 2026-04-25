import type {
  MobileSentrixCategoriesResponse,
  MobileSentrixCategorySummary,
  MobileSentrixOAuthExchangeResponse,
  MobileSentrixProductsResponse,
  MobileSentrixProductSummary,
  MobileSentrixSearchResponse,
  MobileSentrixStatusResponse
} from '~~/shared/types/pos'
import { normalizeOptionalText } from './pos/core'

type MobileSentrixConfig = {
  baseUrl: string
  consumerName: string | null
  consumerKey: string | null
  consumerSecret: string | null
  accessToken: string | null
  accessTokenSecret: string | null
}

type MobileSentrixApiQuery = Record<string, string | number | boolean | null | undefined>

type MobileSentrixSearchPayload = {
  data?: {
    categories?: unknown
    items?: unknown
    total_items?: unknown
  }
}

function getMobileSentrixConfig(): MobileSentrixConfig {
  const config = useRuntimeConfig()

  return {
    baseUrl: (normalizeOptionalText(config.mobilesentrixBaseUrl) || 'https://www.mobilesentrix.com').replace(/\/+$/, ''),
    consumerName: normalizeOptionalText(config.mobilesentrixConsumerName),
    consumerKey: normalizeOptionalText(config.mobilesentrixConsumerKey),
    consumerSecret: normalizeOptionalText(config.mobilesentrixConsumerSecret),
    accessToken: normalizeOptionalText(config.mobilesentrixAccessToken),
    accessTokenSecret: normalizeOptionalText(config.mobilesentrixAccessTokenSecret)
  }
}

function requireConsumerConfig(config = getMobileSentrixConfig()) {
  if (!config.consumerName || !config.consumerKey || !config.consumerSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'La configuration MobileSentrix est incomplète.'
    })
  }

  return config as MobileSentrixConfig & {
    consumerName: string
    consumerKey: string
    consumerSecret: string
  }
}

function requireApiConfig(config = requireConsumerConfig()) {
  if (!config.accessToken || !config.accessTokenSecret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Les tokens OAuth MobileSentrix sont manquants. Connectez le compte puis ajoutez MOBILESENTRIX_ACCESS_TOKEN et MOBILESENTRIX_ACCESS_TOKEN_SECRET dans .env.'
    })
  }

  return config as MobileSentrixConfig & {
    consumerName: string
    consumerKey: string
    consumerSecret: string
    accessToken: string
    accessTokenSecret: string
  }
}

function oauthEncode(value: string) {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
}

function createOAuthHeader(config: ReturnType<typeof requireApiConfig>) {
  const params = {
    oauth_consumer_key: config.consumerKey,
    oauth_token: config.accessToken,
    oauth_signature_method: 'PLAINTEXT',
    oauth_signature: `${oauthEncode(config.consumerSecret)}&${oauthEncode(config.accessTokenSecret)}`,
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_nonce: crypto.randomUUID().replace(/-/g, ''),
    oauth_version: '1.0'
  }

  return `OAuth ${Object.entries(params)
    .map(([key, value]) => `${oauthEncode(key)}="${oauthEncode(value)}"`)
    .join(', ')}`
}

function appendQuery(url: URL, query: MobileSentrixApiQuery) {
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') {
      continue
    }

    url.searchParams.set(key, String(value))
  }
}

function getRequestMessage(payload: unknown, fallback: string) {
  if (!payload || typeof payload !== 'object') {
    return fallback
  }

  if ('message' in payload && typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message
  }

  if ('messages' in payload && payload.messages && typeof payload.messages === 'object') {
    const messages = payload.messages as { error?: Array<{ message?: unknown }> }
    const message = messages.error?.find(item => typeof item.message === 'string')?.message

    if (typeof message === 'string' && message.trim()) {
      return message
    }
  }

  return fallback
}

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

async function mobileSentrixRequest<T>(path: string, query: MobileSentrixApiQuery = {}) {
  const config = requireApiConfig()
  const url = new URL(path.startsWith('/api/rest') ? path : `/api/rest${path.startsWith('/') ? path : `/${path}`}`, config.baseUrl)
  appendQuery(url, query)

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: createOAuthHeader(config)
    }
  })

  const text = await response.text()
  let payload: T | null = null

  if (text) {
    try {
      payload = JSON.parse(text) as T
    } catch {
      throw createError({
        statusCode: response.status || 502,
        statusMessage: response.ok
          ? 'MobileSentrix a renvoyé une réponse non JSON.'
          : 'MobileSentrix a refusé la requête avant de renvoyer du JSON.'
      })
    }
  }

  if (!response.ok) {
    throw createError({
      statusCode: response.status,
      statusMessage: getRequestMessage(payload, 'MobileSentrix a refusé la requête.')
    })
  }

  return payload as T
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value
  }

  if (value && typeof value === 'object') {
    return Object.values(value)
  }

  return []
}

function textValue(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key]

    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }

    if (typeof value === 'number' && Number.isFinite(value)) {
      return String(value)
    }
  }

  return null
}

function numberValue(record: Record<string, unknown>, keys: string[]) {
  const value = textValue(record, keys)

  if (!value) {
    return null
  }

  const parsed = Number(value.replace(',', '.'))

  return Number.isFinite(parsed) ? parsed : null
}

function booleanStockValue(record: Record<string, unknown>) {
  const quantity = numberValue(record, ['quantity', 'qty', 'stock_qty'])

  if (quantity !== null) {
    return quantity > 0
  }

  const isInStock = textValue(record, ['is_in_stock', 'in_stock'])

  if (!isInStock) {
    return null
  }

  return isInStock === '1' || isInStock.toLowerCase() === 'true'
}

function stringArrayValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.map(item => String(item)).filter(Boolean)
  }

  if (typeof value === 'string') {
    return value.split('[:ATTR:]').map(item => item.trim()).filter(Boolean)
  }

  return []
}

function mapProduct(value: unknown): MobileSentrixProductSummary {
  const record = asRecord(value)
  const name = textValue(record, ['title', 'name']) || 'Produit MobileSentrix'

  return {
    id: textValue(record, ['product_id', 'entity_id', 'id']) || '',
    sku: textValue(record, ['product_code', 'sku', 'barcode']),
    newSku: textValue(record, ['new_sku']),
    name,
    price: numberValue(record, ['price']),
    listPrice: numberValue(record, ['list_price', 'special_price']),
    inStock: booleanStockValue(record),
    quantity: numberValue(record, ['quantity', 'qty', 'stock_qty']),
    categoryIds: stringArrayValue(record.category_ids),
    manufacturer: textValue(record, ['manufacturer_text', 'device_manufacturer_text', 'manufacturer']),
    model: textValue(record, ['model_text', 'device_model_text', 'model']),
    frontPosition: textValue(record, ['front_position', 'front_position_text']),
    imageUrl: textValue(record, ['image_link', 'default_image', 'image']),
    url: textValue(record, ['link', 'url']),
    tags: stringArrayValue(record.tags),
    raw: record
  }
}

function mapCategory(value: unknown): MobileSentrixCategorySummary {
  const record = asRecord(value)

  return {
    id: textValue(record, ['category_id', 'entity_id', 'id']) || '',
    name: textValue(record, ['title', 'name']) || 'Catégorie MobileSentrix',
    parentId: textValue(record, ['parent_id']),
    isActive: record.is_active === undefined && record.isActive === undefined
      ? null
      : textValue(record, ['is_active', 'isActive']) === '1',
    productCount: numberValue(record, ['product_count', 'productCount']),
    url: textValue(record, ['link', 'url']),
    imageUrl: textValue(record, ['image_link', 'image'])
  }
}

export function getMobileSentrixStatus(origin: string): MobileSentrixStatusResponse {
  const config = getMobileSentrixConfig()
  const readyForOAuth = Boolean(config.consumerName && config.consumerKey && config.consumerSecret)
  const readyForApi = Boolean(readyForOAuth && config.accessToken && config.accessTokenSecret)

  return {
    baseUrl: config.baseUrl,
    hasConsumerName: Boolean(config.consumerName),
    hasConsumerKey: Boolean(config.consumerKey),
    hasConsumerSecret: Boolean(config.consumerSecret),
    hasAccessToken: Boolean(config.accessToken),
    hasAccessTokenSecret: Boolean(config.accessTokenSecret),
    readyForOAuth,
    readyForApi,
    authorizePath: `${origin.replace(/\/+$/, '')}/api/tools/mobilesentrix/oauth/start`
  }
}

export function getMobileSentrixAuthorizeUrl(origin: string) {
  const config = requireConsumerConfig()
  const url = new URL('/oauth/authorize/identifier', config.baseUrl)

  url.searchParams.set('consumer', config.consumerName)
  url.searchParams.set('authtype', '1')
  url.searchParams.set('flowentry', 'SignIn')
  url.searchParams.set('consumer_key', config.consumerKey)
  url.searchParams.set('consumer_secret', config.consumerSecret)
  url.searchParams.set('callback', `${origin.replace(/\/+$/, '')}/tools/mobilesentrix`)

  return url.toString()
}

export async function exchangeMobileSentrixOAuthToken(oauthToken: string, oauthVerifier: string): Promise<MobileSentrixOAuthExchangeResponse> {
  const config = requireConsumerConfig()
  const response = await fetch(new URL('/oauth/authorize/identifiercallback', config.baseUrl), {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      consumer: config.consumerName,
      consumer_key: config.consumerKey,
      consumer_secret: config.consumerSecret,
      oauth_token: oauthToken,
      oauth_verifier: oauthVerifier
    })
  })
  const text = await response.text()
  let payload: Record<string, unknown> | null = null

  if (text) {
    try {
      payload = JSON.parse(text) as Record<string, unknown>
    } catch {
      throw createError({
        statusCode: response.status || 502,
        statusMessage: response.status === 403 && text.includes('Just a moment')
          ? 'Cloudflare bloque l’échange OAuth côté serveur. Utilisez l’échange navigateur MobileSentrix.'
          : 'MobileSentrix a renvoyé une réponse OAuth non JSON.'
      })
    }
  }

  if (!response.ok || !payload || payload.status === 0) {
    throw createError({
      statusCode: response.status || 400,
      statusMessage: getRequestMessage(payload, 'MobileSentrix n’a pas pu générer les tokens OAuth.')
    })
  }

  const data = asRecord(payload.data)
  const accessToken = textValue(data, ['access_token'])
  const accessTokenSecret = textValue(data, ['access_token_secret'])

  if (!accessToken || !accessTokenSecret) {
    throw createError({
      statusCode: 502,
      statusMessage: 'La réponse MobileSentrix ne contient pas les tokens attendus.'
    })
  }

  return {
    accessToken,
    accessTokenSecret,
    oauthVerifier: textValue(data, ['oauth_verifier'])
  }
}

export function getMobileSentrixBrowserExchangeHtml(oauthToken: string, oauthVerifier: string) {
  const config = requireConsumerConfig()
  const action = new URL('/oauth/authorize/identifiercallback', config.baseUrl).toString()
  const fields = {
    consumer: config.consumerName,
    consumer_key: config.consumerKey,
    consumer_secret: config.consumerSecret,
    oauth_token: oauthToken,
    oauth_verifier: oauthVerifier
  }

  return `<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Échange OAuth MobileSentrix</title>
  <style>
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem; color: #18181b; }
    main { max-width: 42rem; }
    button { border: 0; border-radius: .5rem; background: #16a34a; color: white; font: inherit; font-weight: 600; padding: .75rem 1rem; }
    p { color: #52525b; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>Échange OAuth MobileSentrix</h1>
    <p>Le formulaire va être envoyé directement à MobileSentrix depuis ce navigateur. Si la réponse contient access_token et access_token_secret, copiez ces deux valeurs dans .env puis redémarrez Nuxt.</p>
    <form method="post" action="${escapeHtmlAttribute(action)}">
      ${Object.entries(fields).map(([key, value]) => `<input type="hidden" name="${escapeHtmlAttribute(key)}" value="${escapeHtmlAttribute(value)}">`).join('\n      ')}
      <button type="submit">Continuer vers MobileSentrix</button>
    </form>
    <script>document.querySelector('form').submit()</script>
  </main>
</body>
</html>`
}

export async function searchMobileSentrixProducts(query: { q: string, maxResults: number, startIndex: number }): Promise<MobileSentrixSearchResponse> {
  const payload = await mobileSentrixRequest<MobileSentrixSearchPayload>('/searchproduct', {
    q: query.q,
    max_results: query.maxResults,
    start_index: query.startIndex
  })
  const data = asRecord(payload.data)

  return {
    query: query.q,
    startIndex: query.startIndex,
    maxResults: query.maxResults,
    totalItems: numberValue(data, ['total_items']) || 0,
    items: asArray(data.items).map(mapProduct),
    categories: asArray(data.categories).map(mapCategory)
  }
}

export async function listMobileSentrixProducts(query: {
  categoryId: string | null
  sku: string | null
  productId: string | null
  deviceProducts: boolean
  page: number
  limit: number
}): Promise<MobileSentrixProductsResponse> {
  const path = query.productId ? `/products/${encodeURIComponent(query.productId)}` : '/products'
  const apiQuery: MobileSentrixApiQuery = {}

  if (query.categoryId) {
    apiQuery.category_id = query.categoryId
  }

  if (query.sku) {
    apiQuery['filter[1][attribute]'] = 'sku'
    apiQuery['filter[1][in][0]'] = query.sku
    apiQuery.disableProducts = true
    apiQuery.filter_by_both_sku = true
  }

  if (query.deviceProducts) {
    apiQuery.limit = query.limit
    apiQuery.page = query.page
    apiQuery.pageinfo = 1
    apiQuery.product_type = 'devicesystem'
  }

  const payload = await mobileSentrixRequest<unknown>(path, apiQuery)
  const payloadRecord = asRecord(payload)
  const data = 'data' in payloadRecord ? payloadRecord.data : payload
  const dataRecord = asRecord(data)
  const itemSource = Array.isArray(data)
    ? data
    : Array.isArray(dataRecord.items)
      ? dataRecord.items
      : data

  return {
    page: query.page,
    limit: query.limit,
    pageInfo: query.deviceProducts,
    totalItems: numberValue(dataRecord, ['total_items', 'total_count', 'total']),
    items: asArray(itemSource).map(mapProduct)
  }
}

export async function listMobileSentrixCategories(): Promise<MobileSentrixCategoriesResponse> {
  const payload = await mobileSentrixRequest<unknown>('/categories')
  const payloadRecord = asRecord(payload)
  const data = 'data' in payloadRecord ? payloadRecord.data : payload

  return {
    items: asArray(data).map(mapCategory)
  }
}
