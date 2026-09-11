import type { CatalogItemRecord, CustomerRecord, DocumentListItem, TicketListItem } from './pos'

export interface PostalCodeLookupQuery {
  postalCode: string
}

export interface PostalCodeLookupResult {
  postalCode: string
  localities: string[]
}

export interface SuggestionsResponse<T> {
  items: T[]
}

export type CustomerSuggestionsResponse = SuggestionsResponse<CustomerRecord>
export type CatalogSuggestionsResponse = SuggestionsResponse<CatalogItemRecord>
export interface CatalogSummaryResponse {
  product: number
  repair: number
  service: number
}
export type TicketLookupItem = Pick<TicketListItem,
  'id' | 'ticketNumber' | 'type' | 'status' | 'brand' | 'model' | 'serialNumber' | 'imei' | 'customerName'>
export type DocumentLookupItem = Pick<DocumentListItem,
  'id' | 'documentNumber' | 'total' | 'customerName' | 'ticketNumber'>

export interface GlobalLookupResponse {
  query: string
  customers: CustomerSuggestionsResponse
  tickets: SuggestionsResponse<TicketLookupItem>
  documents: SuggestionsResponse<DocumentLookupItem>
  catalogItems: CatalogSuggestionsResponse
}
