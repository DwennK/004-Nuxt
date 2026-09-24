import type { AssistantChatResponse, AssistantStreamOptions } from '~~/shared/types/assistant'

/** A backpressured Web stream. Cancelling the response also cancels provider work. */
export function createAssistantStream(
  run: (options: AssistantStreamOptions) => Promise<AssistantChatResponse>,
  requestSignal?: AbortSignal
) {
  const abort = new AbortController()
  const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(180_000), ...(requestSignal ? [requestSignal] : [])])
  const stream = new TransformStream<Uint8Array, Uint8Array>()
  const writer = stream.writable.getWriter()
  const encoder = new TextEncoder()
  const emit: NonNullable<AssistantStreamOptions['emit']> = async (event) => {
    signal.throwIfAborted()
    await writer.write(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
  }
  // Reader cancellation rejects writer.closed; always observe it.
  void writer.closed.catch(() => abort.abort())
  const onAbort = () => {
    void writer.abort(signal.reason).catch(() => undefined)
  }
  signal.addEventListener('abort', onAbort, { once: true })
  void (async () => {
    try {
      signal.throwIfAborted()
      const response = await run({ signal, emit })
      await emit({ type: 'finish', response })
      await writer.close()
    } catch {
      if (!signal.aborted) {
        try {
          await emit({ type: 'finish', response: {
            message: { id: crypto.randomUUID(), role: 'assistant', content: 'La réponse a été interrompue.' },
            error: { code: 'service_unavailable', message: 'La réponse a été interrompue. Réessayez dans quelques instants.', retryable: true }
          } })
          await writer.close()
        } catch {
          abort.abort()
        }
      }
    } finally {
      if (signal.aborted) await writer.abort(signal.reason).catch(() => undefined)
      signal.removeEventListener('abort', onAbort)
    }
  })()
  return { body: stream.readable, abort: () => abort.abort() }
}
