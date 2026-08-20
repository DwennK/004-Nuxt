import type { DocumentStatus, DocumentType } from '../../types/pos'

export type DocumentRevisionCode
  = | 'DOCUMENT_TOTAL_BELOW_PAID'
    | 'DOCUMENT_TYPE_WITH_PAYMENTS_IMMUTABLE'
    | 'PAID_DOCUMENT_CANNOT_BE_CANCELLED'

export type DocumentRevisionResult
  = { ok: true, status: DocumentStatus }
    | { ok: false, code: DocumentRevisionCode }

export function evaluateDocumentRevision(input: {
  currentType: DocumentType
  nextType: DocumentType
  requestedStatus: DocumentStatus
  nextTotal: number
  paymentCount: number
  paidTotal: number
  nextTypeIsPayable: boolean
}): DocumentRevisionResult {
  if (input.paymentCount > 0 && (
    input.currentType !== input.nextType
    || !input.nextTypeIsPayable
  )) {
    return { ok: false, code: 'DOCUMENT_TYPE_WITH_PAYMENTS_IMMUTABLE' }
  }

  if (input.paidTotal > input.nextTotal) {
    return { ok: false, code: 'DOCUMENT_TOTAL_BELOW_PAID' }
  }

  if (input.paidTotal > 0 && input.requestedStatus === 'cancelled') {
    return { ok: false, code: 'PAID_DOCUMENT_CANNOT_BE_CANCELLED' }
  }

  if (input.nextTypeIsPayable && input.paidTotal >= input.nextTotal && input.nextTotal > 0) {
    return { ok: true, status: 'paid' }
  }

  if (input.requestedStatus === 'cancelled' || input.requestedStatus === 'draft') {
    return { ok: true, status: input.requestedStatus }
  }

  return { ok: true, status: 'issued' }
}
