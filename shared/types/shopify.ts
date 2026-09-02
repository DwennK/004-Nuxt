export interface ShopifyConnection {
  configured: boolean
  shop?: { domain: string, name: string }
  allOrders?: boolean
}

export interface ShopifyOrderSummary {
  id: string
  name: string
  createdAt: string
  customerName: string
  financialStatus: string
  fulfillmentStatus: string
  currency: string
  totalCents: number
  documentId: number | null
}

export interface ShopifyOrderList {
  items: ShopifyOrderSummary[]
  pageInfo: { hasNextPage: boolean, endCursor: string | null }
}

export interface ShopifyImportResult {
  documentId: number
  documentNumber: string
  orderName: string
  paymentsAdded: number
  alreadyImported: boolean
}

export interface ShopifyProvenance {
  domain: string
  orderId: string
  orderName: string
}
