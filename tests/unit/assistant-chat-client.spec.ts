import { computed, effectScope, onScopeDispose, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAssistantChat } from '../../app/composables/useAssistantChat'
import type { AssistantStreamEvent } from '../../shared/types/assistant'

function response(events: AssistantStreamEvent[]) {
  return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'Content-Type': 'text/event-stream' } })
}
const answer: AssistantStreamEvent = { type: 'finish', response: { message: { id: 'server', role: 'assistant', content: 'Réponse complète.' } } }
let scope: ReturnType<typeof effectScope>
beforeEach(() => {
  vi.stubGlobal('ref', ref)
  vi.stubGlobal('computed', computed)
  vi.stubGlobal('onScopeDispose', onScopeDispose)
  scope = effectScope()
})
afterEach(() => scope.stop())

describe('assistant client stream lifecycle', () => {
  it('keeps partial replies visible, excludes them from history and retries without duplicating the question', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce(response([{ type: 'text', text: 'Début incomplet' }]))
      .mockResolvedValueOnce(response([answer]))
    vi.stubGlobal('fetch', fetch)
    const chat = scope.run(() => useAssistantChat())!
    await chat.send('Question', false)
    expect(chat.status.value).toBe('error')
    expect(chat.messages.value.at(-1)).toMatchObject({ content: 'Début incomplet', includeInRequest: false })
    await chat.retry(false)
    expect(chat.messages.value.map(message => message.role)).toEqual(['user', 'assistant'])
    expect(chat.messages.value.at(-1)).toMatchObject({ content: 'Réponse complète.', includeInRequest: true })
    const retry = JSON.parse(fetch.mock.calls[1]![1].body)
    expect(retry.messages).toHaveLength(1)
    expect(retry.messages[0].content).toBe('Question')
  })
  it('preserves partial text and cancels both the fetch and reader when stopped', async () => {
    let cancelled = false
    let signal: AbortSignal | undefined
    const fetch = vi.fn((_url, init: RequestInit) => {
      signal = init.signal!
      return Promise.resolve(new Response(new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"text","text":"Début"}\n\n'))
        },
        cancel() {
          cancelled = true
        }
      }), { headers: { 'Content-Type': 'text/event-stream' } }))
    })
    vi.stubGlobal('fetch', fetch)
    const chat = scope.run(() => useAssistantChat())!
    const run = chat.send('Question', false)
    await vi.waitFor(() => expect(chat.messages.value.at(-1)?.content).toBe('Début'))
    chat.stop()
    await run
    expect(cancelled).toBe(true)
    expect(signal?.aborted).toBe(true)
    expect(chat.messages.value.at(-1)).toMatchObject({ content: 'Début', stopped: true, includeInRequest: false })
    expect(chat.pending.value).toBe(false)
    expect(chat.retryable.value).toBe(true)
  })
  it('retains completed query evidence if a later step fails', async () => {
    const query = { summary: 'Nombre de dossiers', explanation: '', rowCount: 1, truncated: false, table: { columns: ['total'], rows: [{ total: 2 }] } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response([
      { type: 'query-start', id: 'q1', summary: query.summary },
      { type: 'query-result', id: 'q1', query },
      { type: 'finish', response: { message: { id: 'server', role: 'assistant', content: 'Erreur' }, error: { code: 'service_unavailable', message: 'Indisponible', retryable: false } } }
    ])))
    const chat = scope.run(() => useAssistantChat())!
    await chat.send('Question', false)
    expect(chat.messages.value.at(-1)?.tools?.[0]).toMatchObject({ state: 'done', query })
    expect(chat.messages.value.at(-1)?.content).toBe('')
    expect(chat.retryable.value).toBe(false)
  })
})
