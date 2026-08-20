export interface SmartphoneStock {
  id: number
  model: string
  imei: string
  sku: string
  capacity: string
  stockedAt: string
  sold: boolean
}

export type SmartphoneReservationStatus = 'pending' | 'contacted' | 'sold'

export interface SmartphoneReservationRequest {
  id: number
  name: string
  phone: string
  model: string
  storage: string
  requestedAt: string
  status: SmartphoneReservationStatus
  notes: string
}
