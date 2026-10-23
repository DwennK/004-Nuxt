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

    return createSmartphoneStock(body)
  }

  if (event.method === 'PATCH') {
    const body = await readValidatedBody(event, updateSmartphoneStockSchema.parse)

    return updateSmartphoneStock(body)
  }

  throw createError({
    statusCode: 405,
    statusMessage: 'Method not allowed'
  })
})
