import type { SmartphoneReservationStatus } from './smartphones'

export interface SmartphoneListQuery {
  page: number
  pageSize: number
  search: string
  sort: 'default' | 'asc' | 'desc'
  includeTotal: boolean
  selectedIds: number[]
}

export interface SmartphoneStockListQuery extends SmartphoneListQuery {
  sold: 'all' | 'available' | 'sold'
}

export interface SmartphoneReservationListQuery extends SmartphoneListQuery {
  status: SmartphoneReservationStatus | 'all'
}

export interface SmartphoneListResponse<T> {
  items: T[]
  selectedItems: T[]
  total?: number
  page: number
  pageSize: number
}
