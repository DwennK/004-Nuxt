export type MobileSentrixOrderLineKind = 'smartphone' | 'other' | 'unknown'

export interface MobileSentrixOrderLine {
  id: string
  name: string
  sku: string | null
  quantity: number | null
  shippedQuantity: number | null
  unitPriceCents: number | null
  totalCents: number | null
  kind: MobileSentrixOrderLineKind
}

export interface MobileSentrixOrder {
  id: string
  number: string
  createdAt: string | null
  status: string
  currency: string | null
  totalCents: number | null
  deliveryDate: string | null
  carrier: string | null
  trackingNumber: string | null
  trackingUrl: string | null
  lines: MobileSentrixOrderLine[]
}

export interface MobileSentrixOrdersResponse {
  items: MobileSentrixOrder[]
  page: number
  hasMore: boolean
}
