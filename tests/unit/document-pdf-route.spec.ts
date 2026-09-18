import { createApp, createError, createRouter, eventHandler, getRequestURL, getValidatedRouterParams, setHeader, toWebHandler } from 'h3'
import { PDFDocument } from 'pdf-lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { printCompany, printDocument } from '../fixtures/document-print'

const mocks = vi.hoisted(() => ({
  requireCapability: vi.fn(),
  getDocumentById: vi.fn(),
  getCompanySettings: vi.fn()
}))
vi.mock('~~/server/utils/auth/session', () => ({ requireCapability: mocks.requireCapability }))
vi.mock('~~/server/utils/pos/documents', () => ({ getDocumentById: mocks.getDocumentById }))
vi.mock('~~/server/utils/company-settings', () => ({ getCompanySettings: mocks.getCompanySettings }))
vi.mock('~~/server/utils/pos/dossiers', () => ({
  readDossierRecord: (_target: unknown, read: () => Promise<unknown>) => read()
}))

async function request(id = '1') {
  const { default: handler } = await import('../../server/api/documents/[id]/pdf.get')
  const app = createApp()
  app.use(createRouter().get('/api/documents/:id/pdf', handler))
  return toWebHandler(app)(new Request(`http://localhost/api/documents/${id}/pdf`))
}

beforeEach(() => {
  for (const [key, value] of Object.entries({ eventHandler, getRequestURL, getValidatedRouterParams, setHeader })) vi.stubGlobal(key, value)
  mocks.requireCapability.mockReset().mockResolvedValue({})
  mocks.getDocumentById.mockReset().mockResolvedValue(printDocument())
  mocks.getCompanySettings.mockReset().mockResolvedValue(printCompany())
})

describe('document PDF download', () => {
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
