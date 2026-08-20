import type { DocumentStatus, PaymentStatus } from '../../types/pos'

export type PaymentPolicyCode
  = | 'DOCUMENT_CANCELLED'
    | 'DOCUMENT_ALREADY_PAID'
    | 'PAYMENT_AMOUNT_INVALID'
    | 'PAYMENT_EXCEEDS_BALANCE'

export type PaymentPolicyResult
  = | { ok: true, balanceBeforePayment: number, balanceAfterPayment: number }
    | { ok: false, code: PaymentPolicyCode, balanceBeforePayment: number }

export function getRemainingDocumentBalance(total: number, paidTotal: number) {
  return Math.max(total - paidTotal, 0)
}

export function canDeletePayment(status: PaymentStatus) {
  return status === 'pending'
}

export function canEditPayment(status: PaymentStatus) {
  return status === 'pending' || status === 'paid'
}

export function canChangePaymentStatus(from: PaymentStatus, to: PaymentStatus) {
  if (from === 'pending' || from === 'paid') {
    return to === 'pending' || to === 'paid' || to === 'cancelled'
  }

  return false
}

export function evaluateDocumentPayment(input: {
  documentStatus: DocumentStatus
  documentTotal: number
  paidTotal: number
  amount: number
}): PaymentPolicyResult {
  const balanceBeforePayment = getRemainingDocumentBalance(input.documentTotal, input.paidTotal)

  if (input.documentStatus === 'cancelled') {
    return { ok: false, code: 'DOCUMENT_CANCELLED', balanceBeforePayment }
  }

  if (balanceBeforePayment <= 0) {
    return { ok: false, code: 'DOCUMENT_ALREADY_PAID', balanceBeforePayment }
  }

  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    return { ok: false, code: 'PAYMENT_AMOUNT_INVALID', balanceBeforePayment }
  }

  if (input.amount > balanceBeforePayment) {
    return { ok: false, code: 'PAYMENT_EXCEEDS_BALANCE', balanceBeforePayment }
  }

  return {
    ok: true,
    balanceBeforePayment,
    balanceAfterPayment: balanceBeforePayment - input.amount
  }
}
