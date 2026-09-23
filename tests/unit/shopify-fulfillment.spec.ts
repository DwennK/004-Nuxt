import { beforeEach, describe, expect, it, vi } from 'vitest'
import { externalFetch } from '../../server/utils/external-fetch'
import { fetchFulfillment, setFulfillment } from '../../server/utils/shopify/fulfillment'

vi.mock('../../server/utils/external-fetch', () => ({ externalFetch: vi.fn() }))
const config = { domain: 'test-pos.myshopify.com', clientId: '', clientSecret: '', accessToken: 'test-token' }
const id = 'gid://shopify/Order/1'
function order(status = 'UNFULFILLED') {
  return {
    id, cancelledAt: null as string | null, displayFulfillmentStatus: status,
    fulfillments: status === 'FULFILLED' ? [{ id: 'f1', status: 'SUCCESS' }] : [],
    fulfillmentsCount: { count: status === 'FULFILLED' ? 1 : 0, precision: 'EXACT' },
    fulfillmentOrders: { nodes: [
      { id: 'fo1', status: status === 'FULFILLED' ? 'CLOSED' : 'OPEN', supportedActions: [{ action: 'CREATE_FULFILLMENT' }], assignedLocation: { location: { id: 'l1' } } }
    ], pageInfo: { hasNextPage: false } }
  }
}
function response(data: unknown) {
  vi.mocked(externalFetch).mockResolvedValueOnce({ response: new Response(JSON.stringify({ data })), requestId: 'test' })
}
function mutation(kind: 'fulfillmentCreate' | 'fulfillmentCancel', status: string) {
  response({ [kind]: { fulfillment: { id: 'f1', status }, userErrors: [] } })
}
function bodies() {
  return vi.mocked(externalFetch).mock.calls.map(call => JSON.parse(String(call[1]?.body)))
}

beforeEach(() => vi.mocked(externalFetch).mockReset())
describe('Shopify handover', () => {
  it('fulfills remaining items and verifies remote status without customer notification', async () => {
    response({ order: order() })
    mutation('fulfillmentCreate', 'SUCCESS')
    response({ order: order('FULFILLED') })
    expect((await setFulfillment(config, id, true)).displayFulfillmentStatus).toBe('FULFILLED')
    expect(bodies()[1].variables.fulfillment).toEqual({ notifyCustomer: false, lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: 'fo1' }] })
  })
  it('cancels existing fulfillments and verifies the order is no longer fulfilled', async () => {
    response({ order: order('FULFILLED') })
    mutation('fulfillmentCancel', 'CANCELLED')
    response({ order: order() })
    expect((await setFulfillment(config, id, false)).displayFulfillmentStatus).toBe('UNFULFILLED')
    expect(bodies()[1].variables).toEqual({ id: 'f1' })
  })
  it.each([true, false])('is idempotent when the desired state is already reached: %s', async (collected) => {
    response({ order: order(collected ? 'FULFILLED' : 'UNFULFILLED') })
    await setFulfillment(config, id, collected)
    expect(externalFetch).toHaveBeenCalledTimes(1)
  })
  it('groups remaining fulfillment orders by location', async () => {
    const value = order()
    value.fulfillmentOrders.nodes.push({ ...value.fulfillmentOrders.nodes[0]!, id: 'fo2' }, { ...value.fulfillmentOrders.nodes[0]!, id: 'fo3', assignedLocation: { location: { id: 'l2' } } })
    response({ order: value })
    mutation('fulfillmentCreate', 'SUCCESS')
    mutation('fulfillmentCreate', 'SUCCESS')
    response({ order: order('FULFILLED') })
    await setFulfillment(config, id, true)
    expect(bodies()[1].variables.fulfillment.lineItemsByFulfillmentOrder).toHaveLength(2)
    expect(bodies()[2].variables.fulfillment.lineItemsByFulfillmentOrder).toEqual([{ fulfillmentOrderId: 'fo3' }])
  })
  it('preflights every visible location before sending any mutation', async () => {
    const value = order()
    value.fulfillmentOrders.nodes.push({ ...value.fulfillmentOrders.nodes[0]!, id: 'blocked', status: 'ON_HOLD', supportedActions: [] })
    response({ order: value })
    await expect(setFulfillment(config, id, true)).rejects.toMatchObject({ data: { code: 'SHOPIFY_FULFILLMENT_BLOCKED' } })
    expect(externalFetch).toHaveBeenCalledTimes(1)
  })
  it.each(['pages', 'count', 'precision', 'missing'])('rejects incomplete Shopify data: %s', async (reason) => {
    const value = order()
    if (reason === 'pages') value.fulfillmentOrders.pageInfo.hasNextPage = true
    if (reason === 'count') value.fulfillmentsCount.count = 251
    if (reason === 'precision') value.fulfillmentsCount.precision = 'AT_LEAST'
    response({ order: reason === 'missing' ? { id } : value })
    await expect(fetchFulfillment(config, id)).rejects.toThrow()
    expect(externalFetch).toHaveBeenCalledTimes(1)
  })
  it('surfaces userErrors instead of marking the device as delivered', async () => {
    response({ order: order() })
    response({ fulfillmentCreate: { fulfillment: null, userErrors: [{ message: 'Cannot fulfill this order.' }] } })
    await expect(setFulfillment(config, id, true)).rejects.toMatchObject({ data: { code: 'SHOPIFY_FULFILLMENT_REFUSED' } })
  })
  it('refuses to report success when the post-write order is still partial', async () => {
    response({ order: order() })
    mutation('fulfillmentCreate', 'SUCCESS')
    response({ order: order('PARTIALLY_FULFILLED') })
    await expect(setFulfillment(config, id, true)).rejects.toMatchObject({ data: { code: 'SHOPIFY_FULFILLMENT_UNCONFIRMED' } })
  })
  it('re-reads after a lost response, avoiding duplicate fulfillment on retry', async () => {
    response({ order: order() })
    vi.mocked(externalFetch).mockRejectedValueOnce(new Error('Lost response'))
    await expect(setFulfillment(config, id, true)).rejects.toThrow('Lost response')
    response({ order: order('FULFILLED') })
    await setFulfillment(config, id, true)
    expect(bodies().filter(body => body.query.includes('mutation'))).toHaveLength(1)
  })
  it('ignores cancelled fulfillments when undoing a partial order', async () => {
    const value = order('FULFILLED')
    value.displayFulfillmentStatus = 'PARTIALLY_FULFILLED'
    value.fulfillments.push({ id: 'old', status: 'CANCELLED' })
    value.fulfillmentsCount.count++
    response({ order: value })
    mutation('fulfillmentCancel', 'CANCELLED')
    response({ order: order() })
    await setFulfillment(config, id, false)
    expect(bodies().filter(body => body.query.includes('mutation'))).toHaveLength(1)
  })
  it('refuses cancelled orders before any mutation', async () => {
    const value = order()
    value.cancelledAt = '2026-09-23T10:00:00Z'
    response({ order: value })
    await expect(setFulfillment(config, id, true)).rejects.toMatchObject({ data: { code: 'SHOPIFY_ORDER_CANCELLED' } })
    expect(externalFetch).toHaveBeenCalledTimes(1)
  })
})
