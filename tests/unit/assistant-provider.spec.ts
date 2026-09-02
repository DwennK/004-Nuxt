import type { H3Event } from 'h3'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { externalFetch } from '../../server/utils/external-fetch'
import { requestStructuredResponse, requestTextResponse } from '../../server/utils/assistant/provider'

vi.mock('../../server/utils/external-fetch', () => ({ externalFetch: vi.fn(), isExternalFetchError: () => false }))
const options = { requestId: 'assistant-test', systemPrompt: 'Test', userPrompt: 'Test' }

function respond(content = 'OK', status = 200) {
  vi.mocked(externalFetch).mockResolvedValueOnce({
    response: new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status }),
    requestId: options.requestId
  })
}

describe('assistant request-time configuration', () => {
  beforeEach(() => {
    vi.mocked(externalFetch).mockReset()
    vi.stubGlobal('useRuntimeConfig', () => ({}))
    for (const name of ['API_KEY', 'MODEL', 'BASE_URL']) {
      vi.stubEnv(`MINIMAX_${name}`, '')
      vi.stubEnv(`NUXT_MINIMAX_${name}`, '')
    }
  })

  it.each(['cloudflare', '_platform'])('reads the deployed MINIMAX_API_KEY binding through %s', async (shape) => {
    const cloudflare = { env: { MINIMAX_API_KEY: ' worker-key ', MINIMAX_MODEL: 'worker-model', MINIMAX_BASE_URL: 'https://api.minimax.io/v1/' } }
    const event = { context: shape === 'cloudflare' ? { cloudflare } : { _platform: { cloudflare } } } as unknown as H3Event
    respond()

    expect(await requestTextResponse(event, options)).toBe('OK')
    const [url, init] = vi.mocked(externalFetch).mock.calls[0]!
    expect(url).toBe('https://api.minimax.io/v1/chat/completions')
    expect(init?.headers).toMatchObject({ Authorization: 'Bearer worker-key' })
    expect(JSON.parse(String(init?.body)).model).toBe('worker-model')
  })

  it('uses request runtime overrides without reusing credentials between requests', async () => {
    const first = { context: {} } as H3Event
    const second = { context: {} } as H3Event
    vi.stubGlobal('useRuntimeConfig', (event: H3Event) => ({ minimaxApiKey: event === first ? 'first-key' : 'second-key' }))
    respond()
    respond()
    await requestTextResponse(first, options)
    await requestTextResponse(second, options)
    expect(vi.mocked(externalFetch).mock.calls.map(call => call[1]?.headers)).toEqual([
      expect.objectContaining({ Authorization: 'Bearer first-key' }),
      expect.objectContaining({ Authorization: 'Bearer second-key' })
    ])
  })

  it('prefers NUXT bindings over legacy bindings and local environment', async () => {
    vi.stubEnv('MINIMAX_API_KEY', 'local-key')
    const event = { context: { cloudflare: { env: { MINIMAX_API_KEY: 'legacy-key', NUXT_MINIMAX_API_KEY: 'preferred-key' } } } } as unknown as H3Event
    respond()
    await requestTextResponse(event, options)
    expect(vi.mocked(externalFetch).mock.calls[0]![1]?.headers).toMatchObject({ Authorization: 'Bearer preferred-key' })
  })

  it('supports the documented local environment names', async () => {
    vi.stubEnv('MINIMAX_API_KEY', 'local-key')
    respond()
    await requestTextResponse({ context: {} } as H3Event, options)
    expect(vi.mocked(externalFetch).mock.calls[0]![1]?.headers).toMatchObject({ Authorization: 'Bearer local-key' })
    expect(JSON.parse(String(vi.mocked(externalFetch).mock.calls[0]![1]?.body)).model).toBe('MiniMax-M2.7')
  })

  it('rejects missing or blank credentials before any provider call', async () => {
    vi.stubEnv('MINIMAX_API_KEY', '  ')
    await expect(requestTextResponse({ context: {} } as H3Event, options)).rejects.toMatchObject({
      statusCode: 503, data: { code: 'assistant_not_configured' }
    })
    expect(externalFetch).not.toHaveBeenCalled()
  })

  it('retains Worker configuration when structured output needs the JSON fallback', async () => {
    const event = { context: { cloudflare: { env: { MINIMAX_API_KEY: 'worker-key' } } } } as unknown as H3Event
    respond('', 400)
    respond('{"sql":"SELECT 1"}')
    expect(await requestStructuredResponse(event, { ...options, schemaName: 'test', schema: {} })).toEqual({ sql: 'SELECT 1' })
    expect(externalFetch).toHaveBeenCalledTimes(2)
    expect(vi.mocked(externalFetch).mock.calls[1]![1]?.headers).toMatchObject({ Authorization: 'Bearer worker-key' })
  })
})
