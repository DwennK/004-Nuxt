import { createApp, defineEventHandler, getRequestURL, setResponseHeaders, toWebHandler } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => {
  for (const [key, value] of Object.entries({ defineEventHandler, getRequestURL, setResponseHeaders })) vi.stubGlobal(key, value)
})

async function headers(path: string) {
  const { default: middleware } = await import('../../server/middleware/security-headers')
  const app = createApp()
  app.use(middleware)
  app.use(defineEventHandler(() => 'OK'))
  return (await toWebHandler(app)(new Request(`https://pos.example${path}`))).headers
}

describe('print frame boundaries', () => {
  it.each(['/documents/1/print?profile=a4', '/documents/42/print?profile=thermal', '/dossiers/1/print/', '/api/documents/1/pdf?inline=1'])('allows only same-origin embedding of %s', async (path) => {
    const result = await headers(path)
    expect(result.get('x-frame-options')).toBe('SAMEORIGIN')
    expect(result.get('content-security-policy')).toContain('frame-ancestors \'self\'')
    expect(result.get('content-security-policy')).toContain('frame-src \'self\' https://challenges.cloudflare.com')
  })

  it.each(['/', '/login', '/documents/1', '/dossiers/1/edit', '/api/documents/1', '/api/documents/1/pdf/other', '/api/documents/0/pdf', '/documents/1/print/other'])('continues to block all embedding of %s', async (path) => {
    const result = await headers(path)
    expect(result.get('x-frame-options')).toBe('DENY')
    expect(result.get('content-security-policy')).toContain('frame-ancestors \'none\'')
  })
})
