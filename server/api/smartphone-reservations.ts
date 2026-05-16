import * as z from 'zod'
import type { H3Event } from 'h3'
import {
  createSmartphoneReservation,
  deleteSmartphoneReservations,
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

const deleteSmartphoneReservationsSchema = z.object({
  ids: z.array(z.coerce.number().int().positive()).min(1)
})

function parseDeleteIds(event: H3Event) {
  const query = getQuery(event)
  const values = [query.ids, query.id]
    .flatMap(value => Array.isArray(value) ? value : [value])
    .filter(value => value !== undefined)
    .flatMap(value => String(value).split(','))
    .map(value => value.trim())
    .filter(Boolean)

  return deleteSmartphoneReservationsSchema.parse({ ids: values })
}

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

  if (event.method === 'DELETE') {
    const { ids } = parseDeleteIds(event)
    const deleted = await deleteSmartphoneReservations(ids)

    return { deleted }
  }

  throw createError({
    statusCode: 405,
    statusMessage: 'Method not allowed'
  })
})
