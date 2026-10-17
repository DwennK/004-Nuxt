import { z } from 'zod'

export const mobileSentrixOrdersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(50)
})

export const mobileSentrixOrderParamsSchema = z.object({
  id: z.string().regex(/^[1-9]\d{0,19}$/, 'Identifiant de commande invalide')
})
