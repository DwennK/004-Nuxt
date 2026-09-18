import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  query: {} as Record<string, unknown>,
  session: { data: { state: 'expected', userId: 7 }, clear: vi.fn() },
  token: vi.fn(),
  account: vi.fn(),
  execute: vi.fn()
}))
vi.mock('../../server/utils/backups/http', () => ({
  withBackupAdmin: (_event: unknown, action: (context: object, userId: number) => unknown) => action({
    client: { execute: mocks.execute },
    dropbox: { encryptionKey: btoa('x'.repeat(32)), redirectUri: 'https://pos.example/api/settings/backups/dropbox/callback' }
  }, 7),
  backupOAuthSession: async () => mocks.session
}))
vi.mock('../../server/utils/backups/service', () => ({ requireBackupConfig: vi.fn(), requireBackupSchema: vi.fn() }))
vi.mock('../../server/utils/backups/dropbox', () => ({ dropboxToken: mocks.token, dropboxAccount: mocks.account }))

beforeEach(() => {
  mocks.query = {}
  mocks.session.data = { state: 'expected', userId: 7 }
  mocks.execute.mockResolvedValue({ rowsAffected: 1 })
  mocks.token.mockResolvedValue({ access_token: 'access', refresh_token: 'refresh' })
  mocks.account.mockResolvedValue('backup@example.test')
  vi.stubGlobal('eventHandler', (handler: unknown) => handler)
  vi.stubGlobal('setResponseHeader', vi.fn())
  vi.stubGlobal('getQuery', () => mocks.query)
  vi.stubGlobal('sendRedirect', (_event: unknown, path: string) => path)
})

async function callback() {
  const { default: handler } = await import('../../server/api/settings/backups/dropbox/callback.get')
  return handler({} as Parameters<typeof handler>[0])
}

describe('Dropbox OAuth callback', () => {
  it.each(['missing', 'wrong', 'different-user'])('rejects %s state before exchanging a code', async (scenario) => {
    mocks.query = { code: 'code', ...(scenario === 'missing' ? {} : { state: scenario === 'wrong' ? 'wrong' : 'expected' }) }
    if (scenario === 'different-user') mocks.session.data.userId = 8
    expect(await callback()).toBe('/settings/backups?dropbox=invalid_state')
    expect(mocks.token).not.toHaveBeenCalled()
    expect(mocks.execute).not.toHaveBeenCalled()
    expect(mocks.session.clear).toHaveBeenCalledOnce()
  })

  it('handles cancellation without changing the connection', async () => {
    mocks.query = { state: 'expected', error: 'access_denied' }
    expect(await callback()).toBe('/settings/backups?dropbox=cancelled')
    expect(mocks.execute).not.toHaveBeenCalled()
  })

  it('persists only an encrypted refresh token after a valid callback', async () => {
    mocks.query = { state: 'expected', code: 'code' }
    expect(await callback()).toBe('/settings/backups?dropbox=connected')
    const statement = mocks.execute.mock.calls[0]![0]
    expect(statement.args[0]).toMatch(/^v1\./)
    expect(statement.args).not.toContain('refresh')
    expect(statement.args).not.toContain('access')
    expect(statement.args[1]).toBe('backup@example.test')
  })
})
