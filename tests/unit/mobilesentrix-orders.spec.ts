import { createError } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { externalFetch } from '../../server/utils/external-fetch'
import { getMobileSentrixOrder, listMobileSentrixOrders } from '../../server/utils/mobilesentrix'
import { mapMobileSentrixOrder } from '../../server/utils/mobilesentrix-order-mapping'
import { mergeMobileSentrixOrders, mobileSentrixCalendarDate, mobileSentrixLinesSubtotal, mobileSentrixOrderDate, mobileSentrixOrderLineKind, mobileSentrixOrderMatchesSearch, mobileSentrixOrderMoney, mobileSentrixOrderStatus, mobileSentrixVisibleOrderLines } from '../../shared/utils/mobilesentrix-orders'
import { mobileSentrixOrderParamsSchema, mobileSentrixOrdersQuerySchema } from '../../shared/validation/mobilesentrix-orders'

vi.mock('../../server/utils/external-fetch', () => ({ externalFetch: vi.fn() }))

// Synthetic supplier-shaped fixtures. Never store real order/customer data in tests.
const phone = {
  item_id: '1', product_attribute_setid: 10, name: 'Pre-Owned Device - iPhone 15 (eSim) 128GB Black - Grade C', sku: '000123',
  qty_ordered: '2.0000', qty_shipped: '1.0000', price_incl_tax: '120.0000', row_total_incl_tax: '240.0000'
}
const cable = { ...phone, item_id: '2', product_attribute_setid: 20, name: 'Cable compatible for iPhone', qty_ordered: '1.0000', price_incl_tax: '5.5000', row_total_incl_tax: '5.5000' }
const fixture = {
  entity_id: 12, increment_id: '001234', created_at: '2026-10-15 07:59:26', status: 'Shipped', store_currency_code: 'USD',
  grand_total: '255.5000', delivery_date: '2026-10-19 18:00:00', shipping_description: 'FedEx International Priority', tracking_number: '123456789012',
  order_items: [phone, cable], customer_email: 'private@example.test', addresses: [{ street: 'private street' }], payment_info: { secret: 'private payment' }
}

function respond(payload: unknown, status = 200) {
  vi.mocked(externalFetch).mockResolvedValueOnce({ response: new Response(JSON.stringify(payload), { status }), requestId: 'orders-test' })
}

