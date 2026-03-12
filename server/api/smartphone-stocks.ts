import * as z from 'zod'
import {
  createSmartphoneStock,
  deleteSmartphoneStocks,
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

const smartphoneStockSchema = z.object({
  model: z.string().min(2),
  imei: optionalText(8),
  sku: optionalText(3),
  capacity: z.string().min(2),
  stockedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sold: z.boolean().default(false)
})

const updateSmartphoneStockSchema = smartphoneStockSchema.extend({
  id: z.coerce.number().int().positive()
})

const deleteSmartphoneStocksSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1)
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

  if (event.method === 'DELETE') {
    const body = await readValidatedBody(event, deleteSmartphoneStocksSchema.parse)
    const deleted = await deleteSmartphoneStocks(body.ids)

    return { deleted }
  }

  throw createError({
    statusCode: 405,
    statusMessage: 'Method not allowed'
  })
})
