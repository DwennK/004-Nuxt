import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const guardedRuntimeSchemaFiles = [
  'server/utils/pos/core.ts',
  'server/utils/smartphone-stocks.ts',
  'server/utils/smartphone-reservations.ts',
  'server/utils/auth/login-throttle.ts'
]

describe('runtime schema policy', () => {
  it.each(guardedRuntimeSchemaFiles)('%s requires the explicit local bootstrap switch', async (path) => {
    const source = await readFile(new URL(`../../${path}`, import.meta.url), 'utf8')

    expect(source).toContain('posAllowRuntimeSchemaBootstrap')
    expect(source).toContain('!== true')
  })

  it('keeps both dangerous compatibility switches disabled in the environment template', async () => {
    const source = await readFile(new URL('../../.env.example', import.meta.url), 'utf8')

    expect(source).toContain('POS_ALLOW_RUNTIME_SCHEMA_BOOTSTRAP=false')
    expect(source).toContain('POS_ALLOW_RUNTIME_DEMO_SEED=false')
  })
})
