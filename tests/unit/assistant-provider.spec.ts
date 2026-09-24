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
    expect(JSON.parse(String(vi.mocked(externalFetch).mock.calls[0]![1]?.body)).model).toBe('MiniMax-M3')
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

describe('assistant real provider streaming', () => {
  const event = { context: {} } as H3Event
  beforeEach(() => {
    vi.stubGlobal('useRuntimeConfig', () => ({ minimaxApiKey: 'test-key' }))
  })
  it('delivers text while the provider connection is still open, excluding reasoning', async () => {
    let output: ReadableStreamDefaultController<Uint8Array>
    const stream = new ReadableStream<Uint8Array>({ start(controller) {
      output = controller
    } })
    const fetch = vi.fn().mockResolvedValue(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }))
    vi.stubGlobal('fetch', fetch)
    const received: string[] = []
    let firstText: (() => void) | undefined
    const arrived = new Promise<void>((resolve) => {
      firstText = resolve
    })
    const result = requestTextResponse(event, { ...options, onText: async (text) => {
      received.push(text)
      firstText!()
    } })
    const send = (chunk: unknown) => output.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`))
    send({ choices: [{ delta: { reasoning_details: [{ text: 'hidden' }], content: '<thi' } }] })
    send({ choices: [{ delta: { content: 'nk>secret</think>Bonjour' } }] })
    await arrived
    expect(received).toEqual(['Bonjour'])
    send({ choices: [{ delta: { content: ' !' }, finish_reason: 'stop' }] })
    output!.enqueue(new TextEncoder().encode('data: [DONE]\n\n'))
    output!.close()
    expect(await result).toBe('Bonjour !')
    expect(JSON.parse(fetch.mock.calls[0]![1].body)).toMatchObject({ stream: true, reasoning_split: true })
  })
  it.each([
    'data: {"choices":[{"delta":{"content":"Partial"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"Partial"},"finish_reason":"length"}]}\n\ndata: [DONE]\n\n',
    'data: {"error":{"message":"private"}}\n\n'
  ])('rejects incomplete or failed responses instead of marking them complete', async (body) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } })))
    await expect(requestTextResponse(event, { ...options, onText: async () => {} })).rejects.toThrow()
  })
  it('passes caller cancellation through to the provider request', async () => {
    const abort = new AbortController()
    const fetch = vi.fn((_url, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
    }))
    vi.stubGlobal('fetch', fetch)
    const result = requestTextResponse(event, { ...options, signal: abort.signal, onText: async () => {} })
    abort.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetch.mock.calls[0]![1].signal?.aborted).toBe(true)
  })
})

it('accepts MiniMax stop completion without an OpenAI DONE marker', async () => {
  vi.stubGlobal('useRuntimeConfig', () => ({ minimaxApiKey: 'test-key' }))
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
    'data: {"choices":[{"delta":{"content":"Bonjour"}}]}\n\ndata: {"choices":[{"delta":{"content":" !"},"finish_reason":"stop"}]}\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } }
  )))
  const received: string[] = []
  expect(await requestTextResponse({ context: {} } as H3Event, { ...options, onText: async (text) => {
    received.push(text)
  } })).toBe('Bonjour !')
  expect(received).toEqual(['Bonjour', ' !'])
})
