import { afterEach, describe, expect, it, vi } from 'vitest'
import { waitForPdfFrame } from '../../app/utils/pdf-print'

function frame(contentDocument: object | null) {
  return { contentDocument } as HTMLIFrameElement
}

afterEach(() => vi.useRealTimers())

describe('native PDF print readiness', () => {
  it('accepts an already loaded PDF even when the iframe load event never fires', async () => {
    expect(await waitForPdfFrame(frame({ readyState: 'complete', URL: '/api/documents/1/pdf?inline=1', contentType: 'application/pdf' }), () => true)).toBe(true)
  })

  it('waits past the initial blank document and loading PDF', async () => {
    vi.useFakeTimers()
    const content = { readyState: 'complete', URL: 'about:blank', contentType: 'text/html' }
    const ready = waitForPdfFrame(frame(content), () => true)
    await vi.advanceTimersByTimeAsync(100)
    Object.assign(content, { readyState: 'loading', URL: '/api/documents/1/pdf?inline=1', contentType: 'application/pdf' })
    await vi.advanceTimersByTimeAsync(100)
    content.readyState = 'complete'
    await vi.advanceTimersByTimeAsync(100)
    expect(await ready).toBe(true)
  })

  it.each(['text/html', 'application/json'])('rejects %s errors instead of printing them', async (contentType) => {
    await expect(waitForPdfFrame(frame({ readyState: 'complete', URL: '/api/documents/1/pdf', contentType }), () => true)).rejects.toThrow('PDF unavailable')
  })

  it('stops when the preview unmounts or the print attempt is cancelled', async () => {
    expect(await waitForPdfFrame(frame(null), () => false)).toBe(false)
  })

  it('times out if a PDF viewer cannot load', async () => {
    vi.useFakeTimers()
    const assertion = expect(waitForPdfFrame(frame(null), () => true)).rejects.toThrow('PDF loading timed out')
    await vi.advanceTimersByTimeAsync(30000)
    await assertion
  })
})
