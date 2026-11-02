import { paymentCategoryLabels, type PaymentCategory, type PaymentClassification } from '../types/payment-categories'

export function paymentClassificationLabel(classification: PaymentClassification) {
  if (!classification.allocations.length) return 'À catégoriser'
  if (classification.allocations.length === 1) return paymentCategoryLabels[classification.allocations[0]!.category]
  return `${classification.allocations.length} catégories`
}

export function summarizePaymentCategories(payments: { amount: number, classification: PaymentClassification }[]) {
  const totals = new Map<PaymentCategory | null, number>()
  for (const payment of payments) {
    if (!payment.classification.allocations.length) {
      totals.set(null, (totals.get(null) || 0) + payment.amount)
    } else {
      for (const allocation of payment.classification.allocations) {
        totals.set(allocation.category, (totals.get(allocation.category) || 0) + Math.sign(payment.amount) * allocation.amount)
      }
    }
  }
  return [...totals].map(([category, total]) => ({ category, total }))
    .sort((a, b) => a.category === null ? 1 : b.category === null ? -1 : b.total - a.total || a.category.localeCompare(b.category))
}
