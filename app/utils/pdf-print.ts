// Chromium's native PDF viewer may finish without emitting an iframe load event.
// Inspect the same-origin document instead; never print an HTML/JSON error page.
export async function waitForPdfFrame(frame: HTMLIFrameElement, isCurrent: () => boolean) {
  const deadline = Date.now() + 30000
  while (isCurrent()) {
    const content = frame.contentDocument
    if (content?.readyState === 'complete' && content.URL !== 'about:blank') {
      if (content.contentType !== 'application/pdf') throw new Error('PDF unavailable')
      return true
    }
    if (Date.now() >= deadline) throw new Error('PDF loading timed out')
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  return false
}
