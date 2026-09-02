import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listCapabilities } from '../../shared/utils/capabilities'

const business = vi.hoisted(() => ({ listShopifyOrders: vi.fn(), searchShopifyOrder: vi.fn(), importShopifyOrder: vi.fn(), syncShopifyPayments: vi.fn(), getShopifyConnection: vi.fn() }))
vi.mock('~~/server/utils/shopify/import', () => business)
vi.mock('~~/server/utils/shopify/client', () => business)
vi.stubGlobal('eventHandler', (fn: unknown) => fn)
const routes = await Promise.all([
  import('../../server/api/tools/shopify/connection.get'), import('../../server/api/tools/shopify/orders.get'),
  import('../../server/api/tools/shopify/search.get'), import('../../server/api/tools/shopify/import.post'), import('../../server/api/tools/shopify/payments.post')
])

describe('Shopify administrator-only routes', () => {
  beforeEach(() => {
    vi.stubGlobal('createError', createError)
    vi.stubGlobal('readValidatedBody', vi.fn().mockResolvedValue({ orderRef: '#1001', documentId: 1 }))
    vi.stubGlobal('getValidatedQuery', vi.fn().mockResolvedValue({ orderRef: '#1001' }))
  })
  it.each(routes.map((route, i) => [i, route.default] as const))('rejects an operator before accessing Shopify, route %s', async (_, route) => {
    const user = { id: 1, email: 'operator@example.test', name: 'Operator', isAdmin: false, capabilities: listCapabilities({ isAdmin: false }) }
    const event = { context: { auth: { user, actor: { userId: 1 }, capabilities: user.capabilities } } }
    await expect(route(event as never)).rejects.toMatchObject({ statusCode: 403 })
    for (const fn of Object.values(business)) expect(fn).not.toHaveBeenCalled()
  })
})
