/** Fixed blocks are required by Dropbox's content_hash algorithm. */
export async function* binaryChunks(source: AsyncIterable<Uint8Array>, size = 4 * 1024 * 1024) {
  let buffer = new Uint8Array(size)
  let used = 0
  for await (const bytes of source) {
    for (let offset = 0; offset < bytes.length;) {
      const length = Math.min(size - used, bytes.length - offset)
      buffer.set(bytes.subarray(offset, offset + length), used)
      used += length
      offset += length
      if (used === size) {
        yield buffer
        buffer = new Uint8Array(size)
        used = 0
      }
    }
  }
  if (used) yield buffer.slice(0, used)
}
