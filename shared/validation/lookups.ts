import { z } from 'zod'

export const postalCodeLookupQuerySchema = z.object({
  postalCode: z.string().trim().regex(/^\d{4}$/, 'Le NPA doit contenir 4 chiffres')
})

export const addressLookupQuerySchema = z.object({
  search: z.string().trim().min(3).max(120).refine(value => value.split(/\s+/).length <= 10, 'Recherche trop longue'),
  postalCode: z.string().trim().regex(/^\d{0,4}$/).default(''),
  city: z.string().trim().max(80).default('')
})

export const localityLookupQuerySchema = z.object({
  search: z.string().trim().min(2).max(80),
  field: z.enum(['postalCode', 'city'])
})
