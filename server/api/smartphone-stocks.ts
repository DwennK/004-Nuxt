import { smartphoneStockSchema, updateSmartphoneStockSchema } from '../../shared/validation/smartphones'
import {
  createSmartphoneStock,
  listSmartphoneStocks,
  updateSmartphoneStock
} from '../utils/smartphone-stocks'

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
          statusMessage: 'IMEI deja existant'
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
          statusMessage: 'IMEI deja existant'
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