describe('MobileSentrix orders API', () => {
  beforeEach(() => {
    vi.stubGlobal('createError', createError)
    vi.stubGlobal('useRuntimeConfig', () => ({
      mobilesentrixBaseUrl: 'https://www.mobilesentrix.com', mobilesentrixConsumerName: 'test',
      mobilesentrixConsumerKey: 'test-key', mobilesentrixConsumerSecret: 'test-secret',
      mobilesentrixAccessToken: 'test-token', mobilesentrixAccessTokenSecret: 'test-token-secret',
      mobilesentrixRestAuthHeaderName: 'ms-token', mobilesentrixRestAuthHeaderValue: 'test-header'
    }))
  })

  it('requests the newest page, sorts indexed objects explicitly, and reuses server authentication', async () => {
    respond({ 12: fixture, 13: { ...fixture, entity_id: 13, created_at: '2026-10-17 10:00:00' } })
    const result = await listMobileSentrixOrders({ page: 2, limit: 2 })
    expect(result.items.map(order => order.id)).toEqual(['13', '12'])
    expect(result).toMatchObject({ page: 2, hasMore: true })
    const [url, options] = vi.mocked(externalFetch).mock.calls[0]!
    expect(String(url)).toBe('https://www.mobilesentrix.com/api/rest/orders?page=2&limit=2&order=created_at&dir=desc')
    expect(options?.headers).toMatchObject({ 'Authorization': expect.stringContaining('OAuth '), 'ms-token': 'test-header' })
  })

  it('normalizes detail, cents, quantities, leading zeros, tracking and calendar date without private payload', async () => {
    respond(fixture)
    const order = await getMobileSentrixOrder('12')
    expect(order).toMatchObject({ id: '12', number: '001234', totalCents: 25550, currency: 'USD', deliveryDate: '2026-10-19', trackingUrl: 'https://www.fedex.com/fedextrack/?trknbr=123456789012' })
    expect(order.lines[0]).toEqual({ id: '1', name: phone.name, sku: '000123', quantity: 2, shippedQuantity: 1, unitPriceCents: 12000, totalCents: 24000, kind: 'smartphone' })
    expect(Object.keys(order).sort()).toEqual(['id', 'number', 'createdAt', 'status', 'currency', 'totalCents', 'deliveryDate', 'carrier', 'trackingNumber', 'trackingUrl', 'lines'].sort())
    expect(JSON.stringify(order)).not.toMatch(/private|addresses|payment_info|customer_email|test-secret|test-header/)
  })

  it('supports indexed lines and empty lists; does not invent a total page count', async () => {
    expect(mapMobileSentrixOrder({ ...fixture, order_items: { 1: phone } }).lines).toHaveLength(1)
    respond({})
    expect(await listMobileSentrixOrders({ page: 3, limit: 50 })).toEqual({ items: [], page: 3, hasMore: false })
    respond([fixture])
    expect((await listMobileSentrixOrders({ page: 1, limit: 50 })).hasMore).toBe(false)
  })

  it('retains unknown status and missing fields without assuming delivery or borrowing tracking', () => {
    const order = mapMobileSentrixOrder({ ...fixture, delivery_date: null, tracking_number: null, shipping_description: 'Add to Existing Order - FedEx International Priority', status: 'Reserve Stock' })
    expect(order).toMatchObject({ deliveryDate: null, trackingNumber: null, trackingUrl: null })
    expect(mobileSentrixOrderStatus(order.status)).toBe('Stock réservé')
    expect(mobileSentrixOrderStatus('Shipped')).toBe('Expédiée')
    expect(mobileSentrixOrderStatus('Supplier custom status')).toBe('Supplier custom status')
  })

  it('does not turn an unrecognized carrier or tracking payload into a URL', () => {
    expect(mapMobileSentrixOrder({ ...fixture, shipping_description: 'Other carrier' }).trackingUrl).toBeNull()
    expect(mapMobileSentrixOrder({ ...fixture, tracking_number: 'javascript:alert(1)' }).trackingUrl).toBeNull()
  })

  it('rounds supplier decimal strings to cents, preserves signs and handles absent or invalid money', () => {
    for (const [value, expected] of [['1.0050', 101], ['-1.005', -101], ['0', 0], [null, null], ['', null], ['NaN', null], ['999999999999999999999', null]] as const) {
      expect(mapMobileSentrixOrder({ ...fixture, grand_total: value }).totalCents).toBe(expected)
    }
    const order = mapMobileSentrixOrder({ ...fixture, store_currency_code: null, order_items: [{ ...phone, price_incl_tax: null, price: '100', row_total_incl_tax: null, row_total: '200', qty_ordered: '', qty_shipped: 'invalid' }] })
    expect(order.lines[0]).toMatchObject({ unitPriceCents: null, totalCents: null, quantity: null, shippedQuantity: null })
    expect(mobileSentrixOrderMoney(order.totalCents, order.currency)).toContain('devise non communiquée')
    expect(mobileSentrixOrderMoney(1234, 'USD')).toContain('USD')
    expect(mobileSentrixOrderMoney(null, 'USD')).toBe('Non communiqué')
  })

  it('rejects mismatched details, malformed successful payloads and provider errors', async () => {
    respond(fixture)
    await expect(getMobileSentrixOrder('13')).rejects.toMatchObject({ statusCode: 502 })
    for (const payload of [null, { messages: { error: [{ message: 'No access' }] } }, { 12: { entity_id: 12 } }]) {
      respond(payload)
      await expect(listMobileSentrixOrders({ page: 1, limit: 50 })).rejects.toMatchObject({ statusCode: 502 })
    }
    respond({ messages: { error: [{ message: 'Access denied' }] } }, 403)
    await expect(listMobileSentrixOrders({ page: 1, limit: 50 })).rejects.toMatchObject({ statusCode: 403 })
    vi.mocked(externalFetch).mockRejectedValueOnce(createError({ statusCode: 504, message: 'Timeout' }))
    await expect(listMobileSentrixOrders({ page: 1, limit: 50 })).rejects.toMatchObject({ statusCode: 504 })
  })

  it('validates pagination and numeric identifiers before any provider request', () => {
    expect(mobileSentrixOrdersQuerySchema.parse({})).toEqual({ page: 1, limit: 50 })
    for (const query of [{ page: 0 }, { page: 1.5 }, { limit: 51 }, { limit: -1 }]) expect(mobileSentrixOrdersQuerySchema.safeParse(query).success).toBe(false)
    for (const id of ['../products', '', '0', '12?other=true']) expect(mobileSentrixOrderParamsSchema.safeParse({ id }).success).toBe(false)
    expect(mobileSentrixOrderParamsSchema.parse({ id: '12' })).toEqual({ id: '12' })
  })
})

