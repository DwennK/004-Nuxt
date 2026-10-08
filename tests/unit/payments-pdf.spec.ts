import { createApp, createError, eventHandler, getValidatedQuery, setHeader, toWebHandler } from 'h3'
import { PDFDocument } from 'pdf-lib'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { generatePaymentsPdf } from '../../server/utils/documents/payments-pdf'
import { summarizePaymentExport } from '../../shared/utils/payment-export'
import type { PaymentListItem } from '../../shared/types/pos'

const mocks = vi.hoisted(() => ({ requireCapability: vi.fn(), listPaymentsForExport: vi.fn(), getCompanySettings: vi.fn() }))
vi.mock('~~/server/utils/auth/session', () => ({ requireCapability: mocks.requireCapability }))
vi.mock('~~/server/utils/pos/payments', () => ({ listPaymentsForExport: mocks.listPaymentsForExport }))
vi.mock('~~/server/utils/company-settings', () => ({ getCompanySettings: mocks.getCompanySettings }))

function payment(overrides: Partial<PaymentListItem> = {}): PaymentListItem {
  return {
    id: 1, customerId: 1, documentId: 1, documentNumber: 'FA-001', documentType: 'invoice',
    customerName: 'Élodie Müller', method: 'cash', status: 'paid', kind: 'receipt',
    amount: 123456, paidAt: '2026-10-07T12:00:00Z', notes: null,
    originalPaymentId: null, recordedBy: null, voidedAt: null, voidReason: null,
    createdAt: '2026-10-07T12:00:00Z', updatedAt: '2026-10-07T12:00:00Z', ...overrides
  }
}

beforeEach(() => {
  for (const [key, value] of Object.entries({ eventHandler, getValidatedQuery, setHeader })) vi.stubGlobal(key, value)
  mocks.requireCapability.mockReset().mockResolvedValue({ user: { id: 1 } })
  mocks.listPaymentsForExport.mockReset().mockResolvedValue([payment()])
  mocks.getCompanySettings.mockReset().mockResolvedValue({ name: 'Microwest' })
})

async function request(query = '') {
  const { default: handler } = await import('../../server/api/payments/pdf.get')
  const app = createApp().use(handler)
  return toWebHandler(app)(new Request(`http://localhost/api/payments/pdf${query}`))
}

describe('payment PDF export', () => {
  it('counts signed cashflows once and separates pending, cancelled and legacy refunds', () => {
    expect(summarizePaymentExport([
      payment({ amount: 10000 }), payment({ amount: 2000, method: 'card_twint' }),
      payment({ amount: -3000, kind: 'refund', method: 'card_twint' }),
      payment({ amount: 5000, status: 'pending' }), payment({ amount: 6000, status: 'cancelled' }),
      payment({ amount: 7000, status: 'refunded' })
    ])).toEqual({ received: 12000, refunded: 3000, net: 9000, pending: 5000, excludedCount: 3,
      byMethod: { cash: 10000, card_twint: -1000, bank_transfer: 0, stripe: 0, shopify: 0 } })
    expect(summarizePaymentExport([]).net).toBe(0)
  })

  it('downloads a private PDF and forwards validated filters and sorting', async () => {
    const response = await request('?search=Élodie&method=cash&status=paid&dateFrom=2026-10-01&dateTo=2026-10-08&sortBy=amount&sortDirection=asc')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/pdf')
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(response.headers.get('content-disposition')).toBe('attachment; filename="paiements-2026-10-01-2026-10-08.pdf"')
    expect(mocks.requireCapability).toHaveBeenCalledWith(expect.anything(), 'financial:read')
    expect(mocks.listPaymentsForExport).toHaveBeenCalledWith(expect.objectContaining({ search: 'Élodie', method: 'cash', status: 'paid', dateFrom: '2026-10-01', dateTo: '2026-10-08', sortBy: 'amount', sortDirection: 'asc' }))
    expect((await PDFDocument.load(await response.arrayBuffer())).getPageCount()).toBe(1)
  })

  it.each([401, 403])('rejects unauthorized access (%s) before reading financial data', async (statusCode) => {
    mocks.requireCapability.mockRejectedValue(createError({ statusCode }))
    expect((await request()).status).toBe(statusCode)
    expect(mocks.listPaymentsForExport).not.toHaveBeenCalled()
    expect(mocks.getCompanySettings).not.toHaveBeenCalled()
  })

  it.each(['?dateFrom=2026-10-08&dateTo=2026-10-01', '?method=invalid', '?dateFrom=invalid'])('rejects invalid filters: %s', async (query) => {
    expect((await request(query)).status).toBe(400)
    expect(mocks.listPaymentsForExport).not.toHaveBeenCalled()
  })

  it('reports an oversized export instead of returning a truncated ledger', async () => {
    mocks.listPaymentsForExport.mockRejectedValue(createError({ statusCode: 422, message: 'Réduisez la période.' }))
    expect((await request()).status).toBe(422)
  })

  it('renders empty and multipage ledgers with long names and large signed amounts', async () => {
    const empty = await generatePaymentsPdf([], { name: 'Microwest' })
    expect((await PDFDocument.load(empty)).getPageCount()).toBe(1)
    const bytes = await generatePaymentsPdf(Array.from({ length: 260 }, (_, id) => payment({
      id, customerName: 'Société Élodie Müller avec un nom particulièrement long 東京',
      amount: id % 2 ? -123456789 : 123456789, kind: id % 2 ? 'refund' : 'receipt'
    })), { name: 'Microwest' }, { search: 'É'.repeat(200) })
    const pdf = await PDFDocument.load(bytes)
    expect(pdf.getPageCount()).toBeGreaterThan(5)
    expect(pdf.getPages().every(page => page.getWidth() > page.getHeight())).toBe(true)
  })
})
