import { z } from 'zod'

export const shopifyOrderRefSchema = z.object({
  orderRef: z.string().trim().min(1, 'Le numéro de commande est obligatoire').max(200)
})

export const shopifyOrderListSchema = z.object({
  after: z.string().min(1).max(2048).optional()
})

export const shopifyPaymentSyncSchema = z.object({
  documentId: z.number().int().positive()
})
