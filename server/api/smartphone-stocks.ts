import * as z from 'zod'
import { normalizeImei } from '../../shared/utils/pos'
import {
  createSmartphoneStock,
  listSmartphoneStocks,
  updateSmartphoneStock
} from '../utils/smartphone-stocks'

const optionalText = (minLength: number) => z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const normalized = value.trim()
  return normalized === '' ? undefined : normalized
}, z.string().min(minLength).optional().default(''))

const optionalImei = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const normalized = normalizeImei(value)
  return normalized || undefined
}, z.string().optional().default(''))

const smartphoneStockSchema = z.object({
  model: z.string().min(2),
  imei: optionalImei,
  sku: optionalText(3),
  capacity: z.string().min(2),
  stockedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sold: z.boolean().default(false)
})

const updateSmartphoneStockSchema = smartphoneStockSchema.extend({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  if (event.method === 'GET') {
    return listSmartphoneStocks()
  }

  if (event.method === 'POST') {
    const body = await readValidatedBody(event, smartphoneStockSchema.parse)

    try {
      return await createSmartphoneStock(body)
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw createError({
          statusCode: 409,
          statusMessage: 'IMEI ou SKU deja existant'
        })
      }

      throw error
    }
  }

  if (event.method === 'PATCH') {
    const body = await readValidatedBody(event, updateSmartphoneStockSchema.parse)

    try {
      return await updateSmartphoneStock(body)
    } catch (error) {
      if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
        throw createError({
          statusCode: 409,
          statusMessage: 'IMEI ou SKU deja existant'
        })
      }

      throw error
    }
  }

  throw createError({
    statusCode: 405,
    statusMessage: 'Method not allowed'
  })
})
