import { createServer, type Server } from 'node:http'
import { createApp, createError, eventHandler, toNodeListener } from 'h3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withBackupAdmin } from '../../server/utils/backups/http'
import { backupConfigured } from '../../server/utils/backups/service'

const { requireAdmin } = vi.hoisted(() => ({ requireAdmin: vi.fn() }))
vi.mock('../../server/utils/auth/session', () => ({ requireAdminSessionUser: requireAdmin }))
const servers: Server[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))))
})

async function endpoint() {
  const action = vi.fn().mockResolvedValue({ ok: true })
  const app = createApp().use(eventHandler(event => withBackupAdmin(event, action)))
  const server = createServer(toNodeListener(app))
  servers.push(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing test address')
  return { url: `http://127.0.0.1:${address.port}`, action }
}

describe('backup API boundaries', () => {
  it.each([401, 403])('rejects an unauthenticated or non-admin caller (%s) before accessing the database', async (statusCode) => {
    requireAdmin.mockRejectedValue(createError({ statusCode }))
    const runtimeConfig = vi.fn()
    vi.stubGlobal('useRuntimeConfig', runtimeConfig)
    const { url, action } = await endpoint()
    const result = await fetch(url, { method: 'POST', headers: { Origin: url } })
    expect(result.status).toBe(statusCode)
    expect(runtimeConfig).not.toHaveBeenCalled()
    expect(action).not.toHaveBeenCalled()
  })

  it('rejects cross-origin mutations before accessing the database', async () => {
    requireAdmin.mockResolvedValue({ id: 1 })
    const { url, action } = await endpoint()
    const result = await fetch(url, { method: 'POST', headers: { Origin: 'https://other.example' } })
    expect(result.status).toBe(403)
    expect(action).not.toHaveBeenCalled()
  })

  it('allows an administrator from the POS origin and disables caching', async () => {
    requireAdmin.mockResolvedValue({ id: 1 })
    vi.stubGlobal('useRuntimeConfig', () => ({ tursoUrl: 'file::memory:' }))
    const { url, action } = await endpoint()
    const result = await fetch(url, { method: 'POST', headers: { Origin: url } })
    expect(result.status).toBe(200)
    expect(result.headers.get('cache-control')).toBe('no-store')
    expect(action).toHaveBeenCalledOnce()
  })

  it('requires a strong encryption key and an explicit valid callback', () => {
    const config = { appKey: 'key', appSecret: 'secret', encryptionKey: btoa('x'.repeat(32)), redirectUri: 'https://pos.example/api/settings/backups/dropbox/callback' }
    expect(backupConfigured(config)).toBe(true)
    expect(backupConfigured({ ...config, encryptionKey: 'short' })).toBe(false)
    expect(backupConfigured({ ...config, redirectUri: 'http://pos.example/api/settings/backups/dropbox/callback' })).toBe(false)
    expect(backupConfigured({ ...config, redirectUri: 'https://pos.example/elsewhere' })).toBe(false)
  })
})
