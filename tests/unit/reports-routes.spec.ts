import { createApp, eventHandler, getValidatedQuery, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ daily: vi.fn(), overview: vi.fn(), leaders: vi.fn(), commercial: vi.fn(), requireCapability: vi.fn() }))
vi.mock('~~/server/utils/pos/reports', () => ({ getEndOfDaySummary: mocks.daily, getReportsOverview: mocks.overview, getReportsLeaders: mocks.leaders }))
vi.mock('~~/server/utils/auth/session', () => ({ requireCapability: mocks.requireCapability }))
vi.mock('~~/server/utils/pos/commercial-reports', () => ({ getCommercialReport: mocks.commercial }))
vi.mock('~~/server/utils/pos/schema', () => ({ ensurePosSchema: async () => {} }))
vi.mock('~~/server/utils/turso', () => ({ useDb: () => 'database' }))

describe('report query validation', () => {
  beforeEach(() => {
    vi.stubGlobal('eventHandler', eventHandler)
    vi.stubGlobal('getValidatedQuery', getValidatedQuery)
  })

  it.each([
    ['end-of-day', 'date=2026-02-30'],
    ['overview', 'date=not-a-date'],
    ['leaders', 'startDate=2026-11-01&endDate=2026-13-01'],
    ['commercial', 'date=2026-02-30&period=month'],
    ['commercial', 'date=2026-11-10&period=invalid']
  ])('rejects invalid dates in %s with HTTP 400 before querying reports', async (name, query) => {
    const routes = {
      'end-of-day': (await import('../../server/api/reports/end-of-day.get')).default,
      'overview': (await import('../../server/api/reports/overview.get')).default,
      'leaders': (await import('../../server/api/reports/leaders.get')).default,
      'commercial': (await import('../../server/api/reports/commercial.get')).default
    }
    const app = createApp().use(routes[name as keyof typeof routes])
    const response = await toWebHandler(app)(new Request(`http://localhost/?${query}`))
    expect(response.status).toBe(400)
    expect(mocks.daily).not.toHaveBeenCalled()
    expect(mocks.overview).not.toHaveBeenCalled()
    expect(mocks.leaders).not.toHaveBeenCalled()
    expect(mocks.commercial).not.toHaveBeenCalled()
    expect(mocks.requireCapability).toHaveBeenCalledWith(expect.anything(), 'financial:read')
  })

  it('loads the requested commercial calendar period behind financial read access', async () => {
    mocks.commercial.mockResolvedValue({ period: 'year' })
    const route = (await import('../../server/api/reports/commercial.get')).default
    const response = await toWebHandler(createApp().use(route))(new Request('http://localhost/?date=2026-11-10&period=year'))
    expect(response.status).toBe(200)
    expect(mocks.commercial).toHaveBeenCalledWith('database', '2026-11-10', 'year')
    expect(mocks.requireCapability).toHaveBeenCalledWith(expect.anything(), 'financial:read')
  })
})
