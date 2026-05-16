import * as z from 'zod'
import {
  createSmartphoneReservation,
  listSmartphoneReservations,
  updateSmartphoneReservation
} from '../utils/smartphone-reservations'

const optionalText = (minLength: number) => z.preprocess((value) => {
  if (typeof value !== 'string') {
    return value
  }

  const normalized = value.trim()
  return normalized === '' ? undefined : normalized
}, z.string().min(minLength).optional().default(''))

const smartphoneReservationSchema = z.object({
  name: z.string().min(2),
  phone: z.string().min(6),
  model: z.string().min(2),
  storage: optionalText(2),
  requestedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  status: z.enum(['pending', 'contacted', 'sold']).default('pending'),
  notes: optionalText(2)
})

const updateSmartphoneReservationSchema = smartphoneReservationSchema.extend({
  id: z.coerce.number().int().positive()
})

export default eventHandler(async (event) => {
  if (event.method === 'GET') {
    return listSmartphoneReservations()
  }

  if (event.method === 'POST') {
    const body = await readValidatedBody(event, smartphoneReservationSchema.parse)
    return createSmartphoneReservation(body)
  }

  if (event.method === 'PATCH') {
    const body = await readValidatedBody(event, updateSmartphoneReservationSchema.parse)
    return updateSmartphoneReservation(body)
  }

  throw createError({
    statusCode: 405,
    statusMessage: 'Method not allowed'
  })
})