describe('MobileSentrix order presentation', () => {
  it('searches order numbers, translated status, calendar dates, tracking and article SKUs', () => {
    const order = mapMobileSentrixOrder(fixture)
    for (const query of ['#001234', 'expediee iphone', '15.10.2026', '2026-10-19', 'fedex 123456789012', '000123', '   ']) {
      expect(mobileSentrixOrderMatchesSearch(order, query), query).toBe(true)
    }
    expect(mobileSentrixOrderMatchesSearch(order, 'iphone 16')).toBe(false)
    expect(mobileSentrixOrderMatchesSearch(order, 'private@example.test')).toBe(false)
  })
  it('combines order search with smartphone filtering and restores matches when cleared', () => {
    const order = mapMobileSentrixOrder(fixture)
    expect(mobileSentrixOrderMatchesSearch(order, 'cable', false)).toBe(true)
    expect(mobileSentrixOrderMatchesSearch(order, 'cable', true)).toBe(false)
    expect(mobileSentrixOrderMatchesSearch(order, 'iphone', true)).toBe(true)
    expect(mobileSentrixOrderMatchesSearch(order, '', true)).toBe(true)
    expect(order.lines).toHaveLength(2)
  })
  it.each([null, '', '0000-00-00 00:00:00', '2026-02-30', '2026-13-01', '2026-10-19 25:00:00', '2026-10-19 18:60:00', 'invalid'])('rejects an absent or invalid date %s', (value) => {
    expect(mobileSentrixCalendarDate(value)).toBeNull()
  })

  it('preserves the supplier date without timezone conversion', () => {
    expect(mobileSentrixCalendarDate('2024-02-29 23:30:00')).toBe('2024-02-29')
    expect(mobileSentrixOrderDate('2026-10-19 00:01:00')).toBe('19.10.2026')
    expect(mobileSentrixOrderDate(null)).toBe('Non communiquée')
  })

  it.each([
    [10, 'Pre-Owned Device - iPhone 15', 'smartphone'],
    [10, 'Pre-Owned Device - iPhone XR', 'smartphone'],
    [10, 'Pre-Owned Device - iPhone XS Max', 'smartphone'],
    ['10', 'Pre-Owned Device - Galaxy S25 5G', 'smartphone'],
    [10, 'Pre-Owned Device - Galaxy Z Fold 6', 'smartphone'],
    [10, 'Pre-Owned Device - OnePlus 9', 'smartphone'],
    [10, 'Pre-Owned Device - iPad 8 (2020)', 'other'],
    [10, 'Pre-Owned Device - Galaxy Tab S9', 'other'],
    [10, 'Pre-Owned Device - Galaxy Watch 5', 'other'],
    [10, 'Pre-Owned Device - OnePlus Pad 2', 'other'],
    [20, 'Screen for iPhone 15', 'other'],
    [10, 'Pre-Owned Device - Unknown brand X', 'unknown'],
    [null, 'iPhone 15', 'unknown']
  ])('classifies attribute set %s and %s conservatively', (attributeSet, name, expected) => {
    expect(mobileSentrixOrderLineKind(attributeSet, String(name))).toBe(expected)
  })

  it('filters mixed orders and restores every line without altering their total', () => {
    const mixed = mapMobileSentrixOrder(fixture)
    const filtered = mobileSentrixVisibleOrderLines(mixed, true)
    expect(filtered.map(line => line.id)).toEqual(['1'])
    expect(mobileSentrixLinesSubtotal(filtered)).toBe(24000)
    expect(mixed.totalCents).toBe(25550)
    expect(mobileSentrixVisibleOrderLines(mixed, false)).toHaveLength(2)
    const tablet = mapMobileSentrixOrder({ ...fixture, order_items: [{ ...phone, name: 'Pre-Owned Device - iPad 8' }] })
    expect(mobileSentrixVisibleOrderLines(tablet, true)).toEqual([])
    expect(mobileSentrixLinesSubtotal([])).toBeNull()
    expect(mobileSentrixLinesSubtotal([{ ...filtered[0]!, totalCents: null }])).toBeNull()
  })

  it('merges overlapping pages without duplicates and keeps the refreshed data in newest order', () => {
    const old = mapMobileSentrixOrder(fixture)
    const fresh = { ...old, status: 'Delivered' }
    const newer = { ...old, id: '13', createdAt: '2026-10-17 12:00:00' }
    const result = mergeMobileSentrixOrders([old], [fresh, newer])
    expect(result.map(order => order.id)).toEqual(['13', '12'])
    expect(result[1]?.status).toBe('Delivered')
  })
})
