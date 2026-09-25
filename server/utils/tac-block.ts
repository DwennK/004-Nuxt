// Keep both complete reference versions small enough for the existing SQLite
// backup budget. Use Web Streams so the same format works in Workers and Node.
export async function encodeTacBlock(json: string) {
  const stream = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192))
  return `gz:${btoa(binary)}`
}

export async function decodeTacBlock(payload: string): Promise<Record<string, string>> {
  if (!payload.startsWith('gz:')) return JSON.parse(payload)
  const bytes = Uint8Array.from(atob(payload.slice(3)), character => character.charCodeAt(0))
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader()
  const decoder = new TextDecoder()
  let json = ''
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 1024 * 1024) throw new Error('TAC block exceeds size limit')
      json += decoder.decode(value, { stream: true })
    }
    json += decoder.decode()
  } finally {
    await reader.cancel().catch(() => undefined)
    reader.releaseLock()
  }
  return JSON.parse(json)
}
