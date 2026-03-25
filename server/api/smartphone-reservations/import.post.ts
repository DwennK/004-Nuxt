import * as z from 'zod'
import { parseSmartphoneReservationsCsv } from '../../utils/smartphone-reservations-csv'
import { createSmartphoneReservations } from '../../utils/smartphone-reservations'

const importSchema = z.object({
  content: z.string().min(1)
})

export default eventHandler(async (event) => {
  const body = await readValidatedBody(event, importSchema.parse)
  const rows = parseSmartphoneReservationsCsv(body.content)
  const imported = await createSmartphoneReservations(rows)

  return { imported }
})
