import { describe, expect, it } from 'vitest'
import {
  canChangePaymentStatus,
  canDeletePayment,
  canEditPayment,
  evaluateDocumentPayment,
  getRemainingDocumentBalance
} from '../../shared/domain/payments/rules'

describe('document payment policy', () => {
  it('accepts a partial payment and returns both balances', () => {
    expect(evaluateDocumentPayment({
      documentStatus: 'issued',
      documentTotal: 10_000,
      paidTotal: 2_500,
      amount: 3_000
    })).toEqual({
      ok: true,
      balanceBeforePayment: 7_500,
      balanceAfterPayment: 4_500
    })
  })

  it('rejects payments on cancelled documents', () => {
    expect(evaluateDocumentPayment({
      documentStatus: 'cancelled',
      documentTotal: 10_000,
      paidTotal: 0,
      amount: 1_000
    })).toEqual({
      ok: false,
      code: 'DOCUMENT_CANCELLED',
      balanceBeforePayment: 10_000
    })
  })

  it('rejects overpayments and non-integer cents', () => {
    expect(evaluateDocumentPayment({
      documentStatus: 'issued',
      documentTotal: 10_000,
      paidTotal: 9_000,
      amount: 1_001
    })).toMatchObject({ ok: false, code: 'PAYMENT_EXCEEDS_BALANCE' })

    expect(evaluateDocumentPayment({
      documentStatus: 'issued',
      documentTotal: 10_000,
      paidTotal: 0,
      amount: 10.5
    })).toMatchObject({ ok: false, code: 'PAYMENT_AMOUNT_INVALID' })
  })

  it('never reports a negative remaining balance', () => {
    expect(getRemainingDocumentBalance(1_000, 1_500)).toBe(0)
  })

  it('allows deletion only while a payment is pending', () => {
    expect(canDeletePayment('pending')).toBe(true)
    expect(canDeletePayment('paid')).toBe(false)
    expect(canDeletePayment('refunded')).toBe(false)
    expect(canDeletePayment('cancelled')).toBe(false)
  })

  it('allows admins to edit pending and paid payments without turning paid cashflow into cancellation', () => {
    expect(canEditPayment('pending')).toBe(true)
    expect(canEditPayment('paid')).toBe(true)
    expect(canEditPayment('refunded')).toBe(false)
    expect(canEditPayment('cancelled')).toBe(false)

    expect(canChangePaymentStatus('pending', 'paid')).toBe(true)
    expect(canChangePaymentStatus('pending', 'cancelled')).toBe(true)
    expect(canChangePaymentStatus('paid', 'paid')).toBe(true)
    expect(canChangePaymentStatus('paid', 'pending')).toBe(true)
    expect(canChangePaymentStatus('paid', 'cancelled')).toBe(true)
    expect(canChangePaymentStatus('paid', 'refunded')).toBe(false)
  })
})
