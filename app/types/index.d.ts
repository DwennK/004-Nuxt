import type { AvatarProps } from '@nuxt/ui'

export type UserStatus = 'subscribed' | 'unsubscribed' | 'bounced'
export type SaleStatus = 'paid' | 'failed' | 'refunded'

export interface User {
  id: number
  name: string
  email: string
  avatar?: AvatarProps
  status: UserStatus
  location: string
}

export interface Customer {
  id: number
  name: string
  phone: string
  email: string
  address: string
  postalCode: string
  city: string
  comment: string
}

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

export interface Mail {
  id: number
  unread?: boolean
  from: User
  subject: string
  body: string
  date: string
}

export interface Stat {
  title: string
  icon: string
  value: number | string
  variation: number
  formatter?: (value: number) => string
}

export interface Sale {
  id: string
  date: string
  status: SaleStatus
  email: string
  amount: number
}

export interface Notification {
  id: number
  unread?: boolean
  sender: User
  body: string
  date: string
}

export type Period = 'daily' | 'weekly' | 'monthly'

export interface Range {
  start: Date
  end: Date
}
