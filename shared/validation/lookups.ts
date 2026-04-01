import { z } from 'zod'

export const postalCodeLookupQuerySchema = z.object({
  postalCode: z.string().trim().regex(/^\d{4}$/, 'Le NPA doit contenir 4 chiffres')
})
