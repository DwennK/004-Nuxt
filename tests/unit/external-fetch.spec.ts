import { afterEach, describe, expect, it, vi } from 'vitest'
import { externalFetch, isExternalFetchError } from '../../server/utils/external-fetch'

describe('externalFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('propagates the request id and keeps query parameters out of logs', async () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    let forwardedHeaders = new Headers()

    vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      forwardedHeaders = new Headers(init?.headers)

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    }))

    const input = new Request('https://example.test/orders?token=secret', {
      headers: { Authorization: 'Bearer test' }
    })
    const { response, requestId } = await externalFetch(input, {}, {
      provider: 'test-provider',
      requestId: 'req-success',
      timeoutMs: 1_000
    })

    expect(requestId).toBe('req-success')
    expect(forwardedHeaders.get('authorization')).toBe('Bearer test')
    expect(forwardedHeaders.get('x-request-id')).toBe('req-success')
    expect(await response.json()).toEqual({ ok: true })
    expect(infoSpy).toHaveBeenCalledOnce()
    expect(infoSpy.mock.calls[0]?.[0]).toContain('https://example.test/orders')
    expect(infoSpy.mock.calls[0]?.[0]).not.toContain('token=secret')
  })

  it('normalizes timeouts with a correlation id', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.stubGlobal('fetch', vi.fn((_input: RequestInfo | URL, init?: RequestInit) => (
      new Promise<Response>((_resolve, reject) => {
        const keepAlive = setTimeout(() => reject(new Error('Timeout signal did not fire')), 100)
        const rejectOnAbort = () => {
          clearTimeout(keepAlive)
          reject(init?.signal?.reason)
        }

        if (init?.signal?.aborted) {
          rejectOnAbort()
        } else {
          init?.signal?.addEventListener('abort', rejectOnAbort, { once: true })
        }
      })
    )))

    const promise = externalFetch('https://example.test/slow', {}, {
      provider: 'test-provider',
      requestId: 'req-timeout',
      timeoutMs: 5
    })

    await expect(promise).rejects.toMatchObject({
      statusCode: 504,
      data: {
        code: 'external_request_timeout',
        provider: 'test-provider',
        requestId: 'req-timeout',
        timeoutMs: 5
      }
    })
    await expect(promise.catch(error => isExternalFetchError(error))).resolves.toBe(true)
  })

  it('normalizes network failures without retrying', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const fetchMock = vi.fn(async () => {
      throw new TypeError('offline')
    })
    vi.stubGlobal('fetch', fetchMock)

    const promise = externalFetch('https://example.test/down', {}, {
      provider: 'test-provider',
      requestId: 'req-network',
      timeoutMs: 1_000
    })

    await expect(promise).rejects.toMatchObject({
      statusCode: 502,
      data: {
        code: 'external_request_failed',
        requestId: 'req-network'
      }
    })
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('stops an unbounded response stream once the byte limit is exceeded', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let streamCancelled = false

    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(6))
        controller.enqueue(new Uint8Array(6))
      },
      cancel() {
        streamCancelled = true
      }
    }))))

    const promise = externalFetch('https://example.test/oversize', {}, {
      provider: 'test-provider',
      requestId: 'req-oversize',
      timeoutMs: 1_000,
      maxResponseBytes: 10
    })

    await expect(promise).rejects.toMatchObject({
      statusCode: 502,
      data: {
        code: 'external_response_too_large',
        requestId: 'req-oversize',
        maxResponseBytes: 10
      }
    })
    await expect(promise.catch(error => isExternalFetchError(error))).resolves.toBe(true)
    expect(streamCancelled).toBe(true)
  })
})
