import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveSeedTarget } from '../../scripts/seed-target.mjs'

const remoteHost = 'seed-db.example.test'
const remoteUrl = `libsql://${remoteHost}`

function allowRemote(environment: string) {
  vi.stubEnv('TURSO_URL', remoteUrl)
  vi.stubEnv('TURSO_TOKEN', 'test-token')
  vi.stubEnv('DB_REMOTE_TARGETS', JSON.stringify({ [remoteHost]: environment }))
}

describe('seed target safety', () => {
  beforeEach(() => {
    vi.stubEnv('TURSO_URL', 'file:./test.db')
    vi.stubEnv('TURSO_TOKEN', '')
    vi.stubEnv('DB_TARGET_ENV', '')
    vi.stubEnv('DB_REMOTE_TARGETS', '')
  })

  it('does not silently seed the database configured in .env', () => {
    expect(() => resolveSeedTarget({})).toThrow('Seed target must be explicit')
  })

  it('allows an explicit local file without a remote token', () => {
    expect(resolveSeedTarget({ url: 'file:./test.db' }, { testOnly: true })).toMatchObject({
      local: true,
      environment: 'development',
      url: 'file:./test.db'
    })
  })

  it('allows explicitly selecting the configured local test database', () => {
    expect(resolveSeedTarget({ environment: 'test' }, { testOnly: true })).toMatchObject({
      local: true,
      environment: 'test'
    })
  })

  it('does not trust a test label for a remote database absent from the allowlist', () => {
    expect(() => resolveSeedTarget({
      url: remoteUrl,
      environment: 'test',
      confirmTarget: remoteHost
    }, { testOnly: true })).toThrow('not allowlisted')
  })

  it('requires exact confirmation even for an allowlisted remote test database', () => {
    allowRemote('test')

    expect(() => resolveSeedTarget({ environment: 'test' }, { testOnly: true })).toThrow('--confirm-target')
    expect(resolveSeedTarget({
      environment: 'test',
      confirmTarget: remoteHost
    }, { testOnly: true })).toMatchObject({ local: false, environment: 'test' })
  })

  it('cannot relabel a production database as test', () => {
    allowRemote('production')

    expect(() => resolveSeedTarget({
      environment: 'test',
      confirmTarget: remoteHost,
      allowProductionWrite: true
    }, { testOnly: true })).toThrow('allowlisted as production, not test')
  })

  it.each(['development', 'staging', 'production'])('refuses fixtures on remote %s targets', (environment) => {
    allowRemote(environment)

    expect(() => resolveSeedTarget({
      confirmTarget: remoteHost,
      allowProductionWrite: true
    }, { testOnly: true })).toThrow('Fixture and test-user seeds only accept')
  })

  it('refuses fixtures on a local database explicitly designated as production', () => {
    expect(() => resolveSeedTarget({
      url: 'file:./production.db',
      environment: 'production',
      allowProductionWrite: true
    }, { testOnly: true })).toThrow('Fixture and test-user seeds only accept')
  })

  it('preserves administrator seeding on production with both confirmations', () => {
    allowRemote('production')

    expect(() => resolveSeedTarget({ confirmTarget: remoteHost })).toThrow('--allow-production-write')
    expect(resolveSeedTarget({
      confirmTarget: remoteHost,
      allowProductionWrite: true
    })).toMatchObject({ local: false, environment: 'production' })
  })
})
