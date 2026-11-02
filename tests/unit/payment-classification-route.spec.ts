import { createApp, createError, createRouter, eventHandler, getValidatedRouterParams, readValidatedBody, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ update: vi.fn(), auth: vi.fn() }))
vi.mock('~~/server/utils/pos/payment-classifications', () => ({ updatePaymentClassification: mocks.update }))
vi.mock('~~/server/utils/auth/session', () => ({ requireCapability: mocks.auth }))

describe('payment classification route authorization and validation', () => {
  beforeEach(() => {
    vi.stubGlobal('eventHandler', eventHandler)
    vi.stubGlobal('getValidatedRouterParams', getValidatedRouterParams)
    vi.stubGlobal('readValidatedBody', readValidatedBody)
    mocks.update.mockReset().mockResolvedValue({ revision: 1 })
    mocks.auth.mockReset().mockResolvedValue({ actor: { userId: 42 } })
  })

  async function request(body: unknown, id = '7') {
    const { default: handler } = await import('../../server/api/payments/[id]/classification.put')
    const app = createApp().use(createRouter().put('/api/payments/:id/classification', handler))
    return toWebHandler(app)(new Request(`http://localhost/api/payments/${id}/classification`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    }))
  }

  it('uses the authenticated operator, not an actor supplied by the client', async () => {
    const body = { allocations: [{ category: 'device', amount: 32200 }], expectedRevision: 0, expectedAmount: 32200 }
    const response = await request(body)
    expect(response.status).toBe(200)
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), 'financial:record')
    expect(mocks.update).toHaveBeenCalledWith(7, body, 42)
    expect((await request({ ...body, updatedBy: 1 })).status).toBe(400)
  })

  it('requires permission before writing', async () => {
    mocks.auth.mockRejectedValue(createError({ statusCode: 403 }))
    expect((await request({ allocations: [], expectedRevision: 0, expectedAmount: 100 })).status).toBe(403)
    expect(mocks.update).not.toHaveBeenCalled()
  })

  it('rejects invalid IDs and unbounded category input before persistence', async () => {
    expect((await request({ allocations: [], expectedRevision: 0, expectedAmount: 100 }, 'abc')).status).toBe(400)
    expect((await request({ allocations: [{ category: 'unknown', amount: 100 }], expectedRevision: 0, expectedAmount: 100 })).status).toBe(400)
    expect(mocks.update).not.toHaveBeenCalled()
  })
})
