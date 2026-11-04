import type { RequestEvent } from 'nuxt/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listCapabilities } from '../../shared/utils/capabilities'

const mocks = vi.hoisted(() => ({
  users: vi.fn(),
  getSession: vi.fn(),
  replaceSession: vi.fn(),
  clearSession: vi.fn()
}))

vi.mock('~~/server/utils/turso', () => ({
  useDb: () => ({
    select: () => ({ from: () => ({ where: () => ({ limit: mocks.users }) }) })
  })
}))

const { resolveActiveSessionUser, getAuthRequestContext } = await import('../../server/utils/auth/session')

function portableEvent() {
  return {
    req: new Request('https://pos.example.test/api/_auth/session'),
    res: { status: 200, statusText: '', headers: new Headers() },
    context: {}
  } as RequestEvent
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.stubGlobal('getUserSession', mocks.getSession)
  vi.stubGlobal('replaceUserSession', mocks.replaceSession)
  vi.stubGlobal('clearUserSession', mocks.clearSession)
})

describe('active users through the portable authentication session hook', () => {
  it('leaves anonymous sessions unauthenticated without a database lookup', async () => {
    mocks.getSession.mockResolvedValue({})
    const event = portableEvent()

    expect(await resolveActiveSessionUser(event)).toBeNull()
    expect(mocks.users).not.toHaveBeenCalled()
    expect(getAuthRequestContext(event)).toBeUndefined()
  })

  it.each([
    { label: 'missing', rows: [] },
    { label: 'disabled', rows: [{ id: 7, isActive: false }] }
  ])('clears a session when its account is $label', async ({ rows }) => {
    mocks.getSession.mockResolvedValue({ user: { id: 7 } })
    mocks.users.mockResolvedValue(rows)
    const event = portableEvent()

    expect(await resolveActiveSessionUser(event)).toBeNull()
    expect(mocks.clearSession).toHaveBeenCalledWith(event)
    expect(getAuthRequestContext(event)).toBeUndefined()
  })

  it('replaces stale administrator rights with current database capabilities', async () => {
    mocks.getSession.mockResolvedValue({ user: { id: 7, isAdmin: true, capabilities: listCapabilities({ isAdmin: true }) } })
    const user = { id: 7, email: 'operator@example.test', name: 'Operator', isActive: true, isAdmin: false }
    mocks.users.mockResolvedValue([user])
    const event = portableEvent()

    const active = await resolveActiveSessionUser(event)

    expect(active).toEqual({ id: 7, email: user.email, name: user.name, isAdmin: false, capabilities: listCapabilities(user) })
    expect(mocks.replaceSession).toHaveBeenCalledWith(event, { user: active })
    expect(getAuthRequestContext(event)).toMatchObject({ user: active, actor: { userId: 7 }, capabilities: listCapabilities(user) })
    expect(getAuthRequestContext(event)?.requestId).toEqual(expect.any(String))
    expect(await resolveActiveSessionUser(event)).toBe(active)
    expect(mocks.users).toHaveBeenCalledOnce()
  })
})
