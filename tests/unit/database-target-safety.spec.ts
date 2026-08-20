import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDatabaseTarget } from '../../scripts/db/_shared.mjs'

const productionTarget = 'prod-db.example.test'
const productionUrl = `libsql://${productionTarget}`

function stubRemoteEnvironment(environment = 'production') {
  vi.stubEnv('DB_REMOTE_TARGETS', JSON.stringify({ [productionTarget]: environment }))
  vi.stubEnv('TURSO_TOKEN', 'test-token')
}

describe('safe database target resolution', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('refuses every remote target absent from the explicit mapping', () => {
    vi.stubEnv('DB_REMOTE_TARGETS', '')
    vi.stubEnv('TURSO_TOKEN', 'test-token')

    expect(() => resolveDatabaseTarget({
      url: productionUrl,
      environment: 'staging',
      confirmTarget: productionTarget
    })).toThrow('not allowlisted')
  })

  it('cannot downgrade a mapped production target with a staging label', () => {
    stubRemoteEnvironment()

    expect(() => resolveDatabaseTarget({
      url: productionUrl,
      environment: 'staging',
      confirmTarget: productionTarget,
      allowProductionWrite: true
    }, { access: 'write' })).toThrow('allowlisted as production, not staging')
  })

  it('derives production protection from the mapping', () => {
    stubRemoteEnvironment()

    expect(() => resolveDatabaseTarget({
      url: productionUrl,
      confirmTarget: productionTarget
    }, { access: 'write' })).toThrow('Production writes require --allow-production-write')

    expect(resolveDatabaseTarget({
      url: productionUrl,
      confirmTarget: productionTarget,
      allowProductionWrite: true
    }, { access: 'write' })).toMatchObject({
      environment: 'production',
      local: false,
      targetId: productionTarget
    })
  })

  it('applies the same mapping guard to Drizzle configuration', async () => {
    vi.stubEnv('TURSO_URL', productionUrl)
    vi.stubEnv('TURSO_TOKEN', 'test-token')
    vi.stubEnv('DB_CONFIRM_TARGET', productionTarget)
    vi.stubEnv('DB_TARGET_ENV', 'staging')
    vi.stubEnv('DB_REMOTE_TARGETS', JSON.stringify({ [productionTarget]: 'production' }))

    await expect(import('../../drizzle.config')).rejects.toThrow(
      'allowlisted as production, not staging'
    )
  })
})
