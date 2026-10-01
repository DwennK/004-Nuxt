import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readBody: vi.fn(),
  throttleKey: vi.fn(() => '192.0.2.1:person@example.test'),
  assertAllowed: vi.fn(),
  registerFailure: vi.fn(),
  clearThrottle: vi.fn(),
  verifyTurnstile: vi.fn(),
  useDb: vi.fn(),
  verifyPassword: vi.fn(),
  hashPassword: vi.fn(),
  setSession: vi.fn()
}))

vi.mock('~~/server/utils/auth/login-throttle', () => ({
  loginThrottleKey: mocks.throttleKey,
  assertLoginAllowed: mocks.assertAllowed,
  registerLoginFailure: mocks.registerFailure,
  clearLoginThrottle: mocks.clearThrottle
}))
vi.mock('~~/server/utils/auth/turnstile', () => ({ verifyLoginTurnstile: mocks.verifyTurnstile }))
vi.mock('~~/server/utils/turso', () => ({ useDb: mocks.useDb }))
vi.mock('~~/shared/utils/capabilities', () => ({ listCapabilities: () => [] }))

vi.stubGlobal('eventHandler', (handler: unknown) => handler)
vi.stubGlobal('readValidatedBody', mocks.readBody)
vi.stubGlobal('createError', (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
vi.stubGlobal('verifyPassword', mocks.verifyPassword)
vi.stubGlobal('hashPassword', mocks.hashPassword)
vi.stubGlobal('setUserSession', mocks.setSession)

const { default: loginHandler } = await import('../../server/api/auth/login.post')

function body(companyWebsite = '') {
  return {
    email: 'person@example.test',
    password: 'candidate-password',
    companyWebsite,
    turnstileToken: 'token'
  }
}

describe('login anti-abuse boundary', () => {
  beforeEach(() => {
    vi.stubGlobal('readValidatedBody', mocks.readBody)
    vi.stubGlobal('createError', (input: { statusCode: number, statusMessage: string }) => Object.assign(new Error(input.statusMessage), input))
    vi.stubGlobal('verifyPassword', mocks.verifyPassword)
    vi.stubGlobal('hashPassword', mocks.hashPassword)
    vi.stubGlobal('setUserSession', mocks.setSession)
    mocks.readBody.mockResolvedValue(body())
    mocks.assertAllowed.mockResolvedValue(undefined)
    mocks.verifyTurnstile.mockResolvedValue(undefined)
    mocks.hashPassword.mockResolvedValue('dummy-hash')
    mocks.verifyPassword.mockResolvedValue(false)
    mocks.useDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [] })
        })
      })
    })
  })

  it('rejects a filled honeypot without recording a failure or verifying Turnstile', async () => {
    mocks.readBody.mockResolvedValue(body('bot-filled'))

    await expect(loginHandler({} as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.assertAllowed).toHaveBeenCalledOnce()
    expect(mocks.registerFailure).not.toHaveBeenCalled()
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled()
    expect(mocks.useDb).not.toHaveBeenCalled()
  })

  it('preserves the lockout response for an already blocked key', async () => {
    mocks.readBody.mockResolvedValue(body('bot-filled'))
    mocks.assertAllowed.mockRejectedValue(Object.assign(new Error('locked'), { statusCode: 429 }))

    await expect(loginHandler({} as never)).rejects.toMatchObject({ statusCode: 429 })
    expect(mocks.registerFailure).not.toHaveBeenCalled()
    expect(mocks.verifyTurnstile).not.toHaveBeenCalled()
  })

  it('still counts a real failed login after Turnstile verification', async () => {
    await expect(loginHandler({} as never)).rejects.toMatchObject({ statusCode: 401 })
    expect(mocks.verifyTurnstile).toHaveBeenCalledOnce()
    expect(mocks.registerFailure).toHaveBeenCalledWith('192.0.2.1:person@example.test')
  })

  it('still opens a session for a valid login', async () => {
    const user = {
      id: 'user-1',
      email: 'person@example.test',
      name: 'Person',
      isAdmin: false,
      isActive: true,
      passwordHash: 'stored-hash'
    }
    mocks.useDb.mockReturnValue({
      select: () => ({
        from: () => ({
          where: () => ({ limit: async () => [user] })
        })
      })
    })
    mocks.verifyPassword.mockResolvedValue(true)

    await expect(loginHandler({} as never)).resolves.toEqual({ ok: true })
    expect(mocks.verifyTurnstile).toHaveBeenCalledOnce()
    expect(mocks.registerFailure).not.toHaveBeenCalled()
    expect(mocks.clearThrottle).toHaveBeenCalledWith('192.0.2.1:person@example.test')
    expect(mocks.setSession).toHaveBeenCalledWith(expect.anything(), {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        isAdmin: user.isAdmin,
        capabilities: []
      }
    })
  })
})
