/** Read SSE incrementally, including UTF-8 and CRLF split across network chunks. */
export async function* readEventStream(body: ReadableStream<Uint8Array>, signal?: AbortSignal, maxBytes = 8 * 1024 * 1024) {
  signal?.throwIfAborted()
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let data: string[] = []
  let received = 0
  const cancel = () => {
    void reader.cancel().catch(() => undefined)
  }
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    while (true) {
      const { done, value } = await reader.read()
      signal?.throwIfAborted()
      if (done) break
      received += value.byteLength
      if (received > maxBytes) throw new Error('Event stream exceeds the size limit')
      buffer += decoder.decode(value, { stream: true })
      let newline
      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline).replace(/\r$/, '')
        buffer = buffer.slice(newline + 1)
        if (line === '') {
          if (data.length) yield data.join('\n')
          data = []
        } else if (line.startsWith('data:')) {
          data.push(line.slice(5).replace(/^ /, ''))
        }
      }
    }
    // An incomplete event at EOF is intentionally discarded. Consumers require a finish event.
  } finally {
    signal?.removeEventListener('abort', cancel)
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
}
