import { z } from 'zod'
import { paymentCategories } from '../types/payment-categories'

export const paymentAllocationsSchema = z.array(z.object({
  category: z.enum(paymentCategories),
  amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
}).strict()).max(paymentCategories.length).refine(
  items => new Set(items.map(item => item.category)).size === items.length,
  'Chaque catégorie ne peut apparaître qu’une fois.'
)

export const paymentClassificationSchema = z.object({
  // null restores automatic suggestions; [] explicitly leaves it uncategorized.
  allocations: paymentAllocationsSchema.nullable(),
  expectedRevision: z.number().int().min(0),
  expectedAmount: z.number().int().min(-Number.MAX_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER)
}).strict()
