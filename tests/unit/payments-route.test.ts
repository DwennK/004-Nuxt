import { createApp, eventHandler, getValidatedQuery, toWebHandler } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import type { PaymentListResponse } from '../../shared/types/pos'

const routeMocks = vi.hoisted(() => ({
  listPayments: vi.fn(),
  requireCapability: vi.fn()
}))

vi.mock('~~/server/utils/pos/payments', () => ({
  listPayments: routeMocks.listPayments
}))

vi.mock('~~/server/utils/auth/session', () => ({
  requireCapability: routeMocks.requireCapability
}))

describe('GET /api/payments', () => {
  it('returns the paginated payment envelope and forwards bounded query values', async () => {
    vi.stubGlobal('eventHandler', eventHandler)
    vi.stubGlobal('getValidatedQuery', getValidatedQuery)

    const responseBody = {
      items: [],
      page: 2,
      pageSize: 25,
      total: 27
    } satisfies PaymentListResponse
    routeMocks.listPayments.mockResolvedValue(responseBody)

    const { default: paymentsRoute } = await import('../../server/api/payments/index.get')
    const app = createApp()
    app.use(paymentsRoute)

    const response = await toWebHandler(app)(new Request(
      'http://localhost/api/payments?page=2&pageSize=25&method=cash&dateFrom=2026-08-01&dateTo=2026-08-20'
    ))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(responseBody)
    expect(routeMocks.requireCapability).toHaveBeenCalledWith(expect.anything(), 'financial:read')
    expect(routeMocks.listPayments).toHaveBeenCalledWith({
      page: 2,
      pageSize: 25,
      method: 'cash',
      dateFrom: '2026-08-01',
      dateTo: '2026-08-20',
      sortBy: 'paidAt',
      sortDirection: 'desc'
    })
  })
})
