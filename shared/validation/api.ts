import { z } from 'zod'

export const numericIdSchema = z.coerce.number().int().positive()

export const numericIdParamsSchema = z.object({
  id: numericIdSchema
})

export const queryBooleanSchema = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const normalized = value.trim().toLowerCase()

  if (normalized === 'true') {
    return true
  }

  if (normalized === 'false') {
    return false
  }

  return value
}, z.boolean())

export const isoDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (format attendu YYYY-MM-DD)')
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`)

    return !Number.isNaN(date.getTime())
      && date.toISOString().slice(0, 10) === value
  }, 'Date invalide')

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(250).default(50)
})
