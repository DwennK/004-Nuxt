import { describe, expect, it } from 'vitest'
import { evaluateDocumentRevision } from '../../shared/domain/documents/revision'

describe('document revision policy', () => {
  it('keeps a fully paid invoice paid after an allowed edit', () => {
    expect(evaluateDocumentRevision({
      currentType: 'invoice',
      nextType: 'invoice',
      requestedStatus: 'paid',
      nextTotal: 12_500,
      paymentCount: 1,
      paidTotal: 12_500,
      nextTypeIsPayable: true
    })).toEqual({ ok: true, status: 'paid' })
  })

  it('reopens the balance when an edited invoice total increases', () => {
    expect(evaluateDocumentRevision({
      currentType: 'invoice',
      nextType: 'invoice',
      requestedStatus: 'paid',
      nextTotal: 15_000,
      paymentCount: 1,
      paidTotal: 12_500,
      nextTypeIsPayable: true
    })).toEqual({ ok: true, status: 'issued' })
  })

  it('rejects a total below recorded payments', () => {
    expect(evaluateDocumentRevision({
      currentType: 'invoice',
      nextType: 'invoice',
      requestedStatus: 'paid',
      nextTotal: 10_000,
      paymentCount: 1,
      paidTotal: 12_500,
      nextTypeIsPayable: true
    })).toEqual({ ok: false, code: 'DOCUMENT_TOTAL_BELOW_PAID' })
  })

  it('keeps commercial type and cancellation protected once payments exist', () => {
    expect(evaluateDocumentRevision({
      currentType: 'invoice',
      nextType: 'quote',
      requestedStatus: 'issued',
      nextTotal: 12_500,
      paymentCount: 1,
      paidTotal: 12_500,
      nextTypeIsPayable: false
    })).toEqual({ ok: false, code: 'DOCUMENT_TYPE_WITH_PAYMENTS_IMMUTABLE' })

    expect(evaluateDocumentRevision({
      currentType: 'invoice',
      nextType: 'invoice',
      requestedStatus: 'cancelled',
      nextTotal: 12_500,
      paymentCount: 1,
      paidTotal: 12_500,
      nextTypeIsPayable: true
    })).toEqual({ ok: false, code: 'PAID_DOCUMENT_CANNOT_BE_CANCELLED' })
  })
})
