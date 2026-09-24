import { describe, expect, it } from 'vitest'
import { readEventStream } from '../../shared/utils/event-stream'
import { createReasoningFilter } from '../../server/utils/assistant/stream-text'
import { createAssistantStream } from '../../server/utils/assistant/stream'

const encoder = new TextEncoder()
function body(text: string, split = 1) {
  const bytes = encoder.encode(text)
  return new ReadableStream<Uint8Array>({ start(controller) {
    for (let i = 0; i < bytes.length; i += split) controller.enqueue(bytes.slice(i, i + split))
    controller.close()
  } })
}
async function collect(stream: ReadableStream<Uint8Array>, signal?: AbortSignal, maxBytes?: number) {
  const events = []
  for await (const event of readEventStream(stream, signal, maxBytes)) events.push(event)
  return events
}

describe('assistant SSE transport', () => {
  it('decodes fragmented UTF-8, CRLF, multiline data and comments', async () => {
    expect(await collect(body(': heartbeat\r\ndata: déjà\r\ndata: vérifié ✅\r\n\r\ndata: fin\n\n'))).toEqual(['déjà\nvérifié ✅', 'fin'])
  })
  it('does not accept an unfinished event at EOF', async () => {
    expect(await collect(body('data: partial'))).toEqual([])
  })
  it('bounds the entire response even when every event is small', async () => {
    await expect(collect(body('data: first\n\ndata: second\n\n'), undefined, 15)).rejects.toThrow('size limit')
  })
  it('cancels an idle reader immediately on abort', async () => {
    let cancelled = false
    const abort = new AbortController()
    const stream = new ReadableStream<Uint8Array>({ cancel() {
      cancelled = true
    } })
    const result = collect(stream, abort.signal)
    abort.abort()
    await expect(result).rejects.toMatchObject({ name: 'AbortError' })
    expect(cancelled).toBe(true)
  })
  it('streams progress before the answer has finished and sanitizes unexpected errors', async () => {
    const stream = createAssistantStream(async ({ emit }) => {
      await emit!({ type: 'status', text: 'Recherche…' })
      throw new Error('private database credentials')
    })
    const events = (await collect(stream.body)).map(value => JSON.parse(value))
    expect(events[0]).toEqual({ type: 'status', text: 'Recherche…' })
    expect(events[1].type).toBe('finish')
    expect(events[1].response.error.retryable).toBe(true)
    expect(JSON.stringify(events)).not.toContain('private')
  })
  it('propagates downstream cancellation to upstream work', async () => {
    let upstreamSignal: AbortSignal | undefined
    let resolveAbort: (() => void) | undefined
    const aborted = new Promise<void>((resolve) => {
      resolveAbort = resolve
    })
    const stream = createAssistantStream(async ({ signal, emit }) => {
      upstreamSignal = signal
      await emit!({ type: 'status', text: 'Recherche…' })
      await new Promise<void>((resolve) => {
        if (signal!.aborted) resolve()
        else signal!.addEventListener('abort', () => resolve(), { once: true })
      })
      resolveAbort!()
      signal!.throwIfAborted()
      throw new Error('unreachable')
    })
    const reader = stream.body.getReader()
    await reader.read()
    await reader.cancel()
    await aborted
    expect(upstreamSignal?.aborted).toBe(true)
  })
})

describe('streamed reasoning filter', () => {
  it.each([1, 2, 3, 7, 100])('never emits reasoning with chunks of %i characters', (size) => {
    const filter = createReasoningFilter()
    const input = '<think>private analysis</think>**Bonjour**<THINK>more hidden</THINK> !'
    let result = ''
    for (let i = 0; i < input.length; i += size) result += filter.push(input.slice(i, i + size))
    result += filter.finish()
    expect(result).toBe('**Bonjour** !')
  })
  it('drops unterminated reasoning and incomplete opening tags', () => {
    const filter = createReasoningFilter()
    expect(filter.push('Visible <thi') + filter.finish()).toBe('Visible ')
    const hidden = createReasoningFilter()
    expect(hidden.push('<think>private') + hidden.finish()).toBe('')
  })
})
