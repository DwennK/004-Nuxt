import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ bootstrap: vi.fn() }))
vi.mock('../../server/legacy/pos-bootstrap', () => ({ bootstrapLegacyPosSchema: mocks.bootstrap }))

beforeEach(() => {
  vi.resetModules()
  mocks.bootstrap.mockReset()
})

describe('POS legacy bootstrap boundary', () => {
  it.each([undefined, false, 'true'])('does not bootstrap for a non-explicit switch (%s)', async (enabled) => {
    vi.stubGlobal('useRuntimeConfig', () => ({ posAllowRuntimeSchemaBootstrap: enabled }))
    const { ensurePosSchema } = await import('../../server/utils/pos/schema')
    await ensurePosSchema()
    expect(mocks.bootstrap).not.toHaveBeenCalled()
  })

  it('runs one bootstrap for concurrent callers when explicitly enabled', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ posAllowRuntimeSchemaBootstrap: true }))
    const { ensurePosSchema } = await import('../../server/utils/pos/schema')
    await Promise.all([ensurePosSchema(), ensurePosSchema()])
    expect(mocks.bootstrap).toHaveBeenCalledTimes(1)
  })

  it('allows retry after an unsuccessful bootstrap', async () => {
    vi.stubGlobal('useRuntimeConfig', () => ({ posAllowRuntimeSchemaBootstrap: true }))
    mocks.bootstrap.mockRejectedValueOnce(new Error('bootstrap unavailable')).mockResolvedValue(undefined)
    const { ensurePosSchema } = await import('../../server/utils/pos/schema')
    await expect(ensurePosSchema()).rejects.toThrow('bootstrap unavailable')
    await ensurePosSchema()
    expect(mocks.bootstrap).toHaveBeenCalledTimes(2)
  })
})
