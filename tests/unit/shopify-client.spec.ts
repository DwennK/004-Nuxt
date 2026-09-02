import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { externalFetch } from '../../server/utils/external-fetch'
import { connectShopify, fetchShopifyOrder, findShopifyOrder, getShopifyConfig, getShopifyConnection } from '../../server/utils/shopify/client'
import { orderFixture } from '../fixtures/shopify'

vi.mock('../../server/utils/external-fetch', () => ({ externalFetch: vi.fn() }))
const config = { domain: 'test-pos.myshopify.com', clientId: '', clientSecret: '', accessToken: 'test-token' }
const event = { context: {} } as H3Event
const pageInfo = { hasNextPage: false, endCursor: null }
function response(body: unknown, status = 200) {
  vi.mocked(externalFetch).mockResolvedValueOnce({ response: new Response(JSON.stringify(body), { status }), requestId: 'shopify-test' })
}
function identity(domain = config.domain) {
  return { data: { shop: { name: 'Test POS', myshopifyDomain: domain }, currentAppInstallation: { accessScopes: [{ handle: 'read_orders' }] } } }
}
function remoteOrder() {
  const order = orderFixture()
  return { ...order, lineItems: { nodes: order.lineItems, pageInfo }, shippingLines: { nodes: order.shippingLines, pageInfo } }
}

