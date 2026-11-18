import { lineCategoryLabels } from '../constants/pos'

export const paymentCategories = ['repair', 'accessory', 'service', 'device_new', 'device_refurbished', 'other'] as const
export type PaymentCategory = (typeof paymentCategories)[number]

export const paymentCategoryLabels: Record<PaymentCategory, string> = {
  repair: 'Réparation',
  accessory: 'Accessoire',
  service: 'Service',
  device_new: lineCategoryLabels.device_new,
  device_refurbished: lineCategoryLabels.device_refurbished,
  other: 'Autre'
}

// Allocations are positive integer cents; the payment supplies the cashflow sign.
export interface PaymentCategoryAllocation {
  category: PaymentCategory
  amount: number
}

export interface PaymentClassification {
  allocations: PaymentCategoryAllocation[]
  source: 'automatic' | 'manual'
  revision: number
}
