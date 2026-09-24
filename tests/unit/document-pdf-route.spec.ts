import { createApp, createError, createRouter, eventHandler, getQuery, getRequestURL, getValidatedRouterParams, readValidatedBody, setHeader, toWebHandler } from 'h3'
import { PDFDocument } from 'pdf-lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { printCompany, printDocument } from '../fixtures/document-print'

const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  getDocumentById: vi.fn(),
  getCompanySettings: vi.fn(),
  sendDocumentEmail: vi.fn()
}))
vi.mock('~~/server/utils/auth/session', () => ({ requireCapability: mocks.requireCapability }))
vi.mock('~~/server/utils/pos/documents', () => ({ getDocumentById: mocks.getDocumentById }))
vi.mock('~~/server/utils/company-settings', () => ({ getCompanySettings: mocks.getCompanySettings }))
vi.mock('~~/server/utils/documents/email', () => ({ sendDocumentEmail: mocks.sendDocumentEmail }))
vi.mock('~~/server/utils/idempotency', () => ({ requireIdempotencyKey: () => 'pdf-parity-test' }))
vi.mock('~~/server/utils/email/journal', () => ({ getEmailAttempt: async () => null }))
vi.mock('~~/server/utils/turso', () => ({ useDb: () => ({}) }))
vi.mock('~~/server/utils/pos/dossiers', () => ({
  readDossierRecord: (_target: unknown, read: () => Promise<unknown>) => read()
}))

async function request(id = '1', query = '') {
  const { default: handler } = await import('../../server/api/documents/[id]/pdf.get')
  const app = createApp()
  app.use(createRouter().get('/api/documents/:id/pdf', handler))
  return toWebHandler(app)(new Request(`http://localhost/api/documents/${id}/pdf${query}`))
}

beforeEach(() => {
  for (const [key, value] of Object.entries({ eventHandler, getQuery, getRequestURL, getValidatedRouterParams, readValidatedBody, setHeader })) vi.stubGlobal(key, value)
  mocks.requireCapability.mockReset().mockResolvedValue({ user: { id: 1 } })
  mocks.getDocumentById.mockReset().mockResolvedValue(printDocument())
  mocks.getCompanySettings.mockReset().mockResolvedValue(printCompany())
  mocks.sendDocumentEmail.mockReset().mockResolvedValue({ ok: true })
})

describe('document PDF download', () => {
  it('uses identical PDF bytes for preview, printing, download and email', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-24T12:00:00Z'))
    try {
      const download = await request()
      const preview = await request('1', '?inline=1')
      expect(preview.headers.get('content-disposition')).toBe('inline; filename*=UTF-8\'\'FA-TEST-001.pdf')
      expect(preview.headers.get('cache-control')).toBe('private, no-store')
      expect(new Uint8Array(await preview.arrayBuffer())).toEqual(new Uint8Array(await download.arrayBuffer()))
      const { default: emailHandler } = await import('../../server/api/documents/[id]/email.post')
      const app = createApp()
      app.use(createRouter().post('/api/documents/:id/email', emailHandler))
      const sent = await toWebHandler(app)(new Request('http://localhost/api/documents/1/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: 'client@example.test', subject: 'Votre facture', message: 'Bonjour, voici votre facture.' })
      }))
      expect(sent.status).toBe(200)
      expect(mocks.sendDocumentEmail).toHaveBeenCalledOnce()
      const printed = new Uint8Array(await (await request('1', '?inline=1')).arrayBuffer())
      expect(mocks.sendDocumentEmail.mock.calls[0]![0].pdfBytes).toEqual(printed)
    } finally {
      vi.useRealTimers()
    }
  })

  it.each(['invoice', 'quote', 'customer_order', 'sav'] as const)('downloads a readable %s PDF as an uncached attachment', async (type) => {
    mocks.getDocumentById.mockResolvedValue(printDocument({ type, documentNumber: 'DOC-1' }))
    const response = await request()
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename*=UTF-8\'\'DOC-1.pdf')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(new TextDecoder().decode(bytes.subarray(0, 5))).toBe('%PDF-')
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0)
    expect(mocks.requireCapability).toHaveBeenCalledWith(expect.anything(), 'financial:read')
  })

  it.each([401, 403])('refuses unauthorized access (%s) before reading document data', async (statusCode) => {
    mocks.requireCapability.mockRejectedValue(createError({ statusCode }))
    expect((await request()).status).toBe(statusCode)
    expect((await request('1', '?inline=1')).status).toBe(statusCode)
    expect(mocks.getDocumentById).not.toHaveBeenCalled()
    expect(mocks.getCompanySettings).not.toHaveBeenCalled()
  })

  it('rejects invalid IDs and preserves missing-document errors', async () => {
    expect((await request('0')).status).toBe(400)
    expect(mocks.getDocumentById).not.toHaveBeenCalled()
    mocks.getDocumentById.mockRejectedValue(createError({ statusCode: 404 }))
    expect((await request('999')).status).toBe(404)
  })
})
