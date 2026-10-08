import { paymentMethods } from '../constants/pos'
import type { PaymentRecord } from '../types/pos'

export function summarizePaymentExport(payments: Pick<PaymentRecord, 'amount' | 'status' | 'method'>[]) {
  const summary = {
    received: 0,
    refunded: 0,
    net: 0,
    pending: 0,
    excludedCount: 0,
    byMethod: Object.fromEntries(paymentMethods.map(method => [method, 0])) as Record<PaymentRecord['method'], number>
  }
  for (const payment of payments) {
    if (payment.status !== 'paid') {
      summary.excludedCount++
      if (payment.status === 'pending') summary.pending += payment.amount
      continue
    }
    summary.received += Math.max(payment.amount, 0)
    summary.refunded += Math.max(-payment.amount, 0)
    summary.net += payment.amount
    summary.byMethod[payment.method] += payment.amount
  }
  return summary
}
