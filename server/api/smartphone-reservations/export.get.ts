import { buildSmartphoneReservationsCsv } from '../../utils/smartphone-reservations-csv'
import { listSmartphoneReservations } from '../../utils/smartphone-reservations'

export default eventHandler(async (event) => {
  const rows = await listSmartphoneReservations()
  const csv = buildSmartphoneReservationsCsv(rows)
  const date = new Date().toISOString().slice(0, 10)

  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(event, 'Content-Disposition', `attachment; filename="demandes-reservation-smartphones-${date}.csv"`)

  return `\uFEFF${csv}`
})
