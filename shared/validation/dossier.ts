import { z } from 'zod'

export const dossierTargetSchema = z.object({
  kind: z.enum(['ticket', 'document', 'payment']),
  id: z.number().int().positive()
})
export const dossierProofSchema = z.object({
  key: z.string().regex(/^(ticket|document):[1-9]\d*$/),
  revision: z.number().int().nonnegative(),
  token: z.string().uuid()
})
export const dossierSessionSchema = z.object({
  target: dossierTargetSchema,
  standalone: z.boolean().default(false),
  tabId: z.string().uuid(),
  station: z.string().trim().min(1).max(40),
  action: z.enum(['observe', 'acquire', 'takeover', 'release']),
  intent: z.enum(['edit', 'operate']).default('operate'),
  token: z.string().uuid().nullable().optional(),
  expectedGeneration: z.number().int().nonnegative().optional(),
  dirty: z.boolean().default(false)
})
