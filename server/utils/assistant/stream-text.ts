/** Suppress legacy <think> blocks even when their delimiters cross chunk boundaries. */
export function createReasoningFilter() {
  let buffer = ''
  let thinking = false
  return {
    push(text: string) {
      buffer += text
      let output = ''
      while (buffer) {
        const delimiter = thinking ? '</think>' : '<think>'
        const index = buffer.toLowerCase().indexOf(delimiter)
        if (index !== -1) {
          if (!thinking) output += buffer.slice(0, index)
          buffer = buffer.slice(index + delimiter.length)
          thinking = !thinking
          continue
        }
        let retained = 0
        for (let size = 1; size < delimiter.length; size++) {
          if (buffer.toLowerCase().endsWith(delimiter.slice(0, size))) retained = size
        }
        if (!thinking) output += buffer.slice(0, buffer.length - retained)
        buffer = retained ? buffer.slice(-retained) : ''
        break
      }
      return output
    },
    finish() {
      // Never expose an unfinished reasoning block or a partial opening delimiter.
      const tail = thinking || '<think>'.startsWith(buffer.toLowerCase()) ? '' : buffer
      buffer = ''
      return tail
    }
  }
}
