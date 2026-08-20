import { afterEach, describe, expect, it, vi } from 'vitest'
import { listSentEmails } from '../../server/utils/sent-emails'

describe('listSentEmails', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('limits concurrent Resend detail requests while preserving result order', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => undefined)
    vi.stubGlobal('useRuntimeConfig', () => ({ resendApiKey: 'test-key' }))

    let activeDetails = 0
    let maxActiveDetails = 0
    const references = Array.from({ length: 12 }, (_, index) => ({
      id: `mail-${index}`,
      to: ['client@example.test'],
      from: 'shop@example.test',
      subject: `Sujet ${index}`,
      created_at: new Date(index * 1_000).toISOString(),
      last_event: 'delivered'
    }))

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : String(input))

      if (url.pathname === '/emails') {
        return Response.json({ data: references, has_more: false })
      }

      activeDetails += 1
      maxActiveDetails = Math.max(maxActiveDetails, activeDetails)
      await new Promise(resolve => setTimeout(resolve, 2))
      activeDetails -= 1

      return Response.json({
        ...references[Number(url.pathname.split('-').at(-1))],
        text: `Aperçu ${url.pathname}`
      })
    }))

    const result = await listSentEmails({ limit: 100 })

    expect(maxActiveDetails).toBe(4)
    expect(result.items.map(item => item.id)).toEqual(references.map(mail => mail.id))
    expect(result.items[0]?.preview).toBe('Aperçu /emails/mail-0')
  })
})