describe('Shopify read-only transport', () => {
  beforeEach(() => {
    vi.mocked(externalFetch).mockReset()
    vi.stubGlobal('useRuntimeConfig', () => ({ shopifyShopDomain: config.domain, shopifyAdminAccessToken: config.accessToken }))
  })

  it('reports unconfigured without making an external request', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({}))
    expect(await getShopifyConnection(event)).toEqual({ configured: false })
    expect(externalFetch).not.toHaveBeenCalled()
  })

  it('reads Worker credentials from the request when startup config is empty', async () => {
    vi.stubGlobal('useRuntimeConfig', (request?: H3Event) => request === event
      ? { shopifyShopDomain: config.domain, shopifyClientId: 'worker-client', shopifyClientSecret: 'worker-secret' }
      : {})
    response({ access_token: 'worker-token', expires_in: 86400 })
    response(identity())

    expect(await getShopifyConnection(event)).toEqual({
      configured: true,
      shop: { name: 'Test POS', domain: config.domain },
      allOrders: false
    })
    expect(externalFetch).toHaveBeenCalledTimes(2)
    expect(vi.mocked(externalFetch).mock.calls[1]![1]!.headers).toMatchObject({ 'X-Shopify-Access-Token': 'worker-token' })
  })

  it.each(['https://test-pos.myshopify.com', 'test-pos.myshopify.com.evil.test', 'localhost', 'user@foo.myshopify.com'])('rejects untrusted shop destination %s', (domain) => {
    vi.stubGlobal('useRuntimeConfig', () => ({ shopifyShopDomain: domain, shopifyAdminAccessToken: 'test' }))
    expect(() => getShopifyConfig(event)).toThrow()
  })

  it('rejects ambiguous credentials', () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ shopifyShopDomain: config.domain, shopifyAdminAccessToken: 'test', shopifyClientId: 'id', shopifyClientSecret: 'secret' }))
    expect(() => getShopifyConfig(event)).toThrow()
  })

  it('validates shop identity and read_orders permission', async () => {
    response(identity('wrong.myshopify.com'))
    await expect(connectShopify(event)).rejects.toMatchObject({ data: { code: 'SHOPIFY_SHOP_MISMATCH' } })
    const payload = identity()
    payload.data.currentAppInstallation.accessScopes = []
    response(payload)
    await expect(connectShopify(event)).rejects.toMatchObject({ data: { code: 'SHOPIFY_ACCESS_DENIED' } })
  })

  it('caches client-credential tokens and renews before expiry', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ shopifyShopDomain: config.domain, shopifyClientId: 'renewal-client', shopifyClientSecret: 'test-secret' }))
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000)
    response({ access_token: 'temporary-1', expires_in: 120 })
    response(identity())
    await connectShopify(event)
    response(identity())
    await connectShopify(event)
    expect(externalFetch).toHaveBeenCalledTimes(3)
    now.mockReturnValue(1_061_000)
    response({ access_token: 'temporary-2', expires_in: 120 })
    response(identity())
    await connectShopify(event)
    expect(externalFetch).toHaveBeenCalledTimes(5)
    const options = vi.mocked(externalFetch).mock.calls[4]![1]!
    expect(options.headers).toMatchObject({ 'X-Shopify-Access-Token': 'temporary-2' })
    expect(options.redirect).toBe('manual')
  })

  it.each([301, 302, 307, 308])('rejects HTTP %s without forwarding credentials to a redirect', async (status) => {
    response({}, status)
    await expect(connectShopify(event)).rejects.toMatchObject({ data: { code: 'SHOPIFY_UNAVAILABLE' } })
    expect(externalFetch).toHaveBeenCalledTimes(1)
    expect(vi.mocked(externalFetch).mock.calls[0]![1]!.redirect).toBe('manual')
  })

  it.each([401, 403, 429, 500])('returns safe provider errors for HTTP %s', async (status) => {
    response({ secret: 'must-not-leak' }, status)
    await expect(connectShopify(event)).rejects.not.toThrow('must-not-leak')
  })

  it('rejects partial GraphQL data and permission errors', async () => {
    response({ ...identity(), errors: [{ message: 'Private data', extensions: { code: 'ACCESS_DENIED' } }] })
    await expect(connectShopify(event)).rejects.toMatchObject({ data: { code: 'SHOPIFY_ACCESS_DENIED' } })
  })

  it('retrieves every page of lines and shipping before parsing', async () => {
    const first = remoteOrder()
    first.lineItems.pageInfo = { hasNextPage: true, endCursor: 'line-1' } as typeof pageInfo
    first.shippingLines.pageInfo = { hasNextPage: true, endCursor: 'shipping-1' } as typeof pageInfo
    response({ data: { order: first } })
    response({ data: { order: { updatedAt: first.updatedAt, lineItems: { nodes: [{ ...first.lineItems.nodes[0], id: 'line-2' }], pageInfo } } } })
    response({ data: { order: { updatedAt: first.updatedAt, shippingLines: { nodes: [], pageInfo } } } })
    const result = await fetchShopifyOrder(config, first.id)
    expect(result.lineItems).toHaveLength(2)
    expect(externalFetch).toHaveBeenCalledTimes(3)
  })

  it('rejects orders edited between pages', async () => {
    const first = remoteOrder()
    first.lineItems.pageInfo = { hasNextPage: true, endCursor: 'next' } as typeof pageInfo
    response({ data: { order: first } })
    response({ data: { order: { updatedAt: '2026-08-21T10:00:00Z', lineItems: { nodes: [], pageInfo } } } })
    await expect(fetchShopifyOrder(config, first.id)).rejects.toMatchObject({ data: { code: 'SHOPIFY_ORDER_CHANGED' } })
  })

  it('supports custom order prefixes and quotes search input', async () => {
    const order = remoteOrder()
    order.name = 'MW-1001'
    response({ data: { orders: { nodes: [{ id: order.id, name: order.name }], pageInfo } } })
    response({ data: { order } })
    expect((await findShopifyOrder(config, 'MW-1001')).id).toBe(order.id)
    const body = JSON.parse(String(vi.mocked(externalFetch).mock.calls[0]![1]!.body))
    expect(body.variables.query).toBe('(name:"MW-1001" OR name:"#MW-1001")')
  })

  it('distinguishes an inaccessible order from a provider failure', async () => {
    response({ data: { order: null } })
    await expect(fetchShopifyOrder(config, 'gid://shopify/Order/1')).rejects.toMatchObject({ statusCode: 404 })
  })
})
