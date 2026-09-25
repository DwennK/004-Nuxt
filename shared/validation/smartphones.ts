import { z } from 'zod'
import { smartphoneSuppliers } from '../constants/smartphones'
import { isValidImei, normalizeImei } from '../utils/pos'

export const smartphoneImeiLookupSchema = z.object({
  imei: z.string().trim().regex(/^[\d\s]+$/, 'IMEI invalide')
    .transform(value => normalizeImei(value) || '')
    .refine(isValidImei, 'IMEI invalide')
})

export const smartphoneStockFormSchema = z.object({
  model: z.string().trim().min(2, 'Trop court'),
  imei: z.string().optional().default('').transform(value => normalizeImei(value) || ''),
  capacity: z.string().trim().min(2, 'Capacité invalide'),
  supplier: z.enum(['', ...smartphoneSuppliers]).default(''),
  stockedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide')
})

// Keep compatibility with existing records and callers without exposing these
// legacy fields in the IMEI editor or resetting them when they are omitted.
const legacySku = z.string().trim().refine(value => !value || value.length >= 3, 'SKU invalide')

export const smartphoneStockSchema = smartphoneStockFormSchema.extend({
  sku: legacySku.default(''),
  sold: z.boolean().default(false)
})

export const updateSmartphoneStockSchema = smartphoneStockFormSchema.extend({
  id: z.coerce.number().int().positive(),
  supplier: smartphoneStockFormSchema.shape.supplier.removeDefault().optional(),
  sku: legacySku.optional(),
  sold: z.boolean().optional()
})
