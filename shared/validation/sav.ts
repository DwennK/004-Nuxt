import { z } from 'zod'
import { savCoverages, savStatuses } from '../types/sav'

export const savDetailsSchema = z.object({
  sourceDocumentId: z.number().int().positive().nullable().default(null),
  repair: z.string().trim().min(1, 'Indiquez la réparation concernée').max(2000),
  reason: z.string().trim().min(1, 'Indiquez le motif du retour').max(4000),
  coverage: z.enum(savCoverages).default('pending'),
  status: z.enum(savStatuses).default('received'),
  diagnosis: z.string().trim().max(8000).default(''),
  work: z.string().trim().max(8000).default(''),
  receivedAt: z.string().datetime(),
  deliveredAt: z.string().datetime().nullable().default(null)
})
